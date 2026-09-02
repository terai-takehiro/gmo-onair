/**
 * 財務ダッシュボードから台帳へ引き継ぐ「期間」を、画面の絞り込み UI に変換する
 * （③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通） (v4)
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * ダッシュボードの「台帳をひらく」は期間を `recognition_from`／`recognition_to`
 * （＋`period_label`）で渡す。台帳はそれを**そのままサーバーへ流すだけ**で、
 * 画面の「計上月」の欄には何も入れていなかった。結果、月で絞ってから台帳へ来ると
 * **絞れてはいるのに計上月の欄が空**で、いま何が効いているのか画面から読めない
 * （ユーザー報告「計上月の部分に表示がされていない」）。
 *
 * ── 月と期間は排他にする（ここがいちばん大事）─────────────────
 *
 * ⚠️ サーバーは `recognition_month`（`LIKE 'YYYY-MM-%'`）と
 * `recognition_from`／`recognition_to`（`>=` ／ `<=`）を **AND で合成する**
 * （`server/src/contexts/finance/list-query.ts`）。両方を掛けたまま利用者が月を
 * 変えると「4月から6月 かつ 5月」の交差になり、0件になった理由が画面から読めない。
 * だから**どちらか一方しか持たない**形にしてある（`setMonth` は期間を落とす）。
 *
 * 引き継いだ期間が**ちょうど1つの月**（月初〜実在の月末）なら計上月の欄に入れ、
 * from/to のほうは落とす。`recognition_date` は TEXT の `YYYY-MM-DD` なので
 * `LIKE '2026-04-%'` と `>= '2026-04-01' AND <= '2026-04-30'` は**同じ集合**を指す。
 * ＝ 見え方だけが直り、**絞り込みの結果は1件も変わらない**。
 *
 * 1つの月に収まらないとき（四半期・年・期間指定）は `<input type="month">` に
 * 入れようが無いので、月の欄は空のままにして期間として持ち続ける。
 * 「開始月だけ月の欄に入れる」案は採らない — 4月と表示しながら4月から6月の行が
 * 出ることになり、嘘の月を出すほうが分かりにくい。
 *
 * **React に繋ぐフックは `useLedgerUrlPeriod.ts`。** ここを純関数だけに保つのは、
 * `shared/tests/financeDashboardPeriod.test.ts` から React 抜きで固定できるようにするため。
 */
/** 月に収まらない引き継ぎ期間（四半期・年・期間指定） */
import { formatMonth } from '@/lib/format';

export interface LedgerPeriodRange {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  /** 「2026年 2Q（4から6月）」など。URL に無ければ空 */
  label: string;
}

/**
 * ダッシュボードから引き継いだ絞り込みが、**今もそのまま効いているか**。
 * 利用者が月を触った時点で null にする（触った後も「財務ダッシュボードから」と
 * 出し続けると、画面の表示と実際の絞り込みの出どころが食い違う）。
 */
export interface LedgerPeriodHandoff {
  kind: 'month' | 'range' | 'all';
  label: string;
}

export interface LedgerUrlPeriod {
  /** 計上月の欄に入れる値（`YYYY-MM`）。空なら月では絞らない */
  month: string;
  /** 月に収まらない期間。null なら期間では絞らない */
  range: LedgerPeriodRange | null;
  handoff: LedgerPeriodHandoff | null;
}

export interface LedgerUrlPeriodState extends LedgerUrlPeriod {
  /** 計上月を変える。**期間は必ず落とす**（AND で二重に効かせない） */
  setMonth: (value: string) => void;
  /** 引き継いだ期間を外す（月も付けない＝全月） */
  clearPeriod: () => void;
}

/** 今月（`YYYY-MM`）。台帳の既定 */
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * `from` と `to` がちょうど1つの月（月初〜**実在の**月末）に収まるなら `YYYY-MM`、
 * 違えば空文字。`2026-04-01` から `2026-04-29` のような半端な範囲を月の欄に
 * 入れてしまうと、表示（4月）と絞り込み（4/1-4/29）が食い違うので弾く。
 */
export function singleMonthOf(from: string, to: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return '';
  const ym = from.slice(0, 7);
  if (to.slice(0, 7) !== ym || from.slice(8) !== '01') return '';
  const [y, m] = ym.split('-').map(Number);
  if (!(m >= 1 && m <= 12)) return '';
  // 月は1始まり・日0は「前の月の末日」なので、翌月の0日＝この月の末日
  // （`financeDashboard/period.ts` の `endOfMonth` と同じ数え方にそろえる）
  const last = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0');
  return to.slice(8) === last ? ym : '';
}

/**
 * URL のクエリ（`recognition_from`／`recognition_to`／`period_label`／`period_all`）を
 * 台帳の絞り込みの初期値にする。**純関数**（テストは
 * `shared/tests/financeDashboardPeriod.test.ts`）。
 *
 * @param hasProject 案件で絞り込んで来たか。案件の中を見ているときは月で絞らない
 *                   （その案件の売上・仕入を今月ぶんだけ見せても意味が無い）
 */
export function ledgerPeriodFromUrl(
  from: string,
  to: string,
  label: string,
  all: boolean,
  hasProject: boolean,
): LedgerUrlPeriod {
  const ym = singleMonthOf(from, to);
  /*
   * ⚠️ **`label` が無いときに `ym`（`2026-04`）を素で出さない。**
   * ダッシュボードの「台帳をひらく」は必ず `period_label` を付けるが、
   * URL を手で書いた人・古いブックマークには付いていない。そのとき帯に
   * 「2026-04 で絞り込み中」と機械の形が出ていた。画面のほかの場所は
   * すべて `formatMonth`（`2026年04月`）で揃っているので、ここも揃える。
   */
  if (ym) return { month: ym, range: null, handoff: { kind: 'month', label: label || formatMonth(ym) } };
  if (from) return { month: '', range: { from, to, label }, handoff: { kind: 'range', label } };
  // 全期間で見ていたのに台帳が黙って今月になると、ダッシュボードの金額と合わない
  if (all) return { month: '', range: null, handoff: { kind: 'all', label: label || '全期間' } };
  if (hasProject) return { month: '', range: null, handoff: null };
  return { month: thisMonth(), range: null, handoff: null };
}
