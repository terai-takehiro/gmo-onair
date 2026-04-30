/**
 * server/src/contexts/awards/services/awards-box.service.ts — v2.8.52
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
 * BOX フォルダ構造（v2.8.52+）:
 *   `BOX_PROJECT_PARENT_FOLDER_ID` (社外共有可)
 *     └── 11_awards_photo/                  ← awards 全イベント共通の親
 *           ├── event_{id}_{name}/          ← イベント別サブフォルダ
 *           │     ├── {uuid}.jpg
 *           │     └── {uuid}.png
 *           └── event_{id}_{name}/          ← 削除済みイベントもここに残る (バックアップ)
 *
 * イベントが削除されると ONAiR の DB / ローカルファイルからは消えるが
 * BOX 側のフォルダはそのまま残るので、後から復元できる。
 */
import fs from 'fs';
import path from 'path';
import { isBoxConfigured, getBoxClient } from '../../../shared/services/box';

const AWARDS_BOX_FOLDER_NAME = '11_awards_photo';

let cachedRootFolderId: string | null = null;
let rootInitPromise: Promise<string | null> | null = null;
const cachedEventFolders = new Map<number, string>(); // eventId → BOX folder ID

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/** BOX のフォルダ名で使えない文字を除去する */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim().slice(0, 100) || 'untitled';
}

/** `event_{id}_{name}` 形式から id と name を抽出。マッチしなければ null */
export function parseEventFolderName(folderName: string): { eventId: number; name: string } | null {
  const m = folderName.match(/^event_(\d+)_(.*)$/);
  if (!m) return null;
  const eventId = parseInt(m[1], 10);
  if (isNaN(eventId)) return null;
  return { eventId, name: m[2] };
}

async function ensureAwardsRootFolder(): Promise<string | null> {
  if (cachedRootFolderId) return cachedRootFolderId;
  if (rootInitPromise) return rootInitPromise;

  rootInitPromise = (async () => {
    const client = getBoxClient();
    if (!client) return null;

    const parentId = process.env.BOX_PROJECT_PARENT_FOLDER_ID || null;
    if (!parentId) {
      console.warn('[awards-box] BOX_PROJECT_PARENT_FOLDER_ID not set — BOX mirror disabled');
      return null;
    }

    try {
      const items = await client.folders.getItems(parentId, { limit: 1000, fields: 'id,name,type' });
      const existing = items.entries.find(
        (it) => it.type === 'folder' && it.name === AWARDS_BOX_FOLDER_NAME,
      );
      if (existing) {
        cachedRootFolderId = existing.id;
        console.log(`[awards-box] Using existing BOX folder '${AWARDS_BOX_FOLDER_NAME}' = ${existing.id}`);
        return existing.id;
      }
      const created = await client.folders.create(parentId, AWARDS_BOX_FOLDER_NAME);
      cachedRootFolderId = created.id;
      console.log(`[awards-box] Created BOX folder '${AWARDS_BOX_FOLDER_NAME}' = ${created.id}`);
      return created.id;
    } catch (err) {
      console.error('[awards-box] Failed to ensure awards root folder:', (err as Error).message);
      return null;
    }
  })();

  const id = await rootInitPromise;
  rootInitPromise = null;
  return id;
}

/**
 * イベント別サブフォルダ (`event_{id}_{name}`) の ID を返す。
 * 既存があれば再利用、無ければ作成。BOX 未設定なら null。
 */
async function ensureEventFolder(
  eventId: number,
  eventName: string,
): Promise<string | null> {
  const cached = cachedEventFolders.get(eventId);
  if (cached) return cached;

  const client = getBoxClient();
  if (!client) return null;
  const rootId = await ensureAwardsRootFolder();
  if (!rootId) return null;

  try {
    // 既存の event_{eventId}_* で始まるフォルダを検索（rename 後でも追跡できる）
    const items = await client.folders.getItems(rootId, { limit: 1000, fields: 'id,name,type' });
    const existing = items.entries.find(
      (it) => it.type === 'folder' && it.name.startsWith(`event_${eventId}_`),
    );
    if (existing) {
      cachedEventFolders.set(eventId, existing.id);
      return existing.id;
    }

    const folderName = `event_${eventId}_${sanitizeFolderName(eventName)}`;
    const created = await client.folders.create(rootId, folderName);
    cachedEventFolders.set(eventId, created.id);
    console.log(`[awards-box] Created event folder '${folderName}' = ${created.id}`);
    return created.id;
  } catch (err) {
    console.error(`[awards-box] Failed to ensure event folder for ${eventId}:`, (err as Error).message);
    return null;
  }
}

