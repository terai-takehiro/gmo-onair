/**
 * sales/services/box-folder.service.ts — v2.7.11 パターン Y (機密度別 2 親フォルダ並行作成)
 *
 * 案件 (project) 用 BOX フォルダ階層を「社内限り」「社外共有可」の 2 親フォルダに並行作成する。
 *
 * 呼び出し元 (project.service.ts):
 *   - create() 直後: 両親フォルダに {OPP-code}_{案件名} を作成
 *   - update() で name 変更検出時: 両フォルダを並行リネーム
 *   - issueGls() 直後: 両フォルダの ID 部分を OPP-code → GLS-number に置換
 *   - 手動エンドポイント /projects/:id/create-box-folder: 両フォルダのうち未作成のものを補填
 *
 * 失敗時は throw せず warning ログ + null 返却で握り潰す方針
 * (BOX 障害で案件作成 / GLS 発番自体が失敗しないようにする)。
 *
 * 親フォルダ:
 *   BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL → 社内限り (機密情報)
 *   BOX_PROJECT_PARENT_FOLDER_ID          → 社外共有可 (顧客とコラボ可)
 *
 * サブフォルダ配分:
 *   社内限り:   02_発注・契約 / 03_請求 / 07_原価・利益管理
 *   社外共有可: 01_見積・提案 / 04_Qシート / 05_台本・進行表 / 06_納品物
 */
import { getBoxClient, isBoxConfigured, getBoxFolderUrl } from '../../../shared/services/box';

const INTERNAL_SUBFOLDERS = [
  '02_発注・契約',
  '03_請求',
  '07_原価・利益管理',
];

const EXTERNAL_SUBFOLDERS = [
  '01_見積・提案',
  '04_Qシート',
  '05_台本・進行表',
  '06_納品物',
];

export type CustomerType = 'internal' | 'external';

/** BOX のファイル/フォルダ名で使えない文字を除去 (`/ \ : ? * | " < >`) */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim() || 'untitled';
}

function getInternalParentFolderId(): string | null {
  return process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL || null;
}

function getExternalParentFolderId(): string | null {
  return process.env.BOX_PROJECT_PARENT_FOLDER_ID || null;
}

export interface CreatedFolder {
  folderId: string;
  folderUrl: string;
}

export interface CreatedProjectFolderPair {
  /** 社内限り親フォルダ配下のフォルダ。親フォルダ未設定 / 失敗時は null */
  internal: CreatedFolder | null;
  /** 社外共有可親フォルダ配下のフォルダ。親フォルダ未設定 / 失敗時は null */
  external: CreatedFolder | null;
}

type BoxClient = NonNullable<ReturnType<typeof getBoxClient>>;

async function createOneFolderTree(
  client: BoxClient,
  parentId: string,
  folderName: string,
  subfolders: string[],
  label: string,
): Promise<CreatedFolder | null> {
  try {
    const parentFolder = (await client.folders.create(parentId, folderName)) as { id: string };
    // サブフォルダは逐次作成 (BOX SDK は同時並列で書き込むと rate limit にかかりやすい)
    for (const sub of subfolders) {
      try {
        await client.folders.create(parentFolder.id, sub);
      } catch (subErr) {
        console.warn(
          `[box-folder] (${label}) Failed to create subfolder '${sub}' under ${folderName}:`,
          (subErr as Error).message,
        );
      }
    }
    console.log(`[box-folder] (${label}) Created '${folderName}' → ${parentFolder.id}`);
    return { folderId: parentFolder.id, folderUrl: getBoxFolderUrl(parentFolder.id) };
  } catch (err) {
    console.error(
      `[box-folder] (${label}) Failed to create folder '${folderName}':`,
      (err as Error).message,
    );
    return null;
  }
}

/**
 * 案件向けの BOX フォルダ階層を「社内限り」「社外共有可」の両親フォルダに並行作成する。
 * @param idCode GLS 発番前なら OPP コード、発番後なら GLS 番号
 * @param projectName 例: "テレビ朝日 特番収録"
 * @returns 内部・外部それぞれの作成結果 (片方失敗・親未設定でも他方を進める)
 */
export async function createProjectFolderTree(
  idCode: string,
  projectName: string,
): Promise<CreatedProjectFolderPair> {
  if (!isBoxConfigured()) {
    console.log('[box-folder] BOX not configured — skipping folder creation for', idCode);
    return { internal: null, external: null };
  }

  const client = getBoxClient();
  if (!client) return { internal: null, external: null };

  const folderName = sanitizeFolderName(`${idCode}_${projectName}`);
  const internalParent = getInternalParentFolderId();
  const externalParent = getExternalParentFolderId();

  if (!internalParent) {
    console.warn('[box-folder] BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL not set — skipping 社内限り folder');
  }
  if (!externalParent) {
    console.warn('[box-folder] BOX_PROJECT_PARENT_FOLDER_ID not set — skipping 社外共有可 folder');
  }
  if (!internalParent && !externalParent) {
    return { internal: null, external: null };
  }

  // 親フォルダが異なるので並行実行 OK
  const [internal, external] = await Promise.all([
    internalParent
      ? createOneFolderTree(client, internalParent, folderName, INTERNAL_SUBFOLDERS, '社内限り')
      : Promise.resolve(null),
    externalParent
      ? createOneFolderTree(client, externalParent, folderName, EXTERNAL_SUBFOLDERS, '社外共有可')
      : Promise.resolve(null),
  ]);

  return { internal, external };
}

/**
 * 既存の BOX フォルダ名を変更する。
 * 案件名変更 / GLS 発番時の ID 部分置換に使う。
 */
export async function renameProjectFolder(
  folderId: string,
  newName: string,
): Promise<{ folderUrl: string } | null> {
  if (!isBoxConfigured()) return null;
  const client = getBoxClient();
  if (!client) return null;

  const sanitized = sanitizeFolderName(newName);
  try {
    await client.folders.update(folderId, { name: sanitized });
    console.log(`[box-folder] Renamed folder ${folderId} → '${sanitized}'`);
    return { folderUrl: getBoxFolderUrl(folderId) };
  } catch (err) {
    console.warn(
      `[box-folder] Failed to rename folder ${folderId} → '${sanitized}':`,
      (err as Error).message,
    );
    return null;
  }
}

/** 案件に紐づく両フォルダを並行リネーム (片方しかない場合は片方のみ) */
export async function renameProjectFolderPair(
  internalFolderId: string | null,
  externalFolderId: string | null,
  newName: string,
): Promise<void> {
  await Promise.all([
    internalFolderId ? renameProjectFolder(internalFolderId, newName) : Promise.resolve(null),
    externalFolderId ? renameProjectFolder(externalFolderId, newName) : Promise.resolve(null),
  ]);
}
