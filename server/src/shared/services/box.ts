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

/** BOX フォルダの中身1件 */
export interface BoxItem {
  id: string;
  type: 'file' | 'folder';
  name: string;
  /** ファイルのときだけ。バイト数 */
  size: number | null;
  modified_at: string | null;
  modified_by: string | null;
  /** ブラウザで開く URL */
  url: string;
}

/**
 * フォルダの中身を1階層ぶん返す。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 * ・**再帰しない。** 深いフォルダを全部たどると BOX の呼び出し回数が読めず、
 *   画面が固まります。中を見たい人は BOX を開きます
 * ・**フォルダを先、次にファイル。** どちらも名前順。BOX の既定の並びは
 *   API のページングに依存するので、こちらで決め直します
 * ・**BOX が未設定・障害のときは投げます。** 呼び出し側が「BOX につながりません」と
 *   出して、案件の作成や更新は普通に続けられるようにするためです
 *   (このファイルの冒頭の設計方針)
 */
export async function listFolderItems(folderId: string, limit = 100): Promise<BoxItem[]> {
  const client = getBoxClient();
  if (!client) throw new Error('BOX_NOT_CONFIGURED');

  const res = await client.folders.getItems(folderId, {
    fields: 'id,type,name,size,modified_at,modified_by',
    limit,
  }) as unknown as { entries?: Record<string, unknown>[] };

  return mapBoxItems(res.entries ?? []);
}

/**
 * BOX の返事を画面が使う形に直す。**ここだけ純関数にしてある** —
 * BOX につないでいない環境 (検証用の Postgres だけ立てたとき) でも
 * 並び順と整形を確かめられるようにするためです。
 */
export function mapBoxItems(entries: Record<string, unknown>[]): BoxItem[] {
  const items: BoxItem[] = entries.map((e) => {
    const type = e.type === 'folder' ? 'folder' : 'file';
    const by = e.modified_by as { name?: string } | undefined;
    return {
      id: String(e.id),
      type,
      // フォルダに size は無い。ファイルでも数値でなければ出さない
      name: String(e.name ?? ''),
      size: type === 'file' && typeof e.size === 'number' ? e.size : null,
      modified_at: typeof e.modified_at === 'string' ? e.modified_at : null,
      modified_by: by?.name ?? null,
      url: type === 'folder'
        ? getBoxFolderUrl(String(e.id))
        : `https://app.box.com/file/${String(e.id)}`,
    };
  });

  return items.sort((a, b) =>
    (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1)
    || a.name.localeCompare(b.name, 'ja'));
}
