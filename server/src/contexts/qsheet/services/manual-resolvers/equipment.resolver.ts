/**
 * 運営マニュアル 段C — 差し込みブロックの resolver: 持ち出す機材（`equipment.lending`）。
 * 設計: docs/design/v4/production-manual.md §4-3・§5-4。レジストリは
 * `shared/src/production/manualBlocks.ts`（`server/src/shared/production/manualBlocks.ts` は複製・変更しない）。
 *
 * ── 実際に読んだ既存サービス ─────────────────────────────────────────
 *   - `server/src/contexts/equipment/services/lending.service.ts` の `lendingService.list(filter)`
 *     （`equipment_items`/`projects` を JOIN した生の行を `queryAll` でそのまま返す薄い層。
 *     `el.*` に `id・equipment_id・project_id・borrower_name・purpose・lent_at・due_date・
 *     status・condition_out・notes・updated_at` 等、JOIN 分に `equipment_name・eq_code・
 *     unit_number・project_name・gls_number` が乗る）
 *   - `server/src/shared/constants/statuses.ts` の `EQUIPMENT_LENDING_STATUS.LENT`
 *     （マジック文字列 `'lent'` を直書きしない）
 *
 * ⚠️ **`equipment_lendings` は `project_id` しか持たない（`program_id` 列が無い）。**
 * 番組（program）に紐づくマニュアルでは対応する貸出データが存在し得ないため、
 * `ctx.projectId` が無ければ**必ず** `data: []` を返す（エラーにしない。§「equipment.lending」
 * の実在チェックが「project_id が無ければ false 固定」としているのと同じ理由）。
 *
 * ── 共通ポリシー ──────────────────────────────────────────────────────
 * resolve はサーバーの実行権限で読む。呼び出しユーザーが `equipment` モジュール権限を
 * 個別に持っているかはここでは再チェックしない——**マニュアル自体が `canAccessManual` を
 * 通っていることだけ**をゲートにする。この resolver は `resolve` 経由専用で、単体で外部公開しない。
 *
 * ── data の形（client-linked-ui 担当向け） ───────────────────────────────────
 * `EquipmentLendingItem[]`（`programId` 由来のマニュアル、または貸出中が1件も無ければ `[]`）。
 * 無い項目はキーごと省く（空文字/null のラベルを出さない——`project.resolver.ts` と同じ作法）。
 */
import { lendingService } from '../../../equipment/services/lending.service';
import { EQUIPMENT_LENDING_STATUS } from '../../../../shared/constants/statuses';
import type { ManualResolverCtx, ManualResolverResult } from './project.resolver';

export interface EquipmentLendingItem {
  id: string;
  equipmentName: string;
  eqCode?: string;
  unitNumber?: string;
  borrowerName: string;
  purpose?: string;
  lentAt: string;
  dueDate?: string;
}

/** `equipment.lending`: 持ち出す機材（社内の貸出中リスト）。projectId が無ければ常に空配列 */
export async function resolveEquipmentLending(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  if (!ctx.projectId) return { data: [], updatedAt: null };

  const rows = await lendingService.list({
    status: EQUIPMENT_LENDING_STATUS.LENT,
    project_id: ctx.projectId,
  });

  const data: EquipmentLendingItem[] = rows.map((r) => {
    const item: EquipmentLendingItem = {
      id: r.id as string,
      equipmentName: r.equipment_name as string,
      borrowerName: r.borrower_name as string,
      lentAt: r.lent_at as string,
    };
    const eqCode = r.eq_code as string | null;
    const unitNumber = r.unit_number as string | null;
    const purpose = r.purpose as string | null;
    const dueDate = r.due_date as string | null;
    if (eqCode) item.eqCode = eqCode;
    if (unitNumber) item.unitNumber = unitNumber;
    if (purpose) item.purpose = purpose;
    if (dueDate) item.dueDate = dueDate;
    return item;
  });

  let updatedAt: string | null = null;
  for (const r of rows) {
    if (!r.updated_at) continue;
    const t = new Date(r.updated_at as string).toISOString();
    if (!updatedAt || t > updatedAt) updatedAt = t;
  }

  return { data, updatedAt };
}
