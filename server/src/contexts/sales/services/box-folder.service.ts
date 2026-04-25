/**
 * sales/services/box-folder.service.ts — Phase 4 v2.7.0
 *
 * 案件 (project) 用 BOX フォルダ階層を作成するドメインサービス。
 * GLS 発番時に projectService.issueGls() から呼ばれる。
 *
 * 失敗時は throw せず、warning ログ + null 返却で握り潰す方針 (BOX 障害で
 * GLS 発番自体が失敗しないようにする)。
 *
 * フォルダ階層 (CLAUDE.md より):
 *   {GLS番号}_{案件名}/
 *     01_見積・提案/
 *     02_発注・契約/
 *     03_請求/
 *     04_Qシート/
 *     05_台本・進行表/
 *     06_納品物/
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

/** BOX のファイル/フォルダ名で使えない文字を除去 (`/ \ : ? * | " < >`) */
function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim() || 'untitled';
}

export interface CreatedProjectFolder {
  /** 親案件フォルダの BOX フォルダ ID */
  folderId: string;
  /** Web UI URL (https://app.box.com/folder/{id}) */
  folderUrl: string;
}

/**
 * 案件向けの BOX フォルダ階層を作成する。
 * @param glsNumber 例: "GLS-A001"
 * @param projectName 例: "テレビ朝日 特番収録"
 * @returns 親案件フォルダの ID + URL。BOX 未設定 / 失敗時は null
 */
export async function createProjectFolderTree(
  glsNumber: string,
  projectName: string,
): Promise<CreatedProjectFolder | null> {
  if (!isBoxConfigured()) {
    console.log('[box-folder] BOX not configured — skipping folder creation for', glsNumber);
    return null;
  }
  const parentId = process.env.BOX_PROJECT_PARENT_FOLDER_ID;
  if (!parentId) {
    console.warn('[box-folder] BOX_PROJECT_PARENT_FOLDER_ID not set — skipping');
    return null;
  }

  const client = getBoxClient();
  if (!client) return null;

  const folderName = sanitizeFolderName(`${glsNumber}_${projectName}`);

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

    return {
      folderId: parentFolder.id,
      folderUrl: getBoxFolderUrl(parentFolder.id),
    };
  } catch (err) {
    console.error(
      `[box-folder] Failed to create project folder for ${glsNumber}:`,
      (err as Error).message,
    );
    return null;
  }
}
