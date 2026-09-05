// CSV インポート: CSV エクスポート (#, セクション, 尺, ...ブロック列) と往復可能な形式を読み込み、
// sections[] に変換する。Excel で編集した CSV (引用符・改行・カンマ内包) にも対応。
// (相対パスで書く: この層は画面を持たない純粋関数なので、
//  エイリアスを解決しないテスト実行環境からもそのまま読めるようにする)
import { parseDur } from "./time";
import { genId } from "./stableIds";

// ─── CSV パーサ (RFC 4180 準拠: "" エスケープ / セル内改行 / CRLF) ───
export function parseCsv(text: string): string[][] {
  // BOM 除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell); cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  // 完全な空行は除去
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ─── 型 ───
interface Block {
  id: string;
  type: string;
  label: string;
}

export interface CsvColumnMap {
  sectionIdx: number; // 「セクション」列 (必須)
  durationIdx: number; // 「尺」列 (-1 = なし)
  blockCols: { block: Block; idx: number }[]; // マッチしたブロック列
  unmatchedHeaders: string[]; // どのブロックにも対応しない列 (無視される)
  missingBlocks: string[]; // CSV に列がないブロック (空セルになる)
}

// ヘッダー行とブロック定義を突き合わせる
export function mapCsvColumns(headers: string[], blocks: Block[]): CsvColumnMap | { error: string } {
  const norm = (s: string) => s.trim();
  const sIdx = headers.findIndex((h) => ["セクション", "ロール"].includes(norm(h)) || norm(h).toLowerCase() === "section");
  if (sIdx < 0) return { error: "「セクション」列が見つかりません。1 行目にヘッダー (#, セクション, 尺, …) が必要です。" };
  const durationIdx = headers.findIndex((h) => norm(h) === "尺" || norm(h).toLowerCase() === "duration");

  const used = new Set<number>([sIdx, durationIdx].filter((i) => i >= 0));
  headers.forEach((h, i) => { if (norm(h) === "#") used.add(i); });

  const blockCols: { block: Block; idx: number }[] = [];
  const missingBlocks: string[] = [];
  blocks.forEach((b) => {
    const idx = headers.findIndex((h, i) => !used.has(i) && norm(h) === norm(b.label));
    if (idx >= 0) { blockCols.push({ block: b, idx }); used.add(idx); }
    else missingBlocks.push(b.label);
  });
  const unmatchedHeaders = headers.filter((_, i) => !used.has(i)).map(norm).filter(Boolean);
  return { sectionIdx: sIdx, durationIdx, blockCols, unmatchedHeaders, missingBlocks };
}

// ─── セル文字列 → ブロック型ごとのセルデータ ───
function parseScenarioCell(text: string): any {
  // 「【名前】本文」形式から話者を抽出 (export 形式は html 本文のみだが、手書き CSV を考慮)
  const m = text.match(/^【([^】]{1,20})】\s*([\s\S]*)$/);
  if (m) return { entries: [{ name: m[1], html: m[2], isQWord: false }] };
  return { entries: [{ name: "", html: text, isQWord: false }] };
}

function parseLabelMemoCell(text: string): any {
  // export 形式は「ラベル メモ」。最初の空白でラベル / メモに分割 (ラベルは VTR / BGM 等の短語想定)
  const m = text.match(/^(\S{1,8})\s+([\s\S]+)$/);
  if (m) return { entries: [{ label: m[1], memo: m[2] }] };
  return { entries: [{ label: text, memo: "" }] };
}

function parseMicCell(text: string): any {
  // export 形式: "Ch1:ON 田中/SM58 / Ch2:STBY 鈴木"
  const assignments: any[] = [];
  text.split(/\s\/\s/).forEach((seg) => {
    const m = seg.trim().match(/^Ch(\d+):(ON|STBY)\s*([^/]*)(?:\/(.*))?$/i);
    if (!m) return;
    assignments.push({
      ch: parseInt(m[1], 10),
      state: m[2].toUpperCase() === "ON" ? "on" : "standby",
      person: (m[3] || "").trim(),
      micType: (m[4] || "").trim(),
    });
  });
  return assignments.length > 0 ? { assignments } : {};
}

function parseCell(block: Block, text: string): any {
  if (!text.trim()) return undefined;
  switch (block.type) {
    case "scenario": return parseScenarioCell(text);
    case "video":
    case "audio":
    case "telop": return parseLabelMemoCell(text);
    case "audio_mic": return parseMicCell(text);
    case "slide":
    case "stage_diagram":
    case "led_xr": return undefined; // 画像 / 構造データは CSV から復元不可
    default: return { value: text };
  }
}

// ─── CSV 行列 → sections[] ───
//
// ⚠️ ここで作る section / row には **必ず `id` を付けること**。
// 同時共同編集の差分器 (lib/collab/ydocDiff) は id を鍵に prev/next を突き合わせるため、
// id が無いと「まだ Y.Doc に無いもの」と毎回判定され、編集のたびに全部が再追加される
// (取り込んだロールが倍々に増えてブラウザとサーバーが落ちる)。

export interface CsvImportResult {
  sections: any[];
  rowCount: number;
  sectionCount: number;
  speakerNames: string[]; // scenario から検出した話者 (masters.persons へのマージ用)
}

export function buildSectionsFromCsv(rows: string[][], map: CsvColumnMap): CsvImportResult {
  const dataRows = rows.slice(1); // ヘッダーを除く
  const sections: any[] = [];
  const speakerSet = new Set<string>();
  let current: any = null;
  let rowCount = 0;

  dataRows.forEach((r) => {
    const label = (r[map.sectionIdx] || "").trim();
    const duration = map.durationIdx >= 0 ? (r[map.durationIdx] || "").trim() : "";
    const hasBlockContent = map.blockCols.some(({ idx }) => (r[idx] || "").trim() !== "");

    // VTR 行: 「VTR: タイトル」「VTR」「ＶＴＲ」(全角/コロン無しも許容)
    const vtrMatch = label.match(/^(?:VTR|ＶＴＲ)(?:[:：]\s*(.*))?$/i);
    if (vtrMatch && !hasBlockContent) {
      sections.push({ id: genId("sec"), _vtr: true, label: (vtrMatch[1] || "").trim() || "VTR", duration: duration || "0:30", rows: [] });
      current = null;
      return;
    }
    // CM 行: ラベルが CM で始まりブロック内容なし (「CM」「ＣＭ」「CM②」等、名前はそのまま保持)
    if (/^(?:CM|ＣＭ)/i.test(label) && !hasBlockContent) {
      sections.push({ id: genId("sec"), _break: true, label, duration: duration || "1:00", rows: [] });
      current = null;
      return;
    }

    // ロール行: ラベルが前行と変われば新セクション。
    // 新セクションの先頭行がブロック内容なしなら「ロール見出し行」とみなし、
    // その尺をロール尺 (section.duration) に設定する (空行は作らない)。
    if (!current || current.label !== label) {
      current = { id: genId("sec"), label: label || "【無題ロール】", rows: [] };
      sections.push(current);
      if (!hasBlockContent) {
        if (duration) current.duration = duration;
        return;
      }
    }

    const cells: Record<string, any> = {};
    map.blockCols.forEach(({ block, idx }) => {
      const cell = parseCell(block, r[idx] || "");
      if (cell !== undefined) {
        cells[block.id] = cell;
        if (block.type === "scenario") {
          (cell.entries || []).forEach((e: any) => { if (e.name) speakerSet.add(e.name); });
        }
      }
    });
    current.rows.push({ id: genId("row"), duration, cells });
    rowCount++;
  });

  // ロール尺が未設定のロールは、行の尺の合計をロール尺に反映する
  // (時刻タイムラインは section.duration で進むため、CSV に書いた尺が「反映されない」問題の解消)
  sections.forEach((sec) => {
    if (sec._break || sec._vtr || sec.duration) return;
    const total = (sec.rows || []).reduce((sum: number, row: any) => sum + parseDur(row.duration || ""), 0);
    if (total > 0) sec.duration = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  });

  return {
    sections,
    rowCount,
    sectionCount: sections.length,
    speakerNames: Array.from(speakerSet),
  };
}
