/**
 * server/src/shared/services/box.ts — Phase 4 v2.7.0
 *
 * BOX SDK のシングルトンクライアント。JWT App (サービスアカウント) 認証で動作。
 *
 * 環境変数:
 *   BOX_CONFIG_JSON — BOX 開発者コンソールで作成した JWT App の JSON 設定を 1 行に圧縮した文字列。
 *                     未設定なら BOX 連携全体が無効化され、関連フックは no-op になる。
 *   BOX_PROJECT_PARENT_FOLDER_ID — 案件フォルダを作成する親フォルダの BOX フォルダ ID。
 *
 * 設計方針: BOX 障害が業務をブロックしないよう、未設定時もサーバーは正常起動する。
 *           各呼び出し側は `isBoxConfigured()` で有効化を確認するか、try/catch で握り潰す。
 */
import BoxSDK from 'box-node-sdk';

type BoxClient = ReturnType<ReturnType<typeof BoxSDK.getPreconfiguredInstance>['getAppAuthClient']>;

let cachedClient: BoxClient | null = null;
let initAttempted = false;

interface BoxConfigJson {
  boxAppSettings?: {
    clientID: string;
    clientSecret: string;
    appAuth: {
      publicKeyID: string;
      privateKey: string;
      passphrase: string;
    };
  };
  enterpriseID?: string;
}

function initClient(): typeof cachedClient {
  if (initAttempted) return cachedClient;
  initAttempted = true;

  const raw = process.env.BOX_CONFIG_JSON;
  if (!raw) {
    console.log('[box] BOX_CONFIG_JSON not set — BOX integration disabled');
    return null;
  }

  let config: BoxConfigJson;
  try {
    config = JSON.parse(raw) as BoxConfigJson;
  } catch (err) {
    console.error('[box] BOX_CONFIG_JSON is not valid JSON:', (err as Error).message);
    return null;
  }

  if (!config.boxAppSettings || !config.enterpriseID) {
    console.error('[box] BOX_CONFIG_JSON missing boxAppSettings or enterpriseID');
    return null;
  }

  try {
    const sdk = BoxSDK.getPreconfiguredInstance(config);
    cachedClient = sdk.getAppAuthClient('enterprise', config.enterpriseID);
    console.log('[box] BOX client initialized for enterprise', config.enterpriseID);
  } catch (err) {
    console.error('[box] Failed to initialize BOX client:', (err as Error).message);
    cachedClient = null;
  }
  return cachedClient;
}

/**
 * BOX が設定済みかどうか。各サービスはこれで gate して、未設定なら no-op する。
 */
export function isBoxConfigured(): boolean {
  return initClient() !== null;
}

/**
 * BOX SDK の AppAuth クライアント。設定が無ければ null。
 */
export function getBoxClient(): NonNullable<typeof cachedClient> | null {
  return initClient();
}

/**
 * BOX フォルダ ID から Web UI URL を生成。
 * 共有リンクではなくユーザーがログイン状態でアクセスする URL。
 */
export function getBoxFolderUrl(folderId: string): string {
  return `https://app.box.com/folder/${folderId}`;
}

/**
 * BOX フォルダ URL から folder ID を抽出。
 * 期待フォーマット: https://app.box.com/folder/123456789
 * マッチしなければ null。
 */
export function extractFolderId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/folder\/(\d+)/);
  return m ? m[1] : null;
}

// ── 受信した書類 (請求書等) の置き場所 ────────────────────────────────
//
// **フォルダ ID を運用者に調べさせない**。社内限りの親フォルダの下に
// 無ければ作る (案件フォルダの自動生成と同じ `folders.create`)。
// 決算インポート / 精算PDF取込のフォルダとは**必ず別にする** — あちらは
// 「フォルダ内の最新ファイルを自動で読む」動きをするので混ぜると誤って取り込む。

const RECEIVED_DOCS_FOLDER_NAME = '00_受信した請求書';
let receivedDocsFolderId: string | null = null;

