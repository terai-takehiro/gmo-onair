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
/**
 * 議事録の `kind`。**文字列を書き写さない** — 書き写すと、`kind` を変えた日に
 * 集計だけが黙って 0 件になる（画面には「まだレビュー済みの出力がない」と出るだけ）。
 */
import { MINUTES_KIND } from '../../contexts/sales/services/minutes.service';
// 制作資料 v4 段9（04-ai.md §6-1）。qsheet 系 kind だけの分岐に使う定数。
import {
  SCRIPT_OUTLINE_KIND, SCRIPT_LINE_KIND, PRODUCTION_CHAT_KIND, QSHEET_AI_KINDS, AI_REVIEW_PRODUCTION_KIND,
} from '../../contexts/qsheet/ai/kinds';
import { parseDur } from '../schedule/time';

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

/**
 * 段9（04-ai.md §6-1）。混ざった期間のデータは後から切り分けられないため、
 * `segmentKey` / `source` は windowDays と同時に渡す第3引数として1本にまとめる
 * （README §5「05の第3引数をオブジェクトにして同時に入れる」の決定）。
 */
export interface DigestOpts {
  /** `type:<project_category>|loc:<location_id>` の形。qsheet 系 kind だけが持つ */
  segmentKey?: string;
  /** 'server' = 画面からの生成 / 'mcp' = 外部の Claude からの提案（`propose_qsheet_draft`） */
  source?: 'server' | 'mcp';
}

/** 骨格の成績（kind=script_outline_draft のときのみ・§6-1） */
export interface OutlineStat {
  /** 締めた提案の数（1段目 early） */
  settled: number;
  /** 取り込まれた行の総数 */
  rows_applied: number;
  /** 確定時に残っていた行（fix/reject が付かなかった行） */
  rows_survived: number;
  survival_rate: number | null;
  /** AI の初期値の精度（主指標）。qsheet_cue_actuals がある行だけ（無ければ null） */
  ai_duration_mape: number | null;
  /** 人の最終見積もりの精度（参考） */
  human_duration_mape: number | null;
  /** 人が AI の尺をどちらへ何秒動かしたか（正=延ばした） */
  plan_drift_sec: number | null;
  /** 実尺が取れた本番の数 */
  runs_measured: number;
  /** その期間に broadcast_date が過ぎた台本の数（分母。取得率の計算に使う） */
  broadcasts_total: number;
}

/** セリフの成績（kind=script_line_draft のときのみ・§6-1） */
export interface LineStat {
  lines_applied: number;
  lines_survived: number;
  /** 言い回しだけ直された（正規化編集距離 >= しきい値） */
  rephrased: number;
  /** 中身を変えられた */
  fixed: number;
  rejected: number;
}

/** 壁打ちの成績（kind=production_chat のときのみ・§6-1） */
export interface ChatStat {
  assistant_messages: number;
  /** 3値のどれかが付いた数（分母） */
  rated: number;
  good: number;
  /** 提案を起こした発言（起票率の分子） */
  spawned: number;
  spawn_rate: number | null;
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
    /**
     * 受注になった案件の金額。**確定した売上があればそれ、無ければ起票時の見込み**
     * （レビューでの指摘 #87 / #52）。見込みのままの件数は `won_without_revenue`。
     */
    won_amount_total: number;
    /** 受注のうち、まだ確定売上が1行も無い件数（＝見込みで数えたもの） */
    won_without_revenue: number;
  };
  /** 投入の指標 (kind=task_intake のときのみ) */
  intake?: IntakeStat;
  /** 骨格の成績（kind=script_outline_draft のときのみ・段9） */
  outline?: OutlineStat;
  /** セリフの成績（kind=script_line_draft のときのみ・段9） */
  line?: LineStat;
  /** 壁打ちの成績（kind=production_chat のときのみ・段9） */
  chat?: ChatStat;
  /**
   * 議事録の持ち帰りのその後 (kind=minutes_draft のときのみ)。
   *
   * **AI が拾った持ち帰りが、実際に追いかけられたか**を見る。
   * 案件ではタスク (`open_items[].task_id`)、プロジェクトでは未確認事項
   * (`open_items[].ask_id`) になるので、**印が付いた要素の数**で数える
   * （`ai_outcomes` に行を足さない — 既存データで表現できる）。
   *
   * ⚠️ **追跡率を「AI が正しかった率」と読まないこと。** 人が言い換えて
   * 登録することもあり、その場合は印が付かない。**拾いすぎの目安**として見る
   * （率が低いほど「タスクにも未確認事項にもならない持ち帰り」を出しすぎている）。
   */
  minutes?: {
    /** 確定した議事録の数 */
    confirmed: number;
    /** そこに載っていた持ち帰りの総数 */
    open_items_total: number;
    /** タスク or 未確認事項になった数 */
    open_items_tracked: number;
    /** 追跡率 (0〜1) */
    tracked_rate: number | null;
  };
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

