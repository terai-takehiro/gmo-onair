// ①イベント設計（枠の叩き台）の取り込み（段8・04-ai.md §3-1・§10-2）。
//
// ②③（`applyProposal.ts`）は Yjs の `data` へ書くが、①は
// `qsheet_schedule_items` / `qsheet_schedule_columns` への **REST 書き込み**なので別の入口。
// 「提案に無いものは書かない・書いた分だけ `applied_ids` に積む」という約束は同じ。
import { createColumn, createItem } from "./scheduleApi";
import type { AppliedIds } from "./applyProposal";
import type { EventPlanProposal } from "./aiApi";

export interface ApplyEventPlanResult {
  appliedIds: AppliedIds;
  appliedPayload: { items: unknown[]; columns: unknown[] };
}

/**
 * 選ばれた列・項目だけを実際に作る。**取り込む前に人が外したものは呼ばない**
 * （呼び出し側がチェックボックスで絞り込んでから渡す）。
 */
export async function applyEventPlanOps(
  scheduleId: string,
  plan: EventPlanProposal,
  selectedItemKeys: Set<string>,
  existingColumnIds: Set<string>,
): Promise<ApplyEventPlanResult> {
  const appliedIds: AppliedIds = { sections: [], rows: [], items: [], columns: [] };
  const appliedColumns: unknown[] = [];
  const appliedItems: unknown[] = [];
  const keyToColumnId: Record<string, string> = {};

  // 選ばれた項目が使う列だけを作る（使われない列を無駄に作らない）
  const neededColumnKeys = new Set(
    plan.items.filter((it) => selectedItemKeys.has(it.key) && !existingColumnIds.has(it.column_ref))
      .map((it) => it.column_ref),
  );
  for (const col of plan.columns) {
    if (!neededColumnKeys.has(col.key)) continue;
    // ⚠️ `room_hint` は候補の**文字列**でしかなく `room_id` ではない
    // （AI に room_id を決めさせない・04-ai.md §11「room_id は AI に決めさせない」）。
    // サーバーは `room_id` しか読まないので、候補は見出しに添えて人に選ばせる。
    const label = col.room_hint ? `${col.label}（候補: ${col.room_hint}）` : col.label;
    const created = await createColumn(scheduleId, { col_group: col.col_group, label });
    keyToColumnId[col.key] = created.id;
    appliedIds.columns.push(created.id);
    appliedColumns.push(created);
  }

  for (const it of plan.items) {
    if (!selectedItemKeys.has(it.key)) continue;
    const columnId = existingColumnIds.has(it.column_ref) ? it.column_ref : keyToColumnId[it.column_ref];
    if (!columnId) continue; // 列が作れなかった（起きない想定だが防御的に）
    const created = await createItem(scheduleId, {
      column_id: columnId, title: it.title, kind: it.kind,
      start_min: it.start_min, end_min: it.end_min,
      assignee: it.assignee ?? undefined, note: it.note ?? undefined,
    });
    appliedIds.items.push(created.id);
    appliedItems.push(created);
  }

  return { appliedIds, appliedPayload: { items: appliedItems, columns: appliedColumns } };
}
