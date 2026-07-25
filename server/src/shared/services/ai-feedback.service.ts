/**
 * AI フィードバックの集計・還流 (ai-feedback-loop Phase 3〜4)
 *
 * 貯めた ai_outputs / ai_corrections を「AI が読める形」「人がレビューできる形」に
 * 集計する。ここが無いと記録しているだけで賢くならない (条件4)。
 *
 * 設計判断:
 *  - **成果 (受注/失注・金額) は既存データから読み取り時に導出する**。
 *    日次バッチで ai_outcomes に焼き込む案もあるが、バッチという可動部品を増やさず
 *    常に最新を返せるほうが良い。ai_outcomes テーブルは、既存データから導出できない
 *    もの (Slack のリアクション、満足度など) のために残してある。
 *  - **無修正採用 (correction_type='none') を分母に含める**。これが無いと
 *    「よく直されるフィールド」だけ見えて、改善したかどうかが分からない。
 */
import { queryAll, queryOne } from '../db/connection';

export interface FieldStat {
  field_path: string;
  corrections: number;
  fix: number;
  enrich: number;
  reject: number;
}

export interface FeedbackDigest {
  kind: string;
  window_days: number;
  /** レビューを経た AI 出力の件数 (修正 or 無修正の記録がある = 分母) */
  reviewed_outputs: number;
  /** 一切直されずに採用された件数 */
  accepted_as_is: number;
  /** 無修正採用率 (0〜1)。改善したかの主要指標 */
  as_is_rate: number | null;
  /** よく直されるフィールド (多い順) */
  top_corrected_fields: FieldStat[];
  /** 直近の修正例 (AI が「何をどう間違えたか」を具体で読むため) */
  recent_examples: Array<{
    field_path: string;
    correction_type: string;
    before: unknown;
    after: unknown;
    note: string | null;
    corrected_at: string;
  }>;
  /** 成果 (既存データから導出。kind=estimate_draft のときのみ) */
  outcomes?: {
    won: number;
    lost: number;
    in_progress: number;
    won_amount_total: number;
  };
  /** AI への助言 (集計から機械的に組み立てた文。プロンプト更新を待たず効かせる) */
  advice: string[];
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

export async function getFeedbackDigest(kind = 'estimate_draft', windowDays = 90): Promise<FeedbackDigest> {
  const w = String(windowDays);

  const totals = await queryOne(
    `SELECT
       COUNT(DISTINCT o.id) AS reviewed_outputs,
       COUNT(DISTINCT o.id) FILTER (
         WHERE NOT EXISTS (
           SELECT 1 FROM ai_corrections c2
            WHERE c2.output_id = o.id AND c2.correction_type <> 'none'
         )
       ) AS accepted_as_is
     FROM ai_outputs o
     WHERE o.kind = ?
       AND o.created_at >= NOW() - (? || ' days')::interval
       AND EXISTS (SELECT 1 FROM ai_corrections c WHERE c.output_id = o.id)`,
    [kind, w],
  ) as any;

  const reviewed = num(totals?.reviewed_outputs);
  const asIs = num(totals?.accepted_as_is);

  const fields = await queryAll(
    `SELECT c.field_path,
            COUNT(*) AS corrections,
            COUNT(*) FILTER (WHERE c.correction_type = 'fix')    AS fix,
            COUNT(*) FILTER (WHERE c.correction_type = 'enrich') AS enrich,
            COUNT(*) FILTER (WHERE c.correction_type = 'reject') AS reject
       FROM ai_corrections c
       JOIN ai_outputs o ON o.id = c.output_id
      WHERE o.kind = ? AND c.correction_type <> 'none'
        AND c.corrected_at >= NOW() - (? || ' days')::interval
      GROUP BY c.field_path
      ORDER BY COUNT(*) DESC
      LIMIT 15`,
    [kind, w],
  ) as any[];

  const examples = await queryAll(
    `SELECT c.field_path, c.correction_type, c.before_value, c.after_value, c.note, c.corrected_at
       FROM ai_corrections c
       JOIN ai_outputs o ON o.id = c.output_id
      WHERE o.kind = ? AND c.correction_type <> 'none'
        AND c.corrected_at >= NOW() - (? || ' days')::interval
      ORDER BY c.corrected_at DESC
      LIMIT 10`,
    [kind, w],
  ) as any[];

  const digest: FeedbackDigest = {
    kind,
    window_days: windowDays,
    reviewed_outputs: reviewed,
    accepted_as_is: asIs,
    as_is_rate: reviewed > 0 ? Math.round((asIs / reviewed) * 100) / 100 : null,
    top_corrected_fields: fields.map((f) => ({
      field_path: f.field_path,
      corrections: num(f.corrections),
      fix: num(f.fix),
      enrich: num(f.enrich),
      reject: num(f.reject),
    })),
    recent_examples: examples.map((e) => ({
      field_path: e.field_path,
      correction_type: e.correction_type,
      before: e.before_value,
      after: e.after_value,
      note: e.note ?? null,
      corrected_at: e.corrected_at,
    })),
    advice: [],
  };

  // 成果は既存データから導出 (バッチ不要・常に最新)。
  // estimate_draft は target_id = projects.id なので案件のステージと確定売上に繋がる。
  if (kind === 'estimate_draft') {
    const oc = await queryOne(
      `SELECT
         COUNT(DISTINCT p.id) FILTER (WHERE p.stage IN ('a_won','s_completed')) AS won,
         COUNT(DISTINCT p.id) FILTER (WHERE p.stage = 'e_lost')                AS lost,
         COUNT(DISTINCT p.id) FILTER (WHERE p.stage NOT IN ('a_won','s_completed','e_lost')) AS in_progress,
         COALESCE(SUM(DISTINCT p.expected_amount) FILTER (WHERE p.stage IN ('a_won','s_completed')), 0) AS won_amount_total
       FROM ai_outputs o
       JOIN projects p ON p.id = o.target_id AND o.target_table = 'projects' AND p.deleted_at IS NULL
      WHERE o.kind = 'estimate_draft'
        AND o.created_at >= NOW() - (? || ' days')::interval`,
      [w],
    ) as any;
    digest.outcomes = {
      won: num(oc?.won), lost: num(oc?.lost), in_progress: num(oc?.in_progress),
      won_amount_total: num(oc?.won_amount_total),
    };
  }

  digest.advice = buildAdvice(digest);
  return digest;
}

/**
 * 集計から助言文を機械的に組み立てる。
 * AI がツール応答としてこれを読むことで、**プロンプトを更新しなくても
 * 次の実行から傾向を踏まえられる**のが狙い (条件4の一番効く経路)。
 */
function buildAdvice(d: FeedbackDigest): string[] {
  const out: string[] = [];
  if (d.reviewed_outputs === 0) {
    out.push('まだレビュー済みの出力がないため傾向は不明。通常どおり作成してよい。');
    return out;
  }
  if (d.as_is_rate != null) {
    const pct = Math.round(d.as_is_rate * 100);
    out.push(`直近${d.window_days}日で人がレビューした${d.reviewed_outputs}件のうち、無修正で採用されたのは${pct}%。`);
    if (pct < 50) out.push('半分以上が修正されている。下記のよく直されるフィールドを優先して見直すこと。');
  }
  for (const f of d.top_corrected_fields.slice(0, 3)) {
    const share = d.reviewed_outputs > 0 ? Math.round((f.corrections / d.reviewed_outputs) * 100) : 0;
    const kinds: string[] = [];
    if (f.fix) kinds.push(`値の誤り${f.fix}件`);
    if (f.reject) kinds.push(`不採用${f.reject}件`);
    if (f.enrich) kinds.push(`人が追加${f.enrich}件`);
    out.push(`${f.field_path} は ${f.corrections}件修正 (レビュー件数比 ${share}%) — ${kinds.join(' / ')}。`);
  }
  if (d.outcomes && (d.outcomes.won || d.outcomes.lost)) {
    out.push(`成果: 受注${d.outcomes.won}件 / 失注${d.outcomes.lost}件 / 進行中${d.outcomes.in_progress}件。`);
  }
  return out;
}
