/**
 * MCP `propose_qsheet_draft` の payload 検証（段10 / 05-mcp.md §5 相当）。
 *
 * ⚠️ **設計書 05-mcp.md §5 との食い違い（README に倣い、ここに明記する）**:
 * §5 は「11ブロック型ぶんの `cells: Record<blockRef, string>`」という汎用形を前提にしていたが、
 * 段7で実際に実装された取り込み側（`client-qsheet/src/lib/applyProposal.ts` の
 * `ScriptOutlineProposal` / `ScriptLinesProposal`、それを受ける `apply.core.ts` の
 * `proposalKeys`/`proposalElementsByKey`）は、決めたこと9（AI が書く型は `scenario` のみ）を
 * 見込んで**もっと単純な専用の形**（`sections[].rows[].speaker/hint` と `lines[].name/text`）で
 * 既に固まっている。この専用形が唯一の取り込み経路なので、MCP はこちらに合わせる
 * （blockRef 汎用形は作らない — 作っても取り込み側が読めず、②で決めた「取り込みは画面」の
 * 経路に絶対に乗らない）。第2版で `audio_mic` 等を開けるときは、取り込み側の型を
 * 先に広げてから MCP 側もそれに追従する。
 *
 * ここでの役割は3つ:
 *  1. AI が送ってきた自由な JSON を `ScriptOutlineProposal` / `ScriptLinesProposal` の
 *     形に絞り込む（余計なフィールドは削る・型が合わない要素は dropped[] に積んで捨てる）
 *  2. HTML タグの混入を拒否する（§5 決めたこと6・表示時に消えるうえ XSS の口）
 *  3. `script_line_draft` は対象文書に実在する row_id だけを残す（存在しない id を
 *     AI に書かせない。§5 の「参照は実在確認する」と同じ考え方）
 *
 * **DB もネットワークも触らない純関数。** 呼び出し側（production.tools.ts）が
 * 対象文書の行 id 一覧を渡す。
 */

// client-qsheet/src/lib/applyProposal.ts の型と意図的に同じ形（server は client-qsheet を
// import できないための複製。生成側の唯一の消費者は取り込み側なので、そちらの形に従う）。
export interface McpScriptOutlineRow {
  key: string;
  label: string;
  duration_sec: number;
  speaker: string | null;
  hint?: string | null;
}
export interface McpScriptOutlineSection {
  key: string;
  label: string;
  duration_sec: number;
  rows: McpScriptOutlineRow[];
}
export interface McpScriptOutlineProposal {
  budget_sec: number | null;
  sections: McpScriptOutlineSection[];
}

export interface McpScriptLine {
  row_id: string;
  name: string;
  text: string;
  is_q_word?: boolean;
}
export interface McpScriptLinesProposal {
  lines: McpScriptLine[];
  advice?: string[];
}

export type DropReason = 'unsupported_type' | 'no_block' | 'bad_reference' | 'html' | 'missing_field' | 'too_long';
export interface DroppedItem {
  path: string;
  reason: DropReason;
  detail?: string;
}

export interface ValidateResult<T> {
  payload: T;
  dropped: DroppedItem[];
  warnings: string[];
}

// コンテキスト保護（AI が暴走して巨大な提案を送っても許さない）
const MAX_SECTIONS = 60;
const MAX_ROWS_PER_SECTION = 200;
const MAX_LINES = 500;
const MAX_LABEL_LEN = 200;
const MAX_TEXT_LEN = 4000;
const MAX_HINT_LEN = 500;

