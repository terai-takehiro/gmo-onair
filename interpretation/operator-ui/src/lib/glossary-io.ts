import type { GlossaryEntry } from "@/lib/api";

const TARGET_LANG_CODES = ["en", "th", "vi", "zh-CN", "zh-TW", "ko"];

/**
 * Parse a minimal CSV (no quoted commas/newlines support — keep it simple
 * because the operator pastes from a spreadsheet template).
 *
 * Header row: source_ja,category,en,th,vi,...
 */
export function parseCsv(text: string): GlossaryEntry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);

  const out: GlossaryEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const source = cols[idx("source_ja")];
    if (!source) continue;
    const translations: Record<string, string> = {};
    for (const lang of TARGET_LANG_CODES) {
      const j = idx(lang);
      if (j >= 0 && cols[j]) translations[lang] = cols[j];
    }
    const cat = (cols[idx("category")] ?? "term").toLowerCase();
    out.push({
      source_ja: source,
      translations,
      category:
        cat === "company" || cat === "product" || cat === "person"
          ? (cat as GlossaryEntry["category"])
          : "term",
    });
  }
  return out;
}

export function entriesToCsv(entries: GlossaryEntry[]): string {
  const langs = new Set<string>();
  for (const e of entries) for (const k of Object.keys(e.translations)) langs.add(k);
  const ordered = TARGET_LANG_CODES.filter((c) => langs.has(c));
  const header = ["source_ja", "category", ...ordered];
  const rows = entries.map((e) =>
    [
      e.source_ja,
      e.category,
      ...ordered.map((l) => e.translations[l] ?? ""),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const TARGET_LANGS = TARGET_LANG_CODES;
