/**
 * 案件・プロジェクトの BOX フォルダにファイルを置く／中を見る
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * 置く・見るの決めごと（**社内と社外を取り違えない**／**上げるほうは失敗を隠さない**／
 * **見るほうは BOX が落ちても 200 で返す**／**日本語のファイル名を latin1 から直す**）は
 * 案件（`/projects/:id/box-files`）とプロジェクト（`/gpm/projects/:id/box-files`）で
 * まったく同じです。ルートに書いたままプロジェクト側へ写すと、
 * **どちらかだけ直した日から片方が原価を外に出す**形が生まれます。
 *
 * 違うのは「どのフォルダに入れるか」だけなので、そこは呼ぶ側が決めます。
 */
import { AppError } from '../../../shared/middleware/errorHandler';
import { queryOne } from '../../../shared/db/connection';
import {
  isBoxConfigured, extractFolderId, uploadToFolder, listFolderItems, type BoxItem,
} from '../../../shared/services/box';

export type BoxScope = 'internal' | 'external';

/** multer が渡してくる形のうち、ここで使うぶんだけ */
export interface UploadFile {
  originalname: string;
  buffer: Buffer;
}

/**
 * `scope` を読む。**既定を持たせない** — 社内限り（発注・請求・原価）と
 * 社外共有（見積・図面・納品物）は**取り違えると原価が外に出ます**。
 */
export function requireScope(raw: unknown): BoxScope {
  if (raw === 'internal' || raw === 'external') return raw;
  throw new AppError(400, 'VALIDATION_ERROR', '置き場所（社内限り／社外共有）を指定してください');
}

/**
 * その案件・プロジェクトの、その `scope` のフォルダ id。
 *
 * **無いことと繋がっていないことを分けて返します** — 前者はフォルダを作れば済み、
 * 後者は環境の設定なので、押した人にできることが違います。
 */
export async function projectFolderId(
  projectId: string,
  scope: BoxScope,
  labels: { notFound?: string; noFolder?: string } = {},
): Promise<string> {
  const row = await queryOne(
    'SELECT box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as { box_url_internal: string | null; box_url_external: string | null } | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', labels.notFound ?? '案件が見つかりません');

  const id = extractFolderId(scope === 'internal' ? row.box_url_internal : row.box_url_external);
  if (!id) {
    // **何をすれば置けるようになるかは呼ぶ側が知っている**（案件は GLS 発番、
    // プロジェクトは書類タブの「フォルダを作る」）。ここで一般化した文にすると、
    // 押した人が次にどこへ行けばよいか分からない
    throw new AppError(400, 'NO_FOLDER',
      labels.noFolder ?? 'BOX フォルダがまだ作られていません。フォルダを作ってからお試しください。');
  }
  if (!isBoxConfigured()) {
    throw new AppError(503, 'NOT_CONFIGURED', 'この環境は BOX につないでいないので、置けません。');
  }
  return id;
}

/**
 * ファイルが1つも無ければ止める。
 *
 * **フォルダを探す前に呼ぶ**こと — 順番を逆にすると、ファイルを選ばずに押した人に
 * 「フォルダがありません」と出て、何をすればよいのか分からなくなります。
 */
export function requireFiles(files: UploadFile[]): UploadFile[] {
  if (files.length === 0) throw new AppError(400, 'VALIDATION_ERROR', 'ファイルを選んでください');
  return files;
}

/**
 * フォルダに置く。
 *
 * **1つずつ上げて、上がった分だけ返します。** まとめて失敗にすると
 * 「3つ中2つは入っている」ことに気づけず、同じものをもう一度上げることになります。
 * **1つも上がらなかったときだけ**失敗を投げます（上がっていないのに
 * 上がったように見えるのが一番困る）。
 */
export async function uploadFiles(
  folderId: string, files: UploadFile[],
): Promise<{ uploaded: unknown[]; failed: string[] }> {
  requireFiles(files);
  const uploaded: unknown[] = [];
  const failed: string[] = [];
  for (const f of files) {
    // multer は multipart のファイル名を latin1 で読む。日本語のファイル名が
    // 文字化けしたまま BOX に載ると、探せないうえ直せない
    const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
    try {
      uploaded.push(await uploadToFolder(folderId, name, f.buffer));
    } catch (err) {
      console.error('[box] upload failed:', name, (err as Error).message);
      failed.push(name);
    }
  }
  if (uploaded.length === 0) {
    throw new AppError(502, 'BOX_UNAVAILABLE', 'BOX に置けませんでした。あとでもう一度お試しください。');
  }
  return { uploaded, failed };
}

/**
 * 中を1階層ぶん見る。**再帰しません**（呼び出し回数が読めず画面が固まる）。
 *
 * **失敗しても投げません。** `reason` を添えて空で返すのがこのリポジトリの決めごとで
 * （`shared/services/box.ts`）、500 にすると BOX が落ちた日に詳細画面が全部開けなくなります。
 */
export async function listProjectFolder(
  projectId: string, scope: BoxScope, notFoundMessage = '案件が見つかりません',
): Promise<{ items: BoxItem[]; total: number; truncated: boolean; reason?: string }> {
  const row = await queryOne(
    'SELECT box_url_internal, box_url_external FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as { box_url_internal: string | null; box_url_external: string | null } | undefined;
  if (!row) throw new AppError(404, 'NOT_FOUND', notFoundMessage);

  const id = extractFolderId(scope === 'internal' ? row.box_url_internal : row.box_url_external);
  if (!id) return { items: [], total: 0, truncated: false, reason: 'NO_FOLDER' };
  if (!isBoxConfigured()) return { items: [], total: 0, truncated: false, reason: 'NOT_CONFIGURED' };
  try {
    // **総数と「切ったか」も返す**（レビューでの指摘 #51）。100 件で黙って
    // 切れていたので、置いた人には「上げたのに無い」としか見えなかった
    return await listFolderItems(id);
  } catch (err) {
    console.error('[box] listFolderItems failed:', (err as Error).message);
    return { items: [], total: 0, truncated: false, reason: 'UNAVAILABLE' };
  }
}
