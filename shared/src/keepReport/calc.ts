/**
 * 定例報告パックの計算列 — **画面・pptx・Slack が使う純粋関数**（DB も HTTP も触らない）
 *
 * ── 数字の約束（types.ts の頭注と同じ）──────────────────────────
 * - 判定・比率・差は**サーバーが計算して**パックに入れる。画面や pptx で計算し直さない
 *   （8/13 の資料で、手計算の写し間違いがそのまま会議に出た）。ここにあるのは**同じ式の写し**で、
 *   画面が「いま入れた予算ならこうなる」と案内するときや、営業日を数えるときに使う
 * - 金額は円のまま持つ。千円に丸めるのは表示の直前（`toThousandYen`）
 *
 * ── サーバーとの写し ────────────────────────────────────────────
 * サーバーは `shared/` を import できない（`server/tsconfig.json` の `rootDir`）。
 * 比率・判定の正は `server/src/contexts/sales/services/keep-report-rules.ts`（`ratioOf` / `varianceOf`）、
 * 残り（確度の文字・営業日・稼働率・新規/更新の印・日付の見出し）は
 * `server/src/contexts/dailyops/services/keep-pack-calc.ts`。
 * **同じ答えを出すことは `shared/tests/keepReportCalc.test.ts` が両方を import して固定する。**
 * 片方だけ直すと、画面の案内とパックの数字が食い違う（型検査にも lint にも出ない）。
 */
import type { BudgetLine, ConfidenceLetter, Judge } from './types';

export type JudgeKind = BudgetLine['kind'];

/** 小数1桁に丸める。`-0` は 0 にする（`Object.is` の比較・表示で符号だけ残らないように） */
const round1 = (n: number): number => {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
};

/**
 * 対目標比（%・小数1桁）。docs/design/v4/keep-report.md §5.3。
 *
 * - 目標 > 0 … 実績 ÷ 目標 × 100
 * - 目標 < 0（赤字の目標）… 100 − (目標 − 実績) ÷ |目標| × 100 — **9/4 の資料の式に揃える**
 *   （60.0% = 1 − 11,380 ÷ 28,454）。素直に割ると −39,834 ÷ −28,454 = 140% になり、
 *   目標より悪いのに「達成」に見える
 * - 目標が無い・0 … null（割れない。判定は diff で付く）
 */
export function varianceRatio(budget: number | null | undefined, actual: number): number | null {
  if (budget == null || budget === 0 || !Number.isFinite(budget) || !Number.isFinite(actual)) return null;
  const raw = budget < 0
    ? 100 - ((budget - actual) / Math.abs(budget)) * 100
    : (actual / budget) * 100;
  return round1(raw);
}

/**
 * 判定。売上・利益系（higher_better）は 実績 ≧ 目標 → ○、費用系（lower_better）は 実績 ≦ 目標 → ○、
 * 目標が無ければ "-"。
 */
export function judge(kind: JudgeKind, budget: number | null | undefined, actual: number): Judge {
  if (budget == null) return '-';
  if (kind === 'higher_better') return actual >= budget ? '○' : '✕';
  return actual <= budget ? '○' : '✕';
}

/**
 * 円 → 千円（表示の直前だけ）。
 * 丸め方は `toMan`（`shared/src/client/ui/numbers.tsx`）と同じ「絶対値で丸めて符号を戻す」。
 * `Math.round` を負の数にそのまま掛けると −1,500 円が −1 千円になり、正の 1,500 円（2 千円）と
 * 丸め方が変わる。`-0` は 0 にする（−400 円が「−0」と出ない）。
 */
export function toThousandYen(n: number): number {
  const r = Math.sign(n) * Math.round(Math.abs(n) / 1000);
  return r === 0 ? 0 : r;
}

/**
 * 資料の確度の文字。ONAiR のステージから引く。
 * a_won / r_delivered / s_completed → A、b_verbal → B、c_proposal → C、d_hold → D、neta・その他 → E。
 */
export function confidenceOf(stage: string | null | undefined): ConfidenceLetter {
  switch (stage) {
    case 'a_won': case 'r_delivered': case 's_completed': return 'A';
    case 'b_verbal': return 'B';
    case 'c_proposal': return 'C';
    case 'd_hold': return 'D';
    default: return 'E';
  }
}

