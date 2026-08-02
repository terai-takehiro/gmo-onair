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