/**
 * 段9（04-ai.md §6-1）。`segmentKey`/`source` の絞り込みを SQL の末尾に足す。
 * **`o.` エイリアス（`ai_outputs`）を前提にする** — 5つの集計クエリは全部これで JOIN している。
 * 混ざった期間のデータは後から切り分けられないため、既存の9呼び出し元（opts省略）は
 * このまま何も変わらない（`opts` が無ければ条件を1本も足さない）。
 */
function extraFilter(opts: DigestOpts | undefined): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts?.segmentKey) {
    conds.push(`o.payload_snapshot->'context'->>'segment_key' = ?`);
    params.push(opts.segmentKey);
  }
  // model には MCP 由来だけ `mcp:` が前置される（§6-5c）。これを唯一の手がかりにする —
  // 新しい列は作らない（既存9か所の記録形を変えずに済む）
  if (opts?.source === 'mcp') {
    conds.push(`o.model LIKE 'mcp:%'`);
  } else if (opts?.source === 'server') {
    conds.push(`(o.model IS NULL OR o.model NOT LIKE 'mcp:%')`);
  }
  return { sql: conds.length ? ` AND ${conds.join(' AND ')}` : '', params };
}

export async function getFeedbackDigest(kind = 'estimate_draft', windowDays = 90, opts?: DigestOpts): Promise<FeedbackDigest> {
  const w = String(windowDays);
  const seg = extraFilter(opts);

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
       AND EXISTS (SELECT 1 FROM ai_corrections c WHERE c.output_id = o.id)
       ${seg.sql}`,
    [kind, w, ...seg.params],
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
        ${seg.sql}
      GROUP BY c.field_path
      ORDER BY COUNT(*) DESC
      LIMIT 15`,
    [kind, w, ...seg.params],
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
        ${seg.sql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 15`,
    [kind, w, ...seg.params],
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
        ${seg.sql}
      GROUP BY 1, 2
      ORDER BY COUNT(DISTINCT o.id) DESC`,
    [kind, w, ...seg.params],
  ) as any[];

  const examples = await queryAll(
    `SELECT c.field_path, c.correction_type, c.before_value, c.after_value, c.note, c.corrected_at
       FROM ai_corrections c
       JOIN ai_outputs o ON o.id = c.output_id
      WHERE o.kind = ? AND c.correction_type <> 'none'
        AND c.corrected_at >= NOW() - (? || ' days')::interval
        ${seg.sql}
      ORDER BY c.corrected_at DESC
      LIMIT 10`,
    [kind, w, ...seg.params],
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
    /*
     * ⚠️ **`SUM(DISTINCT 金額)` は使わない**（レビューでの指摘 #52）。
     *
     * 1つの案件に AI の出力が何回も付く（起票 → 直し → 再起票）ので、素直に結合すると
     * 案件が何行にもなります。前の版はそれを `SUM(DISTINCT p.expected_amount)` で
     * 避けていましたが、これは**「同じ金額の案件」を1件に潰します** — 定型の案件は
     * 金額が揃うのが普通なので（50万円の配信が3件なら 150万円ではなく **50万円**）、
     * **受注額が実際より小さく出ます**。しかも**それらしい数字**なので、
     * 台帳と突き合わせるまで誰も気づけません。
     *
     * **先に案件を1行に畳んでから**足します（`DISTINCT p.id, ...` の内側）。
     *
     * ⚠️ **受注額は確定した売上で数える**（レビューでの指摘 #87）。`expected_amount` は
     * **起票のときの見込み**で、見積が受注になっても更新されません（**更新しない**のが
     * 正しい — 上書きすると「AI がいくらと見込んだか」が消え、この digest が
     * 比べる相手そのものを失います）。**確定した売上があればそれを、無ければ見込みを**使い、
     * どちらで数えたかは呼ぶ側に返します。
     */
    /*
     * ⚠️ **この PR のレビューで2つ直しました。**
     *
     * ①**分け合う請求（グループ請求）はこの案件への配分額で数える。**
     *   `revenues.project_id` は**グループの代表1件**しか指さないので、そこだけで足すと
     *   **代表の案件がグループ全体の額を受け取り、ほかの案件は「売上が無い」ことになって
     *   見込みに落ちます**。財務の台帳（`revenues.routes.ts`）と同じく
     *   `revenue_allocations.allocated_amount` を使います。
     * ②**「売上の行が無い」と「合計が 0 円」を分ける。** `NULLIF(合計, 0)` にすると、
     *   **0 円で計上した売上**（無償対応・相殺）を「売上が無い」と見なして見込みに
     *   差し替え、**実績が 0 円だった案件が見込みの金額で受注額に入り**ます。
     *   行数（`n_rows`）で分けます。
     *
     * ⚠️ **この文字列の中にバッククォートを書かないこと**（テンプレートリテラルが
     * そこで終わり、型検査が読めない形になります。実際に踏みました）。
     */
    const oc = await queryOne(
      `SELECT COUNT(*) FILTER (WHERE stage IN ('a_won','s_completed')) AS won,
              COUNT(*) FILTER (WHERE stage = 'e_lost')                AS lost,
              COUNT(*) FILTER (WHERE stage NOT IN ('a_won','s_completed','e_lost')) AS in_progress,
              COALESCE(SUM(amount) FILTER (WHERE stage IN ('a_won','s_completed')), 0) AS won_amount_total,
              COUNT(*) FILTER (WHERE stage IN ('a_won','s_completed') AND revenue_rows = 0) AS won_without_revenue
         FROM (
           SELECT DISTINCT p.id, p.stage,
                  -- 売上の行があればその合計、無ければ起票時の見込み（上の説明の②）
                  CASE WHEN r.n_rows > 0 THEN r.amount ELSE COALESCE(p.expected_amount, 0) END AS amount,
                  r.n_rows AS revenue_rows
             FROM ai_outputs o
             JOIN projects p ON p.id = o.target_id AND o.target_table = 'projects' AND p.deleted_at IS NULL
             LEFT JOIN LATERAL (
               -- 分け合う請求はこの案件への配分額で数える（上の説明の①）
               SELECT COALESCE(SUM(COALESCE(ra.allocated_amount, rv.amount)), 0) AS amount,
                      COUNT(*) AS n_rows
                 FROM revenues rv
                 LEFT JOIN revenue_allocations ra ON ra.revenue_id = rv.id AND ra.project_id = p.id
                WHERE rv.deleted_at IS NULL AND rv.status = 'confirmed'
                  AND (rv.project_id = p.id OR ra.project_id = p.id)
             ) r ON TRUE
            WHERE o.kind = ?
              AND o.created_at >= NOW() - (? || ' days')::interval
         ) AS one_row_per_project`,
      [kind, w],
    ) as any;
    digest.outcomes = {
      won: num(oc?.won), lost: num(oc?.lost), in_progress: num(oc?.in_progress),
      won_amount_total: num(oc?.won_amount_total),
      won_without_revenue: num(oc?.won_without_revenue),
    };
  }

  /*
    議事録の持ち帰りのその後。**読み取り時に導出する**（バッチを作らない）。

    ここは長らく穴だった（`.claude/skills/ai-feedback-loop/references/onair-current-state.md`
    の「成果 △ 持ち帰り→タスクの導出は未」）。プロジェクト管理から
    **持ち帰り → 未確認事項**を作れるようにしたので、案件のタスクと合わせて
    「拾った持ち帰りが追いかけられたか」を数えられるようになった。

    **確定した議事録だけを分母にする** — 下書きのままのものを混ぜると、
    確定していない（＝まだ誰も持ち帰りを処理していない）ぶんで率が下がる。
  */
  if (kind === MINUTES_KIND) {
    const mn = await queryOne(
      `SELECT COUNT(DISTINCT m.id) AS confirmed,
              COALESCE(SUM(jsonb_array_length(m.open_items)), 0) AS items_total,
              COALESCE(SUM((
                SELECT COUNT(*) FROM jsonb_array_elements(m.open_items) e
                 -- ⚠️ jsonb の存在演算子（疑問符）は使えない。この製品の DB 層は
                 --    それをプレースホルダとして数えるので、syntax error で落ちる（実際に踏んだ）。
                 --    ->> は鍵が無ければ NULL を返すので同じことが言える。
                 --    （SQL の注釈にバッククォートも書かない。テンプレート文字列が途中で終わる）
                 WHERE e->>'task_id' IS NOT NULL OR e->>'ask_id' IS NOT NULL
              )), 0) AS items_tracked
         FROM ai_outputs o
         JOIN project_minutes m ON m.id = o.target_id
          AND o.target_table = 'project_minutes' AND m.deleted_at IS NULL
        WHERE o.kind = ?
          AND m.confirmed_at IS NOT NULL
          AND o.created_at >= NOW() - (? || ' days')::interval`,
      [kind, w],
    ) as any;
    const total = num(mn?.items_total);
    digest.minutes = {
      confirmed: num(mn?.confirmed),
      open_items_total: total,
      open_items_tracked: num(mn?.items_tracked),
      tracked_rate: total > 0 ? num(mn?.items_tracked) / total : null,
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

  // qsheet 系 kind の分岐（段9・04-ai.md §6-1）。他の9か所の kind は素通り
  if (kind === SCRIPT_OUTLINE_KIND) digest.outline = await computeOutlineStat(windowDays, opts);
  if (kind === SCRIPT_LINE_KIND) digest.line = await computeLineStat(windowDays, opts);
  if (kind === PRODUCTION_CHAT_KIND) digest.chat = await computeChatStat(windowDays);

  digest.advice = buildAdvice(digest);
  // 月次レビューが2回連続で未実施なら、AI 自身が読む場所に出す（§5-5 手順3。
  // 「AI が読む場所に出すのがいちばん確実」）。qsheet 系 digest のときだけ
  if (isQsheetDigestKind(kind)) digest.advice = [...(await qsheetReviewAdvice()), ...digest.advice];
  return digest;
}

const QSHEET_DIGEST_KINDS: readonly string[] = [...QSHEET_AI_KINDS, PRODUCTION_CHAT_KIND];
function isQsheetDigestKind(kind: string): boolean {
  return QSHEET_DIGEST_KINDS.includes(kind);
}

/**
 * 行単位（`rows[<id>]...`）の修正を、reject > fix > rephrase の優先順位で1行1種別に畳む。
 * `diffByKey` はフィールド単位で複数の差分を出す（同じ行に `.name` の fix と `.html` の
 * rephrase が両方付くことがある）ので、単純に COUNT(DISTINCT field_path) すると
 * 同じ行が2回数えられる。**行の生死（survived/not）は行単位でしか意味を持たない**ため、
 * ここで1行に畳んでから数える。
 */
async function rowSeverityCounts(
  kind: string, windowDays: number, opts: DigestOpts | undefined,
): Promise<{ rejected: number; fixed: number; rephrased: number }> {
  const w = String(windowDays);
  const pf = proposalFilter(opts);
  const row = await queryOne(
    `WITH per_row AS (
       SELECT regexp_replace(c.field_path, '^(rows\\[[^\\]]*\\]).*$', '\\1') AS row_key,
              MAX(CASE WHEN c.correction_type = 'reject' THEN 3
                       WHEN c.correction_type = 'fix' THEN 2
                       WHEN c.correction_type = 'rephrase' THEN 1
                       ELSE 0 END) AS severity
         FROM ai_corrections c
         JOIN ai_outputs o ON o.id = c.output_id
         JOIN qsheet_ai_proposals p ON p.id = o.target_id AND o.target_table = 'qsheet_ai_proposals'
        WHERE p.kind = ? AND p.settled_at IS NOT NULL
          AND p.applied_at >= NOW() - (? || ' days')::interval
          AND c.field_path LIKE 'rows[%' AND c.field_path NOT LIKE 'late.%'
          AND c.correction_type IN ('fix', 'reject', 'rephrase')
          ${pf.sql}
        GROUP BY 1
     )
     SELECT COUNT(*) FILTER (WHERE severity = 3) AS rejected,
            COUNT(*) FILTER (WHERE severity = 2) AS fixed,
            COUNT(*) FILTER (WHERE severity = 1) AS rephrased
       FROM per_row`,
    [kind, w, ...pf.params],
  ) as any;
  return { rejected: num(row?.rejected), fixed: num(row?.fixed), rephrased: num(row?.rephrased) };
}

/** 中央値。空配列は null（「まだ何も無い」と「0」を区別する） */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** `qsheet_ai_proposals` を直接見る集計向けの絞り込み（`extraFilter` の `p.` 版）。
 * `source` は `ai_outputs.model` の `mcp:` 接頭辞ではなく、提案そのものが持つ
 * `qsheet_ai_proposals.source` 列（'server'|'mcp'）をそのまま使う（より直接的で正確）。 */
function proposalFilter(opts: DigestOpts | undefined): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts?.segmentKey) { conds.push(`p.context->>'segment_key' = ?`); params.push(opts.segmentKey); }
  if (opts?.source) { conds.push(`p.source = ?`); params.push(opts.source); }
  return { sql: conds.length ? ` AND ${conds.join(' AND ')}` : '', params };
}

