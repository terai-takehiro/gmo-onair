"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getGlossary,
  updateGlossary,
  type GlossaryEntry,
  type GlossaryPreset,
} from "@/lib/api";
import {
  TARGET_LANGS,
  downloadFile,
  entriesToCsv,
  parseCsv,
} from "@/lib/glossary-io";
import { useAuthGuard } from "@/lib/use-auth-guard";

type Props = { params: Promise<{ id: string }> };

const EMPTY_ENTRY: GlossaryEntry = {
  source_ja: "",
  translations: {},
  category: "term",
};

export default function GlossaryEditPage({ params }: Props) {
  const ok = useAuthGuard();
  const { id } = use(params);
  const router = useRouter();

  const [preset, setPreset] = useState<GlossaryPreset | null>(null);
  const [name, setName] = useState("");
  const [entries, setEntries] = useState<GlossaryEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ok) return;
    getGlossary(id)
      .then((g) => {
        setPreset(g);
        setName(g.name);
        setEntries(g.entries);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ok, id]);

  if (!ok) return null;

  const setEntry = (i: number, patch: Partial<GlossaryEntry>) => {
    setEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    );
  };
  const setTrans = (i: number, lang: string, value: string) =>
    setEntry(i, {
      translations: { ...entries[i].translations, [lang]: value },
    });

  const onImportCsv = async (file: File) => {
    const txt = await file.text();
    setEntries(parseCsv(txt));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateGlossary(id, {
        name: name.trim(),
        entries: entries.filter((e) => e.source_ja.trim()),
      });
      setPreset(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-lg border px-3 py-2 font-serif text-xl"
          />
          <div className="ml-3 flex gap-2">
            <label className="cursor-pointer rounded border px-3 py-2 text-sm">
              CSV 取込
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && onImportCsv(e.target.files[0])}
                className="hidden"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                downloadFile(
                  `${name || "glossary"}.csv`,
                  entriesToCsv(entries),
                  "text/csv",
                )
              }
              className="rounded border px-3 py-2 text-sm"
            >
              CSV 書出
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm text-white shadow disabled:opacity-50"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => router.push("/glossaries")}
              className="rounded border px-3 py-2 text-sm"
            >
              戻る
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {preset?.updated_at && (
          <p className="mt-2 text-xs text-stone-500">
            最終更新: {new Date(preset.updated_at).toLocaleString("ja-JP")}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
            <tr>
              <th className="px-3 py-2">原語 (日本語)</th>
              <th className="px-3 py-2">分類</th>
              {TARGET_LANGS.map((l) => (
                <th key={l} className="px-3 py-2">
                  {l}
                </th>
              ))}
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">
                  <input
                    type="text"
                    value={e.source_ja}
                    onChange={(ev) => setEntry(i, { source_ja: ev.target.value })}
                    className="w-40 rounded border px-2 py-1"
                  />
                </td>
                <td className="px-2 py-1">
                  <select
                    value={e.category}
                    onChange={(ev) =>
                      setEntry(i, {
                        category: ev.target.value as GlossaryEntry["category"],
                      })
                    }
                    className="rounded border px-2 py-1"
                  >
                    <option value="term">term</option>
                    <option value="company">company</option>
                    <option value="product">product</option>
                    <option value="person">person</option>
                  </select>
                </td>
                {TARGET_LANGS.map((l) => (
                  <td key={l} className="px-2 py-1">
                    <input
                      type="text"
                      value={e.translations[l] ?? ""}
                      onChange={(ev) => setTrans(i, l, ev.target.value)}
                      className="w-40 rounded border px-2 py-1"
                    />
                  </td>
                ))}
                <td className="px-2 py-1">
                  <button
                    type="button"
                    onClick={() =>
                      setEntries((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-xs text-stone-500"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => setEntries((prev) => [...prev, { ...EMPTY_ENTRY }])}
            className="text-sm text-brand"
          >
            + 行を追加
          </button>
        </div>
      </div>
    </section>
  );
}
