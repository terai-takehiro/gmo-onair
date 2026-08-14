/**
 * プロジェクト管理 (GPM) の BOX フォルダ (v4・モックの構成)
 *
 * ── なぜ案件用と分けるのか ──────────────────────────────────
 *
 * 案件 (`sales/services/box-folder.service.ts`) は
 * 01_見積・提案 / 02_発注・契約 / 03_請求 / 04_Qシート / 05_台本・進行表 /
 * 06_納品物 / 07_原価・利益管理 の7つで、**放送・収録の仕事の形**です。
 * プロジェクトは設備の構築なので、置くものが違います
 * (Qシートも台本もありません。代わりに図面と仕様書があります)。
 * 同じ関数に分岐を足すと、片方を直したときにもう片方が黙って変わります。
 *
 * ── サブフォルダはモックどおり ──────────────────────────────
 *
 * 見積・提案 / 原価・発注 / 請求 / 議事メモ / 図面 / 仕様書 / 工程表。
 * **社内限りに置くのは「原価・発注」と「請求」**です — 仕入値・発注書・請求書は
 * 発注者にも PM 会社にも見せません。残りは相手と共有して進めるものなので
 * 社外共有可に置きます。
 *
 * ⚠️ **帳票が入るフォルダの名前は案件とそろえてあります**（ご判断）。
 * 見積書は社外の `01_見積・提案`、請求書・検収書は社内の `03_請求` で、
 * これは `shared/services/doc-box-dest.ts` の表がそのまま使える形です。
 * **名前が1文字でも違うと `ensureSubfolder` が隣に新しいフォルダを作る**ので、
 * 表と綴りを合わせておくこと（案件側で実際に確かめた踏み方）。
 *
 * モックは社外の1つ目を「個別見積」と呼んでいますが、**帳票の行き先を
 * 2系統に分けないため**に案件と同じ「01_見積・提案」にしました。
 * すでに `01_個別見積` を持っているプロジェクトは、下の `LEGACY_ALIASES` で
 * **そのフォルダをそのまま使います**（隣に空の双子を作らないため）。
 *
 * ── 作るのは1回だけ。消せません ──────────────────────────────
 *
 * **BOX に作ったフォルダはこのアプリからは消せません**（人が手で消すことになる）。
 * なので
 *  ・すでに URL を持っているプロジェクトには作らない
 *  ・作るのは**明示的に押したときだけ**（プロジェクトを作った流れでは作らない）
 *  ・失敗しても throw しない（BOX が落ちている日にプロジェクトが作れなくなる）
 *
 * 検証環境の BOX で1件作って中身を確かめてから本番に出すこと。
 */
import { getBoxClient, isBoxConfigured, getBoxFolderUrl } from '../../../shared/services/box';

/** 社内限り — 仕入値・発注書・請求書。**相手に見せない** */
const INTERNAL_SUBFOLDERS = [
  '02_原価・発注',
  // 請求書・検収書の行き先（`doc-box-dest.ts`）。案件と同じ綴り
  '03_請求',
];

/** 社外共有可 — 発注者・PM 会社と一緒に進めるもの */
const EXTERNAL_SUBFOLDERS = [
  // 見積書の行き先（`doc-box-dest.ts`）。案件と同じ綴りにそろえてある
  '01_見積・提案',
  '03_議事メモ',
  '04_図面',
  '05_仕様書',
  '06_工程表',
];

/**
 * 昔の綴り。**すでに BOX にあるならそれを使う**（隣に空の双子を作らない）。
 *
 * `01_個別見積` は 2026-08 まで作られていた名前です。帳票の行き先を案件と
 * そろえた（`01_見積・提案`）ので、**新しく作るプロジェクトは新しい綴り**ですが、
 * 古いプロジェクトのフォルダを勝手に名前変更はしません（BOX 側の履歴と
 * 共有リンクが動くため）。人が BOX で名前を直すまで、こちらが合わせます。
 */
export const LEGACY_SUBFOLDER_ALIASES: Record<string, string[]> = {
  '01_見積・提案': ['01_個別見積'],
};

const INTERNAL_PREFIX = '【社内】';
const EXTERNAL_PREFIX = '【社外】';

/** BOX のファイル/フォルダ名で使えない文字を除去 (`/ \ : ? * | " < >`) */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim() || 'untitled';
}

export interface CreatedFolder { folderId: string; folderUrl: string }
export interface CreatedGpmFolderPair {
  internal: CreatedFolder | null;
  external: CreatedFolder | null;
}

type BoxClient = NonNullable<ReturnType<typeof getBoxClient>>;

async function createOneTree(
  client: BoxClient, parentId: string, folderName: string, subfolders: string[], label: string,
): Promise<CreatedFolder | null> {
  try {
    const parent = (await client.folders.create(parentId, folderName)) as { id: string };
    // 逐次で作る (BOX SDK は同時に書き込むと rate limit にかかる)
    for (const sub of subfolders) {
      try {
        await client.folders.create(parent.id, sub);
      } catch (err) {
        console.warn(`[gpm-box] (${label}) サブフォルダ '${sub}' を作れませんでした:`, (err as Error).message);
      }
    }
    console.log(`[gpm-box] (${label}) '${folderName}' を作りました → ${parent.id}`);
    return { folderId: parent.id, folderUrl: getBoxFolderUrl(parent.id) };
  } catch (err) {
    console.error(`[gpm-box] (${label}) '${folderName}' を作れませんでした:`, (err as Error).message);
    return null;
  }
}

/**
 * プロジェクトの BOX フォルダを社内限り／社外共有可の両方に作る。
 *
 * @param projectName プロジェクト名（そのままフォルダ名になる）
 */
export async function createGpmFolderTree(projectName: string): Promise<CreatedGpmFolderPair> {
  if (!isBoxConfigured()) {
    console.log('[gpm-box] BOX が設定されていないので作りません:', projectName);
    return { internal: null, external: null };
  }
  const client = getBoxClient();
  if (!client) return { internal: null, external: null };

  const baseName = sanitizeFolderName(projectName);
  const internalParent = process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL || null;
  const externalParent = process.env.BOX_PROJECT_PARENT_FOLDER_ID || null;

  if (!internalParent && !externalParent) {
    console.warn('[gpm-box] 親フォルダが1つも設定されていません');
    return { internal: null, external: null };
  }

  const [internal, external] = await Promise.all([
    internalParent
      ? createOneTree(client, internalParent, `${INTERNAL_PREFIX}${baseName}`, INTERNAL_SUBFOLDERS, '社内限り')
      : Promise.resolve(null),
    externalParent
      ? createOneTree(client, externalParent, `${EXTERNAL_PREFIX}${baseName}`, EXTERNAL_SUBFOLDERS, '社外共有可')
      : Promise.resolve(null),
  ]);
  return { internal, external };
}

/** 画面に「何が作られるか」を出すための一覧（作る前に見せる） */
export const GPM_FOLDER_PREVIEW = {
  internal: INTERNAL_SUBFOLDERS,
  external: EXTERNAL_SUBFOLDERS,
} as const;
