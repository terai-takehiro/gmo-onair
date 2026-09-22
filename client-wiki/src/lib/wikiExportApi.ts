/**
 * `.md` と zip の受け渡し（段D・設計 `docs/design/v4/wiki.md` §5-2 の約束3）
 *
 * 約束3 の「.md の口は3つ」のうち、**画面から使う2つ**がここです
 * （3つめの MCP は段E）。
 *
 *   GET  /wiki/pages/:id.md   ページ1枚を `text/markdown` で（先頭に YAML の見出し）
 *   GET  /wiki/export?space=  スペースまるごとを zip で
 *   POST /wiki/import         zip を取り込む（editor）
 *
 * ⚠️ **組み立てはサーバーに任せます。** 段B の間は `.md` をクライアントで組んで
 *    いましたが、同じ書式を2か所に持つと必ず片方が古くなります
 *    （`client-wiki/CLAUDE.md`「同じ口を2つのファイルに持たない」）。
 *    YAML の見出しの正は `shared/src/wiki/frontMatter.ts` で、サーバーの
 *    `wiki-md.service.ts` がそれを使って組みます。
 *
 * ⚠️ **`{ success, data }` の包みが無い返りがあります。** `.md` と zip は
 *    中身そのもの（`text/markdown` / `application/zip`）です。包みを外すのは
 *    取り込み（`POST /wiki/import`）だけです。
 */
import api from './api';

export const WIKI_TRANSFER_URL = {
  /** ページ1枚の `.md`。**`:id.md` は `:id` より先に登録されています**（サーバーの `index.ts`） */
  pageMd: (id: string) => `/wiki/pages/${id}.md`,
  /** スペースまるごとの zip（`?space=<key>`） */
  export: '/wiki/export',
  /** zip の取り込み（`multipart/form-data`・項目名は `file`） */
  import: '/wiki/import',
} as const;

/** 取り込みの zip の上限（サーバーの `WIKI_IMPORT_MAX_BYTES` と同じ） */
export const WIKI_IMPORT_MAX_BYTES = 50 * 1024 * 1024;

/** `POST /wiki/import` の返り（サーバーの `WikiImportResult` と同じ） */
export interface WikiImportResult {
  space_key: string;
  /** 作ったページ（データベースと行を含む） */
  pages: number;
  databases: number;
  rows: number;
  files: number;
}

/* ── 保存するときの名前 ───────────────────────────────────── */

/** ファイル名に使えない文字を落とす（Windows・macOS の両方で開けるように） */
export function safeFileName(title: string, fallback: string, ext: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${cleaned || fallback}${ext}`;
}

/**
 * サーバーが付けた名前（`Content-Disposition`）を読む。
 *
 * ⚠️ **題は日本語なので `filename*=UTF-8''…`（RFC 5987）で来ます。**
 * 素の `filename=` しか見ないと、`.md` が毎回 id の名前で保存されます。
 */
export function fileNameFromDisposition(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const star = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      // 壊れた並びのときは呼ぶ側の名前を使う
    }
  }
  const plain = value.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1] : null;
}

/**
 * 受け取った中身を端末に保存する。
 *
 * ⚠️ `URL.createObjectURL` で作った URL は**必ず捨てる**。捨てないと、
 * 書き出すたびにその中身がタブの寿命だけ残ります。
 */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * 中身を blob で受けているときの失敗は、`err.response.data` が **Blob**（中身は JSON）
 * なので、そのままだとサーバーの日本語が読めません（`notifyApiError` が
 * `data.error.message` を見るため）。読んで普通の `Error` に戻します。
 */
async function unpackBlobError(err: unknown): Promise<unknown> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return err;
  try {
    const body = JSON.parse(await data.text()) as { error?: { message?: string }; message?: string };
    const message = body.error?.message ?? body.message;
    if (message) return new Error(message);
  } catch {
    // 読めないときは元の失敗のまま出す（少なくとも「失敗した」ことは伝わる）
  }
  return err;
}

/* ── 書き出し ─────────────────────────────────────────────── */

/** ページ1枚を `.md` で保存する（ページの「…」の「.md で書き出す」） */
export async function downloadPageAsMarkdown(page: { id: string; title: string }): Promise<void> {
  try {
    const res = await api.get<Blob>(WIKI_TRANSFER_URL.pageMd(page.id), { responseType: 'blob' });
    const name = fileNameFromDisposition(res.headers['content-disposition'])
      ?? safeFileName(page.title, page.id, '.md');
    saveBlob(res.data, name);
  } catch (err) {
    throw await unpackBlobError(err);
  }
}

/** スペースまるごとを zip で保存する（`/wiki/transfer`） */
export async function downloadSpaceZip(spaceKey: string, spaceName: string): Promise<void> {
  try {
    const res = await api.get<Blob>(WIKI_TRANSFER_URL.export, {
      responseType: 'blob',
      params: { space: spaceKey },
    });
    const name = fileNameFromDisposition(res.headers['content-disposition'])
      ?? safeFileName(spaceName, spaceKey, '.zip');
    saveBlob(res.data, name);
  } catch (err) {
    throw await unpackBlobError(err);
  }
}

/* ── 取り込み ─────────────────────────────────────────────── */

export interface WikiImportInput {
  /** 取り込み先のスペース（URL に出る短い英数字） */
  space: string;
  /** 取り込んだページの状態。既定は公開（サーバーと同じ） */
  status?: 'draft' | 'published';
}

/**
 * zip を取り込む。**元に戻せません**（呼ぶ前に必ず確認を取ってください）。
 *
 * ⚠️ `Content-Type` を手で書きません。`FormData` を渡すと境界の印つきで
 * ブラウザが付けます（手で書くと境界が付かず、サーバーが中身を読めません）。
 */
export async function importWikiZip(file: File, input: WikiImportInput): Promise<WikiImportResult> {
  const form = new FormData();
  // 先に行き先、あとから中身（受け取る側が読む順と同じにしておく）
  form.append('space', input.space);
  if (input.status) form.append('status', input.status);
  form.append('file', file);
  const res = await api.post<{ success: boolean; data: WikiImportResult }>(
    WIKI_TRANSFER_URL.import,
    form,
  );
  return res.data.data;
}
