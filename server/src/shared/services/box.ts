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

/** フォルダの中身と、**出し切れたかどうか** */
export interface FolderListing {
  items: BoxItem[];
  /** そのフォルダにある総数（BOX が返す `total_count`）。分からなければ `items.length` */
  total: number;
  /** 上限に当たって途中で止めたか。**true のときは画面に「ほか N 件」を書くこと** */
  truncated: boolean;
}

/** 1回の呼び出しで取る件数（BOX の上限は 1000。既定の 100 は少なすぎる） */
const PAGE = 200;
/** 何件まで取るか。**これを超えたら「ほか N 件」と書いて BOX を開いてもらう** */
export const FOLDER_ITEMS_MAX = 600;

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
 *
 * ── ⚠️ 1回で取り切れると思わないこと（レビューでの指摘 #51）─────
 *
 * `getItems` は既定で **100 件**しか返しません。前の版は `limit = 100` を
 * 渡して1回呼ぶだけだったので、**101 個目からのファイルは画面に出ませんでした**。
 * しかも**出ないだけ**なので手がかりがありません — 置いた人は「上げたのに無い」、
 * 見る人は「まだ入っていない」と読み、**同じファイルがもう一度上がります**。
 * 当日の写真（`08_写真`）は1つの現場で 100 枚を軽く超えます。
 *
 * **端まで送りながら集めます。** それでも上限（`FOLDER_ITEMS_MAX`）は置きます —
 * 何千件あるフォルダを全部引くと画面が固まるので。**上限に当たったことは
 * `truncated` で返し、呼ぶ側が必ず画面に書きます**（黙って切らない）。
 */
export async function listFolderItems(
  folderId: string, max = FOLDER_ITEMS_MAX,
): Promise<FolderListing> {
  const client = getBoxClient();
  if (!client) throw new Error('BOX_NOT_CONFIGURED');

  return await collectFolderItems(
    (limit, offset) => client.folders.getItems(folderId, {
      fields: 'id,type,name,size,modified_at,modified_by',
      limit,
      offset,
    }) as unknown as Promise<BoxPage>,
    max,
  );
}

/** BOX の `folders.getItems` の返事のうち、ここで見るぶんだけ */
export interface BoxPage { entries?: Record<string, unknown>[]; total_count?: number }

/**
 * 端まで送りながら集める部分だけを取り出したもの。
 *
 * **BOX につないでいない環境（検証用の Postgres だけ立てたとき）でも
 * 送り方を確かめられるように**、取ってくるところを引数にしてあります
 * （`mapBoxItems` を純関数にしてあるのと同じ理由）。
 * 数え方を間違えると**黙って足りない一覧**になり、画面を見ても気づけません。
 */
