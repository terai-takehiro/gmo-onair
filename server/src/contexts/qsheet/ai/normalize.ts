/**
 * LLM の生出力（`schemas.ts` の形）→ 提案として保存する内部表現への正規化（段8・04-ai.md §2-5）。
 *
 * **純関数。ネットワークにも DB にも触らない。** 呼び出し側（`*-ai.service.ts`）が
 * `recordAiOutput` の直後に `dropped` を `normalize.<reason>.<path>` の `field_path` で
 * `ai_corrections` へ積む（§2-5 の F8）。
 *
 * 守ること（04-ai.md §2-4・§2-5）:
 * - ③セリフは**既存の行 id にしか書かない**。行を増やしも減らしもしない
 * - ①②は AI が言い出した一時キー（`key`）を渡すだけで、**genId はクライアントが取り込み時に振る**
 * - **AI に HTML を書かせない**。`text`/`html` に `<` が混ざっていたら剥がす（捨てない）
 */

export interface DroppedItem {
  /** `normalize.<reason>.` の `<reason>` 部分 */
  reason: string;
  /** `normalize.<reason>.<path>` の `<path>` 部分（例 `rows[3]`） */
  path: string;
  value: unknown;
}

export interface EventPlanProposalColumn {
  key: string;
  col_group: 'venue' | 'prep' | 'ops';
  label: string;
  room_hint: string | null;
}
export interface EventPlanProposalItem {
  key: string;
  column_ref: string;
  title: string;
  kind: string;
  start_min: number;
  end_min: number;
  assignee: string | null;
  note: string | null;
  reason: string | null;
}
export interface EventPlanProposal {
  columns: EventPlanProposalColumn[];
  items: EventPlanProposalItem[];
}

export interface ScriptOutlineProposalRow {
  key: string;
  label: string;
  duration_sec: number;
  speaker: string | null;
  hint: string | null;
}
export interface ScriptOutlineProposalSection {
  key: string;
  label: string;
  duration_sec: number;
  rows: ScriptOutlineProposalRow[];
}
export interface ScriptOutlineProposal {
  budget_sec: number | null;
  sections: ScriptOutlineProposalSection[];
}

export interface ScriptLinesProposalLine {
  row_id: string;
  name: string;
  text: string;
  is_q_word: boolean;
}
export interface ScriptLinesProposal {
  lines: ScriptLinesProposalLine[];
  advice: string[];
}

const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s);
/** AI に HTML を書かせない（§2-5）。捨てるのではなく**剥がす** — 文章自体は使える */
const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');
const MAX_MIN = 2880; // 48時間（日跨ぎ上限。02-schedule.md §3）

/* ── ①イベント設計 ───────────────────────────────────────────── */

export interface NormalizeEventPlanOptions {
  /** 既存列の id（`column_ref` がここに無ければ、提案内 columns[].key を見る） */
  existingColumnIds: Set<string>;
}

export function normalizeEventPlan(
  raw: { columns?: unknown; items?: unknown },
  opts: NormalizeEventPlanOptions,
): { plan: EventPlanProposal; dropped: DroppedItem[] } {
  const dropped: DroppedItem[] = [];
  const seenColKeys = new Set<string>();
  const columns: EventPlanProposalColumn[] = [];
  for (const [i, c] of asArray(raw.columns).entries()) {
    const key = String(c.key ?? '').trim() || `col${i}`;
    if (seenColKeys.has(key)) {
      dropped.push({ reason: 'duplicate_key', path: `columns[${i}]`, value: c });
      continue;
    }
    const colGroup = c.col_group;
    if (colGroup !== 'venue' && colGroup !== 'prep' && colGroup !== 'ops') {
      dropped.push({ reason: 'bad_col_group', path: `columns[${i}]`, value: c });
      continue;
    }
    seenColKeys.add(key);
    columns.push({
      key, col_group: colGroup, label: String(c.label ?? ''),
      room_hint: strOrNull(String(c.room_hint ?? '')),
    });
  }

  const validRefs = new Set<string>([...opts.existingColumnIds, ...seenColKeys]);
  const seenItemKeys = new Set<string>();
  const items: EventPlanProposalItem[] = [];
  for (const [i, it] of asArray(raw.items).entries()) {
    const key = String(it.key ?? '').trim() || `item${i}`;
    const columnRef = String(it.column_ref ?? '');
    if (!validRefs.has(columnRef)) {
      dropped.push({ reason: 'bad_reference', path: `items[${i}]`, value: it });
      continue;
    }
    const startMin = Math.round(Number(it.start_min));
    const endMin = Math.round(Number(it.end_min));
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)
      || startMin < 0 || endMin > MAX_MIN || endMin <= startMin) {
      dropped.push({ reason: 'bad_time_range', path: `items[${i}]`, value: it });
      continue;
    }
    if (seenItemKeys.has(key)) {
      dropped.push({ reason: 'duplicate_key', path: `items[${i}]`, value: it });
      continue;
    }
    seenItemKeys.add(key);
    items.push({
      key, column_ref: columnRef, title: String(it.title ?? ''),
      kind: String(it.kind ?? 'other'), start_min: startMin, end_min: endMin,
      assignee: strOrNull(String(it.assignee ?? '')), note: strOrNull(String(it.note ?? '')),
      reason: strOrNull(String(it.reason ?? '')),
    });
  }

  return { plan: { columns, items }, dropped };
}

