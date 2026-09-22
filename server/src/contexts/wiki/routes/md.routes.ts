/**
 * Wiki — `.md` の口（段D）。設計: `docs/design/v4/wiki.md` §5-2 の約束3。
 *
 * - `GET  /wiki/pages/:id.md`  ページ1枚を `text/markdown` で（先頭に YAML の見出し）
 * - `GET  /wiki/export?space=` スペースまるごとを zip で
 * - `POST /wiki/import`        Obsidian・Notion・ONAiR の書き出し（zip）を取り込む
 *
 * 約束3 の3つの口のうち、REST の2本がここです（MCP は段E・同じ組み立てを呼びます）。
 *
 * ⚠️ **`/pages/:id.md` は `/pages/:id`（`pages.routes.ts`）より先に登録すること。**
 * Express は**登録順**に照合するので、後ろに置くと `:id` が `wp-xxxx.md` まで食べて
 * 「ページが見つかりません」になります（`index.ts` で順番を決めています）。
 *
 * 権限（§8）: 読み出し（`.md`・書き出し）は reader、取り込みは editor。
 * **読めないページ・スペースは 404**（存在ごと隠す）。
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requirePermission } from '../../../shared/middleware/auth';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { getPageMarkdown } from '../services/wiki-md.service';
import { exportSpaceZip } from '../services/wiki-export.service';
import { importZip } from '../services/wiki-import.service';
import { wrap, p1 } from './wrap';

const router = Router();
const canRead = [requireAuth, requirePermission('wiki', 'reader')] as const;
const canEdit = [requireAuth, requirePermission('wiki', 'editor')] as const;

/** 取り込みの zip の上限。zip はいったんメモリに載せて開くので、大きすぎるものは受けない */
export const WIKI_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: WIKI_IMPORT_MAX_BYTES, files: 1 },
});

/**
 * multer の失敗（大きすぎる・項目名が違う）は利用者の操作の誤りなので 400 にします
 * （そのまま `next` に渡すと共通の `errorHandler` が 500 を返します）。
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
          ? 'ファイルサイズが50MBを超えています。フォルダを分けてからお試しください。'
          : 'ファイルを取り込めませんでした。もう一度お試しください。',
      },
    });
  });
}

/** zip の先頭の並び（`PK\x03\x04`）。送られてきた名前や Content-Type は信用しない */
function looksLikeZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
    && (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);
}

router.get('/pages/:id.md', ...canRead, wrap(async (req, res) => {
  const { markdown, fileName } = await getPageMarkdown(req.user!, p1(req.params.id));
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  // `inline` = ブラウザでそのまま読める。保存したときの名前だけ整える
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(markdown);
}));

router.get('/export', ...canRead, wrap(async (req, res) => {
  const key = p1(req.query.space as string | string[] | undefined);
  if (!key) throw new ValidationError('書き出すスペースを選んでください。');
  const { fileName, buffer } = await exportSpaceZip(req.user!, key);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buffer);
}));

router.post('/import', ...canEdit, uploadOne, wrap(async (req, res) => {
  const file = req.file;
  if (!file?.buffer) throw new ValidationError('取り込むファイルを選んでください。');
  if (!looksLikeZip(file.buffer)) {
    throw new ValidationError('zip のファイルを選んでください。');
  }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const space = typeof b.space === 'string' ? b.space : '';
  if (!space) throw new ValidationError('取り込み先のスペースを選んでください。');

  const result = await importZip(req.user!, file.buffer, {
    space,
    parent_id: typeof b.parent_id === 'string' && b.parent_id ? b.parent_id : null,
    status: b.status === 'draft' ? 'draft' : 'published',
  });
  res.status(201).json({ success: true, data: result });
}));

export default router;