function hasHtml(s: string): boolean {
  return s.includes('<');
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

/** kind='script_outline_draft' の payload を検証・整形する */
export function validateOutlineProposal(raw: unknown): ValidateResult<McpScriptOutlineProposal> {
  const dropped: DroppedItem[] = [];
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawSections = Array.isArray(src.sections) ? src.sections : [];
  if (rawSections.length > MAX_SECTIONS) {
    dropped.push({ path: 'sections', reason: 'too_long', detail: `${rawSections.length}件 → 先頭${MAX_SECTIONS}件のみ` });
  }

  const sections: McpScriptOutlineSection[] = [];
  rawSections.slice(0, MAX_SECTIONS).forEach((raw, si) => {
    const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const key = str(s.key, 50) || `S${si + 1}`;
    const label = str(s.label, MAX_LABEL_LEN);
    if (!label) {
      dropped.push({ path: `sections[${si}].label`, reason: 'missing_field' });
      return;
    }
    if (hasHtml(label)) {
      dropped.push({ path: `sections[${si}].label`, reason: 'html' });
      return;
    }
    const rawRows = Array.isArray(s.rows) ? s.rows : [];
    if (rawRows.length > MAX_ROWS_PER_SECTION) {
      dropped.push({ path: `sections[${si}].rows`, reason: 'too_long', detail: `${rawRows.length}件 → 先頭${MAX_ROWS_PER_SECTION}件のみ` });
    }
    const rows: McpScriptOutlineRow[] = [];
    rawRows.slice(0, MAX_ROWS_PER_SECTION).forEach((rawRow, ri) => {
      const r = rawRow && typeof rawRow === 'object' ? (rawRow as Record<string, unknown>) : {};
      const rowLabel = str(r.label, MAX_LABEL_LEN);
      const speaker = typeof r.speaker === 'string' ? str(r.speaker, MAX_LABEL_LEN) : null;
      const hint = typeof r.hint === 'string' ? str(r.hint, MAX_HINT_LEN) : null;
      if (hasHtml(rowLabel) || (speaker && hasHtml(speaker)) || (hint && hasHtml(hint))) {
        dropped.push({ path: `sections[${si}].rows[${ri}]`, reason: 'html' });
        return;
      }
      rows.push({
        key: str(r.key, 50) || `${key}.R${ri + 1}`,
        label: rowLabel,
        duration_sec: num(r.duration_sec),
        speaker,
        ...(hint ? { hint } : {}),
      });
    });
    sections.push({ key, label, duration_sec: num(s.duration_sec), rows });
  });

  const budgetSec = typeof src.budget_sec === 'number' && Number.isFinite(src.budget_sec) ? Math.round(src.budget_sec) : null;
  return { payload: { budget_sec: budgetSec, sections }, dropped, warnings: [] };
}

/**
 * kind='script_line_draft' の payload を検証・整形する。
 * `existingRowIds` に無い `row_id` は `bad_reference` で落とす
 * （AI が幻覚した id を書かせない。取り込み側 `applyLines` も二重に弾くが、
 * ここで落とせば `dropped[]` で AI に理由が返る）。
 */
export function validateLineProposal(raw: unknown, existingRowIds: ReadonlySet<string>): ValidateResult<McpScriptLinesProposal> {
  const dropped: DroppedItem[] = [];
  const warnings: string[] = [];
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rawLines = Array.isArray(src.lines) ? src.lines : [];
  if (rawLines.length > MAX_LINES) {
    dropped.push({ path: 'lines', reason: 'too_long', detail: `${rawLines.length}件 → 先頭${MAX_LINES}件のみ` });
  }
  if (existingRowIds.size === 0) {
    warnings.push('この台本にはまだ行がありません。script_line_draft は既存の行を埋めるだけなので、先に script_outline_draft で骨格を作って取り込んでください。');
  }

  const lines: McpScriptLine[] = [];
  rawLines.slice(0, MAX_LINES).forEach((rawLine, i) => {
    const l = rawLine && typeof rawLine === 'object' ? (rawLine as Record<string, unknown>) : {};
    const rowId = str(l.row_id, 100);
    if (!rowId) {
      dropped.push({ path: `lines[${i}].row_id`, reason: 'missing_field' });
      return;
    }
    if (!existingRowIds.has(rowId)) {
      dropped.push({ path: `lines[${i}].row_id`, reason: 'bad_reference', detail: rowId });
      return;
    }
    const name = str(l.name, MAX_LABEL_LEN);
    const text = str(l.text, MAX_TEXT_LEN);
    if (hasHtml(name) || hasHtml(text)) {
      dropped.push({ path: `lines[${i}]`, reason: 'html' });
      return;
    }
    lines.push({ row_id: rowId, name, text, is_q_word: !!l.is_q_word });
  });

  const advice = Array.isArray(src.advice) ? src.advice.filter((a): a is string => typeof a === 'string').slice(0, 10) : undefined;
  return { payload: { lines, ...(advice ? { advice } : {}) }, dropped, warnings };
}
