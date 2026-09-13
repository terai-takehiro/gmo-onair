// sheet.rundown（進行表）・sheet.excerpt（台本の抜粋）・sheet.micAssignment（マイク割り）の
// 中身描画（段C）。この3種だけ `sourceId` が必須（進行台本は1案件に複数ありうるため）で、
// 資料の選択自体は `InsertPanel` が済ませている。
//
// resolver は `qsheet-read.service.ts` の `getQsheetOutline`/`getQsheetRows` を土台にする
// 想定だが、まだ実装されていないため `rows`/`sections`/`cells` のどの形で来ても崩れないよう、
// 行を正規化してから描く（担当分担のメモどおり — 型は Integrate フェーズで締める）。
import { asRecord, LinkedEmpty, LinkedGrid, type Grid } from "./sharedLinkedContent";

interface Props {
  blockKey: "sheet.rundown" | "sheet.excerpt" | "sheet.micAssignment";
  data: unknown;
  options: Record<string, unknown>;
}

interface NormalizedRow {
  id: string;
  label: string;
  duration: string;
  text: string;
}

const OWN_KEYS = new Set(["id", "label", "duration", "cells"]);

function cellText(row: Record<string, unknown>): string {
  const cells = row.cells && typeof row.cells === "object" && !Array.isArray(row.cells) ? (row.cells as Record<string, unknown>) : null;
  const source = cells ?? row;
  return Object.entries(source)
    .filter(([k]) => cells || !OWN_KEYS.has(k))
    .map(([, v]) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : ""))
    .filter((v) => v !== "")
    .join(" ／ ");
}

/**
 * ⚠️⚠️ 外部レビュー再指摘（P1）: `sheet.excerpt` は「セクション」欄（`options.sectionTitle`。
 * `LinkedBlockInspector.tsx` の自由入力）で見せる範囲を絞れる設計だったが、この関数が
 * `options` を受け取っておらず（そもそも分割代入していなかった）、常に全セクションを
 * そのまま出していた——著者が意図的に外した節まで紙面・PDFへそのまま配ってしまう。
 * `sectionTitle` が指定されているときは、そのラベルを含むセクションだけに絞ってから渡す。
 */
export function filterSectionsByTitle(data: unknown, sectionTitle: string): unknown {
  const obj = asRecord(data);
  if (!Array.isArray(obj.sections)) return data;
  const needle = sectionTitle.trim();
  if (!needle) return data;
  const filtered = (obj.sections as unknown[]).filter((s) => {
    const sec = asRecord(s);
    return typeof sec.label === "string" && sec.label.includes(needle);
  });
  return { ...obj, sections: filtered };
}

/** `{ rows: [...] }` / `{ sections: [{ rows: [...] }] }` / 素の配列、のどれでも読む */
function normalizeRows(data: unknown): NormalizedRow[] {
  let raw: unknown[] = [];
  if (Array.isArray(data)) {
    raw = data;
  } else {
    const obj = asRecord(data);
    if (Array.isArray(obj.rows)) {
      raw = obj.rows as unknown[];
    } else if (Array.isArray(obj.sections)) {
      raw = (obj.sections as unknown[]).flatMap((s) => {
        const sec = asRecord(s);
        return Array.isArray(sec.rows) ? (sec.rows as unknown[]) : [];
      });
    }
  }
  return raw.map((r, i) => {
    const row = asRecord(r);
    const id = typeof row.id === "string" ? row.id : String(i);
    const label = typeof row.label === "string" ? row.label : "";
    const duration = typeof row.duration === "string" ? row.duration : typeof row.duration === "number" ? String(row.duration) : "";
    return { id, label, duration, text: cellText(row) };
  });
}

/**
 * `sheet.micAssignment` だけ形が違う（`resolveSheetMicAssignment` の戻り値は
 * `{ assignments: [{ ch, person, micType, state, sectionId, sectionLabel, rowId, rowLabel }] }`
 * — `rows`/`sections` を持たないので `normalizeRows` では拾えない）。出演者ごとの行に組み直す
 */
function normalizeMicAssignments(data: unknown): NormalizedRow[] {
  const obj = asRecord(data);
  const assignments = Array.isArray(obj.assignments) ? (obj.assignments as unknown[]) : [];
  return assignments.map((a, i) => {
    const row = asRecord(a);
    const person = typeof row.person === "string" ? row.person : "";
    const sectionLabel = typeof row.sectionLabel === "string" ? row.sectionLabel : "";
    const ch = typeof row.ch === "number" ? String(row.ch) : typeof row.ch === "string" ? row.ch : "";
    const micType = typeof row.micType === "string" ? row.micType : "";
    const state = typeof row.state === "string" ? row.state : "";
    const detail = [ch && `Ch${ch}`, micType, state].filter(Boolean).join(" / ");
    const id = typeof row.rowId === "string" && row.rowId ? `${row.rowId}-${i}` : String(i);
    return { id, label: person || sectionLabel, duration: "", text: [detail, sectionLabel].filter(Boolean).join(" ｜ ") };
  });
}

const EMPTY_TEXT: Record<Props["blockKey"], string> = {
  "sheet.rundown": "進行表の内容がありません",
  "sheet.excerpt": "選んだセクションの内容がありません",
  "sheet.micAssignment": "マイク割りの情報がありません",
};

const COLUMNS: Record<Props["blockKey"], string[]> = {
  "sheet.rundown": ["項目", "尺", "内容"],
  "sheet.excerpt": ["項目", "内容"],
  "sheet.micAssignment": ["出演者", "マイク割り"],
};

export default function SheetLinkedContent({ blockKey, data, options }: Props) {
  const sectionTitle = blockKey === "sheet.excerpt" && typeof options.sectionTitle === "string" ? options.sectionTitle : "";
  const effectiveData = sectionTitle ? filterSectionsByTitle(data, sectionTitle) : data;
  const rows = blockKey === "sheet.micAssignment" ? normalizeMicAssignments(data) : normalizeRows(effectiveData);
  if (rows.length === 0) return <LinkedEmpty text={EMPTY_TEXT[blockKey]} />;

  const hasDurationColumn = blockKey === "sheet.rundown";
  const grid: Grid = {
    columns: COLUMNS[blockKey],
    rows: rows.map((r) => (hasDurationColumn ? [r.label, r.duration, r.text] : [r.label, r.text])),
  };
  return <LinkedGrid grid={grid} />;
}