/**
 * 骨格の成績（§5-3a・§6-1）。**尺の精度が主指標**。`ai_duration_mape` は
 * 「AI の初期値」対「実尺」で、`human_duration_mape`（人の最終見積もり）とは別に出す
 * （人が全部直すと後者だけ良く見える逆転を防ぐ。検査 AIループ#F3）。
 */
async function computeOutlineStat(windowDays: number, opts: DigestOpts | undefined): Promise<OutlineStat> {
  const w = String(windowDays);
  const pf = proposalFilter(opts);

  const agg = await queryOne(
    `SELECT COUNT(*) AS settled,
            COALESCE(SUM(jsonb_array_length(COALESCE(p.applied_ids->'rows', '[]'::jsonb))), 0) AS rows_applied
       FROM qsheet_ai_proposals p
      WHERE p.kind = ? AND p.settled_at IS NOT NULL
        AND p.applied_at >= NOW() - (? || ' days')::interval
        ${pf.sql}`,
    [SCRIPT_OUTLINE_KIND, w, ...pf.params],
  ) as any;
  const rowsApplied = num(agg?.rows_applied);
  const sev = await rowSeverityCounts(SCRIPT_OUTLINE_KIND, windowDays, opts);
  const rowsSurvived = Math.max(0, rowsApplied - sev.fixed - sev.rejected);

  // 尺の精度: settled な提案の applied_payload（AI の初期値）と qsheet_cue_actuals（実尺）を
  // Node 側で突合する（重み・判定を直すたびに migration が要らないよう、点数付けと同じ作法）
  const proposals = await queryAll(
    `SELECT p.document_id, p.applied_payload
       FROM qsheet_ai_proposals p
      WHERE p.kind = ? AND p.settled_at IS NOT NULL AND p.document_id IS NOT NULL
        AND p.applied_at >= NOW() - (? || ' days')::interval
        ${pf.sql}
      ORDER BY p.applied_at DESC
      LIMIT 300`,
    [SCRIPT_OUTLINE_KIND, w, ...pf.params],
  ) as any[];

  const aiMape: number[] = [];
  const humanMape: number[] = [];
  const drift: number[] = [];
  let runsMeasured = 0;

  if (proposals.length > 0) {
    // 文書ごとに最新1件だけ使う（作り直された場合、実尺と比べたいのは直近に取り込んだ版）
    const latestByDoc = new Map<string, any>();
    for (const p of proposals) {
      const id = String(p.document_id);
      if (!latestByDoc.has(id)) latestByDoc.set(id, p); // 上のクエリは applied_at DESC 済み
    }
    const docIds = [...latestByDoc.keys()];
    const cues = await queryAll(
      `SELECT document_id, run_id, row_id, section_id, planned_sec, actual_sec, pass_no
         FROM qsheet_cue_actuals WHERE document_id = ANY(?::text[])`,
      [docIds],
    ) as any[];
    // その run・その行の最終 pass だけ使う（撮り直しは最後の版で見る。§10 の pass_no の理由と同じ）
    const latestPass = new Map<string, any>();
    for (const c of cues) {
      const key = `${c.document_id} ${c.run_id} ${c.row_id ?? ''} ${c.section_id}`;
      const cur = latestPass.get(key);
      if (!cur || num(c.pass_no) > num(cur.pass_no)) latestPass.set(key, c);
    }
    const runKeys = new Set<string>();
    for (const c of latestPass.values()) {
      runKeys.add(`${c.document_id} ${c.run_id}`);
      const p = latestByDoc.get(String(c.document_id));
      const payload = (p?.applied_payload ?? {}) as { rows?: Record<string, unknown>[]; sections?: Record<string, unknown>[] };
      const rows = Array.isArray(payload.rows) ? payload.rows : [];
      const sections = Array.isArray(payload.sections) ? payload.sections : [];
      const el = c.row_id
        ? rows.find((r) => String(r?.row_id ?? r?.id ?? '') === String(c.row_id))
        : sections.find((s) => String(s?.row_id ?? s?.id ?? s?.key ?? '') === String(c.section_id));
      if (!el) continue;
      const aiDur = parseDur((el as any).duration);
      const actual = num(c.actual_sec);
      const planned = c.planned_sec == null ? null : num(c.planned_sec);
      if (aiDur > 0) {
        aiMape.push(Math.abs(actual - aiDur) / aiDur);
        if (planned != null) drift.push(planned - aiDur);
      }
      if (planned != null && planned > 0) humanMape.push(Math.abs(actual - planned) / planned);
    }
    runsMeasured = runKeys.size;
  }

  // broadcast_date は TEXT（`YYYY-MM-DD...`）。ISO 形式は文字列比較で日付比較できる
  // （substr せず先頭一致に頼らないよう左右とも同じ書式の文字列にして比べる）
  const broadcastsRow = await queryOne(
    `SELECT COUNT(*) AS n FROM qsheet_documents
      WHERE deleted_at IS NULL AND broadcast_date IS NOT NULL
        AND substr(broadcast_date, 1, 10) < to_char(CURRENT_DATE, 'YYYY-MM-DD')
        AND substr(broadcast_date, 1, 10) >= to_char(CURRENT_DATE - (? || ' days')::interval, 'YYYY-MM-DD')`,
    [w],
  ) as any;

  return {
    settled: num(agg?.settled), rows_applied: rowsApplied, rows_survived: rowsSurvived,
    survival_rate: rowsApplied > 0 ? Math.round((rowsSurvived / rowsApplied) * 100) / 100 : null,
    ai_duration_mape: median(aiMape), human_duration_mape: median(humanMape), plan_drift_sec: median(drift),
    runs_measured: runsMeasured, broadcasts_total: num(broadcastsRow?.n),
  };
}

