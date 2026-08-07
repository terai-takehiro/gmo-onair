/**
 * プロジェクト管理の見積のまとめ（v4 大⑤・ダッシュボードの KPI 2枚）
 *
 * モックの KPI は5枚で、後ろの2枚が **個別見積 未提出** と **検収待ち** です。
 * migration 173 で `estimates` にぶら下げられるようになったので数えられます。
 *
 * ── 「検収待ち」の数え方（実測して直したところ）──────────────
 *
 * 検収したかは売上 (`revenues.inspection_date`) が持っています。案件の見積は
 * 受注（`accepted`）になると売上に変換され `revenue_id` が入るので、
 * そこから検収の有無が読めます。
 *
 * **ところがプロジェクトの見積は、いまは売上に変換できません** —
 * `revenues.project_id` が **NOT NULL** で、案件（GLS）を持たない
 * 自社構築のプロジェクトでは行を作れないためです（実 DB で確認）。
 * `revenues` を NULL 可にするには**同じ表を読む 53 か所**を見直すことになり、
 * migration 138 が「41 か所が `status` を見ていない」を理由に避けた道です。
 *
 * そこで **受注（`accepted`）にした見積のうち、検収が済んでいないもの**を数えます:
 *
 *   ・売上に変換済み → その売上の `inspection_date` が空なら検収待ち
 *   ・変換していない → 検収待ち（まだ請求も立っていない）
 *
 * **画面にはこの但し書きをそのまま出します。** 「検収待ち」と書いてあるのに
 * 請求が立っていないものまで数えている、が黙って起きるのがいちばん困ります。
 *
 * ── 0 件でも枠を出す ────────────────────────────────────────
 *
 * 数えられる状態になったので、0 は「無い」という正しい答えです
 * （数えられなかった頃は枠ごと出しませんでした）。
 */
import { queryOne } from '../../../shared/db/connection';

export interface GpmEstimateSummary {
  /** まだ出していない見積（draft） */
  draft: number;
  draft_amount: number;
  /** 出したまま返事が無い見積（sent） */
  sent: number;
  sent_amount: number;
  /**
   * 受注（accepted）にしたが検収が済んでいないもの。
   * **売上に変換していないものも含む**（プロジェクトの見積は変換できないため）
   */
  awaiting_inspection: number;
  awaiting_inspection_amount: number;
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

export async function gpmEstimateSummary(): Promise<GpmEstimateSummary> {
  // 値引きは単価を下げず別建てなので、合計は subtotal から引く（案件側と同じ）
  const est = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'draft')                              AS draft,
       COALESCE(SUM(subtotal - discount) FILTER (WHERE status = 'draft'), 0) AS draft_amount,
       COUNT(*) FILTER (WHERE status = 'sent')                               AS sent,
       COALESCE(SUM(subtotal - discount) FILTER (WHERE status = 'sent'), 0)  AS sent_amount
     FROM estimates
     WHERE deleted_at IS NULL AND gpm_project_id IS NOT NULL`,
  );

  const insp = await queryOne(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(COALESCE(r.amount, e.subtotal - e.discount)), 0) AS amount
       FROM estimates e
       LEFT JOIN revenues r ON r.id = e.revenue_id AND r.deleted_at IS NULL
      WHERE e.deleted_at IS NULL AND e.gpm_project_id IS NOT NULL
        AND e.status = 'accepted'
        AND (r.id IS NULL OR r.inspection_date IS NULL)`,
  );

  return {
    draft: num(est?.draft), draft_amount: num(est?.draft_amount),
    sent: num(est?.sent), sent_amount: num(est?.sent_amount),
    awaiting_inspection: num(insp?.n), awaiting_inspection_amount: num(insp?.amount),
  };
}