/** 受信書類フォルダの ID。無ければ作る (env `FINANCE_DOC_BOX_FOLDER_ID` で明示指定も可) */
export async function ensureReceivedDocsFolder(): Promise<string> {
  if (process.env.FINANCE_DOC_BOX_FOLDER_ID) return process.env.FINANCE_DOC_BOX_FOLDER_ID;
  if (receivedDocsFolderId) return receivedDocsFolderId;
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');
  const parentId = process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL;
  if (!parentId) throw new Error('Box の社内限り親フォルダ (BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL) が未設定です');

  // 既にあれば使う (毎回作らない)
  const items = await client.folders.getItems(parentId, { fields: 'id,name,type', limit: 1000 });
  const found = (items.entries as Array<{ id: string; name: string; type: string }> | undefined)
    ?.find((e) => e.type === 'folder' && e.name === RECEIVED_DOCS_FOLDER_NAME);
  if (found) { receivedDocsFolderId = found.id; return found.id; }

  try {
    const created = (await client.folders.create(parentId, RECEIVED_DOCS_FOLDER_NAME)) as { id: string };
    receivedDocsFolderId = created.id;
    return created.id;
  } catch (err) {
    // 同時に2人が上げたときは name conflict になる → 相手が作ったものを使う
    const conflict = (err as { response?: { body?: { context_info?: { conflicts?: Array<{ id: string }> } } } })
      .response?.body?.context_info?.conflicts?.[0]?.id;
    if (conflict) { receivedDocsFolderId = conflict; return conflict; }
    throw err;
  }
}

/**
 * Box にファイルを上げる。同名があっても**上書きしない** (別名で保存する)。
 * 原本は差し替えの記録が要るものなので、黙って消してはいけない。
 */
export async function uploadToBox(
  folderId: string, fileName: string, buffer: Buffer,
): Promise<{ id: string; name: string }> {
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');
  const upload = async (name: string) => {
    const res = await client.files.uploadFile(folderId, name, buffer) as { entries?: Array<{ id: string; name: string }> };
    const e = res.entries?.[0];
    if (!e) throw new Error('Box へのアップロードに失敗しました');
    return { id: e.id, name: e.name };
  };
  try {
    return await upload(fileName);
  } catch (err) {
    const code = (err as { response?: { body?: { code?: string } } }).response?.body?.code;
    if (code !== 'item_name_in_use') throw err;
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const dot = fileName.lastIndexOf('.');
    const alt = dot > 0 ? `${fileName.slice(0, dot)}_${stamp}${fileName.slice(dot)}` : `${fileName}_${stamp}`;
    return upload(alt);
  }
}

/** Box のファイルを Buffer で読む (画面に原本を出すため) */
export async function downloadFromBox(boxFileId: string): Promise<Buffer> {
  const client = getBoxClient();
  if (!client) throw new Error('Box が未設定です (BOX_CONFIG_JSON が必要)');
  const stream = await client.files.getReadStream(boxFileId) as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Box のテキスト抽出 (extracted_text representation) から本文を取る。
 * **上げた直後は生成に 1〜2 分かかる**ので、timeoutMs で必ず制御を戻す
 * (nginx の /api/ プロキシは既定 60 秒で 504 になるため、それより短くすること)。
 * 取れなかったときは null を返す (下読みができないだけで、原本は付いている)。
 */
export async function fetchBoxExtractedText(
  boxFileId: string, timeoutMs = 20_000,
): Promise<string | null> {
  const client = getBoxClient();
  if (!client) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
    const stream = await Promise.race([
      (client.files as unknown as { getRepresentationContent(id: string, rep: string): Promise<NodeJS.ReadableStream> })
        .getRepresentationContent(boxFileId, '[extracted_text]'),
      timeout,
    ]);
    if (!stream) return null;
    const chunks: Buffer[] = [];
    const text = await Promise.race([
      new Promise<string>((resolve, reject) => {
        (stream as NodeJS.ReadableStream).on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        (stream as NodeJS.ReadableStream).on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        (stream as NodeJS.ReadableStream).on('error', reject);
      }),
      timeout,
    ]);
    return text && text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
