/**
 * Wiki の AI — 3機能で共有する決めごと（`docs/design/v4/wiki.md` §7）。
 *
 * ⚠️ **kind とプロンプトの版はここが正です。** 文字列を各 service に書き写すと、
 * 名前を変えた日に**集計だけが黙って 0 件**になります
 * （`ai-feedback.service.ts` の `MINUTES_KIND` と同じ理由）。
 *
 * ── なぜ kind を3つに分けるか（§7-5）──────────────────────────
 *
 * 仕事が違うからです。**聞く**は材料から答えを作る、**下書き**は材料から
 * ページを書く、**整える**は人が打った文の形だけを直す。混ぜると
 * 「1件あたりいくら」も「直され方」も両方が嘘になります
 * （`activity_format` と `activity_intake` を分けたのと同じ判断）。
 */
import { CORRECTION_WINDOW_DAYS } from '../../../shared/services/ai-output.service';

/* ── `ai_outputs.kind` / `ai_usage.kind` ────────────────────────── */

/** 「AI に聞く」。1発言 = 1行（`target_table='wiki_ai_messages'`） */
export const WIKI_ANSWER_KIND = 'wiki_answer';
/** 「AI で下書きを作る」。`target_table='wiki_pages'`・`wiki_pages.ai_output_id` に紐づく */
export const WIKI_DRAFT_KIND = 'wiki_draft';
/** 「AI で整える」。**本文は保存しない**ので `target_id` は持たない（置き換えは画面が決める） */
export const WIKI_REWRITE_KIND = 'wiki_rewrite';

/** 段F の見直し（§6-⑦）とこの段の digest が読む3つ */
export const WIKI_AI_KINDS = [WIKI_ANSWER_KIND, WIKI_DRAFT_KIND, WIKI_REWRITE_KIND] as const;
export type WikiAiKind = (typeof WIKI_AI_KINDS)[number];

/* ── プロンプトの版（§7-5）──────────────────────────────────── */

/**
 * ⚠️ **プロンプトを1文字でも変えたら上げること。**
 *
 * ONAiR では `prompt_version` の入れ忘れが既に穴になっています
 * （スキルの `onair-current-state.md`「残っていること」#3）。版が無いと
 * **直した効果を後から数字で言えません**（`get_ai_feedback_digest` の
 * `by_model` が版ごとの無修正採用率を返す単位がこれ）。
 */
export const WIKI_ANSWER_PROMPT_VERSION = 'wiki-answer-v1';
export const WIKI_DRAFT_PROMPT_VERSION = 'wiki-draft-v1';
export const WIKI_REWRITE_PROMPT_VERSION = 'wiki-rewrite-v1';

/**
 * 直され方の傾向（`advice`）を載せた版。**混ぜないこと** —
 * 載せた効果を後から数字で言えなくなります（議事録の `+fb` と同じ作法）。
 */
export const withFeedback = (version: string): string => `${version}+fb`;

/* ── 材料と分量 ────────────────────────────────────────────── */

/** 「AI に聞く」が材料にする上位ページ数（§7-1） */
export const WIKI_ANSWER_TOP_N = 8;

/** ページから開いたときに先に入れる子ページの数の上限（そのページ自身は別勘定） */
export const WIKI_ANSWER_CHILD_LIMIT = 5;

/**
 * 1ページから材料に渡す本文の上限。
 *
 * ⚠️ **これは「記録を切り詰める」ことではありません。** `ai_outputs` には
 * ページの id と `updated_at` だけを残し、本文は `wiki_page_versions` から
 * いつでも復元できます（§7-5「全文を二重に持たない」）。ここで絞るのは
 * **1回の呼び出しに渡す量**で、絞らないと長いページ1本で枠を使い切り、
 * 他の7ページが材料から落ちます。
 */
export const WIKI_MATERIAL_CHARS_PER_PAGE = 6_000;

/** 1回の呼び出しに渡す材料の合計の上限 */
export const WIKI_MATERIAL_CHARS_TOTAL = 24_000;

/** 「AI で整える」が light のままでいられる長さ（§7-1。`activity` の閾値に揃える） */
export const WIKI_REWRITE_HEAVY_CHARS = 4_000;

/** 「AI で整える」に渡せる長さの上限。**超えたら切らずに断る**（黙って切ると後半が消える） */
export const WIKI_REWRITE_MAX_CHARS = 40_000;

/** 質問の長さの上限（これを超える「質問」は貼り付けミス。切らずに断る） */
export const WIKI_QUESTION_MAX_CHARS = 2_000;

/** 1つのスレッドに積める往復の上限（壁打ちと同じ作法） */
export const WIKI_THREAD_MAX_TURNS = 30;

/** 直前の何往復を文脈として渡すか */
export const WIKI_HISTORY_TURNS = 6;

/* ── 時間窓（§7-3「計測を壊しやすい所」）───────────────────── */

/**
 * AI の下書きから**何日以内**の保存を「人の修正」として数えるか。
 *
 * ⚠️ **7日を過ぎた更新を AI の誤りとして数えないこと。** Wiki のページは
 * 公開後も見直し・組織変更で普通に直り続けます。窓を切らないと
 * **正常な更新が全部「AI の誤り」**になり、無修正採用率が意味を失います。
 * 既存の `CORRECTION_WINDOW_DAYS` をそのまま使い、別の数字を持ちません。
 */
export const WIKI_DRAFT_WINDOW_DAYS = CORRECTION_WINDOW_DAYS;

/** 同じ質問が「まだ解けていない」とみなす期間（条件3 の再質問率） */
export const WIKI_REASK_WINDOW_DAYS = 7;

/* ── 出典が出せないときの返事（§10 の判断8）──────────────── */

/**
 * **出典が出せない回答はしません。**
 *
 * ⚠️ 文面を変えるときは `wiki-ask.service.ts` の判定と
 * 画面の表示（段E のクライアント）を同時に見ること。ここは
 * 「答えなかった」ことの印でもあります（`confidence='none'`）。
 */
export const WIKI_NO_ANSWER_MD =
  'Wiki にはまだ書かれていません。\n\n'
  + 'この質問に答えられる公開ページが見つかりませんでした。'
  + '**足りないページ**に登録したので、見直しの場で「ページを作成」から書き起こせます。';
