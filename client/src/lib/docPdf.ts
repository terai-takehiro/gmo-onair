/**
 * 帳票（見積書・請求書・検収書）を発行する — PDF を作って BOX に入れ、手元にも落とす
 *
 * ── なぜ1か所にまとめるか ──────────────────────────────────
 *
 * 発行できる場所は4つあります（案件詳細の見積タブ・同 売上・請求ペイン・
 * ⑤ 見積・請求（全案件）・② 締め処理）。**blob の受け取り方とファイル名の
 * 取り出し方を画面ごとに書くと必ず食い違います** — 実際、v3 は
 * `BusinessProjectView` に1つだけ持っていて、そこには
 * `alert('PDF生成に失敗しました')` が残っていました（理由が出ないので、
 * 権限が無いのか BOX が落ちているのか押した人には分からない）。
 *
 * ── 「出す」＝「発行」＝「BOX に入る」（ご指示）──────────────
 *
 * 押すと ①PDF を作り ②案件の BOX フォルダに置き ③手元にダウンロードします。
 * 同じ名前は BOX の**新しい版**になるので、出し直しても行は増えません。
 *
 * ── 入らなかったことを黙らない ─────────────────────────────
 *
 * サーバーは**ダウンロードを止めません**（BOX が落ちている日に請求書を
 * 出せなくなるほうが困る）。そのかわり入ったかどうかを応答ヘッダーで返すので、
 * ここで読み取って**必ず画面に出します**。出さないと「保存されたつもり」で
 * 手元にしか無い帳票ができます。
 */
import type { AxiosResponse } from 'axios';
import api from './api';
import { notifySuccess, notifyError, notifyWarning } from '@gmo-onair/shared/src/client/notify';

export type DocKind = 'estimate' | 'invoice' | 'inspection';

export const DOC_LABEL: Record<DocKind, string> = {
  estimate: '見積書',
  invoice: '請求書',
  inspection: '検収書',
};

/**
 * 入った場所の言い方（「社内限りフォルダの『03_請求』」）は
 * **サーバーが `X-Box-Where` で渡します**（`doc-box-dest.ts` の1つの表から作る）。
 * ここに書き写すと、表を直した日から**「社外に入りました」と読んだのに
 * 社内にある**が起きます。取れなかったときだけ場所を言わずに済ませます。
 */
function whereOf(res: AxiosResponse): string {
  const raw = String(res.headers['x-box-where'] ?? '');
  if (!raw) return 'BOX';
  try { return `BOX の${decodeURIComponent(raw)}`; } catch { return 'BOX'; }
}

/**
 * 入らなかった理由。**「失敗しました」で終わらせない** —
 * 押し直せば直るのか、直らないのかが分からないと同じ操作が繰り返されます。
 */
const BOX_REASON: Record<string, string> = {
  NOT_CONFIGURED: 'この環境は BOX につないでいないので、保存はしていません。',
  NO_FOLDER: 'この案件の BOX フォルダがまだ無いので保存できませんでした（GLS を発番するとできます）。',
  NO_SUBFOLDER: 'BOX の置き場所を用意できませんでした。あとでもう一度お試しください。',
  UNAVAILABLE: 'BOX につながらなかったので保存できませんでした。あとでもう一度お試しください。',
  NO_PERMISSION: '保存する権限が無いので BOX には入れていません。',
  // ⚠️ **社外フォルダに置くのは「送った」のと同じ**なので、承認待ちの間は入れません
  NOT_APPROVED: '値引きが承認待ちなので、社外と共有するフォルダには入れていません（承認されたらもう一度出してください）。',
};

/** `Content-Disposition` からファイル名を取り出す。取れなければ既定の名前 */
function filenameOf(res: AxiosResponse, fallback: string): string {
  const disposition = String(res.headers['content-disposition'] ?? '');
  const m = disposition.match(/filename\*=UTF-8''(.+)/);
  if (!m) return fallback;
  try {
    return decodeURIComponent(m[1].trim().replace(/^"|"$/g, ''));
  } catch {
    return fallback;
  }
}

/** blob をダウンロードさせる。既定は PDF、請求書 Excel は呼び出し側で mime を渡す */
function download(data: BlobPart, filename: string, mime = 'application/pdf'): void {
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
 * **`responseType: 'blob'` だと、エラーの本文も Blob で返ってきます** —
 * そのまま `notifyApiError` に渡すと「エラーが発生しました」しか出ず、
 * 権限が無いのか案件が消えているのかが分かりません。読んで JSON に戻します。
 */
async function messageOf(err: unknown, fallback: string): Promise<string> {
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

/**
 * 帳票を発行する。
 *
 * @param path   API のパス（`/revenues/:id/pdf` / `/projects/:id/estimates/:id/pdf`）
 * @param kind   帳票の種類。画面に出す言葉と BOX の行き先を決める
 * @param params クエリ（売上からの発行では `{ type }`）
 */
export async function issueDocPdf(
  path: string,
  kind: DocKind,
  params?: Record<string, string>,
): Promise<void> {
  const label = DOC_LABEL[kind];
  try {
    const res = await api.get(path, { params, responseType: 'blob' });
    download(res.data, filenameOf(res, `${label}.pdf`));

    const stored = String(res.headers['x-box-stored'] ?? '') === '1';
    if (stored) {
      notifySuccess(`${label}を発行し、${whereOf(res)}に保存しました`);
      return;
    }
    const reason = String(res.headers['x-box-reason'] ?? '');
    notifyWarning(`${label}をダウンロードしました。${BOX_REASON[reason] ?? 'BOX には保存していません。'}`);
  } catch (err) {
    notifyError(await messageOf(err, `${label}を発行できませんでした`));
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * 請求書 Excel（業務推進への監査提出用）をダウンロードする。
 *
 * **PDF の発行（`issueDocPdf`）とは別に持つ** — `GET /revenues/:id/excel` は
 * BOX にはなにも置かない、手元に落とすだけの帳票（`server/.../revenues.routes.ts`）。
 * `X-Box-*` ヘッダーを返さないので、ここでは読みません。読んで「保存しました」と
 * 出すと、実際には保存していないのに保存したかのように伝えることになります。
 *
 * blob の受け取り方・ファイル名の取り出し方（`filenameOf`）・エラーの読み方
 * （`messageOf`）は PDF と同じ形なので使い回します（食い違いの元は関数を分けることではなく、
 * この3つを画面ごとに書き写すことだったため）。
 */
export async function downloadRevenueExcel(revenueId: string): Promise<void> {
  try {
    const res = await api.get(`/revenues/${revenueId}/excel`, { responseType: 'blob' });
    download(res.data, filenameOf(res, '請求書.xlsx'), XLSX_MIME);
    notifySuccess('請求書Excelを発行しました');
  } catch (err) {
    notifyError(await messageOf(err, '請求書Excelを発行できませんでした'));
  }
}
