"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createGlossary,
  deleteGlossary,
  listGlossaries,
  type GlossaryPreset,
} from "@/lib/api";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function GlossariesPage() {
  const ok = useAuthGuard();
  const router = useRouter();
  const [items, setItems] = useState<GlossaryPreset[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ok) return;
    listGlossaries()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ok]);

  if (!ok) return null;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const g = await createGlossary({ name: name.trim(), entries: [] });
      router.push(`/glossaries/${g.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("削除しますか?")) return;
    await deleteGlossary(id);
    setItems((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-serif text-2xl font-semibold">用語辞書プリセット</h2>
        <p className="mt-1 text-sm text-stone-500">
          イベントごとの用語辞書を管理します。STT の Speech Adaptation と
          Gemini 翻訳の system prompt に注入されます。
        </p>

        <form onSubmit={onCreate} className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="新規プリセット名 (例: 2026春 製品発表会)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-brand px-4 py-2 text-sm text-white shadow disabled:opacity-50"
          >
            作成
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-2xl border bg-white shadow-sm">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">プリセットがまだありません。</p>
        ) : (
          <ul className="divide-y">
            {items.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/glossaries/${g.id}`}
                    className="font-medium text-brand hover:underline"
                  >
                    {g.name}
                  </Link>
                  <p className="text-xs text-stone-500">
                    {g.entries.length} エントリ ·{" "}
                    {g.updated_at
                      ? new Date(g.updated_at).toLocaleString("ja-JP")
                      : "未保存"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(g.id)}
                  className="rounded border px-3 py-1 text-xs text-stone-600"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
