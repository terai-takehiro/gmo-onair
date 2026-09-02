// ランダウン画面のデータまわり (型・整形・キュー展開)。
// RundownPage.tsx (400 行基準の超過ファイル) から役割で切り出した。中身は移動そのままで挙動は変えていない。
import { parseDur, fmtAbs } from "@/lib/time";

// ============================================================
// Types (shared with EditorPage / OnAirPage)
// ============================================================
export interface CueRow {
  id: string;
  label: string;
  duration: string | number;
  cells?: Record<string, any>;
  [key: string]: any;
}

export interface Section {
  id: string;
  label: string;
  rows: CueRow[];
  duration?: string | number;
  _break?: boolean;
  _pageBreak?: boolean;
  _vtr?: boolean;
}

export interface Block {
  id: string;
  type: string;
  label: string;
  width: number;
}

export interface DocumentData {
  meta: { title: string; draft: string; [key: string]: unknown };
  blocks: Block[];
  sections: Section[];
  masters: {
    persons: string[];
    video: string[];
    audio: string[];
    telop: string[];
    micTypes?: string[];
    micChannels?: { ch: number; label?: string }[];
  };
  stageTemplates?: { id?: string; name: string; elements: any[] }[];
  ledScenes?: { id: string; name: string; wall: string; floor: string }[];
}

export interface FlatCue {
  sectionLabel: string;
  sectionIdx: number;
  row: CueRow;
  startTime: number;
  globalIndex: number;
}

// ============================================================
// Helpers
// ============================================================
export const formatTime = (seconds: number): string => {
  const sign = seconds < 0 ? "-" : "";
  return `${sign}${fmtAbs(Math.abs(seconds))}`;
};

export function extractCellText(row: CueRow, block: Block): string {
  const cell = row.cells?.[block.id];
  if (cell) {
    if (block.type === "scenario" && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.name ? `【${e.name}】` : ""}${(e.html || "").replace(/<[^>]*>/g, "")}`)
        .filter((s: string) => s)
        .join("\n");
    }
    if (["video", "audio", "telop"].includes(block.type) && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.label || ""}${e.memo ? " " + e.memo : ""}`)
        .filter((s: string) => s.trim())
        .join("\n");
    }
    if (block.type === "audio_mic" && Array.isArray(cell.assignments)) {
      return cell.assignments
        .filter((a: any) => a.state && a.state !== "off")
        .sort((a: any, b: any) => (a.ch || 0) - (b.ch || 0))
        .map((a: any) => {
          const tag = a.state === "on" ? "ON" : "STBY";
          const name = a.person ? ` ${a.person}` : "";
          const mic = a.micType ? `/${a.micType}` : "";
          return `Ch${a.ch}:${tag}${name}${mic}`;
        })
        .join("\n");
    }
    if (typeof cell === "string") return cell;
    if (cell.value) return String(cell.value);
  }
  const val = row[block.id] || "";
  return typeof val === "string" ? val : String(val || "");
}

export const STORAGE_KEY_COLUMNS = "rundown-visible-columns";
export const STORAGE_KEY_THEME = "rundown-theme";

// ============================================================
// Flatten cues (RundownPage の useMemo から切り出した純関数)
// ============================================================
export function flattenCues(sections: Section[] | undefined): FlatCue[] {
  if (!sections) return [];
  const cues: FlatCue[] = [];
  let time = 0;
  let idx = 0;
  sections.forEach((section, sIdx) => {
    if (section._pageBreak) return;
    // CM (break) は section 自体を1キューとして尺を積む
    if (section._break) {
      const dur = parseDur(section.duration);
      const cmRow: CueRow = { id: `cm-${sIdx}`, label: section.label || "CM", duration: dur };
      cues.push({ sectionLabel: section.label || "CM", sectionIdx: sIdx, row: cmRow, startTime: time, globalIndex: idx });
      time += dur;
      idx++;
      return;
    }
    // VTR も section 自体を1キューとして尺を積む
    if (section._vtr) {
      const dur = parseDur(section.duration);
      const vtrRow: CueRow = { id: `vtr-${sIdx}`, label: section.label || "VTR", duration: dur };
      cues.push({ sectionLabel: `VTR: ${section.label || ""}`.trim(), sectionIdx: sIdx, row: vtrRow, startTime: time, globalIndex: idx });
      time += dur;
      idx++;
      return;
    }
    // 通常ロール: 行ごとの duration 合計が 0 かつ section.duration が設定されていれば、ロール全体を 1 キューとする
    const rowSum = section.rows.reduce((a, r) => a + parseDur(r.duration), 0);
    const secDur = parseDur(section.duration);
    if (rowSum === 0 && secDur > 0) {
      const secRow: CueRow = { id: `sec-${sIdx}`, label: section.label || "", duration: secDur };
      cues.push({ sectionLabel: section.label, sectionIdx: sIdx, row: secRow, startTime: time, globalIndex: idx });
      time += secDur;
      idx++;
      return;
    }
    for (const row of section.rows) {
      cues.push({ sectionLabel: section.label, sectionIdx: sIdx, row, startTime: time, globalIndex: idx });
      time += parseDur(row.duration);
      idx++;
    }
  });
  return cues;
}
