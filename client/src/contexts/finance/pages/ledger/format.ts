/**
 * 台帳（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費）の値の書き方 (v4)
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * 計上月・税区分の出し方は `LedgerRows.tsx`（PC の表）の中に閉じていました。
 * スマホのカード（`LedgerCards.tsx`）と詳細シートが同じ値を出すので、
 * **写すと必ず片方だけ直されます**（旧実装が「売上だけ `26/07`・仕入は
 * `2026-07`」だったのと同じ事故）。関数を1か所に置いて両方が読みます。
 */
import { TaxCategoryLabels } from '@/types';

/** `2026-07-01` → `26/07`。**計上「月」なので日は出さない**（日があると入金日と読み違える） */
export function monthOf(date: string | null | undefined): string {
  if (!date || date.length < 7) return '—';
  return `${date.slice(2, 4)}/${date.slice(5, 7)}`;
}

/** `2026-07-01` → `2026/07`。詳細シートのように横幅がある場所で使う（年を落とさない） */
export function monthFull(date: string | null | undefined): string {
  if (!date || date.length < 7) return '—';
  return `${date.slice(0, 4)}/${date.slice(5, 7)}`;
}

/** 税区分は2文字に畳む。PC の列が 56px なので「10%課税」は入らない */
export function taxShort(tax: string): string {
  const label = TaxCategoryLabels[tax as keyof typeof TaxCategoryLabels] ?? tax;
  return label.replace(/課税|税率/g, '').replace(/\s/g, '') || label;
}

/** 税区分の正式な呼び名。**詳細シートでは畳まない**（税率を読み違えると請求額が変わる） */
export function taxLabel(tax: string): string {
  return TaxCategoryLabels[tax as keyof typeof TaxCategoryLabels] ?? tax;
}

/**
 * 日付を `2026/07/31` にする。**台帳の詳細シートは日付の桁をそろえて読む**ので、
 * `toLocaleDateString()` のような環境依存の書き方は使わない
 * （`purchases.service_completed_date` だけ DATE 型で `...T00:00:00.000Z` が来るため、
 *  先頭10文字だけを見る形にしてある）。
 */
export function ymd(date: string | null | undefined): string {
  if (!date) return '—';
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : String(date);
}
