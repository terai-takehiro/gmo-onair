/**
 * 問い合わせの一覧 — ストックの再確認日の計算（migration 247）
 *
 * ── なぜ画面の外に出すか ────────────────────────────────────
 *
 * 「ストックしたものをいつ机に戻すか」は**この画面の要件そのもの**で、
 * かつ日付の境目（今日・月末・うるう年）を画面を開いて確かめることが
 * できません。純粋な関数にして `shared/tests/inboxDesk.test.ts` で固定します。
 *
 * ⚠️ **`Date` の現地時刻を使わない。** `new Date('2026-08-31')` は UTC の
 * 真夜中として読まれるので、日本時間の午前中に1日ずれます。
 * ここは全部 `YYYY-MM-DD` の文字列のまま数えます
 * （日数の差だけ `Date.UTC` を使う — どちらも UTC なのでずれません）。
 *
 * ── 「決めていない」を「永久に出さない」と読まない ──────────
 *
 * `stock_review_on` が空のストックも**期限が来たもの**として扱います。
 * 空を「まだ出さない」にすると、migration 247 を入れる前と同じ
 * 行き止まり（ストック＝見送り）に戻ります。
 */

/** ストックしたときに既定で提案する見直しまでの月数 */
export const STOCK_REVIEW_DEFAULT_MONTHS = 1;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** その月の日数（うるう年を含む） */
function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `YYYY-MM-DD` に月を足す。**月末は詰める**（1/31 + 1か月 = 2/28）。
 * 詰めないと 2/31 のような日付ができ、DB に入れた瞬間に弾かれます。
 */
export function addMonthsIso(iso: string, months: number): string {
  const m = ISO.exec(iso);
  if (!m) return iso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const total = (y * 12 + (mo - 1)) + months;
  const ny = Math.floor(total / 12);
  const nmo = (total % 12) + 1;
  return `${ny}-${pad(nmo)}-${pad(Math.min(d, daysInMonth(ny, nmo)))}`;
}

/** 「ストックする」を押したときに最初に入っている見直しの日（今日の1か月後） */
export function defaultStockReviewOn(today: string): string {
  return addMonthsIso(today, STOCK_REVIEW_DEFAULT_MONTHS);
}

/**
 * 見直しの日が来ているか。**未仕分けと同じ扱いで机に出す**もの。
 *
 * - 空（まだ決めていない）→ **来ている扱い**。決めるために机へ出す
 * - 今日ちょうど → 来ている（その日のうちに見るため）
 *
 * サーバー側は SQL で同じ条件を書きます
 * （`stock_review_on IS NULL OR stock_review_on <= CURRENT_DATE`）。
 */
export function isStockReviewDue(reviewOn: string | null | undefined, today: string): boolean {
  if (!reviewOn) return true;
  return reviewOn <= today;
}

/** `to` - `from` の日数。どちらも `YYYY-MM-DD` */
export function daysBetweenIso(from: string, to: string): number {
  const a = ISO.exec(from);
  const b = ISO.exec(to);
  if (!a || !b) return 0;
  const ms = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]))
    - Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

export type StockReviewTone = 'due' | 'soon' | 'later' | 'undecided';

export interface StockReviewNote {
  tone: StockReviewTone;
  /** 画面に出す短い文。**日数で書く**（「そろそろ」と書かない・docs/wording.md ④） */
  text: string;
  /** 今日から見直しの日までの日数。過ぎていれば負。決めていなければ null */
  days: number | null;
}

/**
 * ストックの行に出す一言。
 *
 * **色だけに頼らない**（文字でも同じことを言う）。期限を越えたものは
 * 「◯日超過」まで書きます — 「見直し 7/1」だけだと、
 * それが過去か未来かを読む人が毎回引き算することになります。
 */
export function stockReviewNote(reviewOn: string | null | undefined, today: string): StockReviewNote {
  if (!reviewOn) return { tone: 'undecided', text: '見直し日が未設定です', days: null };
  const days = daysBetweenIso(today, reviewOn);
  if (days < 0) return { tone: 'due', text: `見直し ${jaMd(reviewOn)}（${-days}日超過）`, days };
  if (days === 0) return { tone: 'due', text: '本日が見直し日です', days };
  // 残りは「残りN日」（`docs/wording.md` ルール8・9。✕「あとN日」は口語）
  if (days <= 7) return { tone: 'soon', text: `見直し ${jaMd(reviewOn)}（残り${days}日）`, days };
  return { tone: 'later', text: `見直し ${jaMd(reviewOn)}（残り${days}日）`, days };
}

/** `2026-09-30` → `9/30` */
export function jaMd(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${Number(m[2])}/${Number(m[3])}` : iso;
}

/**
 * 「本日対応」の内訳。**2つの数を足した1つの数だけを出さない** —
 * 未仕分けが0でも見直しが5件あるとき、「5件」とだけ出すと
 * 今日届いたものが5件あるように読めます。
 */
export function deskSummary(unsorted: number, stockDue: number): string {
  if (unsorted === 0 && stockDue === 0) return '本日対応する項目はありません';
  const parts: string[] = [];
  if (unsorted > 0) parts.push(`未処理 ${unsorted}件`);
  if (stockDue > 0) parts.push(`見直し時期 ${stockDue}件`);
  return `本日対応 ${unsorted + stockDue}件（${parts.join(' ・ ')}）`;
}
