/**
 * 移行センター（設定 ＞ 10月の切替）— 改番の対象一覧
 *
 * 2026年10月の事業再編・P1残作業。設計の全文: docs/reorg-2026-10-plan.md（§4.8）。
 *
 * ── 対象の決め方 ──────────────────────────────────────────────
 *
 * 「発番済みで、現行番号がまだ旧方式（GLS）のまま」の案件を全部取り、1件ずつ
 * `resolveEntity()`（P1・entity-resolution.service.ts）に**そのまま**掛ける。
 * 対象かどうか・SCS/GSS/GMOのどれになるかの判定はここでは持たず、既存の
 * 導出ロジックを再利用する（判定を2か所に持たない）。`entityCode: null` が
 * 返るもの（`org_transition.state==='off'`・実施日未定・切替日前 など）は
 * 対象外として静かに落とす——**これにより、state='off'のあいだはこの一覧は
 * 常に0件**になる（他のentity_code依存機能と同じ「切替に自然に追随する」作り）。
 *
 * ⚠️ **B（プロジェクト管理）だけは`resolveEntity()`の外で「進行中」を絞る。**
 * `resolveEntity()`はglsCategory==='B'なら常に'GMO'を返す（stageを見ない）ため、
 * 完了・失注のB案件も対象に含めてしまう。§4.4の決定（「完了・失注でないBは
 * すべてGMOへ。完了済みの4件はGSSの履歴としてGLS-Bのまま残す」）どおり、
 * ここで`stage NOT IN ('s_completed','e_lost')`を明示的に掛ける。
 *
 * ── 「改番が必要なのにまだしていない」の判定 ───────────────────
 *
 * `project_numbers`の現行番号（`retired_at IS NULL`）が`scheme='gls'`のものだけを
 * 見る。改番済み（`scheme='entity'`）は対象から外れる——改番のたびに
 * `renumberProject()`が新しい`project_numbers`行を追記し旧番号を`retired_at`化する
 * ため、このクエリは自然に縮んでいく（改番の進捗＝この一覧の減り方）。
 *
 * ── 使う側 ────────────────────────────────────────────────────
 *
 * 移行センターの対象一覧・進捗（残件数）・通知ジョブ・`done`状態への
 * 「残件0」ゲート、全部がこの1関数を呼ぶ（同じ数字を2か所で数えない）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { resolveEntity, resolveEventDate } from '../../sales/services/entity-resolution.service';
import type { LegalEntityCode } from './legal-entity.service';
import type { GlsCategory } from '../../../shared/services/sequence.service';

export interface RenumberCandidate {
  project_id: string;
  current_number: string;
  name: string;
  customer_id: string | null;
  customer_name: string | null;
  /** グループ内外（お客様マスターの印。導出理由の裏取り表示用） */
  is_gmo_group: boolean;
  target_entity_code: LegalEntityCode;
  /** entity_note に書くのと同じ、人が読める導出理由 */
  reason: string;
  event_date: string | null;
  /** 発行済み・入金済みの売上がある（改番自体は止めないが、請求キーは追随しない旨の注記に使う） */
  has_invoiced_revenue: boolean;
  /** 客先がグループ内外の自社行になり得る取引先か（§4.8。導出規則だけでは検出できない例の注記） */
  self_customer_hint: boolean;
  assigned_to: string | null;
}

/** §4.8 の実例（「インテリジェンス」GLS-A023 ほか）に合わせた名前一致だけで判定する。
 *  自動で書き換えはしない——注記を出すだけ（§4.8 のとおり）。 */
function selfCustomerHint(customerName: string | null): boolean {
  if (!customerName) return false;
  return customerName.includes('サムライコンテンツスタジオ') || customerName.includes('サムライスタジオ');
}

interface CandidateRow {
  id: string;
  gls_number: string;
  name: string;
  gls_category: GlsCategory | null;
  stage: string;
  customer_id: string | null;
  assigned_to: string | null;
  customer_name: string | null;
  is_gmo_group: boolean | null;
}

/** 完了・失注は「進行中」ではない（§4.4・§9-L）。B の絞り込みにだけ使う */
const B_DONE_STAGES = ['s_completed', 'e_lost'];

export async function listRenumberCandidates(): Promise<RenumberCandidate[]> {
  const rows = (await queryAll(
    `SELECT p.id, p.gls_number, p.name, p.gls_category, p.stage, p.customer_id, p.assigned_to,
            c.name AS customer_name, c.is_gmo_group
       FROM projects p
       JOIN project_numbers pn ON pn.project_id = p.id AND pn.retired_at IS NULL
       LEFT JOIN companies c ON c.id = p.customer_id
      WHERE pn.scheme = 'gls' AND p.deleted_at IS NULL AND p.gls_number IS NOT NULL
      ORDER BY p.gls_number`,
  )) as unknown as CandidateRow[];

  const out: RenumberCandidate[] = [];
  for (const row of rows) {
    if (row.gls_category === 'B' && B_DONE_STAGES.includes(row.stage)) continue;

    const resolved = await resolveEntity(row.id, row.gls_category, row.customer_id);
    if (!resolved.entityCode) continue; // 対象外（off／実施日未定／切替日前 など）

    const [eventDate, invoicedRow] = await Promise.all([
      resolveEventDate(row.id),
      queryOne(
        `SELECT 1 AS x FROM revenues
          WHERE project_id = ? AND deleted_at IS NULL
            AND (invoice_issued = TRUE OR paid_date IS NOT NULL) LIMIT 1`,
        [row.id],
      ) as Promise<{ x: number } | null>,
    ]);

    out.push({
      project_id: row.id,
      current_number: row.gls_number,
      name: row.name,
      customer_id: row.customer_id,
      customer_name: row.customer_name,
      is_gmo_group: row.is_gmo_group === true,
      target_entity_code: resolved.entityCode,
      reason: resolved.reason,
      event_date: eventDate,
      has_invoiced_revenue: !!invoicedRow,
      self_customer_hint: selfCustomerHint(row.customer_name),
      assigned_to: row.assigned_to,
    });
  }
  return out;
}
