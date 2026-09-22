/**
 * 次のアクションの「期限の4区分」 (v4・営業活動記録の作り直し)
 *
 * ── なぜ画面から切り出すか ──────────────────────────────────
 *
 * この区分は**サーバー（`GET /activity-logs/by-project` の `due`）と画面の両方**が
 * 持ちます。片方だけ直すと「チップに 3 と出ているのに開くと 2 件」という、
 * **誰も再現手順を書けない食い違い**になります。そこで
 *
 *   ・区分の定義を1か所（この関数）に置く
 *   ・画面を立てずに試験で固定する（`shared/tests/activityDueState.test.ts`）
 *
 * の2つで守ります。サーバー側の定義（`activity-log.service.ts`）を変えるときは
 * **この試験も一緒に直す**のが決めです。
 *
 * ── 区分（契約。サーバーと一字一句同じ）──────────────────────
 *
 *   overdue … next_action_date < 本日
 *   today   … next_action_date が 本日 または 本日+1（画面の名前は「本日・明日」）
 *   week    … next_action_date が 本日+2 〜 本日+7（画面の名前は「今週」）
 *   none    … next_action_date が未設定（next_action はある）
 *   later   … 本日+8 以降。**どの絞り込みチップにも入りません**
 *
 * ⚠️ `later` を「今週」に混ぜないこと。混ぜると「今週やること」に来月の予定が並び、
 * 数字が信用されなくなります（チップを持たないだけで、「すべて」には出ます）。
 *
 * ── 日付はローカルで比べる ──────────────────────────────────
 *
 * `YYYY-MM-DD` の文字列比較で済ませます（`Date` に起こして `toISOString()` で
 * 戻すと、JST の 0:00〜9:00 が前日になって**朝いちばんに期限超過が出遅れます**）。
 */
import { localDateStr, addDaysToDateStr } from '@gmo-onair/shared/src/client/format';

export type DueState = 'overdue' | 'today' | 'week' | 'later' | 'none';

/** 絞り込みに使える区分（`later` は入らない）。URL・API の `due` と同じ綴り */
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

/** 本日（`YYYY-MM-DD`）。試験から固定の日を渡せるように引数にしてある */
export function todayStr(): string {
  return localDateStr(new Date());
}

/**
 * 期限の区分を返す。
 *
 * @param nextActionDate `activity_logs.next_action_date`（未設定は `null`）
 * @param today          本日（`YYYY-MM-DD`）。**必ず呼ぶ側が渡す** —
 *                       モジュール定数にすると、画面を開いたまま日付をまたいだときに
 *                       前日の基準で色が付き続ける
 */
export function dueStateOf(nextActionDate: string | null | undefined, today: string): DueState {
  if (!nextActionDate) return 'none';
  if (nextActionDate < today) return 'overdue';
  if (nextActionDate <= addDaysToDateStr(today, 1)) return 'today';
  if (nextActionDate <= addDaysToDateStr(today, 7)) return 'week';
  return 'later';
}

/** その期限が絞り込み `due` に入るか（`all` は `later` も含めて全部通す） */
export function matchesDue(nextActionDate: string | null | undefined, due: DueFilter, today: string): boolean {
  if (due === 'all') return true;
  return dueStateOf(nextActionDate, today) === due;
}

/**
 * 期限超過の日数。**本日は 0 日**（超過ではないので、呼ぶ側は `overdue` の行にだけ使う）。
 * 月をまたぐ引き算になるので `Date` に起こして 86,400,000 で割る
 * （どちらもその日の 0:00 なので夏時間の無い JST では割り切れる）。
 */
export function overdueDays(nextActionDate: string, today: string): number {
  const a = new Date(`${nextActionDate}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * 期限の文字を**2つに分ける**（`docs/wording.md` ルール8・9）。
 *
 * ✕「9/18 を4日すぎ」「あと3日」 → ○「9/18（4日超過）」「9/18（残り3日）」
 * 利用者から「過ぎてますとかそういう表現やめろ」と明示のご指摘があった箇所なので、
 * **和語・口語・比喩は使わない**（「期限超過」「残り」「期限未設定」で統一する）。
 *
 * 日付と注記を**分けて返す**のは、列（128px）の中で日付を1行目・注記を2行目に
 * 置くためです。1つの文字列にすると列からあふれて省略され、
 * **いちばん読ませたい「4日超過」が消えます**。
 */
export function duePartsOf(
  nextActionDate: string | null | undefined,
  today: string,
): { date: string; note: string; state: DueState } {
  const state = dueStateOf(nextActionDate, today);
  if (!nextActionDate) return { date: '期限未設定', note: '', state };
  const [, m, d] = nextActionDate.split('-');
  const date = `${Number(m)}/${Number(d)}`;
  if (state === 'overdue') return { date, note: `${overdueDays(nextActionDate, today)}日超過`, state };
  if (nextActionDate === today) return { date, note: '本日', state };
  if (nextActionDate === addDaysToDateStr(today, 1)) return { date, note: '明日', state };
  return { date, note: `残り${overdueDays(today, nextActionDate)}日`, state };
}

/** 1つの文にまとめた期限（読み上げ・スマホの1行・`title` 属性で使う） */
export function dueLabel(nextActionDate: string | null | undefined, today: string): string {
  const { date, note } = duePartsOf(nextActionDate, today);
  return note ? `${date}（${note}）` : date;
}

/** 画面に出す区分の名前（チップ・案件の状態の両方が読む。2か所に書かない） */
export const DUE_LABEL: Record<DueFilter, string> = {
  all: 'すべて',
  overdue: '期限超過',
  today: '本日・明日',
  week: '今週',
  none: '期限未設定',
};

/** チップの並び。**「すべて」を先頭に置く** — 絞り込みを外す道が無いと戻れない */
export const DUE_FILTERS: DueFilter[] = ['all', 'overdue', 'today', 'week', 'none'];
