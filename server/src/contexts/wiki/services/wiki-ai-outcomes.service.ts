/**
 * Wiki の AI — 成果の導出（条件3・`docs/design/v4/wiki.md` §7-3）。
 *
 * ⚠️ **`ai_outcomes` に行を焼きません。** 数えるものは全部、既にある表
 * （`wiki_page_views` / `wiki_pages` / `wiki_page_versions` / `wiki_ai_messages`）
 * から**読み取り時に**引けます。日次バッチで焼くと、書き忘れた日から数字が嘘になります
 * （`getFeedbackDigest` が案件・議事録で採っているのと同じ判断）。
 *
 * ── 何を「成果」と呼ぶか（§7-3 条件3）──────────────────────
 *
 *   AI に聞く   出典が開かれた率（`wiki_page_views.via='answer'`）
 *               「ページにする」に進んだ率（`wiki_ai_messages.spawned_page_id`）
 *               7日以内に同じ質問が再び来た率（**まだ解けていない**の目安）
 *   下書き      7日以内に公開されたか／公開後30日の閲覧数／
 *               公開後30日に**他の人**が直した回数（安定度）
 *   整える      置き換えた率まで（その後の良し悪しは読めば分かるので条件2で足りる）
 *
 * ⚠️ **「答えが現場で正しかったか」はここでは取れません**（§7-3 の「穴」）。
 * 代理指標（開かれた・ページにした・再質問が来なかった）で読みます。
 * 断定に使わないこと — 断定すると、誰も開かない良い答えが「外れ」に数えられます。
 */
import { queryOne } from '../../../shared/db/connection';
import {
  WIKI_ANSWER_KIND, WIKI_DRAFT_KIND, WIKI_REWRITE_KIND, WIKI_REASK_WINDOW_DAYS,
  WIKI_DRAFT_WINDOW_DAYS,
} from './wiki-ai.constants';

/** 0〜1 の率。分母が 0 のときは `null`（「0%」と出すと嘘になる） */
function rate(part: unknown, whole: unknown): number | null {
  const w = Number(whole ?? 0);
  if (!Number.isFinite(w) || w <= 0) return null;
  return Number(part ?? 0) / w;
}

const int = (v: unknown): number => {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) ? n : 0;
};

/* ── ① AI に聞く ──────────────────────────────────────────── */

export interface WikiAnswerOutcome {
  /** 記録のある回答の数（`ai_outputs` kind=`wiki_answer`） */
  answers_total: number;
  /** 出典つきで答えた数 */
  cited: number;
  /** 「書かれていません」と返した数（足りないページに積まれた分） */
  no_answer: number;
  /** 答えられなかった率。**上がるほど Wiki に穴がある**（AI が悪いとは限らない） */
  no_answer_rate: number | null;
  /** 出典つきの回答のうち、出典のページが実際に開かれた割合 */
  citation_open_rate: number | null;
  /** 「ページにする」に進んだ割合（採用の印） */
  spawned_page_rate: number | null;
  /** 7日以内に**同じ質問**が再び来た割合（解けていない目安） */
  reask_rate: number | null;
  /** 3値のフィードバックの内訳（押された分だけ） */
  feedback: { good: number; rephrase: number; reject: number };
  /** 引用の文が材料に見つからなかった回答の数（作文の疑い・条件1で印を残している） */
  unverified_quote_answers: number;
}

export async function answerOutcome(windowDays: number): Promise<WikiAnswerOutcome> {
  const w = String(windowDays);
  const row = await queryOne(
    `SELECT
       COUNT(*)::int AS answers_total,
       COUNT(*) FILTER (WHERE o.payload_snapshot->>'confidence' = 'cited')::int AS cited,
       COUNT(*) FILTER (WHERE o.payload_snapshot->>'confidence' = 'none')::int  AS no_answer,
       COUNT(*) FILTER (
         WHERE o.payload_snapshot->>'confidence' = 'cited'
           AND EXISTS (SELECT 1 FROM wiki_page_views v WHERE v.answer_output_id = o.id)
       )::int AS opened,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM wiki_ai_messages m
                        WHERE m.ai_output_id = o.id AND m.spawned_page_id IS NOT NULL)
       )::int AS spawned,
       COUNT(*) FILTER (
         WHERE COALESCE(o.payload_snapshot->>'normalized_question', '') <> ''
           AND EXISTS (
             SELECT 1 FROM ai_outputs o2
              WHERE o2.kind = o.kind AND o2.id <> o.id
                AND o2.payload_snapshot->>'normalized_question'
                    = o.payload_snapshot->>'normalized_question'
                AND o2.created_at >  o.created_at
                AND o2.created_at <= o.created_at + (? || ' days')::interval)
       )::int AS reasked,
       COUNT(*) FILTER (
         WHERE (o.payload_snapshot->>'unverified_quotes')::int > 0
       )::int AS unverified,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM wiki_ai_messages m
                        WHERE m.ai_output_id = o.id AND m.feedback = 'good')
       )::int AS fb_good,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM wiki_ai_messages m
                        WHERE m.ai_output_id = o.id AND m.feedback = 'rephrase')
       )::int AS fb_rephrase,
       COUNT(*) FILTER (
         WHERE EXISTS (SELECT 1 FROM wiki_ai_messages m
                        WHERE m.ai_output_id = o.id AND m.feedback = 'reject')
       )::int AS fb_reject
     FROM ai_outputs o
     WHERE o.kind = ? AND o.created_at >= NOW() - (? || ' days')::interval`,
    [String(WIKI_REASK_WINDOW_DAYS), WIKI_ANSWER_KIND, w],
  );
  const total = int(row?.answers_total);
  return {
    answers_total: total,
    cited: int(row?.cited),
    no_answer: int(row?.no_answer),
    no_answer_rate: rate(row?.no_answer, total),
    citation_open_rate: rate(row?.opened, row?.cited),
    spawned_page_rate: rate(row?.spawned, total),
    reask_rate: rate(row?.reasked, total),
    feedback: {
      good: int(row?.fb_good), rephrase: int(row?.fb_rephrase), reject: int(row?.fb_reject),
    },
    unverified_quote_answers: int(row?.unverified),
  };
}

