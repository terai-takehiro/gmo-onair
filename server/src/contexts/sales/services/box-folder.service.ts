/**
 * sales/services/box-folder.service.ts — v2.7.10 ライフサイクル連動版
 *
 * 案件 (project) 用 BOX フォルダ階層を作成・リネームするドメインサービス。
 *
 * 呼び出し元 (project.service.ts):
 *   - create() 直後: フォルダ作成 ({OPP-code}_{案件名})
 *   - update() で name 変更検出時: リネーム
 *   - issueGls() 直後: ID 部分を OPP-code → GLS-number に置換 (リネーム)
 *   - 手動エンドポイント /projects/:id/create-box-folder: 既存案件向けバックフィル
 *
 * 失敗時は throw せず warning ログ + null 返却で握り潰す方針
 * (BOX 障害で案件作成 / GLS 発番自体が失敗しないようにする)。
 *
 * フォルダ階層 (CLAUDE.md より):
 *   {idCode}_{案件名}/
 *     01_見積・提案/
 *     02_発注・契約/
 *     03_請求/
 *     04_Qシート/
 *     05_台本・進行表/
 *     06_納品物/
 *
 * 親フォルダの振り分け:
 *   customer_type === 'internal' → BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL
 *   customer_type === 'external' → BOX_PROJECT_PARENT_FOLDER_ID
 */
import { getBoxClient, isBoxConfigured, getBoxFolderUrl } from '../../../shared/services/box';

const SUBFOLDERS = [
  '01_見積・提案',
  '02_発注・契約',
  '03_請求',
  '04_Qシート',
  '05_台本・進行表',
  '06_納品物',
];

export type CustomerType = 'internal' | 'external';

/** BOX のファイル/フォルダ名で使えない文字を除去 (`/ \ : ? * | " < >`) */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim() || 'untitled';
}

/** customer_type に応じた親フォルダ ID を返す。未設定なら null */
function getParentFolderId(customerType: CustomerType): string | null {
  if (customerType === 'internal') {
    return process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL || null;
  }
  return process.env.BOX_PROJECT_PARENT_FOLDER_ID || null;
}

export interface CreatedProjectFolder {
  /** 親案件フォルダの BOX フォルダ ID */
  folderId: string;
  /** Web UI URL (https://app.box.com/folder/{id}) */
  folderUrl: string;
}

/**
 * 案件向けの BOX フォルダ階層を作成する。
 * @param idCode GLS 発番前なら OPP コード、発番後なら GLS 番号
 * @param projectName 例: "テレビ朝日 特番収録"
 * @param customerType 'internal' | 'external' — 親フォルダの振り分けに使用
 * @returns 親案件フォルダの ID + URL。BOX 未設定 / 親フォルダ未指定 / 失敗時は null
 */
export async function createProjectFolderTree(
  idCode: string,
  projectName: string,
  customerType: CustomerType,
): Promise<CreatedProjectFolder | null> {
  if (!isBoxConfigured()) {
    console.log('[box-folder] BOX not configured — skipping folder creation for', idCode);
    return null;
  }
  const parentId = getParentFolderId(customerType);
  if (!parentId) {
    console.warn(
      `[box-folder] Parent folder env not set for customerType=${customerType} — skipping (set BOX_PROJECT_PARENT_FOLDER_ID${customerType === 'internal' ? '_INTERNAL' : ''})`,
    );
    return null;
  }

  const client = getBoxClient();
  if (!client) return null;

  const folderName = sanitizeFolderName(`${idCode}_${projectName}`);

  try {
    // 親案件フォルダを作成
    const parentFolder = (await client.folders.create(parentId, folderName)) as { id: string };

    // 6 サブフォルダを順次作成 (BOX SDK は同時並列で書き込むと rate limit にかかりやすいので逐次)
    for (const sub of SUBFOLDERS) {
      try {
        await client.folders.create(parentFolder.id, sub);
      } catch (subErr) {
        console.warn(
          `[box-folder] Failed to create subfolder '${sub}' under ${folderName}:`,
          (subErr as Error).message,
        );
      }
    }

    console.log(
      `[box-folder] Created folder '${folderName}' (${customerType}) → ${parentFolder.id}`,
    );
    return {
      folderId: parentFolder.id,
      folderUrl: getBoxFolderUrl(parentFolder.id),
    };
  } catch (err) {
    console.error(
      `[box-folder] Failed to create project folder for ${idCode}:`,
      (err as Error).message,
    );
    return null;
  }
}

/**
 * 既存の BOX フォルダ名を変更する。
 * 案件名変更 / GLS 発番時の ID 部分置換に使う。
 *
 * @param folderId 既存の BOX フォルダ ID
 * @param newName 新しいフォルダ名 (例: "GLS-A001_新規企画") — 内部で sanitize される
 * @returns 成功なら新フォルダ URL、失敗 / 未設定なら null
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
