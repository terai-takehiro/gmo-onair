/**
 * 受領書類 — 見積書→発注書→請求書の「ひとつづり」と、販管費の支払サイト（migration 280）
 *
 * ── なぜ画面の外に出すか ────────────────────────────────────
 *
 * ここで決めているのは**業務そのもののルール**です。
 *
 *  ・束のいまの段（見積だけ／発注まで／請求が来た）をどう読むか
 *  ・見積が3通あるとき「生きているのはどれか」
 *  ・「月末締め 翌月末払い」を日数で表したときの支払期日
 *
 * どれも月末・うるう年・改定の重なりで外しやすく、画面を開いて確かめられません。
 * 純粋な関数にして `shared/tests/financeDocChain.test.ts` で固定します。
 * **サーバーと画面が同じ関数を呼びます** — 写すと、画面が出す期日と
 * 台帳に入る期日が違う日になります。
 *
 * ⚠️ **`Date` の現地時刻を使わない**（`inboxDesk.ts` と同じ理由）。
 * `new Date('2026-08-31')` は UTC の真夜中として読まれるので、
 * 日本時間の午前中に1日ずれます。日付は文字列のまま数え、
 * 日数の足し算だけ `Date.UTC` を使います。
 */

/** 書類の種類。DB の `finance_docs.doc_type` と同じ語 */
export const DOC_TYPES = ['quote', 'order', 'invoice'] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** 束のいまの段。**「請求が来た」が終わりではない**（台帳に入れて終わり） */
export type ChainStage = 'quote_only' | 'ordered' | 'invoiced' | 'empty';

export const CHAIN_STAGE_LABEL: Record<ChainStage, string> = {
  empty: '書類なし',
  quote_only: '見積書のみ',
  ordered: '発注済み',
  invoiced: '請求書あり',
};

