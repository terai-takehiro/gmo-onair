/**
 * 運営マニュアル 段C — 差し込みブロックの resolver: 収録の一覧（`recording.list`）。
 * 設計: docs/design/v4/production-manual.md §4-3・§5-4。レジストリは
 * `shared/src/production/manualBlocks.ts`（`server/src/shared/production/manualBlocks.ts` は複製・変更しない）。
 *
 * ── 実際に読んだ既存サービス ─────────────────────────────────────────
 *   - `server/src/contexts/qsheet/services/device-settings.service.ts` の `getRecording(owner)`
 *   - `server/src/contexts/qsheet/device-settings-owner.ts` の `Owner`/`ownerWhere`
 *     （`resolveOwner()` は `:ownerKey` という**文字列**から `Owner` を引く関数だが、
 *      ここでは冊子が既に `project_id`/`program_id` を持っているので、その2つから
 *      直接 `Owner` を組み立てるだけでよい——`resolveOwner()` は使わない）
 *
 * ── 共通ポリシー（呼び出し元＝ `GET /techops/manuals/:id/resolve` 側の実装） ─────────
 * resolve はサーバーの実行権限で読む。呼び出しユーザーが `qsheet` モジュール権限を個別に
 * 持っているかはここでは再チェックしない——**冊子自体が `canAccessManual` を通っていること
 * だけ**をゲートにする（一度差し込んだ情報は、冊子を見られる人になら見える、という設計判断）。
 * この resolver は `resolve` 経由専用で、単体で外部公開しない。
 *
 * ── どの日の収録設定を返すか（v1 の割り切り） ────────────────────────────────
 * `getRecording(owner)` は `owner.date` を省くと「その owner でいちばん新しい `service_date`」の
 * 設定を返す（`device-settings.service.ts` の `resolveDate`。非公開関数なのでここでは再現しない）。
 * 差し込みブロックには日付を選ぶ UI が無く（`link-sources` は `sheet.*` の3種にしか候補を
 * 出さない）、収録設定は「1 owner に対して直近の設定が1つ」という運用が実態に近いため、
 * `schedule.day` のような「冊子の予定日と一致する行を優先」という仕分けはせず、
 * 素直に「いちばん新しい」に委ねる。
 *
 * ── data の形（client-linked-ui 担当向け） ───────────────────────────────────
 * `RecordingSettings | null`（`device-settings-types.ts` の型そのまま。`decks[]` は
 * 秘密を持たないため伏せ字化しない）。owner が無い（project/program どちらの id も
 * 持たない冊子）か、その owner に収録設定が1件も無ければ `null`。
 */
import { queryOne, type Row } from '../../../../shared/db/connection';
import { getRecording } from '../device-settings.service';
import { ownerWhere, type Owner } from '../../device-settings-owner';
import type { RecordingSettings } from '../../device-settings-types';
import type { ManualResolverCtx, ManualResolverResult } from './project.resolver';

/** ctx の projectId/programId から `Owner` を組み立てる。どちらも無ければ null */
function toOwner(ctx: ManualResolverCtx): Owner | null {
  if (ctx.projectId) return { kind: 'project', projectId: ctx.projectId };
  if (ctx.programId) return { kind: 'program', programId: ctx.programId };
  return null;
}

/**
 * `getRecording`/`getStreaming` は行の `updated_at` を戻り値に含めない（`RecordingSettings`/
 * `StreamingSettings` に列が無い）ため、resolve が要る「updated_at 相当」だけを別途1件引く。
 * `resolveDate` 相当は `getRecording` 側が既に済ませているので、ここでは
 * 確定した `serviceDate` に対する行を1件引くだけでよい。
 */
async function fetchRowUpdatedAt(table: string, owner: Owner, serviceDate: string): Promise<string | null> {
  const { clause, params } = ownerWhere(owner, 1);
  const row = (await queryOne(
    `SELECT updated_at FROM ${table} WHERE ${clause} AND service_date = $${params.length + 1} AND deleted_at IS NULL`,
    [...params, serviceDate],
  )) as Row | undefined;
  return row?.updated_at ? new Date(row.updated_at as string).toISOString() : null;
}

/** `recording.list`: 収録の一覧（デッキ・形式・保存先）。秘密を持たないため常に平文 */
export async function resolveRecordingList(ctx: ManualResolverCtx): Promise<ManualResolverResult> {
  const owner = toOwner(ctx);
  if (!owner) return { data: null, updatedAt: null };

  const settings: RecordingSettings | null = await getRecording(owner);
  if (!settings) return { data: null, updatedAt: null };

  const updatedAt = await fetchRowUpdatedAt('qsheet_recording_settings', owner, settings.serviceDate);
  return { data: settings, updatedAt };
}