/* ── ② AI で下書きを作る ──────────────────────────────────── */

export interface WikiDraftOutcome {
  drafts_total: number;
  /** 7日以内に公開された数と率（公開されない下書きは、材料か形が外れている） */
  published: number;
  published_rate: number | null;
  /** 公開後30日の閲覧数の平均（読まれない手順書は書いた意味が薄い） */
  views_30d_avg: number | null;
  /** 公開後30日に**他の人**が直した版の数の平均（安定度。多いほど荒い） */
  reedits_30d_avg: number | null;
}

export async function draftOutcome(windowDays: number): Promise<WikiDraftOutcome> {
  const w = String(windowDays);
  const row = await queryOne(
    `WITH d AS (
       SELECT o.id, o.created_at, o.actor_id, p.id AS page_id, p.published_at
         FROM ai_outputs o
         JOIN wiki_pages p ON p.id = o.target_id AND p.deleted_at IS NULL
        WHERE o.kind = ? AND o.target_table = 'wiki_pages'
          AND o.created_at >= NOW() - (? || ' days')::interval
     ), pub AS (
       SELECT d.*,
              (d.published_at IS NOT NULL
               AND d.published_at <= d.created_at + (? || ' days')::interval) AS published_in_window
         FROM d
     )
     SELECT COUNT(*)::int AS drafts_total,
            COUNT(*) FILTER (WHERE published_in_window)::int AS published,
            AVG(CASE WHEN published_in_window THEN (
                  SELECT COUNT(*) FROM wiki_page_views v
                   WHERE v.page_id = pub.page_id
                     AND v.viewed_at BETWEEN pub.published_at AND pub.published_at + INTERVAL '30 days'
                ) END) AS views_30d_avg,
            AVG(CASE WHEN published_in_window THEN (
                  SELECT COUNT(*) FROM wiki_page_versions ver
                   WHERE ver.page_id = pub.page_id
                     AND ver.saved_at BETWEEN pub.published_at AND pub.published_at + INTERVAL '30 days'
                     AND ver.saved_by IS DISTINCT FROM pub.actor_id
                ) END) AS reedits_30d_avg
       FROM pub`,
    [WIKI_DRAFT_KIND, w, String(WIKI_DRAFT_WINDOW_DAYS)],
  );
  const total = int(row?.drafts_total);
  const avg = (v: unknown): number | null => (v == null ? null : Math.round(Number(v) * 10) / 10);
  return {
    drafts_total: total,
    published: int(row?.published),
    published_rate: rate(row?.published, total),
    views_30d_avg: avg(row?.views_30d_avg),
    reedits_30d_avg: avg(row?.reedits_30d_avg),
  };
}

/* ── ③ AI で整える ────────────────────────────────────────── */

export interface WikiRewriteOutcome {
  /** 人が「置き換える」「やめる」のどちらかを押した数（分母） */
  decided: number;
  /** 置き換えた数（直してから置き換えたものも含む） */
  replaced: number;
  replaced_rate: number | null;
  /** そのまま置き換えた（1文字も直さなかった）数 */
  as_is: number;
}

export async function rewriteOutcome(windowDays: number): Promise<WikiRewriteOutcome> {
  const w = String(windowDays);
  const row = await queryOne(
    `SELECT COUNT(DISTINCT c.output_id)::int AS decided,
            COUNT(DISTINCT c.output_id) FILTER (WHERE c.correction_type <> 'reject')::int AS replaced,
            COUNT(DISTINCT c.output_id) FILTER (WHERE c.correction_type = 'none')::int    AS as_is
       FROM ai_corrections c
       JOIN ai_outputs o ON o.id = c.output_id
      WHERE o.kind = ? AND o.created_at >= NOW() - (? || ' days')::interval`,
    [WIKI_REWRITE_KIND, w],
  );
  const decided = int(row?.decided);
  return {
    decided,
    replaced: int(row?.replaced),
    replaced_rate: rate(row?.replaced, decided),
    as_is: int(row?.as_is),
  };
}
