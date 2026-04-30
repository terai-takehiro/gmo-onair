/**
 * server/src/contexts/awards/services/awards-box.service.ts — v2.8.51
 *
 * アワードCG ノミネート写真の BOX ミラー保存サービス。
 *
 * 設計方針:
 *   - ローカル `/app/uploads/awards/` を高速読み出し用キャッシュとし、
 *     BOX を「真のソース・耐障害性バックアップ」として使う。
 *   - アップロード時: ローカルに書き込んだ後、BOX への mirror upload を
 *     fire-and-forget で実行（失敗しても本処理は成功扱い）。
 *   - 読み出し時: ローカルにファイルが無ければ BOX からストリームで取得し、
 *     ローカルキャッシュに書き戻して以降のリクエストを高速化する。
 *
 * BOX 親フォルダは `BOX_PROJECT_PARENT_FOLDER_ID`（社外共有可）配下に
 * `11_awards_photo` という名前で 1 つだけ自動作成する。
 * ID はメモリキャッシュ + 初回のみ getItems で検索する。
 *
 * ※ v2.8.50 では「社内限り」配下の `アワードCG_画像` だったが、表彰式は
 *    社外コラボの可能性があるため v2.8.51 で「社外共有可」配下の
 *    `11_awards_photo` に変更。既存ファイルは旧フォルダに残るが、
 *    新規アップロードは新フォルダに入る（DB 側 photo_box_file_id は
 *    BOX file ID なので、フォルダ移動が手動で行われていなくても
 *    引き続き取得可能）。
 */
import fs from 'fs';
import path from 'path';
import { isBoxConfigured, getBoxClient } from '../../../shared/services/box';

const AWARDS_BOX_FOLDER_NAME = '11_awards_photo';

let cachedFolderId: string | null = null;
let folderInitPromise: Promise<string | null> | null = null;

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function ensureAwardsFolder(): Promise<string | null> {
  if (cachedFolderId) return cachedFolderId;
  if (folderInitPromise) return folderInitPromise;

  folderInitPromise = (async () => {
    const client = getBoxClient();
    if (!client) return null;

    const parentId = process.env.BOX_PROJECT_PARENT_FOLDER_ID || null;
    if (!parentId) {
      console.warn('[awards-box] BOX_PROJECT_PARENT_FOLDER_ID not set — BOX mirror disabled');
      return null;
    }

    try {
      // 既存の同名フォルダを検索（getItems で 1 ページ取り、見つかれば再利用）
      const items = await client.folders.getItems(parentId, { limit: 1000, fields: 'id,name,type' });
      const existing = items.entries.find(
        (it) => it.type === 'folder' && it.name === AWARDS_BOX_FOLDER_NAME,
      );
      if (existing) {
        cachedFolderId = existing.id;
        console.log(`[awards-box] Using existing BOX folder '${AWARDS_BOX_FOLDER_NAME}' = ${existing.id}`);
        return existing.id;
      }

      // 無ければ作成
      const created = await client.folders.create(parentId, AWARDS_BOX_FOLDER_NAME);
      cachedFolderId = created.id;
      console.log(`[awards-box] Created BOX folder '${AWARDS_BOX_FOLDER_NAME}' = ${created.id}`);
      return created.id;
    } catch (err) {
      console.error('[awards-box] Failed to ensure awards folder:', (err as Error).message);
      return null;
    }
  })();

  const id = await folderInitPromise;
  folderInitPromise = null;
  return id;
}

/**
 * 画像を BOX にミラー保存する。失敗時は null を返す（呼び出し側で握り潰す想定）。
 * @param filename サーバー側で生成した一意なファイル名（例: `{uuid}.jpg`）
 * @param buffer  画像バイナリ
 * @returns BOX file ID（DB に保存しておくと restore 時に直接 fetch できる）
 */
export async function uploadAwardsImageToBox(
  filename: string,
  buffer: Buffer,
): Promise<string | null> {
  if (!isBoxConfigured()) return null;
  const client = getBoxClient();
  if (!client) return null;

  const folderId = await ensureAwardsFolder();
  if (!folderId) return null;

  try {
    const res = await client.files.uploadFile(folderId, filename, buffer);
    // SDK によって戻り値の形が { entries: [...] } または { id, name } の場合がある
    const fileId = res.entries?.[0]?.id ?? res.id ?? null;
    if (fileId) {
      console.log(`[awards-box] Uploaded ${filename} → BOX file ${fileId}`);
    }
    return fileId;
  } catch (err) {
    console.warn(`[awards-box] Failed to upload ${filename}:`, (err as Error).message);
    return null;
  }
}

/**
 * BOX からファイルをダウンロードしてローカルキャッシュに書き戻す。
 * @param fileId BOX file ID
 * @param destPath ローカルファイルの絶対パス
 * @returns 復元成功なら true
 */
export async function restoreAwardsImageFromBox(
  fileId: string,
  destPath: string,
): Promise<boolean> {
  if (!isBoxConfigured()) return false;
  const client = getBoxClient();
  if (!client) return false;

  try {
    const stream = await client.files.getReadStream(fileId);
    const buf = await streamToBuffer(stream);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    console.log(`[awards-box] Restored BOX file ${fileId} → ${destPath} (${buf.length} bytes)`);
    return true;
  } catch (err) {
    console.warn(`[awards-box] Failed to restore BOX file ${fileId}:`, (err as Error).message);
    return false;
  }
}
