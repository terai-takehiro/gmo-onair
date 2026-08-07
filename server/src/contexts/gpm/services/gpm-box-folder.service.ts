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
 * 個別見積 / 原価・発注 / 議事メモ / 図面 / 仕様書 / 工程表 の6つ。
 * **社内限りに置くのは「原価・発注」だけ**です — 仕入値と発注書は
 * 発注者にも PM 会社にも見せません。残りは相手と共有して進めるものなので
 * 社外共有可に置きます。
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

/** 社内限り — 仕入値と発注書。**相手に見せない** */
const INTERNAL_SUBFOLDERS = [
  '02_原価・発注',
];

/** 社外共有可 — 発注者・PM 会社と一緒に進めるもの */
const EXTERNAL_SUBFOLDERS = [
  '01_個別見積',
  '03_議事メモ',
  '04_図面',
  '05_仕様書',
  '06_工程表',
];

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
