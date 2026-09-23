/**
 * Wiki — コメントの API（段F）。設計: `docs/design/v4/wiki.md` §6-⑧・§7-3・§8。
 *
 * - `GET    /wiki/pages/:id/comments`  そのページのコメント（返信つき）
 * - `POST   /wiki/pages/:id/comments`  書く（`parent_id` で返信）
 * - `POST   /wiki/comments/:id/resolve` 解決にする／戻す
 * - `DELETE /wiki/comments/:id`        消す（**書いた本人か manager だけ**）
 * - `GET    /wiki/comments/outcome`    AI から生まれたページに付いたコメント（manager）
 *
 * 権限（§8）: 読む・書く・解決にするは **reader**（コメントは reader の操作）。
 * 消すのは書いた本人か manager（判定は service）。成果の集計は manager。
 *
 * ⚠️ **読めないページのコメントは 403 ではなく 404**（存在ごと隠す・§8）。
 * `assertReadablePage` を service が必ず通します。**route では緩めません。**
 *
 * ⚠️ `/comments/outcome` は `/comments/:id/...` と道の形が違う（2つ目が固定語・
 * 3つ目が無い）のでぶつかりません。将来 `/comments/:id` の GET を足すときは
 * **`outcome` より後ろ**に置いてください（`:id` が `outcome` を食べます）。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import {
  addComment, commentOutcome, deleteComment, listComments, setCommentResolved,
} from '../services/wiki-comment.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canManage = [requireAuth, requirePermission('wiki', 'manager')] as const;

function body(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** `?window_days=` のような数字。正の数でなければ無いものとして扱う（ai.routes と同じ） */
function numParam(raw: unknown): number | undefined {
  const v = Number(p1(raw as string | string[] | undefined));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * AI から生まれたページに付いたコメント（§7-3 の「穴」の代替指標）。
 *
 * ⚠️ **`/comments/:id/...` より先に登録します**（上の注記）。
 */
router.get('/comments/outcome', ...canManage, wrap(async (req, res) => {
  const data = await commentOutcome(req.user!, numParam(req.query.window_days) ?? 90);
  res.json({ success: true, data });
}));

router.get('/pages/:id/comments', ...canRead, wrap(async (req, res) => {
  const rows = await listComments(req.user!, p1(req.params.id));
  res.json({ success: true, data: rows });
}));

/** 書く。返信は `parent_id`（入れ子は1段だけ） */
router.post('/pages/:id/comments', ...canRead, wrap(async (req, res) => {
  const b = body(req);
  if (typeof b.body_md !== 'string') throw new ValidationError('コメントは文字で入れてください。');
  const parent = b.parent_id;
  if (parent !== undefined && parent !== null && typeof parent !== 'string') {
    throw new ValidationError('返信先の指定が正しくありません。');
  }
  const row = await addComment(req.user!, p1(req.params.id), {
    body_md: b.body_md,
    parent_id: (parent as string | null | undefined) ?? null,
  });
  res.status(201).json({ success: true, data: row });
}));

/**
 * 解決にする／戻す。`{ "resolved": false }` で戻せます
 * （既定は解決にする。押し間違いを取り返せないと、誰も押さなくなる）。
 */
router.post('/comments/:id/resolve', ...canRead, wrap(async (req, res) => {
  const b = body(req);
  const row = await setCommentResolved(req.user!, p1(req.params.id), b.resolved !== false);
  res.json({ success: true, data: row });
}));

/** 消す（書いた本人か manager だけ。`deleted_at` を入れるだけで行は残す） */
router.delete('/comments/:id', ...canRead, wrap(async (req, res) => {
  const row = await deleteComment(req.user!, p1(req.params.id));
  res.json({ success: true, data: row });
}));

export default router;
