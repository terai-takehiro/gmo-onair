import { parseDur } from "@/lib/time";

// ============================================================
// OnAirPage.tsx から抽出。台本 (qsheet_documents.data) をキューの
// フラットな配列に変換する純粋関数。OnAirPage 専用 (他画面からの利用なし)。
// ============================================================

export interface CueRow {
  id: string;
  label: string;
  duration: number;
  scenario: string;
  video: string;
  audio: string;
  remarks: string;
  [key: string]: string | number | null | undefined;
}

export interface Section {
  id: string;
  label: string;
  rows: CueRow[];
  _break?: boolean;
  _pageBreak?: boolean;
  _vtr?: boolean;
  duration?: string;
}

export interface FlatCue {
  type: "cue" | "cm" | "vtr";
  label: string;
  duration: number;
  start: number;
  oa: number;
  row?: CueRow;
  // 実尺 (qsheet_cue_actuals) の記録用。画面には出さない。section.id をそのまま運ぶ
  // (合成しない — 1行挿すと全部ずれる cm-<index> のような id は作らない)。
  sectionId?: string;
  rowId?: string;
}

export function buildCues(data: { sections?: Section[]; meta?: { broadcastStartTime?: string } }): FlatCue[] {
  if (!data?.sections) return [];
  const cues: FlatCue[] = [];
  const bst = data.meta?.broadcastStartTime || "19:00";
  const bp = bst.split(":");
  const base = (+bp[0] || 19) * 3600 + (+bp[1] || 0) * 60;
  let acc = 0;

  for (const s of data.sections) {
    if ((s as Section & { _pageBreak?: boolean })._pageBreak) continue;
    if ((s as Section)._break) {
      const d = parseDur((s as Section).duration);
      cues.push({ type: "cm", label: s.label || "CM", duration: d, start: acc, oa: base + acc, sectionId: s.id });
      acc += d;
    } else if ((s as Section)._vtr) {
      const d = parseDur((s as Section).duration);
      cues.push({ type: "vtr", label: s.label || "VTR", duration: d, start: acc, oa: base + acc, sectionId: s.id });
      acc += d;
    } else {
      // ロール全体の尺設定がありつつ行の尺合計が 0 なら、ロール自体を 1 キューとして扱う
      const rowSum = s.rows.reduce((a, r) => a + parseDur(r.duration), 0);
      const secDur = parseDur((s as Section & { duration?: string }).duration);
      if (rowSum === 0 && secDur > 0) {
        cues.push({ type: "cue", label: s.label || "", duration: secDur, start: acc, oa: base + acc, sectionId: s.id });
        acc += secDur;
        continue;
      }
      for (const row of s.rows) {
        const d = parseDur(row.duration);
        cues.push({ type: "cue", label: s.label || row.label || "", duration: d, start: acc, oa: base + acc, row, sectionId: s.id, rowId: row.id });
        acc += d;
      }
    }
  }
  return cues;
}
