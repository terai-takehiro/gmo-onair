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

/** モデル / プロンプト版ごとの成績。プロンプトを直して改善したかを比較する単位 */
export interface ModelStat {
  model: string;
  prompt_version: string;
  reviewed_outputs: number;
  accepted_as_is: number;
  as_is_rate: number | null;
}

/** 投入 (task_intake) 専用の指標 */
export interface IntakeStat {
  /** AI が出した下書きの総数 */
  drafts_total: number;
  /** 人が確認して登録した数 */
  drafts_committed: number;
  /** 人がチェックを外した数 (= 誤検知) */
  drafts_rejected: number;
  /** 誤検知率 (0〜1)。「要らないものを拾いすぎていないか」 */
  false_positive_rate: number | null;
  /** 投入から生まれたタスクのその後 (AI が置いた期限が現実的だったかの手掛かり) */
  tasks_completed_on_time: number;
  tasks_completed_late: number;
  tasks_overdue: number;
  tasks_open: number;
  /** 期限内完了率 (0〜1)。完了したタスクのうち期限内だったもの */
  on_time_rate: number | null;
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
  /**
   * よく直される**フィールドの種類** (多い順)。配列の鍵を潰して集計する。
   *
   * `tasks[d1].due_at` と `tasks[d2].due_at` は「1 回の投入の 1 件目 / 2 件目」でしかなく、
   * 鍵ごとに分けると同じ「期限を直された」が draft 数だけ分裂して、
   * 上位が `tasks[d1..d15]` で埋まり**どのフィールドが弱いのか読めなくなる**。
   * AI が読んで行動を変えるのはこちら。
   */
  top_corrected_field_types: FieldStat[];
  /**
   * 鍵ごとの集計 (多い順)。
   * 見積の `items[camera].unit_price` のように**鍵自体に意味がある**場合に見る。
   * 投入の draft_key のような通し番号では意味を持たない。
   */
  top_corrected_fields: FieldStat[];
  /** モデル / プロンプト版ごとの成績 */
  by_model: ModelStat[];
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
  /** 投入の指標 (kind=task_intake のときのみ) */
  intake?: IntakeStat;
  /**
   * 取り込んだ情報の行き先 (kind=inquiry_intake のときのみ)。
   * **拾いすぎていないか**を見る指標 — 見送りの割合が高ければ拾いすぎ。
   * `misc_inquiries.state` から導出する (`ai_outcomes` に行を足さない)
   */
  inquiry?: {
    total: number;
    unsorted: number;
    stock: number;
    ticket: number;
    project: number;
    dropped: number;
    dropped_rate: number | null;
  };
  /** AI への助言 (集計から機械的に組み立てた文。プロンプト更新を待たず効かせる) */
  advice: string[];
}

const num = (v: unknown): number => Number(v ?? 0) || 0;

