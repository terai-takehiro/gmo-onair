"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createSession,
  listGlossaries,
  type CreateSessionResponse,
  type GlossaryPreset,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "英語" },
  { code: "th", label: "タイ語" },
  { code: "vi", label: "ベトナム語" },
];

export default function HomePage() {
  const ok = useAuthGuard();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(["en"]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [glossaries, setGlossaries] = useState<GlossaryPreset[]>([]);
  const [glossaryId, setGlossaryId] = useState<string>("");
  const [ccUrls, setCcUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ok) return;
    listGlossaries()
      .then(setGlossaries)
      .catch(() => {
        /* glossaries are optional */
      });
  }, [ok]);

  if (!ok) return null;

  const toggle = (code: string) => {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setSelected(next);
  };

  const onStart = async () => {
    if (selected.size === 0) {
      setError("少なくとも 1 言語を選択してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ccPayload = Object.fromEntries(
        [...selected]
          .map((l) => [l, (ccUrls[l] || "").trim()] as const)
          .filter(([, v]) => v.length > 0),
      );
      const res: CreateSessionResponse = await createSession({
        target_languages: [...selected],
        glossary_preset_id: glossaryId || null,
        cc_ingest_urls:
          Object.keys(ccPayload).length > 0 ? ccPayload : null,
      });
      sessionStorage.setItem(`session:${res.session_id}`, JSON.stringify(res));
      router.push(`/sessions/${res.session_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-semibold">新規セッション</h2>
        <p className="mt-1 text-sm text-stone-500">
          翻訳対象言語を選んで「開始」を押してください。
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {LANGUAGES.map(({ code, label }) => {
            const active = selected.has(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={active}
                onClick={() => toggle(code)}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-stone-300 bg-white hover:border-brand"
                }`}
              >
                {label} ({code})
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <label className="text-sm text-stone-700">用語辞書プリセット</label>
          <select
            value={glossaryId}
            onChange={(e) => setGlossaryId(e.target.value)}
            className="ml-2 rounded border px-2 py-1 text-sm"
          >
            <option value="">(なし)</option>
            {glossaries.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.entries.length})
              </option>
            ))}
          </select>
        </div>

        <details className="mt-4 rounded-lg border bg-stone-50 p-3 text-sm">
          <summary className="cursor-pointer text-stone-700">
            YouTube Live CC 連携 (任意)
          </summary>
          <p className="mt-2 text-xs text-stone-500">
            YouTube Live Studio の「字幕」パネルで発行される ingest URL を
            言語ごとに貼り付けると、字幕がその言語チャンネルに自動 POST されます。
          </p>
          <div className="mt-3 space-y-2">
            {[...selected].map((lang) => (
              <label key={lang} className="flex items-center gap-2">
                <span className="w-12 rounded bg-stone-200 px-2 py-1 text-center text-xs">
                  {lang}
                </span>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/api/live_ingest/text-mt?id=..."
                  value={ccUrls[lang] ?? ""}
                  onChange={(e) =>
                    setCcUrls((prev) => ({ ...prev, [lang]: e.target.value }))
                  }
                  className="flex-1 rounded border px-2 py-1 font-mono text-xs"
                />
              </label>
            ))}
          </div>
        </details>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-brand px-5 text-white shadow disabled:opacity-50"
        >
          {busy ? "開始中..." : "開始"}
        </button>
      </div>
    </section>
  );
}
