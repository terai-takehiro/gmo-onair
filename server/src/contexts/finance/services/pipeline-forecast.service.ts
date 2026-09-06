/**
 * 財務ダッシュボードの「営業見通し（パイプライン）」集計
 *
 * ── 何を数えるか ──────────────────────────────────────────────
 *
 * ご依頼:「登録されている売上予定額・仕入予定額を、案件フェーズに関係なく
 * 100%で合算する（① パイプライン総額）」「各案件の売上予定額・仕入予定額に、
 * 案件フェーズごとの確度を乗じて合算する（② 確度加味見込み）」。
 *
 * `getMonthlySummary`（月次損益）は `revenues.status = 'confirmed'` だけを数える
 * **実績専用**の集計（財務ダッシュボードのサブ見出しが「確定売上ベース」なのはこのため）。
 * こちらは別軸——**案件に紐づく `revenues`/`purchases` を状態を問わず全部数える**
 * （見込み `status='estimate'` も確定 `status='confirmed'` も、その案件のフェーズの確度で
 * 重みづけて合算する）。実績集計とテーブルは同じだが目的が違うので、別ファイルに分ける
 * （`monthly-summary.service.ts` に混ぜると「確定だけ数える」前提が崩れる）。
 *
 * 固定原価Pj（`code='FIXED-COGS'`）は営業案件ではないので除外する
 * （`monthly-summary.service.ts` と同じ `FIXED_COGS_CODE`）。失注 (`e_lost`) の
 * 案件も、そもそも売上・仕入を新規登録できない対象なので除外する。
 *
 * ── 期間で絞らない ────────────────────────────────────────────
 *
 * パイプラインは「いま生きている商談の見通し」のスナップショットであり、
 * 財務ダッシュボードの期間絞り込み（計上月）とは別軸。既存の案件ステージ別
 * パイプライン（`dashboard.routes.ts` の `GET /dashboard/pipeline`）も期間を持たない。
 */
import { queryAll } from '../../../shared/db/connection';
import { getStageProbabilityMap } from '../../sales/services/stage-probability.service';
import type { ProjectStage } from '../../../shared/constants/statuses';

const FIXED_COGS_CODE = 'FIXED-COGS';

export interface PipelineForecastTotals {
  revenue: number;
  purchase: number;
  grossProfit: number;
  /** 粗利率（0〜1の割合）。売上見込みが0のときは算出できないので null */
  grossMarginRate: number | null;
}

export interface PipelineForecastResult {
  total: PipelineForecastTotals;
  weighted: PipelineForecastTotals;
  byStage: {
    stage: ProjectStage;
    probability: number;
    revenue: number;
    purchase: number;
    grossProfit: number;
  }[];
}

function totalsOf(rows: { stage: ProjectStage; revenue: number; purchase: number }[]): PipelineForecastTotals {
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const purchase = rows.reduce((s, r) => s + r.purchase, 0);
  const grossProfit = revenue - purchase;
  return { revenue, purchase, grossProfit, grossMarginRate: revenue > 0 ? grossProfit / revenue : null };
}

/**
 * `entityCode` 引数（2026年10月の事業再編・P2 Round 1・§4.5〜§4.6）:
 * 渡されたときだけ会社で絞る。財務は「案件ではなく行の entity_code」で切る
 * （`list-query.ts` と同じ判断——改番・移管しても過去の行は前の会社に残る）ので、
 * `p.entity_code`（案件の今の会社）ではなく `r.entity_code`/`pu.entity_code`
 * （書いたときの会社）を見る。
 *
 * ⚠️ **社内取引（`intercompany_links`・§4.12・P2 Round 2）の扱いは entityCode の
 * 有無で変える。** `entityCode` を渡さない＝全社合算のときは**社内取引ペアを
 * 除外する**（設計どおり「外部の売上・仕入だけを数える」——除外しないと
 * 社内売上・社内仕入が両方乗り、合計の revenue/purchase が水増しされる）。
 * 一方、`entityCode` を指定して1社ぶんを見るときは**除外しない**——その会社
 * 自身の社内取引（GJVなら社内仕入・GSSなら社内売上）は、その会社の本物の
 * 売上・仕入予定なので、`getSummaryByEntity`（案件の会社別粗利）と同じ考え方で
 * 含めたままにする。
 *
 * ⚠️ **コストセンター（GMO・§4.7・P3）は entityCode の指定に関わらず常に除外する。**
 * 営業見通し（パイプライン）は「これから売上・仕入がどれだけ立ちそうか」という
 * 営業ツールで、社内取引と違い GMO 自身にとっても意味を持たない（design の
 * 「閉じる」対象——GMO は売上そのものを持たない会社なので、コスト側の
 * 見通しは別画面＝コスト側ダッシュボードが担う）。
 */
