/**
 * 財務ダッシュボードの集計期間の正規化（① 財務ダッシュボード）。
 *
 * ⚠️ **月が空のまま `${month}-01` を組み立てないこと。**
 * `<input type="month">` はブラウザの「クリア」で簡単に空になる。以前はそれを
 * そのまま繋いで `-01` / `-31` という日付をサーバーへ送っており、
 * `monthly-summary` の正規表現に弾かれて **400 →「損益を読み込めませんでした」**
 * になっていた（ユーザー報告「特定の案件を絞り込み かつ 期間絞り込みを解除すると
 * エラーが表示される」の正体）。しかも呼び出し側の `enabled: !!period.from` は
 * `'-01'` を truthy と見るので、ガードとしても効いていなかった。
 *
 * ここは `valid: false` を返すことで**読み込みに行かせない**のが仕事。
 * 期間を外して見たいときは `mode: 'all'`（全期間）を使う。
 */
import { formatMonth } from '@/lib/format';
import type { PeriodMode } from './PeriodBar';

export interface PeriodInput {
  mode: PeriodMode;
  month: string;      // YYYY-MM
  year: number;
  quarter: number;    // 1..4
  rangeFrom: string;  // YYYY-MM
  rangeTo: string;    // YYYY-MM
}

export interface Period {
  /** YYYY-MM-DD。全期間・未入力のときは空文字 */
  from: string;
  /** YYYY-MM-DD。全期間・未入力のときは空文字 */
  to: string;
  /** 期間で絞らない */
  all: boolean;
  /** 集計に行ってよいか。**false のときは1本も API を叩かない** */
  valid: boolean;
  label: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isYm = (v: string) => /^\d{4}-\d{2}$/.test(v);

/**
 * `YYYY-MM` の月末日（`YYYY-MM-DD`）。
 * 以前は一律 `-31` を組み立てていて（`2026-04-31` など**存在しない日付**）、
 * 台帳の URL にそのまま出ていた。列が文字列比較なので結果は同じだったが、
 * 日付として読む側（`<input type="date">`・Excel）に渡すと壊れるので実在の日にする。
 */
const endOfMonth = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  // 月は 1 始まり・日 0 は「前の月の末日」なので、翌月の 0 日 = この月の末日
  return `${ym}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

export function resolvePeriod({ mode, month, year, quarter, rangeFrom, rangeTo }: PeriodInput): Period {
  if (mode === 'all') return { from: '', to: '', all: true, valid: true, label: '全期間' };

  if (mode === 'quarter') {
    const sm = (quarter - 1) * 3 + 1;
    const em = sm + 2;
    return {
      from: `${year}-${pad2(sm)}-01`, to: endOfMonth(`${year}-${pad2(em)}`),
      all: false, valid: true, label: `${year}年 ${quarter}Q（${sm}〜${em}月）`,
    };
  }

  if (mode === 'year') {
    return { from: `${year}-01-01`, to: `${year}-12-31`, all: false, valid: true, label: `${year}年（1〜12月 合算）` };
  }

  if (mode === 'range') {
    if (!isYm(rangeFrom) || !isYm(rangeTo)) {
      return { from: '', to: '', all: false, valid: false, label: '開始月と終了月を入れてください' };
    }
    // 逆に入れられても入れ替えて受ける（**エラーにするほどのことではない**）
    const [f, t] = rangeFrom <= rangeTo ? [rangeFrom, rangeTo] : [rangeTo, rangeFrom];
    return { from: `${f}-01`, to: endOfMonth(t), all: false, valid: true, label: `${formatMonth(f)} から ${formatMonth(t)}` };
  }

  if (!isYm(month)) return { from: '', to: '', all: false, valid: false, label: '月を入れてください' };
  return { from: `${month}-01`, to: endOfMonth(month), all: false, valid: true, label: formatMonth(month) };
}

/**
 * `monthly-summary` へ渡す期間パラメータ。**空文字は送らない**
 * （台帳の一覧 `list-query.ts` の `if (rf)` と同じ作法に揃える）。
 * 全期間のときだけ `all=1` を明示する — サーバーは壊れた日付を黙って全期間に
 * 読み替えたりしない（`monthly-summary.service.ts` のコメント参照）。
 */
export function summaryPeriodParams(period: Period): Record<string, string> {
  const p: Record<string, string> = {};
  if (period.all) p.all = '1';
  else if (period.from) { p.from = period.from; p.to = period.to; }
  return p;
}

/** 台帳系 API（`/revenues` `/purchases` `/sga`）の期間パラメータ。全期間なら条件ごと省く */
export function ledgerPeriodParams(period: Period): Record<string, string> {
  const p: Record<string, string> = {};
  if (!period.all && period.from) { p.recognition_from = period.from; p.recognition_to = period.to; }
  return p;
}

/**
 * 「台帳をひらく」導線が引き継ぐクエリパラメータ（仕様変更 #4）。
 *
 * **台帳側の API パラメータ名（`recognition_from`/`recognition_to`）をそのまま URL の
 * クエリキーにも使う。** 台帳ページ（`RevenueListPage` 等）は受け取った値を
 * 読み替えずにそのまま `/revenues` 等へ渡すだけで済み、キー名の対応表を
 * 別に持たずに済む（`ledgerPeriodParams` と1つの実装を共有）。
 *
 * 案件で絞り込んでいるときは `project_id`／`project_name` も足す。
 *
 * ⚠️ **全期間**（`period.all`）のときは `period_all=1` を足す。台帳 API へ渡す
 * 条件は無い（`ledgerPeriodParams` は空）が、**URL には意思として残す**必要がある
 * — 何も付けないと台帳は既定の「今月」で開き、全期間の集計から飛んだのに今月ぶん
 * しか出ず、ダッシュボードで見ていた金額と合わない。`period_all` は URL だけの鍵で、
 * 台帳 API には送らない（受け取り側は `ledger/ledgerUrlPeriod.ts`）。
 */
export function ledgerOpenQuery(period: Period, projectId?: string, projectName?: string): string {
  const params: Record<string, string> = ledgerPeriodParams(period);
  if (period.all) params.period_all = '1';
  if (Object.keys(params).length > 0) params.period_label = period.label;
  if (projectId) params.project_id = projectId;
  if (projectName) params.project_name = projectName;
  const qs = new URLSearchParams(params).toString();
  return qs ? `?${qs}` : '';
}
