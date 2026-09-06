/**
 * 定例報告パックの計算列 — **サーバー側の写し**（純粋関数だけ。DB も HTTP も触らない）
 *
 * ⚠️ **サーバーは `shared/`（ルートの `@gmo-onair/shared`）を import できません**
 * （`server/tsconfig.json` の `rootDir: "./src"`）。画面・pptx・Slack は
 * `shared/src/keepReport/calc.ts` を使うので、**同じ計算が2か所にあります**。
 *
 * 比率・判定は `sales/services/keep-report-rules.ts`（`ratioOf` / `varianceOf`）が正で、
 * ここには持ちません（3か所に増やさない）。ここにあるのは 確度の文字・営業日・稼働率・
 * 新規/更新の印・日付の見出し と、サーバーだけが持つ祝日表（`holidays.ts`）への橋。
 *
 * **片方だけ直すと、画面の案内とパックの数字が別の値になります。**
 * 同じであることは `shared/tests/keepReportCalc.test.ts` が両方を import して固定しています
 * （受領書類の `financeDocChainParity.test.ts` と同じ形）。
 */
import { holidaysOf } from '../../../shared/services/holidays';

export type ConfidenceLetter = 'A' | 'B' | 'C' | 'D' | 'E';

/** 小数1桁に丸める。`-0` は 0 にする */
const round1 = (n: number): number => {
  const r = Math.round(n * 10) / 10;
  return r === 0 ? 0 : r;
};

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
 * 祝日かどうかは呼ぶ側が渡す（`holidayPredicate` を使う）。
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

/**
 * サーバーの祝日表（`holidays.ts`・振替休日と国民の休日を含む）から「祝日か」を作る。
 * 年の範囲は呼ぶ側が決める（推移は 2024 年から、カレンダーは翌月まで）。
 */
export function holidayPredicate(fromYear: number, toYear: number): (date: string) => boolean {
  const set = new Set<string>();
  for (let y = fromYear; y <= toYear; y += 1) {
    for (const h of holidaysOf(y)) set.add(h.date);
  }
  return (date) => set.has(date.slice(0, 10));
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

/** 今日（サーバーのローカル日付・`YYYY-MM-DD`）。週報の `toDateStr` と同じ決め方 */
export function todayStr(now: Date = new Date()): string {
  return toDateOnly(now)!;
}