export async function getPipelineForecast(projectId?: string, entityCode?: string): Promise<PipelineForecastResult> {
  const params: string[] = [];
  let projectFilter = '';
  if (projectId) {
    projectFilter = ' AND p.id = ?';
    params.push(projectId);
  }
  // コストセンターの案件は常に除外（下記コメント参照）。`org_transition.state='off'`／
  // 未改番のあいだは該当する案件が無いので、この条件は今日は何も落とさない
  const costCenterExclusion =
    ` AND NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.code = p.entity_code AND le.kind = 'cost_center')`;
  // ⚠️ entity_code の条件は末尾に足す（`?` は出現順で置換されるため、
  // params 配列の順序と揃えること）。revenues/purchases で別名が違うので
  // 条件文字列は2本用意する（積む params の値自体は共通の1個）
  const revEntityFilter = entityCode
    ? ' AND r.entity_code = ?'
    : ' AND NOT EXISTS (SELECT 1 FROM intercompany_links il WHERE il.revenue_id = r.id)';
  const purEntityFilter = entityCode
    ? ' AND pu.entity_code = ?'
    : ' AND NOT EXISTS (SELECT 1 FROM intercompany_links il WHERE il.purchase_id = pu.id)';
  const entityParams: string[] = entityCode ? [entityCode] : [];

  const [revRows, purRows, probabilityMap] = await Promise.all([
    queryAll(
      `SELECT p.stage AS stage, COALESCE(SUM(r.amount), 0) AS total
         FROM revenues r JOIN projects p ON p.id = r.project_id
        WHERE r.deleted_at IS NULL AND p.deleted_at IS NULL
          AND p.stage != 'e_lost' AND p.code != ?${projectFilter}${revEntityFilter}${costCenterExclusion}
        GROUP BY p.stage`,
      [FIXED_COGS_CODE, ...params, ...entityParams],
    ) as Promise<{ stage: ProjectStage; total: string | number }[]>,
    queryAll(
      `SELECT p.stage AS stage, COALESCE(SUM(pu.amount), 0) AS total
         FROM purchases pu JOIN projects p ON p.id = pu.project_id
        WHERE pu.deleted_at IS NULL AND p.deleted_at IS NULL
          AND p.stage != 'e_lost' AND p.code != ?${projectFilter}${purEntityFilter}${costCenterExclusion}
        GROUP BY p.stage`,
      [FIXED_COGS_CODE, ...params, ...entityParams],
    ) as Promise<{ stage: ProjectStage; total: string | number }[]>,
    getStageProbabilityMap(),
  ]);

  const revByStage = new Map(revRows.map((r) => [r.stage, Number(r.total)]));
  const purByStage = new Map(purRows.map((r) => [r.stage, Number(r.total)]));
  const stages = new Set<ProjectStage>([...revByStage.keys(), ...purByStage.keys()]);

  const byStage = [...stages].map((stage) => {
    const revenue = revByStage.get(stage) ?? 0;
    const purchase = purByStage.get(stage) ?? 0;
    return { stage, probability: probabilityMap.get(stage) ?? 0, revenue, purchase, grossProfit: revenue - purchase };
  }).sort((a, b) => b.probability - a.probability);

  const total = totalsOf(byStage);
  const weighted = totalsOf(byStage.map((s) => ({
    stage: s.stage,
    revenue: Math.round(s.revenue * (s.probability / 100)),
    purchase: Math.round(s.purchase * (s.probability / 100)),
  })));

  return { total, weighted, byStage };
}