/** セリフの成績（§5-3c・§6-1）。生存＝「none」と「rephrase」（言い直させただけ）。`fix`/`reject` だけが「死」 */
async function computeLineStat(windowDays: number, opts: DigestOpts | undefined): Promise<LineStat> {
  const w = String(windowDays);
  const pf = proposalFilter(opts);
  const agg = await queryOne(
    `SELECT COALESCE(SUM(jsonb_array_length(COALESCE(p.applied_ids->'rows', '[]'::jsonb))), 0) AS lines_applied
       FROM qsheet_ai_proposals p
      WHERE p.kind = ? AND p.settled_at IS NOT NULL
        AND p.applied_at >= NOW() - (? || ' days')::interval
        ${pf.sql}`,
    [SCRIPT_LINE_KIND, w, ...pf.params],
  ) as any;
  const linesApplied = num(agg?.lines_applied);
  const sev = await rowSeverityCounts(SCRIPT_LINE_KIND, windowDays, opts);
  const linesSurvived = Math.max(0, linesApplied - sev.fixed - sev.rejected);
  return {
    lines_applied: linesApplied, lines_survived: linesSurvived,
    rephrased: sev.rephrased, fixed: sev.fixed, rejected: sev.rejected,
  };
}

/** 壁打ちの成績（§5-2b・§5-3d・§6-1）。`qsheet_ai_messages` を直接見る（ai_corrections 経由だと
 * 起票率・rated の分母が正しく出ない — 押されなかった発言を「none」に数えてはいけないため） */
