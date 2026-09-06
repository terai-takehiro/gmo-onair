/**
 * サーバーが作ったファイル（pptx など）を手元に落とす — `client/src/lib/docPdf.ts` の小さな写し
 *
 * ── なぜ写すのか ──────────────────────────────────────────────
 *
 * 案件管理（`client/`）の `docPdf.ts` が blob の受け取り方・`Content-Disposition` からの
 * ファイル名の取り出し方・blob で返ってきたエラー本文の読み方を1か所に持っている。
 * 日常業務は別のバンドル（`@/` が別のアプリを指す）なので、その3つだけをここに置く。
 * **画面ごとに書き写さないこと** — 資料ビルダー以外でファイルを落とす画面が増えたら
 * ここを使う（食い違いの元は関数を分けることではなく、画面ごとに書き写すこと）。
 */
import type { AxiosResponse } from 'axios';

export const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** `Content-Disposition` の `filename*=UTF-8''…` からファイル名を取り出す。取れなければ既定の名前 */
export function filenameOf(res: AxiosResponse, fallback: string): string {
  const disposition = String(res.headers['content-disposition'] ?? '');
  const m = disposition.match(/filename\*=UTF-8''(.+)/);
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ''));
  } catch {
    return fallback;
  }
}

/** blob をダウンロードさせる（`<a download>` を一瞬だけ置いて押す） */
export function download(data: BlobPart, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 失敗したときのサーバーの言い分を取り出す。
 *
 * **`responseType: 'blob'` だと、エラーの本文も Blob で返ってくる** —
 * そのまま `notifyApiError` に渡すと既定の文言しか出ず、権限が無いのか
 * Box が落ちているのかが分からない。読んで JSON に戻す。
 */
export async function messageOf(err: unknown, fallback: string): Promise<string> {
  const body = (err as { response?: { data?: unknown } })?.response?.data;
  if (body instanceof Blob) {
    try {
      const parsed = JSON.parse(await body.text()) as { error?: { message?: string } };
      if (parsed?.error?.message) return parsed.error.message;
    } catch { /* JSON でなければ既定の文言 */ }
  }
  const msg = (body as { error?: { message?: string } })?.error?.message;
  return msg || fallback;
}
