/**
 * sales/services/box-folder.service.ts — v2.7.11 パターン Y (機密度別 2 親フォルダ並行作成)
 *
 * 案件 (project) 用 BOX フォルダ階層を「社内限り」「社外共有可」の 2 親フォルダに並行作成する。
 *
 * フォルダ名は `{実施日}_{管理番号 or 案件コード}_{案件名}`（`buildProjectFolderName`）。
 * 実施日を先頭に置くのは、BOX の名前順がそのまま実施日順になるため（ご依頼 2026-09-24）。
 *
 * 呼び出し元 (project.service.ts):
 *   - create() 直後: 両親フォルダに作成
 *   - 手動エンドポイント /projects/:id/create-box-folder: 両フォルダのうち未作成のものを補填
 * 作ったあとの改名（案件名・実施日・番号が変わったとき）は `box-folder-name.service.ts`。
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
 *   社外共有可: 01_見積・提案 / 04_Qシート / 05_台本・進行表 / 06_納品物 / 08_写真
 */
import { getBoxClient, isBoxConfigured, getBoxFolderUrl } from '../../../shared/services/box';

const INTERNAL_SUBFOLDERS = [
  '02_発注・契約',
  '03_請求',
  '07_原価・利益管理',
];

/**
 * 当日の写真を貯めるフォルダ（v4 ⑥ ふりかえり）。
 *
 * **社外と共有するフォルダの下**に置きます（ご指示）。報告資料はお客様に出すもので、
 * 写真もその材料だからです。**社内限りの下に作らないこと** — 取り違えると
 * 原価と同じ事故（社外に出してはいけないものが出る／出したいものが出せない）になります。
 *
 * 番号を振ってあるのは、BOX の一覧が名前順で並ぶためです。
 * 番号が無いと、既存の `01_` 〜 `06_` の**間**ではなく先頭か末尾に飛びます。
 */
export const PHOTOS_SUBFOLDER = '08_写真';

const EXTERNAL_SUBFOLDERS = [
  '01_見積・提案',
  '04_Qシート',
  '05_台本・進行表',
  '06_納品物',
  PHOTOS_SUBFOLDER,
];

export type CustomerType = 'internal' | 'external';

/** フォルダ名を組み立てるのに使う案件の値 */
export interface ProjectFolderNaming {
  gls_number?: string | null;
  code?: string | null;
  name?: string | null;
  /** `YYYY-MM-DD`（古い行は時刻付き・空文字もある） */
  event_start?: string | null;
  event_end?: string | null;
}

/** 実施日が入っていない案件の頭。**数字より後ろに並ぶ**ので、日付入りの下にまとまる */
export const UNDATED_FOLDER_LABEL = '未定';

function ymdParts(value: string | null | undefined): [string, string, string] | null {
  const m = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? [m[1], m[2], m[3]] : null;
}

/**
 * フォルダ名の頭の実施日（純関数）。
 *   1日        → `2026.12.03`
 *   複数日     → `2026.12.03-12.05`（年をまたぐときは `2026.12.31-2027.01.02`）
 *   日付が無い → `未定`
 *
 * ⚠️ **年を省かない。** 頭に置くので並び順は日付で決まり、月日だけだと
 * 年明けの案件（`01.10`）が前の年の12月より上に来る。
 * ⚠️ **`/` は使えない**（BOX のフォルダ名に使えず `sanitizeFolderName` が消す）。
 */
export function formatFolderDate(start: string | null | undefined, end: string | null | undefined): string {
  const s = ymdParts(start);
  if (!s) return UNDATED_FOLDER_LABEL;
  const head = s.join('.');
  const e = ymdParts(end);
  // 終了が無い・同じ日・開始より前（逆さまの行）は1日として扱う
  if (!e || e.join('.') <= head) return head;
  return e[0] === s[0] ? `${head}-${e[1]}.${e[2]}` : `${head}-${e.join('.')}`;
}

/**
 * 案件フォルダの名前（頭の `【社内】`/`【社外】` を除いた部分）。**唯一の組み立て場所。**
 * 番号は発番済みなら管理番号、未発番なら案件コード。
 *
 * ⚠️ `box-lost-cleanup.service.ts` の `expectedFolderNames` もこれを使う。
 * 写すと、片方だけ形を変えた日に失注の片づけがこの形の名前を見分けられなくなる。
 */
export function buildProjectFolderName(p: ProjectFolderNaming): string {
  const idCode = String(p.gls_number || p.code || '').trim();
  const parts = [formatFolderDate(p.event_start, p.event_end), idCode, String(p.name ?? '').trim()];
  return sanitizeFolderName(parts.filter((v) => v !== '').join('_'));
}

/**
 * BOX のファイル/フォルダ名で使えない文字を除去 (`/ \ : ? * | " < >`)
 *
 * **`box-lost-cleanup.service.ts` が読みます** — 失注の片づけは
 * 「このアプリならこう名付けたはず」を組み立てて BOX の実物と突き合わせるので、
 * **同じ関数で正規化しないと一致しません**（写すと片方だけ直した日にずれる）。
 */
export function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\:?*|"<>]/g, '').trim() || 'untitled';
}

/*
 * フォルダ名の頭に付与して社内/社外を一目で判別できるようにする。
 *
 * **`box-lost-cleanup.service.ts` が安全弁として読みます** — 失注の片づけで
 * 触ってよいのは「このアプリが作った形の名前」だけなので、写さずここから借ります
 * （写すと、片方だけ言い換えた日に**他人のフォルダを消せる**ようになる）。
 */
export const INTERNAL_PREFIX = '【社内】';
export const EXTERNAL_PREFIX = '【社外】';

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
 * @param project 名前の材料（`buildProjectFolderName`）
 * @returns 内部・外部それぞれの作成結果 (片方失敗・親未設定でも他方を進める)
 */
export async function createProjectFolderTree(
  project: ProjectFolderNaming,
): Promise<CreatedProjectFolderPair> {
  const baseName = buildProjectFolderName(project);
  if (!isBoxConfigured()) {
    console.log('[box-folder] BOX not configured — skipping folder creation for', baseName);
    return { internal: null, external: null };
  }

  const client = getBoxClient();
  if (!client) return { internal: null, external: null };

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
      ? createOneFolderTree(client, internalParent, `${INTERNAL_PREFIX}${baseName}`, INTERNAL_SUBFOLDERS, '社内限り')
      : Promise.resolve(null),
    externalParent
      ? createOneFolderTree(client, externalParent, `${EXTERNAL_PREFIX}${baseName}`, EXTERNAL_SUBFOLDERS, '社外共有可')
      : Promise.resolve(null),
  ]);

  return { internal, external };
}

/**
 * 案件のフォルダ配下から、名前でサブフォルダを探す。無ければ作る。
 *
 * **実体は `shared/services/box.ts` に移しました** — 案件の写真だけでなく
 * 財務の帳票（見積書・請求書・検収書）も同じことをするようになり、
 * `shared` から `contexts` を読む形にはできないためです。
 * ここは既存の呼び出し元（`projects.routes.ts`）のための入口として残しています。
 */
export { ensureSubfolder } from '../../../shared/services/box';
