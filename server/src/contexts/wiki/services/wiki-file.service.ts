/**
 * Wiki — 画像（`docs/design/v4/wiki.md` §5-5）。
 *
 * 本文には `![説明](/api/v1/internal/wiki/files/:id)` と書きます。作法は
 * `contexts/qsheet/routes/upload.routes.ts` と同じで、**中身の先頭の並び
 * （マジックバイト）で形式を判定**します — 送られてきた `Content-Type` や
 * 拡張子は信用しません（`.png` という名前の HTML を置かれると、同じ URL から
 * 配られる別のものになってしまうため）。
 *
 * ⚠️ **置き場所は `/app/uploads/wiki`**（Docker の永続ボリューム。
 * `docker-compose.yml` の `uploads_prod` / `uploads_dev` が `/app/uploads` に付く）。
 * `contexts/awards` / `contexts/graphics` と同じ**5つ上**を見ます。
 * 4つ上（`server/uploads/…`）にするとボリュームの外に出て、
 * コンテナを作り直した日に画像だけが消えます。
 *
 * ⚠️ 大きなもの（動画・設計図）は Wiki に置かず BOX のリンクを貼る決まりです（§5-5）。
 */
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { queryOne, execute, type Row } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../../qsheet/services/httpErrors';

/** 1枚の上限（§5-5「10 MB まで」） */
export const WIKI_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const WIKI_UPLOAD_DIR = path.join(__dirname, '../../../../../uploads/wiki');

/** 形式ごとの先頭の並び。ここに無い形式は受け取らない */
const MAGIC_BYTES: Record<string, number[][]> = {
  '.jpg': [[0xFF, 0xD8, 0xFF]],
  '.png': [[0x89, 0x50, 0x4E, 0x47]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
};

/** 配るときの Content-Type。DB の値をそのまま返さず、この表に無ければ断る */
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function detectImageExt(buffer: Buffer): string | null {
  for (const [ext, patterns] of Object.entries(MAGIC_BYTES)) {
    for (const pattern of patterns) {
      if (buffer.length < pattern.length) continue;
      if (pattern.every((byte, i) => buffer[i] === byte)) return ext;
    }
  }
  return null;
}

/** multer が渡してくる形のうち、ここで使うぶんだけ */
export interface UploadedFile {
  originalname?: string;
  buffer: Buffer;
  size?: number;
}

/**
 * 受け取って `uploads/wiki` に置き、`wiki_files` に1行残す。
 * 返す `url` をそのまま本文の `![](…)` に書けます。
 */
export async function saveWikiFile(
  userId: string,
  file: UploadedFile,
  pageId: string | null,
): Promise<Row> {
  const buffer = file.buffer;
  if (!buffer || buffer.length < 4) throw new ValidationError('画像を選んでください。');
  if (buffer.length > WIKI_FILE_MAX_BYTES) {
    throw new ValidationError('ファイルサイズが10MBを超えています。10MB以下の画像を選んでください。');
  }
  const ext = detectImageExt(buffer);
  if (!ext) {
    throw new ValidationError('この形式の画像は使えません。JPEG・PNG・GIF・WebP のいずれかを選んでください。');
  }

  if (!fs.existsSync(WIKI_UPLOAD_DIR)) fs.mkdirSync(WIKI_UPLOAD_DIR, { recursive: true });

  // 名前は乱数だけで作る（元のファイル名は表示用に DB へ残す）。
  // 元の名前をそのまま使うと、日本語・記号・`..` がファイル名に入る
  const storageName = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  const filePath = path.join(WIKI_UPLOAD_DIR, storageName);
  if (!path.resolve(filePath).startsWith(path.resolve(WIKI_UPLOAD_DIR))) {
    throw new ValidationError('画像を保存できませんでした。もう一度お試しください。');
  }
  fs.writeFileSync(filePath, buffer);

  const id = `wf-${uuid().slice(0, 8)}`;
  const name = safeDisplayName(file.originalname) || `image${ext}`;
  await execute(
    `INSERT INTO wiki_files (id, page_id, name, mime, size, storage_path, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, pageId, name, MIME_BY_EXT[ext], buffer.length, storageName, userId],
  );
  return {
    id,
    page_id: pageId,
    name,
    mime: MIME_BY_EXT[ext],
    size: buffer.length,
    url: wikiFileUrl(id),
  };
}

/**
 * 上げ終わった画像を、あとから決まったページに付ける（取り込みで使う）。
 *
 * ⚠️ **`page_id` が空のままだと、読む権限の判定が効きません**（`files.routes.ts` は
 * ページが決まっている画像だけ `canReadPage` を通す）。取り込みは本文が指している
 * 画像を、その本文のページに付け直してから URL を配ります。
 * **すでに付いている画像は動かしません**（先に書いたページの持ち物のまま）。
 */
export async function attachWikiFileToPage(fileId: string, pageId: string): Promise<void> {
  await execute(
    'UPDATE wiki_files SET page_id = ? WHERE id = ? AND page_id IS NULL',
    [pageId, fileId],
  );
}

/** 本文に書く URL。**画面はこれを組み立て直さないこと**（1か所で決める） */
export function wikiFileUrl(id: string): string {
  return `/api/v1/internal/wiki/files/${id}`;
}

/**
 * multer が latin1 で読む multipart のファイル名を日本語に戻し、
 * 表示に使えない文字を落とす（`project-box-files.service.ts` と同じ理由）。
 */
function safeDisplayName(raw: string | undefined): string {
  if (!raw) return '';
  let name = raw;
  try {
    name = Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    name = raw;
  }
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f/\\]/g, '').slice(0, 200);
}

export interface WikiFileOnDisk {
  row: Row;
  absolutePath: string;
  contentType: string;
}

/**
 * 記録と実体を引く。**呼ぶ側は `row.page_id` が入っていたら
 * `canReadPage` を必ず確かめること**（読めないスペースの画像を配らないため・§8）。
 */
export async function getWikiFile(id: string): Promise<WikiFileOnDisk> {
  const row = await queryOne(
    'SELECT id, page_id, name, mime, size, storage_path, created_by, created_at FROM wiki_files WHERE id = ?',
    [id],
  );
  if (!row) throw new NotFoundError('画像が見つかりません');

  // DB の値であっても、ファイル名として使う前に必ず1階層の名前に丸める
  const storageName = path.basename(String(row.storage_path));
  const absolutePath = path.resolve(path.join(WIKI_UPLOAD_DIR, storageName));
  if (!absolutePath.startsWith(path.resolve(WIKI_UPLOAD_DIR)) || !fs.existsSync(absolutePath)) {
    throw new NotFoundError('画像が見つかりません');
  }
  const contentType = MIME_BY_EXT[path.extname(storageName).toLowerCase()];
  if (!contentType) throw new NotFoundError('画像が見つかりません');

  return { row, absolutePath, contentType };
}