/** 束に入っている書類のうち、ここで見るぶんだけ */
export interface ChainDoc {
  doc_type: string;
  /** 受信日 `YYYY-MM-DD`。無ければ並び順は `revision` → 登録順で決める */
  received_at?: string | null;
  /** 見積の改定回数（1 始まり）。無ければ 1 とみなす */
  revision?: number | null;
  amount?: number | null;
  status?: string | null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 束のいまの段。
 *
 * **請求書があれば `invoiced`。** 見積を取り直している最中に請求書が来ることも
 * あるので、「見積が一番新しいから見積の段」とは読みません
 * （払う期日があるほうが急ぐ）。
 * **却下した書類は数えません** — 間違って取り込んだ1通で段が進むと、
 * 「発注済み」に見えるのに何も発注していない束ができます。
 */
export function chainStage(docs: readonly ChainDoc[]): ChainStage {
  const live = docs.filter((d) => d.status !== 'rejected');
  if (live.some((d) => d.doc_type === 'invoice')) return 'invoiced';
  if (live.some((d) => d.doc_type === 'order')) return 'ordered';
  if (live.some((d) => d.doc_type === 'quote')) return 'quote_only';
  return 'empty';
}

/**
 * 生きている見積（＝一番新しい改定）。
 *
 * 見積は**改定されるたびに新しい PDF が届く**ので、束に3通並びます。
 * 金額を見るときに古い版を拾うと、**発注していない金額で仕入が立ちます**。
 *
 * 並べ方は `revision` の大きいほう → 同じなら受信日の遅いほう。
 * どちらも無ければ**配列の後ろのほう**（一覧は受信順で来る）。
 */
export function latestQuote<T extends ChainDoc>(docs: readonly T[]): T | null {
  const quotes = docs.filter((d) => d.doc_type === 'quote' && d.status !== 'rejected');
  if (quotes.length === 0) return null;
  return quotes.reduce((best, d) => {
    const a = d.revision ?? 1;
    const b = best.revision ?? 1;
    if (a !== b) return a > b ? d : best;
    const da = d.received_at ?? '';
    const db = best.received_at ?? '';
    if (da !== db) return da > db ? d : best;
    return d; // 同点は後ろを採る
  });
}

/**
 * 束の「払う金額」。**請求書があればそれ、無ければ生きている見積**。
 *
 * 請求書が複数ある（分割請求）ときは**足します** — 1通目だけ見て払うと
 * 残りが落ちます。見積は足しません（改定なので重複します）。
 */
export function chainAmount(docs: readonly ChainDoc[]): number | null {
  const live = docs.filter((d) => d.status !== 'rejected');
  const invoices = live.filter((d) => d.doc_type === 'invoice' && typeof d.amount === 'number');
  if (invoices.length > 0) return invoices.reduce((s, d) => s + (d.amount as number), 0);
  const q = latestQuote(live);
  return typeof q?.amount === 'number' ? q.amount : null;
}

/** `YYYY-MM-DD` に日数を足す（UTC で数えるので現地時刻でずれない） */
export function addDaysIso(iso: string, days: number): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** その月の末日 `YYYY-MM-DD`（うるう年を含む） */
export function endOfMonthIso(month: string): string {
  const m = MONTH.exec(month);
  if (!m) return month;
  const last = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${pad(last)}`;
}

/** その月の初日 `YYYY-MM-DD`。台帳の「計上月」はこの形で持つ */
export function startOfMonthIso(month: string): string {
  const m = MONTH.exec(month);
  return m ? `${m[1]}-${m[2]}-01` : month;
}

/**
 * 販管費の支払期日を、**処理月（締月）と支払サイト（日数）から**作る。
 *
 * 実務は「月末締め ◯日サイト」で決まっており、**書類に期日が書いていないことのほうが
 * 多い**ので、書いていないぶんをここで埋めます。
 *
 *   2026-08 / 0日   → 2026-08-31（当月末払い）
 *   2026-08 / 30日  → 2026-09-30
 *   2026-08 / 60日  → 2026-10-30
 *
 * ⚠️ **「翌月末払い」を 30日サイトと同じにしない。** 締めた月の末日から
 * 30日を足すと 9/30 になり、たまたま合う月と1日ずれる月ができます
 * （2月締めの 30日サイトは 3/30 で、翌月末＝3/31 ではない）。
 * 翌月末で運用するなら `paymentDueFromMonths(month, 1)` を使ってください。
 */
export function paymentDueFromTerms(processingMonth: string, termsDays: number): string | null {
  if (!MONTH.test(processingMonth)) return null;
  if (!Number.isFinite(termsDays) || termsDays < 0 || termsDays > 365) return null;
  return addDaysIso(endOfMonthIso(processingMonth), Math.trunc(termsDays));
}

/** 「◯か月後の月末払い」。翌月末なら `months = 1` */
export function paymentDueFromMonths(processingMonth: string, months: number): string | null {
  const m = MONTH.exec(processingMonth);
  if (!m) return null;
  if (!Number.isFinite(months) || months < 0 || months > 12) return null;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Math.trunc(months);
  return endOfMonthIso(`${Math.floor(total / 12)}-${pad((total % 12) + 1)}`);
}

/** 受信日から処理月を推す。**書類に締月が無いときの当て推量**なので、人が直せること */
export function guessProcessingMonth(receivedAt: string | null | undefined): string | null {
  const m = receivedAt ? ISO.exec(receivedAt) : null;
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * 束を台帳（仕入・販管費）に渡せるか。
 *
 * **見積書だけの束は渡せません** — 実際に払うのは請求書・注文書が来てからです
 * （`doc-handoff.service.ts` が同じことを境界でも止めます）。
 * 「見積を取ったが発注しなかった」束はここで止まったまま残るのが正しく、
 * **消さずに残す**ことで「あの見積どうなった」を後から引けます。
 */
export function canHandoffChain(docs: readonly ChainDoc[]): boolean {
  return chainStage(docs) === 'ordered' || chainStage(docs) === 'invoiced';
}
