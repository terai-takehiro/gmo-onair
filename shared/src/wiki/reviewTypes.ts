// Wiki — 見直しとコメント（段F・設計 `docs/design/v4/wiki.md` §6-⑦⑧・§7-3）が扱う型
//
// `types.ts` から切り出した。理由は1ファイル 400 行の決まり（`scripts/check-file-size.mjs`）で、
// 段F の型を `types.ts` に足すと上限に当たるため。`aiTypes.ts` を切り出したときと同じ分け方。
//
// ⚠️ **ここの名前は `types.ts` から再輸出している。** 画面は
// `@gmo-onair/shared/src/wiki/types` からこれまでどおり import できる
// （import 先が2つに割れると、どちらから取るべきかを毎回迷うことになる）。
//
// ⚠️ **「期限切れ」と言わない**（§10 #10・2026-09-22 のご指摘）。Wiki のページは
// 予定日を過ぎても中身が無効にならないので、画面のバッジは「要見直し」。
// 型の名前（`overdue`）は内部の鍵で画面には出さない。

/* ── コメント（§6-⑧） ─────────────────────────────────────── */

export interface WikiComment {
  id: string;
  page_id: string;
  parent_id: string | null;
  body_md: string;
  created_by: string;
  creator_name?: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolver_name?: string | null;
  /**
   * 返信（入れ子は1段だけ）。
   *
   * ⚠️ 親が消されている返信は**親の無い返信として上に並びます** —
   * 親ごと隠すと、現場が残した指摘が消えたように見えるためです。
   */
  replies?: WikiComment[];
  /** 自分が消せるか（書いた本人か manager）。画面のゴミ箱の出し分け */
  can_delete?: boolean;
}

/* ── コメントを AI の成果として数える（§7-3 の「穴」）──────── */

/** AI 由来のページ1本ぶん。**コメントの本文は返さない**（読めない棚の中身が混ざる） */
export interface WikiCommentOutcomeRow {
  ai_output_id: string;
  /** `wiki_draft`（下書きから作ったページ）か `wiki_answer`（回答からページにした） */
  kind: string;
  page_id: string;
  page_title: string;
  comments: number;
  unresolved: number;
  last_comment_at: string | null;
}

/**
 * 「回答・下書きから作ったページに付いたコメント」の集計（§7-3 の「穴」の代替指標）。
 *
 * ⚠️ **コメントが多い＝AI が悪い、ではありません。** よく読まれるページほど
 * 指摘も付きます。断定に使わず、**未解決のまま残っている数**を見ること。
 */
export interface WikiCommentOutcome {
  window_days: number;
  /** 期間内に AI から生まれたページの数（分母） */
  ai_pages: number;
  /** そのうちコメントが付いたページの数 */
  pages_with_comments: number;
  /** 付いた割合（分母が 0 なら null。「0%」と出すと嘘になる） */
  comment_rate: number | null;
  comments_total: number;
  unresolved_total: number;
  /** コメントの多い順（上位だけ） */
  top: WikiCommentOutcomeRow[];
}

/* ── 見直し（§6-⑦） ──────────────────────────────────────── */

/**
 * 見直しの一覧の区分。
 *
 * - `overdue` … 予定日を過ぎた（**画面の表示は「要見直し」**）
 * - `soon` … 予定日まで14日以内
 * - `no_owner` … 担当が空（予定日の有無にかかわらず、見直す人がいない）
 */
export type WikiReviewBucket = 'overdue' | 'soon' | 'no_owner';

export interface WikiReviewRow {
  id: string;
  title: string;
  path: string;
  space_id: string;
  space_name: string;
  owner_user_id: string | null;
  owner_name: string | null;
  review_by: string | null;
  updated_at: string;
  bucket: WikiReviewBucket;
  /** 最後に「見直した」を押した日時（まだなら null） */
  last_reviewed_at?: string | null;
}

/** 「見直した」の記録1本（§7-3 条件5「担当の名前と『見直した』の記録」） */
export interface WikiReviewLogEntry {
  id: string;
  page_id: string;
  page_title: string;
  space_name: string;
  reviewed_by: string | null;
  reviewer_name: string | null;
  reviewed_at: string;
  prev_review_by: string | null;
  next_review_by: string | null;
  note: string | null;
}

/**
 * `GET /wiki/review` の返り。
 *
 * ⚠️ **`counts` は上限で切る前の数**です（検索の `counts` と同じ理由）。
 * `rows` を数えると、上限を超えたときに区分の数字が実態より小さく出ます。
 */
export interface WikiReviewList {
  rows: WikiReviewRow[];
  counts: Record<WikiReviewBucket, number>;
  /** 直近の「見直した」の記録（新しい順） */
  recent_reviews: WikiReviewLogEntry[];
}