/* ── ②台本の骨格 ─────────────────────────────────────────────── */

export function normalizeScriptOutline(
  raw: { budget_sec?: unknown; sections?: unknown },
  budgetSec: number | null,
): { plan: ScriptOutlineProposal; dropped: DroppedItem[] } {
  const dropped: DroppedItem[] = [];
  const seenSecKeys = new Set<string>();
  const sections: ScriptOutlineProposalSection[] = [];

  for (const [si, s] of asArray(raw.sections).entries()) {
    const secKey = String(s.key ?? '').trim() || `sec${si}`;
    if (seenSecKeys.has(secKey)) {
      dropped.push({ reason: 'duplicate_key', path: `sections[${si}]`, value: s });
      continue;
    }
    seenSecKeys.add(secKey);
    const seenRowKeys = new Set<string>();
    const rows: ScriptOutlineProposalRow[] = [];
    for (const [ri, r] of asArray(s.rows).entries()) {
      const rowKey = String(r.key ?? '').trim() || `${secKey}r${ri}`;
      if (seenRowKeys.has(rowKey)) {
        dropped.push({ reason: 'duplicate_key', path: `sections[${si}].rows[${ri}]`, value: r });
        continue;
      }
      seenRowKeys.add(rowKey);
      rows.push({
        key: rowKey, label: String(r.label ?? ''),
        duration_sec: Math.max(0, Math.round(Number(r.duration_sec)) || 0),
        speaker: strOrNull(String(r.speaker ?? '')),
        hint: strOrNull(stripTags(String(r.hint ?? ''))),
      });
    }
    const secDuration = Math.max(0, Math.round(Number(s.duration_sec)) || 0)
      || rows.reduce((a, r) => a + r.duration_sec, 0);
    sections.push({ key: secKey, label: String(s.label ?? ''), duration_sec: secDuration, rows });
  }

  // ⚠️ 尺の制約（04-ai.md §2-1）: 枠の長さが絶対の上限。超える骨格は末尾から落とす
  if (budgetSec && budgetSec > 0) {
    let total = sections.reduce((a, s) => a + s.duration_sec, 0);
    while (total > budgetSec && sections.length > 0) {
      const removed = sections.pop()!;
      total -= removed.duration_sec;
      dropped.push({ reason: 'budget_exceeded', path: `sections[${removed.key}]`, value: removed });
    }
  }

  return { plan: { budget_sec: budgetSec, sections }, dropped };
}

/* ── ③セリフ ─────────────────────────────────────────────────── */

export function normalizeScriptLines(
  raw: { lines?: unknown; advice?: unknown },
  allowedRowIds: Set<string>,
  allowedNames?: Set<string>,
): { plan: ScriptLinesProposal; dropped: DroppedItem[] } {
  const dropped: DroppedItem[] = [];
  const seen = new Set<string>();
  const lines: ScriptLinesProposalLine[] = [];

  for (const [i, l] of asArray(raw.lines).entries()) {
    const rowId = String(l.row_id ?? '');
    if (!rowId || !allowedRowIds.has(rowId)) {
      dropped.push({ reason: 'bad_reference', path: `rows[${i}]`, value: l });
      continue;
    }
    if (seen.has(rowId)) {
      dropped.push({ reason: 'duplicate_row', path: `rows[${i}]`, value: l });
      continue;
    }
    const text = stripTags(String(l.text ?? '')).trim();
    if (!text) {
      dropped.push({ reason: 'empty_text', path: `rows[${i}]`, value: l });
      continue;
    }
    seen.add(rowId);
    let name = String(l.name ?? '').trim();
    if (name && allowedNames && !allowedNames.has(name)) name = '';
    lines.push({ row_id: rowId, name, text, is_q_word: !!l.is_q_word });
  }

  const advice = asStringArray(raw.advice).filter((s) => s.trim() !== '').slice(0, 10);
  return { plan: { lines, advice }, dropped };
}

/* ── util ─────────────────────────────────────────────────────── */

function asArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x ?? '')) : [];
}