async function computeChatStat(windowDays: number): Promise<ChatStat> {
  const w = String(windowDays);
  const row = await queryOne(
    `SELECT
       COUNT(*) FILTER (WHERE role = 'assistant')                                    AS assistant_messages,
       COUNT(*) FILTER (WHERE role = 'assistant' AND feedback IS NOT NULL)           AS rated,
       COUNT(*) FILTER (WHERE role = 'assistant' AND feedback = 'good')              AS good,
       COUNT(*) FILTER (WHERE role = 'assistant' AND spawned_proposal_id IS NOT NULL) AS spawned
       FROM qsheet_ai_messages
      WHERE created_at >= NOW() - (? || ' days')::interval`,
    [w],
  ) as any;
  const assistantMessages = num(row?.assistant_messages);
  const spawned = num(row?.spawned);
  return {
    assistant_messages: assistantMessages, rated: num(row?.rated), good: num(row?.good), spawned,
    spawn_rate: assistantMessages > 0 ? Math.round((spawned / assistantMessages) * 100) / 100 : null,
  };
}

/**
 * 月次レビューが2か月連続で未実施なら、AI 自身が読む digest.advice の先頭に出す
 * （§5-5 手順3。「AI 自身が読む場所に出すのがいちばん確実」）。
 * 器（`ops_reports`）が無い・0件のとき（未実施が2回に満たない）は何も言わない
 * — 「始まったばかりで最初の1回がまだ」を「未実施が続いている」と誤読させない。
 */