export async function collectFolderItems(
  getPage: (limit: number, offset: number) => Promise<BoxPage>,
  max = FOLDER_ITEMS_MAX,
): Promise<FolderListing> {
  const entries: Record<string, unknown>[] = [];
  let total = 0;

  for (let offset = 0; entries.length < max; offset += PAGE) {
    const want = Math.min(PAGE, max - entries.length);
    const res = await getPage(want, offset);

    const page = res.entries ?? [];
    entries.push(...page);
    if (typeof res.total_count === 'number') total = res.total_count;
    // 頼んだ数より少ない = 端まで来た（`total_count` を信じ切らない）
    if (page.length < want) break;
  }

  return {
    items: mapBoxItems(entries),
    total: Math.max(total, entries.length),
    // **総数が分からない BOX の応答でも黙らない** — 上限まで取れたなら続きがある扱い
    truncated: entries.length >= max && (total === 0 || total > entries.length),
  };
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

/**
 * 親フォルダの下から名前でサブフォルダを探す。無ければ作る。
 *
 * ── なぜ「無ければ作る」なのか ──────────────────────────────
 *
 * サブフォルダの構成はあとから足されます（`08_写真` は migration 186 の回）。
 * 発番時の自動生成に足すだけだと、**それ以前に作られた案件のフォルダには
 * 入っていない**ので、そこには1枚も置けません（そして理由が画面に出ません）。
 * 初回に使うときに無ければ作ります。
 *
 * ── 競り合いに強くする ──────────────────────────────────────
 *
 * 2人が同時に1枚目を上げると、`create` が **409（同名あり）** で片方だけ落ちます。
 * 落ちたほうは**探し直して**、見つかったらそれを使います
 * （`uploadToFolder` が 409 を版にするのと同じ考え方）。
 *
 * ⚠️ **ここに置いてあるのは、案件の写真と帳票の両方が使うためです。**
 * 元は `contexts/sales/services/box-folder.service.ts` にありましたが、
 * 財務（`revenues` の帳票）からも呼ぶことになったので BOX の土台側へ移しました
 * （`shared` が `contexts` を読む形にはしない）。
 */
export interface EnsuredFolder {
  id: string;
  /**
   * **実際に使ったフォルダの名前。** 昔の綴りのフォルダを掴んだときは
   * `name` ではなくそちらが入ります。**呼ぶ側はこれを画面に出すこと** —
   * 頼んだ名前をそのまま出すと、**昔の綴りのままの案件でだけ
   * 「01_見積・提案 に入れました」と嘘になり、人は空のフォルダを探しに行きます**
   * （まさにこの受け入れが要る案件で外れる）。
   */
  name: string;
}

export async function ensureSubfolder(
  parentFolderId: string,
  name: string,
  /**
   * 昔の綴り。**すでにあるならそれを使い、新しい名前で作り直しません** —
   * 作ると同じ用途のフォルダが隣に2つ並び、どちらに入ったのか誰も分からなくなります
   * （プロジェクト管理の `01_個別見積` → `01_見積・提案` の言い換えで要る）。
   * 探す順は「新しい名前 → 昔の名前」で、**どちらも無いときだけ新しい名前で作ります**。
   */
  alsoAccept: string[] = [],
): Promise<EnsuredFolder | null> {
  if (!isBoxConfigured()) return null;
  const client = getBoxClient();
  if (!client) return null;

  const wanted = [name, ...alsoAccept];
  const find = async (): Promise<EnsuredFolder | null> => {
    try {
      const res = (await client.folders.getItems(parentFolderId, { limit: 200 })) as
        { entries?: { type?: string; id?: string; name?: string }[] };
      const folders = (res.entries ?? []).filter((e) => e.type === 'folder');
      for (const w of wanted) {
        const hit = folders.find((e) => e.name === w);
        if (hit?.id) return { id: hit.id, name: w };
      }
      return null;
    } catch (err) {
      console.warn(`[box] Failed to list ${parentFolderId}:`, (err as Error).message);
      return null;
    }
  };

  const existing = await find();
  if (existing) return existing;
  try {
    const created = (await client.folders.create(parentFolderId, name)) as { id: string };
    return { id: created.id, name };
  } catch (err) {
    // 同名あり (409) は、他の人が先に作ったということ。探し直して使う
    const again = await find();
    if (again) return again;
    console.warn(`[box] Failed to create '${name}' under ${parentFolderId}:`, (err as Error).message);
    return null;
  }
}

/** 1回に上げられる大きさ。**BOX の分割アップロードは使わない**（この用途では要らない） */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * フォルダにファイルを1つ置く。
 *
 * ── 同じ名前のときは版を足す ────────────────────────────────
 *
 * BOX は同名のファイルがあると 409 を返します。ここで諦めると
 * 「見積_v2.pdf を上げ直したのに入らない」が起き、しかも**理由が画面に出ない**と
 * 押し直され続けます。**同名があれば新しい版として上げる**（BOX の版履歴に残るので、
 * 前の中身も追えます）。
 *
 * ── 失敗は投げる ────────────────────────────────────────────
 *
 * 読み取り（`listFolderItems`）は「つながらなくても案件を止めない」ために
 * 呼び出し側で握りつぶしますが、**書き込みは握りつぶしてはいけません** —
 * 上がっていないのに上がったように見えるのが一番困ります。
 */
export async function uploadToFolder(
  folderId: string, filename: string, buffer: Buffer,
): Promise<BoxItem> {
  const client = getBoxClient();
  if (!client) throw new Error('BOX_NOT_CONFIGURED');

  const put = async () => {
    const res = await client.files.uploadFile(folderId, filename, buffer) as
      { entries?: Record<string, unknown>[]; id?: string };
    const entry = res.entries?.[0];
    if (entry) return mapBoxItems([entry])[0];
    if (res.id) return mapBoxItems([{ id: res.id, type: 'file', name: filename, size: buffer.length }])[0];
    throw new Error('BOX_UPLOAD_NO_ID');
  };

  try {
    return await put();
  } catch (err) {
    // 409 = 同じ名前のファイルがある。その id に新しい版として上げ直す
    const conflictId = conflictFileId(err);
    if (!conflictId) throw err;
    const res = await client.files.uploadFileVersion(conflictId, filename, buffer) as
      { entries?: Record<string, unknown>[]; id?: string };
    const entry = res.entries?.[0];
    return entry
      ? mapBoxItems([entry])[0]
      : mapBoxItems([{ id: conflictId, type: 'file', name: filename, size: buffer.length }])[0];
  }
}

/** 409 のときに BOX が教えてくれる「ぶつかった相手の id」。無ければ null */
function conflictFileId(err: unknown): string | null {
  const e = err as { statusCode?: number; response?: { body?: unknown }; context_info?: unknown };
  const status = e?.statusCode ?? (e as { status?: number })?.status;
  if (status !== 409) return null;
  const body = (e.response?.body ?? e) as { context_info?: { conflicts?: { id?: string } } };
  const id = body?.context_info?.conflicts?.id;
  return id ? String(id) : null;
}

/**
 * ファイルのサムネイル（320px の JPEG）を**流して**返す。
 *
 * ── こちらに画像を貯めない ──────────────────────────────────
 *
 * ご指示どおり、写真の実体は BOX にだけ置きます。ここでやるのは
 * **BOX が作ったサムネイルをそのまま流すこと**だけで、保存もキャッシュもしません
 * （貯めると、BOX 側で消した写真がこちらに残ります）。
 *
 * ── 使えないことがある ──────────────────────────────────────
 *
 * サムネイル（representation）は BOX の契約プランと**変換が終わっているか**に
 * 依存します。まだ変換中や、対応していない形式では出せません。
 * そのときは投げて、**呼び出し側がファイル名だけの表示に落とします** —
 * 画面が壊れるより、絵が出ないほうがましです。
 */
export async function getThumbnailStream(fileId: string): Promise<NodeJS.ReadableStream> {
  const client = getBoxClient();
  if (!client) throw new Error('BOX_NOT_CONFIGURED');
  const files = client.files as unknown as {
    representation: Record<string, string>;
    getRepresentationContent: (id: string, rep: string) => Promise<NodeJS.ReadableStream>;
  };
  return await files.getRepresentationContent(fileId, files.representation.THUMBNAIL);
}

/** 画像として扱う拡張子。**BOX に訊かずに決める** — 一覧のたびに問い合わせると遅い */
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff'];

export function isImageName(name: string): boolean {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  return IMAGE_EXT.includes(ext);
}
