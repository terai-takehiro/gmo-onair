/**
 * Wiki — ページの作成・保存・並べ替え・削除・テンプレート（段B）。
 * 設計: `docs/design/v4/wiki.md` §5-3・§6-②③・§8。
 *
 * - `POST   /wiki/pages`                   追加（テンプレートから写せる）
 * - `PATCH  /wiki/pages/:id`               保存（本文・題・情報の欄）
 * - `PATCH  /wiki/pages/:id/move`          ツリーの中で動かす
 * - `DELETE /wiki/pages/:id`               削除（子ページも一緒に）
 * - `GET    /wiki/templates`               テンプレートの一覧
 * - `POST   /wiki/pages/:id/make-template` テンプレートにする／やめる
 *
 * 権限（§8）: 追加・保存・並べ替えは editor、削除とテンプレートの登録は manager。
 * **読めないページは 403 ではなく 404**（存在ごと隠す）——`assertReadablePage` が投げます。
 */
import { Router } from 'express';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { assertReadablePage } from '../services/wiki-access.service';
import { savePageInternal, type SavePageInput } from '../services/wiki-page.service';
import {
  createPage,
  deletePage,
  movePage,
  listTemplates,
  setPageTemplate,
  assertUserExists,
  assertParentForSave,
} from '../services/wiki-write.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;
const canManage = [requireAuth, requirePermission('wiki', 'manager')] as const;

const STATUSES = ['draft', 'published', 'archived'] as const;

function body(req: { body?: unknown }): Record<string, unknown> {
  const b = req.body;
  return b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

function has(b: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(b, key);
}

function asText(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new ValidationError(`${what}は文字で入れてください。`);
  return v;
}

function asTextOrNull(v: unknown, what: string): string | null {
  if (v === null || v === '') return null;
  return asText(v, what);
}

/**
 * `PATCH /wiki/pages/:id` の受け取り。
 *
 * ⚠️ **書かれていない項目は入れません**（`undefined` = 触らない）。
 * `body.icon` が無いのに `icon: undefined` を入れると
 * `savePageInternal` の `pick()` は「いまの値」を使うので実害はありませんが、
 * 「送られた項目だけを見る」形を崩すと、あとから項目を足したときに
 * 送っていない項目まで既定値で上書きされる事故になります。
 */
function readSaveInput(b: Record<string, unknown>): SavePageInput {
  const input: SavePageInput = {};
  if (has(b, 'title')) input.title = asText(b.title, '題');
  if (has(b, 'body_md')) input.body_md = asText(b.body_md, '本文');
  if (has(b, 'icon')) input.icon = asTextOrNull(b.icon, 'アイコン');
  if (has(b, 'note')) input.note = asTextOrNull(b.note, '変更した内容');
  if (has(b, 'review_by')) input.review_by = asTextOrNull(b.review_by, '見直し予定');
  if (has(b, 'owner_user_id')) input.owner_user_id = asTextOrNull(b.owner_user_id, '担当');
  if (has(b, 'parent_id')) input.parent_id = asTextOrNull(b.parent_id, '親ページ');
  if (has(b, 'expected_updated_at')) input.expected_updated_at = asText(b.expected_updated_at, '更新日時');

  if (has(b, 'status')) {
    const s = asText(b.status, '状態');
    if (!(STATUSES as readonly string[]).includes(s)) {
      throw new ValidationError('状態は下書き・公開・アーカイブのいずれかです。');
    }
    input.status = s as SavePageInput['status'];
  }
  if (has(b, 'sort_order')) {
    const n = Number(b.sort_order);
    if (!Number.isFinite(n)) throw new ValidationError('並び順は数字で入れてください。');
    input.sort_order = Math.trunc(n);
  }
  if (has(b, 'tags')) {
    if (!Array.isArray(b.tags) || b.tags.some((t) => typeof t !== 'string')) {
      throw new ValidationError('タグは文字の一覧で入れてください。');
    }
    input.tags = b.tags as string[];
  }
  if (has(b, 'props')) {
    const p = b.props;
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      throw new ValidationError('項目の値を保存できませんでした。入力を確かめてください。');
    }
    input.props = p as Record<string, unknown>;
  }
  return input;
}

/** 追加。`templateId` を渡すと本文・アイコン・タグ・項目の値を写す */
router.post('/pages', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  const status = has(b, 'status') && asText(b.status, '状態') === 'published' ? 'published' : 'draft';
  const page = await createPage(req.user!, {
    space_id: asText(b.space_id, 'スペース'),
    parent_id: has(b, 'parent_id') ? asTextOrNull(b.parent_id, '親ページ') : null,
    title: has(b, 'title') ? asText(b.title, '題') : undefined,
    templateId: has(b, 'templateId') ? asTextOrNull(b.templateId, 'テンプレート') : null,
    body_md: has(b, 'body_md') ? asText(b.body_md, '本文') : undefined,
    icon: has(b, 'icon') ? asTextOrNull(b.icon, 'アイコン') : undefined,
    status,
  });
  res.status(201).json({ success: true, data: page });
}));

/** テンプレートの一覧（「テンプレートから作る」の選択肢） */
router.get('/templates', ...canEdit, wrap(async (req, res) => {
  const rows = await listTemplates(req.user!);
  res.json({ success: true, data: rows });
}));

/**
 * 保存（§5-3）。`expected_updated_at` が食い違えば 409（`CONFLICT`）、
 * 他の人が編集中なら 409（`LOCKED`）。
 *
 * 情報の欄（担当・見直し予定・タグ）だけを直すときは、本文・題を送らなければ
 * 編集ロックに関わらず保存できます（§6-②）。
 */
router.patch('/pages/:id', ...canEdit, wrap(async (req, res) => {
  const pageId = p1(req.params.id);
  await assertReadablePage(req.user!, pageId);
  const input = readSaveInput(body(req));
  if (input.owner_user_id) await assertUserExists(input.owner_user_id);
  if (input.parent_id !== undefined) await assertParentForSave(pageId, input.parent_id);
  const page = await savePageInternal(pageId, input, req.user!);
  res.json({ success: true, data: page });
}));

/**
 * ツリーの中で動かす。**循環参照（自分の下の階層へ）は弾きます。**
 * 本文を触らないので履歴も `updated_at` も増えません。
 */
router.patch('/pages/:id/move', ...canEdit, wrap(async (req, res) => {
  const b = body(req);
  const parentId = has(b, 'parent_id') ? asTextOrNull(b.parent_id, '親ページ') : null;
  const sortOrder = has(b, 'sort_order') ? Number(b.sort_order) : undefined;
  if (sortOrder !== undefined && !Number.isFinite(sortOrder)) {
    throw new ValidationError('並び順は数字で入れてください。');
  }
  const moved = await movePage(req.user!, p1(req.params.id), parentId, sortOrder);
  res.json({ success: true, data: moved });
}));

/** 削除（子ページも一緒に）。他の人が編集中のページは 409（`LOCKED`） */
router.delete('/pages/:id', ...canManage, wrap(async (req, res) => {
  const result = await deletePage(req.user!, p1(req.params.id));
  res.json({ success: true, data: result });
}));

/**
 * テンプレートにする／やめる（§8 では manager の操作——
 * 一度登録すると、ページを作る人全員の選択肢に出るため）。
 */
router.post('/pages/:id/make-template', ...canManage, wrap(async (req, res) => {
  const b = body(req);
  const value = has(b, 'is_template') ? b.is_template !== false : true;
  const page = await setPageTemplate(req.user!, p1(req.params.id), value);
  res.json({ success: true, data: page });
}));

export default router;