async function qsheetReviewAdvice(): Promise<string[]> {
  try {
    const rows = await queryAll(
      `SELECT reviewed_at FROM ops_reports
        WHERE kind = ? AND deleted_at IS NULL
        ORDER BY period_key DESC LIMIT 2`,
      [AI_REVIEW_PRODUCTION_KIND],
    ) as any[];
    if (rows.length < 2) return [];
    if (rows.every((r) => r.reviewed_at == null)) {
      return ['⚠️ 先月・先々月の制作資料 AI 月次レビューが未実施です（ops_reports.kind=ai_review_production）。'
        + '担当者に確認を依頼してください。'];
    }
    return [];
  } catch (e) {
    console.warn('[qsheet-ai] qsheetReviewAdvice に失敗しました（続行）:', (e as Error).message);
    return [];
  }
}

/**
 * 集計から助言文を機械的に組み立てる。
 * AI がツール応答としてこれを読むことで、**プロンプトを更新しなくても
 * 次の実行から傾向を踏まえられる**のが狙い (条件4の一番効く経路)。
 */
/**
 * 骨格の尺の精度（kind=script_outline_draft のときだけ中身が出る・§5-3a）。
 * ⚠️ **実尺の取得率を必ず並べる。** ランダウンを使わない現場は `qsheet_cue_actuals` に
 * 1行も入らないので、取得率が低いほど「几帳面なチームの本番」に自己選択バイアスが掛かる。
 * 5割を切っている間は断定しない（既存の「10件未満は断定しない」作法と同じ）。
 */