/** 確度の語（資料の案件ページに出す文字）。v4.5.25 の受注確度の語彙と同じ並び */
export const CONFIDENCE_LABELS: Record<ConfidenceLetter, string> = {
  A: '受注済',
  B: '正式申込待',
  C: '提案済',
  D: '要件確認',
  E: '問い合わせ',
};

/** ヨミ表の並び（確度の高い順） */
export const CONFIDENCE_ORDER: readonly ConfidenceLetter[] = ['A', 'B', 'C', 'D', 'E'];

/** 稼働率（%・小数1桁）= 利用があった日数 ÷ 営業日数 × 100。営業日が 0 なら null */
export function utilizationRate(activeDays: number, businessDays: number): number | null {
  if (!(businessDays > 0)) return null;
  return round1((activeDays / businessDays) * 100);
}

// ── 日付（`YYYY-MM-DD` の文字列だけで計算する。時差に依存しない）────────

const YM_RE = /^(\d{4})-(\d{2})$/;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** その月の日を `YYYY-MM-DD` で全部返す。形が違えば空 */
export function listMonthDays(yearMonth: string): string[] {
  const m = YM_RE.exec(yearMonth);
  if (!m) return [];
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return [];
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${yearMonth}-${pad2(i + 1)}`);
}

/** 曜日（0 = 日 … 6 = 土）。`YYYY-MM-DD` の先頭 10 桁だけを見る */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** `YYYY-MM` に月を足す（負も可） */
export function addMonths(yearMonth: string, n: number): string {
  const m = YM_RE.exec(yearMonth);
  if (!m) return yearMonth;
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + n;
  const y = Math.floor(total / 12);
  const mo = (total % 12 + 12) % 12 + 1;
  return `${y}-${pad2(mo)}`;
}

/** `YYYY-MM-DD` に日を足す（負も可） */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/**
 * 営業日数 = 平日 − 祝日（土曜は設定で足せる。日曜と祝日は常に除く）。
 * 祝日かどうかは **呼ぶ側が渡す**（画面は `@holiday-jp/holiday_jp`、サーバーは `holidays.ts`）—
 * ここで祝日表を持たないので、テストが暦に依存せずに固定できる。
 */
export function businessDaysInMonth(
  yearMonth: string,
  opts: { countSaturday?: boolean; isHoliday: (date: string) => boolean },
): number {
  let n = 0;
  for (const day of listMonthDays(yearMonth)) {
    const w = weekdayOf(day);
    if (w === 0) continue;
    if (w === 6 && !opts.countSaturday) continue;
    if (opts.isHoliday(day)) continue;
    n += 1;
  }
  return n;
}

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** `2026/10/3（土）`。`withYear: false` で `10/3（土）` */
export function dateLabel(date: string | null | undefined, opts: { withYear?: boolean } = {}): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return '';
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const md = `${m}/${d}（${WEEKDAY_JA[weekdayOf(date)]}）`;
  return opts.withYear === false ? md : `${y}/${md}`;
}

/** `2026/10/3（土）〜10/4（日）`。終了が無い・同じ日なら開始だけ */
export function dateRangeLabel(start: string | null | undefined, end: string | null | undefined): string {
  const s = dateLabel(start);
  if (!s) return '';
  if (!end || end.slice(0, 10) === (start ?? '').slice(0, 10)) return s;
  const sameYear = start!.slice(0, 4) === end.slice(0, 4);
  return `${s}〜${dateLabel(end, { withYear: !sameYear })}`;
}

/** Date か ISO 文字列を `YYYY-MM-DD` にする（Date はその環境のローカル日付） */
export function toDateOnly(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/**
 * ヨミ表の「新規」「更新」の印。前回の会議日**以降**に作られたら new、動いたら updated。
 * 会議日当日を含める（前回のパックは会議より前に凍結されるので、当日の動きはまだ載っていない）。
 * 前回の会議日が分からなければ null。
 */
export function pipelineSinceLast(
  createdAt: string | Date | null | undefined,
  updatedAt: string | Date | null | undefined,
  previousMeetingDate: string | null | undefined,
): 'new' | 'updated' | null {
  if (!previousMeetingDate) return null;
  const created = toDateOnly(createdAt);
  if (created && created >= previousMeetingDate) return 'new';
  const updated = toDateOnly(updatedAt);
  if (updated && updated >= previousMeetingDate) return 'updated';
  return null;
}
