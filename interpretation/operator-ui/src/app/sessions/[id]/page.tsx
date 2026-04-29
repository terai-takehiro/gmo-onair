"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listInputDevices, startMicCapture, type MicCapture } from "@/lib/audio";
import { openOperatorWs, type OperatorWS } from "@/lib/ws";
import { endSession, type CreateSessionResponse } from "@/lib/api";

type Props = { params: Promise<{ id: string }> };

export default function LiveSessionPage({ params }: Props) {
  const { id: sessionId } = use(params);
  const router = useRouter();

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState<string | undefined>();
  const [capture, setCapture] = useState<MicCapture | null>(null);
  const [ws, setWs] = useState<OperatorWS | null>(null);
  const [status, setStatus] = useState<"idle" | "live" | "stopping">("idle");
  const [chunks, setChunks] = useState(0);
  const [info, setInfo] = useState<CreateSessionResponse | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem(`session:${sessionId}`);
    if (raw) setInfo(JSON.parse(raw) as CreateSessionResponse);
    listInputDevices().then((d) => {
      setDevices(d);
      if (d[0]) setDevice(d[0].deviceId);
    });
  }, [sessionId]);

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
    await endSession(sessionId);
    router.push("/");
  };

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

      {info && (
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h3 className="font-serif text-lg font-semibold">vMix 取り込み URL</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(info.output_urls).map(([lang, url]) => (
              <li key={lang} className="flex items-center gap-2">
                <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">
                  {lang}
                </span>
                <code className="flex-1 truncate font-mono text-xs text-stone-700">
                  {url}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(url)}
                  className="rounded border px-2 py-1 text-xs"
                >
                  コピー
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
