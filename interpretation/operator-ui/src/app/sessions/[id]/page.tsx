"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listInputDevices, startMicCapture, type MicCapture } from "@/lib/audio";
import { openOperatorWs, type OperatorWS } from "@/lib/ws";
import {
  correctSession,
  endSession,
  getSessionCost,
  type CreateSessionResponse,
  type SessionCostSummary,
} from "@/lib/api";
import { openPreviewWs, type PreviewFrame, type PreviewWS } from "@/lib/preview-ws";
import { useAuthGuard } from "@/lib/use-auth-guard";
import { OverlaySettings } from "@/components/overlay-settings";

type Props = { params: Promise<{ id: string }> };

export default function LiveSessionPage({ params }: Props) {
  const ok = useAuthGuard();
  const { id: sessionId } = use(params);
  const router = useRouter();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState<string | undefined>();
  const [capture, setCapture] = useState<MicCapture | null>(null);
  const [ws, setWs] = useState<OperatorWS | null>(null);
  const [status, setStatus] = useState<"idle" | "live" | "stopping">("idle");
  const [chunks, setChunks] = useState(0);
  const [info, setInfo] = useState<CreateSessionResponse | null>(null);
  const [transcript, setTranscript] = useState<{ text: string; isFinal: boolean }>(
    { text: "", isFinal: false },
  );
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [activeLang, setActiveLang] = useState<string | null>(null);
  const [cost, setCost] = useState<SessionCostSummary | null>(null);
  const [previewWs, setPreviewWs] = useState<PreviewWS | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`session:${sessionId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as CreateSessionResponse;
      setInfo(parsed);
      const langs = Object.keys(parsed.output_urls);
      if (langs.length) setActiveLang(langs[0]);
    }
    listInputDevices().then((d) => {
      setDevices(d);
      if (d[0]) setDevice(d[0].deviceId);
    });
  }, [sessionId]);

  // Open preview WS for transcript + per-lang translations.
  useEffect(() => {
    if (!ok) return;
    const ws = openPreviewWs(sessionId, (frame: PreviewFrame) => {
      if (frame.type === "transcript") {
        setTranscript({ text: frame.text, isFinal: frame.is_final });
      } else if (frame.type === "translation") {
        setTranslations((prev) => ({ ...prev, [frame.lang]: frame.text }));
      }
    });
    setPreviewWs(ws);
    return () => ws.close();
  }, [ok, sessionId]);

  // Initialize / refresh draft when active language changes or a new
  // translation arrives from upstream.
  useEffect(() => {
    if (!activeLang) return;
    setDraft(translations[activeLang] ?? "");
  }, [activeLang, translations]);

  // Poll cost every 5s.
  useEffect(() => {
    if (!ok) return;
    let alive = true;
    const tick = async () => {
      try {
        const c = await getSessionCost(sessionId);
        if (alive) setCost(c);
      } catch {
        /* ignore transient errors */
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ok, sessionId]);

  const start = async () => {
    if (status !== "idle") return;
    const socket = openOperatorWs(sessionId, {
      onOpen: () => setStatus("live"),
      onClose: () => setStatus("idle"),
      onError: () => setStatus("idle"),
    });
    setWs(socket);

    const cap = await startMicCapture(device, (pcm) => {
      socket.send(pcm);
      setChunks((c) => c + 1);
    });
    setCapture(cap);
  };

  const stop = async () => {
    if (status !== "live") return;
    setStatus("stopping");
    await capture?.stop();
    ws?.close();
    setCapture(null);
    setWs(null);
    setStatus("idle");
  };

  const finish = async () => {
    await stop();
    previewWs?.close();
    await endSession(sessionId);
    router.push("/");
  };

  const pushCorrection = async () => {
    if (!activeLang || !draft.trim()) return;
    setPushBusy(true);
    setPushError(null);
    try {
      await correctSession(sessionId, { lang: activeLang, text: draft.trim() });
    } catch (err) {
      setPushError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushBusy(false);
    }
  };

  if (!ok) return null;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold">ライブ操作</h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              status === "live"
                ? "bg-red-100 text-red-700"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            {status === "live" ? "● ON AIR" : "OFF"}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500">session: {sessionId}</p>

        <div className="mt-4">
          <label className="text-sm text-stone-600">マイク入力</label>
          <select
            value={device ?? ""}
            onChange={(e) => setDevice(e.target.value)}
            disabled={status !== "idle"}
            className="ml-2 rounded border px-2 py-1 text-sm"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 flex gap-3">
          {status !== "live" ? (
            <button
              type="button"
              onClick={start}
              className="rounded-lg bg-brand px-4 py-2 text-white shadow"
            >
              配信開始
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg bg-stone-700 px-4 py-2 text-white shadow"
            >
              停止
            </button>
          )}
          <button
            type="button"
            onClick={finish}
            className="rounded-lg border px-4 py-2 text-stone-700"
          >
            セッション終了
          </button>
        </div>

        <p className="mt-4 text-xs text-stone-500">
          送信チャンク数: <span className="font-mono">{chunks}</span>
        </p>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h3 className="font-serif text-lg font-semibold">プレビュー</h3>

        <div className="mt-3 rounded-xl border bg-stone-50 p-4">
          <div className="text-xs uppercase tracking-wide text-stone-500">原文 (日本語)</div>
          <div
            className={`mt-1 min-h-12 text-base ${transcript.isFinal ? "" : "italic text-stone-600"}`}
          >
            {transcript.text || (
              <span className="text-stone-400">(発話を待機中)</span>
            )}
          </div>
        </div>

        {info && Object.keys(info.output_urls).length > 0 && (
          <div className="mt-4">
            <div className="flex flex-wrap gap-2">
              {Object.keys(info.output_urls).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setActiveLang(lang)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    activeLang === lang
                      ? "border-brand bg-brand text-white"
                      : "border-stone-300 bg-white text-stone-700"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="(翻訳を待機中)"
              rows={3}
              className="mt-3 w-full rounded-xl border bg-stone-50 p-4 text-base"
            />

            <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
              <button
                type="button"
                onClick={pushCorrection}
                disabled={pushBusy || !activeLang || !draft.trim()}
                className="rounded-lg bg-stone-700 px-3 py-1 text-white disabled:opacity-50"
              >
                {pushBusy ? "送信中..." : "修正を ON-AIR に反映"}
              </button>
              <span>
                バックエンドが TTS を再生成し、vMix オーバーレイに上書き字幕＋音声を流します。
              </span>
            </div>

            {pushError && (
              <p className="mt-2 text-sm text-red-600">{pushError}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="font-serif text-lg font-semibold">推定コスト</h3>
          <span className="font-mono text-2xl font-semibold text-brand">
            ¥{cost?.total_jpy?.toFixed(2) ?? "0.00"}
          </span>
        </div>
        <p className="mt-1 text-xs text-stone-500">5 秒ごとに更新</p>

        <ul className="mt-3 space-y-1 text-sm">
          {(cost?.breakdown ?? []).map((b) => (
            <li
              key={b.service}
              className="flex justify-between border-b border-stone-100 py-1"
            >
              <span className="font-mono text-xs uppercase text-stone-500">
                {b.service}
              </span>
              <span className="text-stone-600">
                {b.units.toLocaleString()} {b.unit_label}
              </span>
              <span className="font-mono">¥{b.amount_jpy.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>

      {info && <OverlaySettings outputUrls={info.output_urls} />}
    </section>
  );
}
