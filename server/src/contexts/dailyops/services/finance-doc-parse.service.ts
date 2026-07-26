/**
 * 請求書・見積書 PDF の下読み
 *
 * **AI の代わりではない**。落とした PDF から「金額・支払期日・送付者・件名」が
 * 素直に読めるものだけを拾ってフォームに埋め、**人が確認してから登録**する
 * (精算PDF取込と同じ 3 ステップ)。読めなかった項目は空で返す。
 *
 * 読めなかったことを**エラーにしない**のが要点。原本は付いているので、
 * 人が見て埋めれば業務は進む。
 */

export interface ParsedFinanceDoc {
  doc_type: 'quote' | 'invoice' | 'order';
  sender: string | null;
  subject: string | null;
  amount: number | null;
  payment_due: string | null;
  closing_month: string | null;
  gls_number: string | null;
  /** 人に確認してほしいこと (画面にそのまま出す) */
  warnings: string[];
}

const num = (s: string): number | null => {
  const n = Number(s.replace(/[,，\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** 全角数字・全角記号を半角に寄せる (PDF から出るテキストは混在する) */
function normalize(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，]/g, ',')
    .replace(/[￥]/g, '¥')
    .replace(/\u3000/g, ' '); // 全角スペース
}

function toDate(y: string, m: string, d: string): string | null {
  const yy = Number(y); const mm = Number(m); const dd = Number(d);
  if (!yy || !mm || !dd || mm > 12 || dd > 31) return null;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** 「2026年8月31日」「2026/8/31」「2026-08-31」を YYYY-MM-DD に */
function findDateNear(text: string, labels: string[]): string | null {
  for (const label of labels) {
    // ラベルの後ろ 40 文字までを見る (表組みで少し離れることがある)
    const re = new RegExp(`${label}[^\\d]{0,40}(\\d{4})[年/\\-.](\\d{1,2})[月/\\-.](\\d{1,2})`, 'u');
    const m = text.match(re);
    if (m) { const d = toDate(m[1], m[2], m[3]); if (d) return d; }
  }
  return null;
}

export function parseFinanceDocText(rawText: string, fileName?: string): ParsedFinanceDoc {
  const text = normalize(rawText);
  const warnings: string[] = [];

  // 種別。ファイル名と本文の両方を見る (本文が優先)
  const hay = `${text.slice(0, 2000)} ${fileName ?? ''}`;
  const doc_type: ParsedFinanceDoc['doc_type'] =
    /注\s*文\s*書|発\s*注\s*書|order/i.test(hay) ? 'order'
    : /見\s*積\s*書|御見積|quotation|estimate/i.test(hay) ? 'quote'
    : 'invoice';

  // 金額。「ご請求金額」「合計」「お支払金額」の近くにある数字を優先し、
  // 見つからなければ本文中で最大の金額を取る (請求書は合計が最大になることが多い)
  let amount: number | null = null;
  for (const label of ['ご請求金額', '御請求金額', '請求金額', 'お支払金額', '合計金額', '合計', '総額', '税込金額']) {
    const m = text.match(new RegExp(`${label}[^\\d¥]{0,20}¥?\\s*([\\d,]{3,})`, 'u'));
    if (m) { amount = num(m[1]); if (amount) break; }
  }
  if (!amount) {
    const all = [...text.matchAll(/¥\s*([\d,]{4,})|([\d,]{5,})\s*円/g)]
      .map((m) => num(m[1] ?? m[2] ?? '')).filter((n): n is number => n !== null);
    if (all.length > 0) {
      amount = Math.max(...all);
      warnings.push('金額の見出しが読めなかったため、本文で一番大きい数字を入れています。必ず原本と見比べてください。');
    }
  }
  if (!amount) warnings.push('金額が読み取れませんでした。原本を見て入れてください。');

  const payment_due = findDateNear(text, ['お支払期限', '支払期限', 'お支払期日', '支払期日', '振込期限', '入金期限']);
  if (!payment_due) warnings.push('支払期日が読み取れませんでした。');

  // 送付者。「株式会社◯◯」「◯◯株式会社」の最初の出現 (請求元は先頭付近に出る)
  let sender: string | null = null;
  const co = text.slice(0, 1500).match(/(株式会社[^\s\n、。「」()（）]{1,20}|[^\s\n、。「」()（）]{1,20}株式会社|[^\s\n、。「」()（）]{1,20}(?:合同会社|有限会社))/u);
  if (co) sender = co[1].trim();

  // 件名。ファイル名から拡張子を落としたもののほうが読めることが多い
  const subject = fileName ? fileName.replace(/\.[a-z0-9]+$/i, '') : null;

  // 計上月。発行日 / 請求日 から YYYY-MM
  const issued = findDateNear(text, ['発行日', '請求日', '請求年月日', '作成日']);
  const closing_month = issued ? issued.slice(0, 7) : null;

  // GLS 番号 (新旧どちらの形も)
  const gls = text.match(/GLS-[A-Z]\d+|GLS\d+/);

  return {
    doc_type, sender, subject, amount, payment_due, closing_month,
    gls_number: gls ? gls[0] : null,
    warnings,
  };
}
