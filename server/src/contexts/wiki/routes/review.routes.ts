/**
 * Wiki — 見直しの API（段F）。設計: `docs/design/v4/wiki.md` §6-⑦・§8。
 *
 * - `GET  /wiki/review`              見直し予定のページ（3つの区分と件数・「見直した」の記録）
 * - `POST /wiki/pages/:id/reviewed`  「見直した」（次の予定日を入れ直す・editor）
 *
 * **3つのタブのうち、ここが出すのは①だけです。**
 * ②足りないページは `GET /wiki/ai/gaps`・`POST /wiki/ai/gaps/:id/resolve`、
 * ③AI の直され方は `GET /wiki/ai/digest`（どちらも段E の `ai.routes.ts`）。
 * 画面はこの3本を並べて1つの画面にします — **同じ集計をここで作り直しません。**
 *
 * ⚠️ **「期限切れ」という語を返さないこと**（§10 #10・`docs/wording.md`）。
 * 区分の鍵は `overdue` ですが、これは API の内部の名前で、画面に出す言葉は
 * 「要見直し」です。サーバーが返す**文**（メッセージ・通知の本文）には入れません。
 *
 * ⚠️ 読めないページは 403 ではなく 404（§8）。判定は service が持ちます。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import {
  listReview, markReviewed, WIKI_REVIEW_BUCKETS, type WikiReviewBucket,
} from '../services/wiki-review.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;

function body(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

function has(b: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(b, key);
}

/**
 * 見直し予定の一覧（reader）。`?bucket=` で区分を絞れます。
 *
 * 絞り込みを**サーバー側**に置いてあるのは、一覧に上限があるためです。
 * 画面で絞ると、上限で切られた先にある行が見えません。
 */
router.get('/review', ...canRead, wrap(async (req, res) => {
  const bucket = p1(req.query.bucket as string | string[] | undefined);
  if (bucket && !(WIKI_REVIEW_BUCKETS as readonly string[]).includes(bucket)) {
    throw new ValidationError('区分の指定が正しくありません。');
  }
  const limit = Number(p1(req.query.limit as string | string[] | undefined));
  const data = await listReview(req.user!, {
    bucket: bucket ? (bucket as WikiReviewBucket) : undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  });
  res.json({ success: true, data });
}));

/**
 * 「見直した」（editor）。**次の予定日を入れ直します。**
 *
 * - 何も送らなければ「今日から既定の月数（6か月）後」
 * - `{"months": 3}` … 今日から3か月後
 * - `{"review_by": "2027-03-31"}` … その日
 * - `{"review_by": null}` … 予定日を外す（もう定期的には見直さない）
 *
 * 本文は触りません（版も最終更新も増えません。service の冒頭の注記）。
 */
router.post('/pages/:id/reviewed', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  if (has(b, 'review_by') && b.review_by !== null && typeof b.review_by !== 'string') {
    throw new ValidationError('見直し予定は YYYY-MM-DD の形で入れてください。');
  }
  if (has(b, 'note') && b.note !== null && typeof b.note !== 'string') {
    throw new ValidationError('見直しの記録は文字で入れてください。');
  }
  const page = await markReviewed(req.user!, p1(req.params.id), {
    ...(has(b, 'review_by') ? { review_by: b.review_by as string | null } : {}),
    ...(has(b, 'months') ? { months: Number(b.months) } : {}),
    ...(has(b, 'note') ? { note: b.note as string | null } : {}),
  });
  res.json({ success: true, data: page });
}));

export default router;