/**
 * 画像を BOX のイベント別サブフォルダにミラー保存する。失敗時は null。
 */
export async function uploadAwardsImageToBox(
  eventId: number,
  eventName: string,
  filename: string,
  buffer: Buffer,
): Promise<string | null> {
  if (!isBoxConfigured()) return null;
  const client = getBoxClient();
  if (!client) return null;

  const folderId = await ensureEventFolder(eventId, eventName);
  if (!folderId) return null;

  try {
    const res = await client.files.uploadFile(folderId, filename, buffer);
    const fileId = res.entries?.[0]?.id ?? res.id ?? null;
    if (fileId) {
      console.log(`[awards-box] Uploaded ${filename} → BOX file ${fileId} (event ${eventId})`);
    }
    return fileId;
  } catch (err) {
    console.warn(`[awards-box] Failed to upload ${filename}:`, (err as Error).message);
    return null;
  }
}

/**
 * BOX からファイルをダウンロードしてローカルキャッシュに書き戻す。
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

/**
 * BOX 側に残っている `event_{id}_{name}` 形式のフォルダ一覧を取得。
 * 削除済みイベントのバックアップ復元 UI に使う。
 */
export interface BoxEventBackup {
  eventId: number;
  name: string;
  folderId: string;
  folderName: string;
  imageCount: number;
}

export async function listEventBackups(): Promise<BoxEventBackup[]> {
  if (!isBoxConfigured()) return [];
  const client = getBoxClient();
  if (!client) return [];
  const rootId = await ensureAwardsRootFolder();
  if (!rootId) return [];

  try {
    const items = await client.folders.getItems(rootId, { limit: 1000, fields: 'id,name,type' });
    const eventFolders = items.entries.filter(
      (it) => it.type === 'folder' && /^event_\d+_/.test(it.name),
    );

    // 各フォルダの画像枚数も取得（並列）
    const result: BoxEventBackup[] = await Promise.all(
      eventFolders.map(async (f) => {
        const parsed = parseEventFolderName(f.name);
        let imageCount = 0;
        try {
          const sub = await client.folders.getItems(f.id, { limit: 1000, fields: 'id,type' });
          imageCount = sub.entries.filter((it) => it.type === 'file').length;
        } catch {
          /* count 0 */
        }
        return {
          eventId: parsed?.eventId ?? -1,
          name: parsed?.name ?? f.name,
          folderId: f.id,
          folderName: f.name,
          imageCount,
        };
      }),
    );
    return result;
  } catch (err) {
    console.warn('[awards-box] listEventBackups failed:', (err as Error).message);
    return [];
  }
}

/**
 * 指定 BOX フォルダ配下の全画像をローカルにダウンロードする。
 * @returns 各画像の local filename と BOX file ID のペア
 */
export interface RestoredImage {
  localFilename: string; // {uuid}.jpg のような UPLOAD_DIR 直下のファイル名
  boxFileId: string;
}

export async function downloadEventBackupImages(
  folderId: string,
  uploadDir: string,
): Promise<RestoredImage[]> {
  if (!isBoxConfigured()) return [];
  const client = getBoxClient();
  if (!client) return [];

  try {
    const items = await client.folders.getItems(folderId, { limit: 1000, fields: 'id,name,type' });
    const files = items.entries.filter((it) => it.type === 'file');
    const restored: RestoredImage[] = [];

    for (const f of files) {
      try {
        const stream = await client.files.getReadStream(f.id);
        const buf = await streamToBuffer(stream);
        const localPath = path.join(uploadDir, f.name);
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, buf);
        restored.push({ localFilename: f.name, boxFileId: f.id });
      } catch (err) {
        console.warn(`[awards-box] Failed to download ${f.name}:`, (err as Error).message);
      }
    }
    console.log(`[awards-box] Restored ${restored.length}/${files.length} files from folder ${folderId}`);
    return restored;
  } catch (err) {
    console.warn('[awards-box] downloadEventBackupImages failed:', (err as Error).message);
    return [];
  }
}

/** イベント削除時に呼び出してメモリキャッシュを掃除する */
export function invalidateEventFolderCache(eventId: number): void {
  cachedEventFolders.delete(eventId);
}