function outlineAdvice(d: FeedbackDigest): string[] {
  const o = d.outline;
  if (!o) return [];
  const out: string[] = [];
  const rate = o.broadcasts_total > 0 ? o.runs_measured / o.broadcasts_total : null;
  if (rate != null) {
    const pct = Math.round(rate * 100);
    out.push(`実尺の記録がある本番: ${o.runs_measured}/${o.broadcasts_total}件（${pct}%）。`);
    if (rate < 0.5) {
      out.push('実尺の記録がある本番が少ないため、尺の傾向（AIの精度・押し傾向）は断定できません。');
    }
  }
  if (o.ai_duration_mape != null) {
    out.push(`AI が置いた尺の精度（誤差率の中央値）: ${Math.round(o.ai_duration_mape * 100)}%`
      + (o.human_duration_mape != null ? `（人の最終見積もり: ${Math.round(o.human_duration_mape * 100)}%）` : '') + '。');
  }
  if (o.plan_drift_sec != null && Math.abs(o.plan_drift_sec) >= 10) {
    const dir = o.plan_drift_sec > 0 ? '延ばす' : '縮める';
    out.push(`人は AI の尺を中央値で ${Math.abs(Math.round(o.plan_drift_sec))}秒${dir}方向に直している。`);
  }
  return out;
}

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
  // outline も「直されたか」とは別の信号（実尺の取得率）を含むので、reviewed_outputs=0 の
  // 早期return より前に出す（inquiryAdvice と同じ理由）
  out.push(...outlineAdvice(d));
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
  if (d.minutes && d.minutes.open_items_total > 0) {
    const m = d.minutes;
    const pct = m.tracked_rate == null ? null : Math.round(m.tracked_rate * 100);
    out.push(
      `確定した議事録${m.confirmed}件に載せた持ち帰り${m.open_items_total}件のうち、`
      + `タスクか未確認事項になったのは${m.open_items_tracked}件`
      + (pct == null ? '。' : `（${pct}%）。`),
    );
    // **半分以上が追われていないなら拾いすぎ**。ただし「AI が間違えた」とは言わない —
    // 人が言い換えて登録した場合も印が付かないので、断定すると誤った学習になる
    if (pct != null && pct < 50) {
      out.push('持ち帰りを出しすぎている可能性がある（言い換えて登録された分は数に入らない）。'
        + '相手の判断を待つもの・次にやることが決まるものだけを持ち帰りに入れること。');
    }
  }
  if (d.outcomes && (d.outcomes.won || d.outcomes.lost)) {
    out.push(`成果: 受注${d.outcomes.won}件 / 失注${d.outcomes.lost}件 / 進行中${d.outcomes.in_progress}件。`);
    // **どうやって数えた金額かを書く**（レビューでの指摘 #87）。確定売上がまだ無い案件は
    // 起票時の見込みで数えているので、書かないと「受注額」だと読まれる
    if (d.outcomes.won_without_revenue > 0) {
      out.push(`受注額 ${d.outcomes.won_amount_total.toLocaleString()} 円のうち、`
        + `${d.outcomes.won_without_revenue}件はまだ確定売上が無く、起票時の見込みで数えている。`);
    }
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