const toFieldStat = (f: Record<string, unknown>): FieldStat => ({
  field_path: String(f.field_path),
  corrections: num(f.corrections),
  fix: num(f.fix),
  enrich: num(f.enrich),
  reject: num(f.reject),
});

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

  // 鍵ごと (見積の items[camera] のように鍵に意味がある場合用)
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

  // 鍵を潰した集計 (`tasks[d1].due_at` → `tasks[].due_at`)。
  // AI が読んで行動を変えるのはこちら。鍵ごとだと同じ「期限を直された」が
  // draft 数だけ分裂して、上位が通し番号で埋まり傾向が読めなくなる。
  const fieldTypes = await queryAll(
    `SELECT regexp_replace(c.field_path, '\\[[^\\]]*\\]', '[]', 'g') AS field_path,
            COUNT(*) AS corrections,
            COUNT(*) FILTER (WHERE c.correction_type = 'fix')    AS fix,
            COUNT(*) FILTER (WHERE c.correction_type = 'enrich') AS enrich,
            COUNT(*) FILTER (WHERE c.correction_type = 'reject') AS reject
       FROM ai_corrections c
       JOIN ai_outputs o ON o.id = c.output_id
      WHERE o.kind = ? AND c.correction_type <> 'none'
        AND c.corrected_at >= NOW() - (? || ' days')::interval
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 15`,
    [kind, w],
  ) as any[];

  // モデル / プロンプト版ごとの成績。
  // **これが無いと「プロンプトを直して良くなったのか」を数字で言えない。**
  const models = await queryAll(
    `SELECT COALESCE(o.model, '(不明)')          AS model,
            COALESCE(o.prompt_version, '(なし)') AS prompt_version,
            COUNT(DISTINCT o.id)                 AS reviewed_outputs,
            COUNT(DISTINCT o.id) FILTER (
              WHERE NOT EXISTS (
                SELECT 1 FROM ai_corrections c2
                 WHERE c2.output_id = o.id AND c2.correction_type <> 'none'
              )
            ) AS accepted_as_is
       FROM ai_outputs o
      WHERE o.kind = ?
        AND o.created_at >= NOW() - (? || ' days')::interval
        AND EXISTS (SELECT 1 FROM ai_corrections c WHERE c.output_id = o.id)
      GROUP BY 1, 2
      ORDER BY COUNT(DISTINCT o.id) DESC`,
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
    top_corrected_field_types: fieldTypes.map(toFieldStat),
    top_corrected_fields: fields.map(toFieldStat),
    by_model: models.map((m) => {
      const rv = num(m.reviewed_outputs);
      const ai = num(m.accepted_as_is);
      return {
        model: m.model,
        prompt_version: m.prompt_version,
        reviewed_outputs: rv,
        accepted_as_is: ai,
        as_is_rate: rv > 0 ? Math.round((ai / rv) * 100) / 100 : null,
      };
    }),
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
  // `project_draft` (AI が起票したネタ) も同じ形で読める — どちらも
  // `target_id = projects.id` なので、案件のステージがそのまま成果になる。
  // **`ai_outcomes` に行を足さない**: 既存データから導出できるものに
  // 新しいテーブルを作ると、書き忘れた日から数字が嘘になる
  if (kind === 'estimate_draft' || kind === 'project_draft') {
    const oc = await queryOne(
      `SELECT
         COUNT(DISTINCT p.id) FILTER (WHERE p.stage IN ('a_won','s_completed')) AS won,
         COUNT(DISTINCT p.id) FILTER (WHERE p.stage = 'e_lost')                AS lost,
         COUNT(DISTINCT p.id) FILTER (WHERE p.stage NOT IN ('a_won','s_completed','e_lost')) AS in_progress,
         COALESCE(SUM(DISTINCT p.expected_amount) FILTER (WHERE p.stage IN ('a_won','s_completed')), 0) AS won_amount_total
       FROM ai_outputs o
       JOIN projects p ON p.id = o.target_id AND o.target_table = 'projects' AND p.deleted_at IS NULL
      WHERE o.kind = ?
        AND o.created_at >= NOW() - (? || ' days')::interval`,
      [kind, w],
    ) as any;
    digest.outcomes = {
      won: num(oc?.won), lost: num(oc?.lost), in_progress: num(oc?.in_progress),
      won_amount_total: num(oc?.won_amount_total),
    };
  }

  // 取り込んだ情報の行き先。**同じく既存データから導出する**。
  // 「有益なものだけ取り込め」と言っているツールなので、見送りの割合が
  // そのまま拾いすぎの度合いになる。
  if (kind === 'inquiry_intake') {
    const iq = await queryOne(
      `SELECT COUNT(DISTINCT q.id)                                      AS total,
              COUNT(DISTINCT q.id) FILTER (WHERE q.state = 'unsorted')  AS unsorted,
              COUNT(DISTINCT q.id) FILTER (WHERE q.state = 'stock')     AS stock,
              COUNT(DISTINCT q.id) FILTER (WHERE q.state = 'ticket')    AS ticket,
              COUNT(DISTINCT q.id) FILTER (WHERE q.state = 'project')   AS project,
              COUNT(DISTINCT q.id) FILTER (WHERE q.state = 'dropped')   AS dropped
         FROM ai_outputs o
         JOIN misc_inquiries q ON q.id = o.target_id
          AND o.target_table = 'misc_inquiries' AND q.deleted_at IS NULL
        WHERE o.kind = ?
          AND o.created_at >= NOW() - (? || ' days')::interval`,
      [kind, w],
    ) as any;
    // **仕分けが済んだものだけを分母にする。** 未仕分けを混ぜると、
    // 溜めている人が多い週ほど「拾いすぎていない」ように見える
    const sorted = num(iq?.stock) + num(iq?.ticket) + num(iq?.project) + num(iq?.dropped);
    digest.inquiry = {
      total: num(iq?.total), unsorted: num(iq?.unsorted), stock: num(iq?.stock),
      ticket: num(iq?.ticket), project: num(iq?.project), dropped: num(iq?.dropped),
      dropped_rate: sorted > 0 ? num(iq?.dropped) / sorted : null,
    };
  }

  // 投入の指標。こちらも読み取り時に導出する (バッチを作らない)。
  // 「拾いすぎていないか (誤検知)」と「置いた期限が現実的だったか」を見る。
  if (kind === 'task_intake') {
    const st = await queryOne(
      `WITH d AS (
         SELECT i.id,
                jsonb_array_length(COALESCE(i.drafts, '[]'::jsonb)) AS draft_count
           FROM task_intake i
          WHERE i.deleted_at IS NULL
            AND i.status IN ('committed', 'discarded')
            AND i.created_at >= NOW() - (? || ' days')::interval
       ),
       t AS (
         SELECT COUNT(*) FILTER (WHERE pt.is_completed
                                   AND COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) IS NOT NULL
                                   AND pt.completed_at <= COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp)) AS on_time,
                COUNT(*) FILTER (WHERE pt.is_completed
                                   AND COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) IS NOT NULL
                                   AND pt.completed_at >  COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp)) AS late,
                COUNT(*) FILTER (WHERE NOT pt.is_completed
                                   AND COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) < NOW()) AS overdue,
                COUNT(*) FILTER (WHERE NOT pt.is_completed
                                   AND (COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) >= NOW()
                                        OR COALESCE(pt.due_at, (pt.due_date + TIME '18:00')::timestamp) IS NULL)) AS still_open
           FROM project_tasks pt
          WHERE pt.deleted_at IS NULL
            AND pt.source_ref IN (SELECT id FROM d)
       )
       SELECT (SELECT COALESCE(SUM(draft_count), 0) FROM d) AS drafts_total,
              (SELECT COUNT(*) FROM project_tasks pt2
                WHERE pt2.deleted_at IS NULL AND pt2.source_ref IN (SELECT id FROM d)) AS drafts_committed,
              t.on_time, t.late, t.overdue, t.still_open
         FROM t`,
      [w],
    ) as any;

    const total = num(st?.drafts_total);
    const committed = num(st?.drafts_committed);
    // 出した下書きのうち登録されなかった分 = 人がチェックを外した = 誤検知。
    // 下書きより登録が多くなることは無いが、人が確認画面で行を足した場合に
    // 負にならないよう 0 で下限を切る。
    const rejected = Math.max(0, total - committed);
    const onTime = num(st?.on_time);
    const late = num(st?.late);
    const finished = onTime + late;
    digest.intake = {
      drafts_total: total,
      drafts_committed: committed,
      drafts_rejected: rejected,
      false_positive_rate: total > 0 ? Math.round((rejected / total) * 100) / 100 : null,
      tasks_completed_on_time: onTime,
      tasks_completed_late: late,
      tasks_overdue: num(st?.overdue),
      tasks_open: num(st?.still_open),
      on_time_rate: finished > 0 ? Math.round((onTime / finished) * 100) / 100 : null,
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
/** 取り込んだ情報の行き先（kind=inquiry_intake のときだけ中身が出る） */
function inquiryAdvice(d: FeedbackDigest): string[] {
  const q = d.inquiry;
  if (!q || q.dropped_rate == null) return [];
  const dr = Math.round(q.dropped_rate * 100);
  const out = [
    `取り込んだ情報の行き先: チケット${q.ticket}件 / 案件${q.project}件 / ストック${q.stock}件 / 見送り${q.dropped}件`
    + `（未仕分け${q.unsorted}件は仕分けが済んでいないので数えていない）。見送り率 ${dr}%。`,
  ];
  if (dr >= 40) {
    out.push('拾いすぎている。営業・売り込み・メルマガ・自動通知を除ききれていないか、'
      + '「弊社にとって有益か」をより厳しく見ること。');
  }
  return out;
}

function buildAdvice(d: FeedbackDigest): string[] {
  const out: string[] = [];
  // **行き先は「人が直したか」とは別の信号**なので、修正が1件も無くても出す。
  // 誰も中身を直さずに全部見送っている、というのがまさに拾いすぎの形で、
  // 修正差分が無いことを理由に黙ると**その状態こそ気づけない**
  out.push(...inquiryAdvice(d));
  if (d.reviewed_outputs === 0) {
    out.push('まだレビュー済みの出力がないため、直され方の傾向は不明。通常どおり作成してよい。');
    return out;
  }
  if (d.as_is_rate != null) {
    const pct = Math.round(d.as_is_rate * 100);
    out.push(`直近${d.window_days}日で人がレビューした${d.reviewed_outputs}件のうち、無修正で採用されたのは${pct}%。`);
    if (pct < 50) out.push('半分以上が修正されている。下記のよく直されるフィールドを優先して見直すこと。');
  }
  // 助言には**鍵を潰した集計**を使う。鍵ごとだと通し番号 (tasks[d1] 等) が並んで
  // 「どのフィールドが弱いのか」が読めず、AI が行動を変えられない。
  //
  // 分母の取り方に注意: 投入は 1 出力に下書きが複数入るので、修正件数を
  // 出力件数で割ると 400% のような読めない数字になる。下書き件数で割る。
  const denom = d.intake?.drafts_total || d.reviewed_outputs;
  const denomLabel = d.intake?.drafts_total ? '下書き件数比' : 'レビュー件数比';
  for (const f of d.top_corrected_field_types.slice(0, 3)) {
    const share = denom > 0 ? Math.min(100, Math.round((f.corrections / denom) * 100)) : 0;
    const kinds: string[] = [];
    if (f.fix) kinds.push(`値の誤り${f.fix}件`);
    if (f.reject) kinds.push(`不採用${f.reject}件`);
    if (f.enrich) kinds.push(`人が追加${f.enrich}件`);
    out.push(`${f.field_path} は ${f.corrections}件修正 (${denomLabel} ${share}%) — ${kinds.join(' / ')}。`);
  }
  if (d.outcomes && (d.outcomes.won || d.outcomes.lost)) {
    out.push(`成果: 受注${d.outcomes.won}件 / 失注${d.outcomes.lost}件 / 進行中${d.outcomes.in_progress}件。`);
  }
  if (d.intake) {
    const s = d.intake;
    if (s.false_positive_rate != null && s.drafts_total > 0) {
      const fp = Math.round(s.false_positive_rate * 100);
      out.push(`出した下書き${s.drafts_total}件のうち${fp}%は人がチェックを外して登録されなかった。`);
      if (fp >= 30) {
        out.push('拾いすぎている。決定事項・報告・共有をタスクにしていないか、より厳しく見ること。');
      }
    }
    if (s.on_time_rate != null) {
      const ot = Math.round(s.on_time_rate * 100);
      out.push(`投入から生まれたタスクの期限内完了率は${ot}% (期限内${s.tasks_completed_on_time}件 / 遅延${s.tasks_completed_late}件)。`);
      if (ot < 50) {
        out.push('置いた期限が実態に対して短すぎる可能性がある。ただし期限を安易に延ばさず、原文に書かれた期限を尊重すること。');
      }
    }
    if (s.tasks_overdue > 0) {
      out.push(`期限を過ぎたまま未完了のタスクが${s.tasks_overdue}件ある。`);
    }
  }
  // モデル / プロンプト版が複数あるときだけ比較を出す (1 つだけなら情報にならない)。
  //
  // 件数が少ないうちは比較しない。**2 件で「新しい版のほうが良い」と言うのは誤り**で、
  // それを根拠にプロンプトを弄ると改善しているつもりで悪化させる。
  if (d.by_model.length > 1) {
    const ranked = d.by_model
      .filter((m) => m.reviewed_outputs >= MIN_SAMPLES_FOR_COMPARISON && m.as_is_rate != null)
      .sort((a, b) => (b.as_is_rate ?? 0) - (a.as_is_rate ?? 0));
    if (ranked.length > 1) {
      const best = ranked[0], worst = ranked[ranked.length - 1];
      const caveat = Math.min(best.reviewed_outputs, worst.reviewed_outputs) < SMALL_SAMPLE_THRESHOLD
        ? ' ただし件数が少ないので傾向として断定はできない。'
        : '';
      out.push(
        `無修正採用率の比較: ${best.model}/${best.prompt_version} が ${Math.round((best.as_is_rate ?? 0) * 100)}% ` +
        `(${best.reviewed_outputs}件) で最良、${worst.model}/${worst.prompt_version} が ` +
        `${Math.round((worst.as_is_rate ?? 0) * 100)}% (${worst.reviewed_outputs}件) で最低。${caveat}`
      );
    }
  }
  return out;
}

/** これ未満の件数のモデル / 版は比較の対象にしない */
const MIN_SAMPLES_FOR_COMPARISON = 3;
/** これ未満なら「断定はできない」と添える */
const SMALL_SAMPLE_THRESHOLD = 10;
