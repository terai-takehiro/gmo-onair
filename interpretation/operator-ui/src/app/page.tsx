"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession, type CreateSessionResponse } from "@/lib/api";
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
      const res: CreateSessionResponse = await createSession({
        target_languages: [...selected],
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
