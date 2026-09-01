/**
 * GPM の請求タブ — 帳票の発行（見積書・請求書・検収書・請求書 Excel）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段2）。
 *
 * ここは **state を1つも閉じ込めておらず、フックでもありません**（引数だけで完結する
 * ただの関数）。だから**呼び出しの順序に一切影響しない**＝分割の中で最も安全な塊です。
 */
import api from '@/lib/api';
import { issueDocPdf, type DocKind } from '@/lib/docPdf';

/**
 * 帳票を発行する（v4 で共通部品に寄せた）。
 *
 * 元はここに blob の受け取りとファイル名の取り出しが直に書いてあり、
 * 失敗すると `alert('PDF生成に失敗しました')` だけが出ていました
 * （権限が無いのか BOX が落ちているのか押した人には分からない）。
 * いまは `lib/docPdf.ts` が1つだけ持ち、**BOX に入ったかどうかも出します**。
 */
export const handleDownloadPdf = (revenueId: string, type: DocKind) =>
  issueDocPdf(`/revenues/${revenueId}/pdf`, type, { type });

// 請求書 Excel (業務推進への監査提出用・BOX格納フォーマット) をダウンロード
export const handleDownloadExcel = async (revenueId: string) => {
  try {
    const res = await api.get(`/revenues/${revenueId}/excel`, { responseType: 'blob' });
    const blob = new Blob([res.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const disposition = res.headers['content-disposition'] || '';
    const match = disposition.match(/filename\*=UTF-8''(.+)/);
    a.download = match ? decodeURIComponent(match[1]) : 'invoice.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert('Excel生成に失敗しました');
  }
};
