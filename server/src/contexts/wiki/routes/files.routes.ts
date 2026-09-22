/**
 * Wiki — 画像（段B）。設計: `docs/design/v4/wiki.md` §5-5。
 *
 * - `POST /wiki/files`     上げる（multipart・項目名 `file`・10MB まで・画像だけ）
 * - `GET  /wiki/files/:id` 配る（本文の `![](…)` が開く）
 *
 * 上げるのは editor、配るのは reader です（`qsheet/routes/upload.routes.ts` と同じ
 * 判断——editor だけにすると、読むだけの人の画面で画像だけが壊れて見えます）。
 * さらに Wiki は `wiki_files.page_id` を持つので、**そのページが読めるかも見ます**
 * （§8。閲覧範囲を絞ったスペースの画像を、URL を知っている人に配らない）。
 *
 * ⚠️ `<img src>` は `Authorization` ヘッダーを送りません。cookie の JWT で通るので
 * （`jwtAuth` が cookie も見る）、画面は画像だけ別の取り方をしなくて済みます。
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { canReadPage, assertReadablePage } from '../services/wiki-access.service';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';
import { saveWikiFile, getWikiFile, WIKI_FILE_MAX_BYTES } from '../services/wiki-file.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;

/**
 * ディスクには multer に書かせず、いったん memory で受けます——
 * 形式の判定（マジックバイト）を通ったものだけを置きたいためです。
 * 10MB で切るので、memory に載る量も 10MB を超えません。
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WIKI_FILE_MAX_BYTES, files: 1 },
});

/**
 * multer の失敗（大きすぎる・項目名が違う）をそのまま `next` に渡すと
 * 共通の `errorHandler` が 500 を返します。利用者の操作の誤りなので 400 にします。
 */
function uploadOne(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) { next(); return; }
    const tooBig = (err as { code?: string }).code === 'LIMIT_FILE_SIZE';
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: tooBig
          ? 'ファイルサイズが10MBを超えています。10MB以下の画像を選んでください。'
          : '画像を上げられませんでした。もう一度お試しください。',
      },
    });
  });
}

router.post('/files', ...canEdit, uploadOne, wrap(async (req, res) => {
  const file = req.file;
  if (!file) throw new ValidationError('画像を選んでください。');

  // ページに紐づけて上げるときは、そのページが読めるかを先に見る（§8）
  const rawPageId = (req.body ?? {}).page_id;
  const pageId = typeof rawPageId === 'string' && rawPageId ? rawPageId : null;
  if (pageId) await assertReadablePage(req.user!, pageId);

  const saved = await saveWikiFile(req.user!.id, file, pageId);
  res.status(201).json({ success: true, data: saved });
}));

router.get('/files/:id', ...canRead, wrap(async (req, res) => {
  const { row, absolutePath, contentType } = await getWikiFile(p1(req.params.id));
  const pageId = row.page_id ? String(row.page_id) : null;
  if (pageId) {
    if (!(await canReadPage(req.user!, pageId))) throw new NotFoundError('画像が見つかりません');
  } else if (String(row.created_by ?? '') !== req.user!.id) {
    /*
     * ⚠️ **ページに付いていない画像は、上げた本人にしか出しません。**
     * `page_id` が空のときに素通しにしていたため、限定のスペースへ取り込んだ画像の
     * URL を知っていれば**誰でも中身を取れて**いました（Codex の指摘・P1）。
     * 取り込みは本文が指している画像をそのページに付け直すので（`wiki-import.service.ts`）、
     * ここに落ちてくるのは付け先が決まる前の1枚か、本文から外れた孤児だけです。
     */
    throw new NotFoundError('画像が見つかりません');
  }

  res.setHeader('Content-Type', contentType);
  // 中身は id ごとに変わらない（差し替えは別の id になる）ので、長く持たせてよい
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(absolutePath).pipe(res);
}));

export default router;
