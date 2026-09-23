/**
 * 見直しの画面に出す言葉と色（段F・`docs/design/v4/wiki.md` §6-⑦）
 *
 * ⚠️ **「期限切れ」「期限」「締切」「延滞」とは書きません**（2026-09-22 の
 * 利用者からのご指摘「Wiki なので期限切れという概念はないと思います」）。
 * ページは予定日を過ぎても中身が無効になるわけではないので、
 * **「見直し予定」「予定日」**と言い、印は**「要見直し」**にします。
 * 色も赤（異常）ではなく情報の色です（`WikiStatusBadge` の `overdue` と同じ）。
 *
 * 区分の値（`overdue`／`soon`／`no_owner`）は**サーバーと対**なので変えません。
 * 変えるのは画面に出す言葉だけです。
 */
import type { WikiReviewBucket, WikiReviewRow } from '@gmo-onair/shared/src/wiki/types';

export type ReviewBucket = WikiReviewBucket;

export const REVIEW_BUCKETS: ReviewBucket[] = ['overdue', 'soon', 'no_owner'];

export const BUCKET_TONE: Record<ReviewBucket, { label: string; cls: string; note: string }> = {
  overdue: {
    label: '要見直し',
    cls: 'border-info-border bg-info-surface text-info',
    note: '見直しの予定日が来たページ',
  },
  soon: {
    label: 'まもなく',
    cls: 'border-warning-border bg-warning-surface text-warning',
    note: '予定日まで14日以内',
  },
  no_owner: {
    label: '担当なし',
    cls: 'border-border bg-muted text-muted-foreground',
    note: '担当が決まっていない',
  },
};

/** 区分ごとの件数。タブの脇の案内に出す（押す前に諦められるように） */
export function countByBucket(rows: WikiReviewRow[] | undefined): Record<ReviewBucket, number> {
  const out: Record<ReviewBucket, number> = { overdue: 0, soon: 0, no_owner: 0 };
  for (const r of rows ?? []) out[r.bucket] += 1;
  return out;
}

/**
 * 「要見直し 3 ・ まもなく 2 ・ 担当なし 2」。0件の区分は出さない。
 *
 * ⚠️ **サーバーの `counts` を渡すこと。** 一覧には上限（300件）があるので、
 * `rows` を数えると切られた先の行が数から落ちます。スペースで絞っている
 * ときだけ、手元の行から数えた `countByBucket` を渡します。
 */
export function bucketSummary(counts: Record<ReviewBucket, number> | undefined): string {
  if (!counts) return '';
  const parts = REVIEW_BUCKETS.filter((b) => counts[b] > 0).map((b) => `${BUCKET_TONE[b].label} ${counts[b]}`);
  return parts.join(' ・ ');
}

/** 区分の合計（タブの脇の数字。`counts` を渡す） */
export function bucketTotal(counts: Record<ReviewBucket, number> | undefined): number | null {
  if (!counts) return null;
  return REVIEW_BUCKETS.reduce((sum, b) => sum + counts[b], 0);
}

/** 割合の表示。分母が足りないときは `—`（0% と「まだ数えられない」は別のこと） */
export function rateLabel(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

/** 「今日」「9/19」。質問が最後に来た日のような、粗くてよい日付に使う */
export function shortDayLabel(value: string | null | undefined, now = new Date()): string {
  if (!value) return '—';
  const t = new Date(value);
  if (!Number.isFinite(t.getTime())) return '—';
  const sameDay = t.getFullYear() === now.getFullYear()
    && t.getMonth() === now.getMonth()
    && t.getDate() === now.getDate();
  if (sameDay) return '今日';
  if (t.getFullYear() !== now.getFullYear()) return `${t.getFullYear()}/${t.getMonth() + 1}/${t.getDate()}`;
  return `${t.getMonth() + 1}/${t.getDate()}`;
}

/** AI の3つの機能の画面上の名前（`docs/wording.md` ルール1・同じ事実に1つの言い方） */
export const AI_KIND_LABEL: Record<string, string> = {
  wiki_answer: 'AI に聞く',
  wiki_draft: 'AI で下書きを作成',
  wiki_rewrite: 'AI で整える',
};
