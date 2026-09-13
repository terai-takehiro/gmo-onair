/**
 * 運営マニュアル 段C — 差し込みブロックの resolver: 借りる機材（`rental.list`）。
 * 設計: docs/design/v4/production-manual.md §4-3・§5-4。レジストリは
 * `shared/src/production/manualBlocks.ts`（`server/src/shared/production/manualBlocks.ts` は複製・変更しない）。
 *
 * ── 実際に読んだ既存サービス ─────────────────────────────────────────
 *   - `server/src/contexts/qsheet/services/rental.service.ts` の `getReservationGroups(owner)`
 *     （品目・数量・会社・受渡し日を会社ごとにグループ化して返す。他 owner との重ね順警告
 *     `conflict` も含む——差し込みブロックでも「他の案件/番組と被っている」が分かるほうが
 *     有用なため、絞り込まずそのまま渡す）
 *   - `server/src/contexts/qsheet/device-settings-owner.ts` の `Owner`/`ownerWhere`
 *     （`qsheet_rental_reservations` は project_id/program_id のみ対応。`rental.service.ts`
 *     の `ownerCols()` も同じ制約——doc_no owner は元々扱えない）
 *
 * ── 共通ポリシー ──────────────────────────────────────────────────────
 * resolve はサーバーの実行権限で読む。呼び出しユーザーが `qsheet` モジュール権限を個別に
 * 持っているかはここでは再チェックしない——**マニュアル自体が `canAccessManual` を通っていること
 * だけ**をゲートにする。この resolver は `resolve` 経由専用で、単体で外部公開しない。
 *
 * ── data の形（client-linked-ui 担当向け） ───────────────────────────────────
 * `{ groups: ReservationGroup[] } | null`（`rental.service.ts` の型そのまま）。
 *   - owner が無い（project/program どちらの id も持たないマニュアル）ときは `null`
 *   - owner はあるが予約行が1件も無いときは `{ groups: [] }`（`project.team` が
 *     projectId はあるがメンバー0件のとき `[]` を返すのと同じ考え方——「その案件/番組に
 *     レンタル機材の枠自体が無い」ではなく「まだ何も予約していない」ので空配列で表す）
 */
import { queryOne, type Row } from '../../../../shared/db/connection';
import { getReservationGroups, type ReservationGroup } from '../rental.service';
import { ownerWhere, type Owner } from '../../device-settings-owner';
import type { ManualResolverCtx, ManualResolverResult } from './project.resolver';

/** ctx の projectId/programId から `Owner` を組み立てる。どちらも無ければ null */
function toOwner(ctx: ManualResolverCtx): Owner | null {
  if (ctx.projectId) return { kind: 'project', projectId: ctx.projectId };
  if (ctx.programId) return { kind: 'program', programId: ctx.programId };
  return null;
}

export interface RentalListData {
  groups: ReservationGroup[];
}

/** `getReservationGroups` は行ごとの `updated_at` を返さないため、その owner の
 *  予約行の最新 `updated_at` を別途1件引く。1件も無ければ null（=空リスト） */
async function fetchLatestUpdatedAt(owner: Owner): Promise<string | null> {
  const { clause, params } = ownerWhere(owner, 1);
  const row = (await queryOne(
    `SELECT MAX(updated_at) AS updated_at FROM qsheet_rental_reservations WHERE ${clause} AND deleted_at IS NULL`,
    params,
  )) as Row | undefined;
  return row?.updated_at ? new Date(row.updated_at as string).toISOString() : null;
}

/** `rental.list`: 借りる機材（品目・数量・会社・受渡し）。秘密を持たないため常に平文 */
export async function resolveRentalList(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  const owner = toOwner(ctx);
  if (!owner) return { data: null, updatedAt: null };

  const { groups } = await getReservationGroups(owner);
  const updatedAt = await fetchLatestUpdatedAt(owner);
  const data: RentalListData = { groups };
  return { data, updatedAt };
}
