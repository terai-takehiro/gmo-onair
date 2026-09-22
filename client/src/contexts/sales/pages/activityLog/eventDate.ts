/**
 * 案件の「実施日」の書き方 (v4・営業活動記録の作り直し)
 *
 * ── なぜ1か所に決めるか ────────────────────────────────────
 *
 * 営業担当がこの画面で最初に探すのは**案件名の次に実施日**です（本番がいつかで
 * やることの重さが変わる）。ところが実施日は
 * `project_dates`（案件を作ったときに入れた日）と
 * `projects.event_start` / `event_end`（予約から引き直される日）の**2か所**にあり、
 * 素直に書くと画面ごとに違う日が出ます
 * （`projectDetail/tabs.ts` の `projectPhase` が同じ材料を見ているので考え方を合わせた）。
 *
 * ── 書き方（契約。この3通りしか無い）────────────────────────
 *
 *   実施日が1日     … `10/24（金）`
 *   実施日が複数日  … `10/24 ほか2日`（曜日は付けない。ほかの日数 = 総日数 - 1）
 *   未定            … `実施日 未定`
 *
 * **複数日に曜日を付けないのは意図です。** 先頭の日の曜日だけ出すと
 * 「その曜日の1日だけ」と読めてしまい、3日間の本番を1日と取り違えます。
 */

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 実施日の表記を作る。
 *
 * @param eventStart いちばん早い実施日（`YYYY-MM-DD`）。サーバーの `event_start`
 * @param dayCount   実施日の総数。`0`・未指定は「未定」
 */
export function eventDateLabel(
  eventStart: string | null | undefined,
  dayCount: number | null | undefined,
): string {
  if (!eventStart) return '実施日 未定';
  const d = new Date(`${eventStart}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '実施日 未定';
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  // 総数が来ていない（古い口・実施日を持たない返り）ときは 1 日として扱う。
  // ここで「未定」に倒すと、日付があるのに「未定」と出て嘘になる
  const n = dayCount == null ? 1 : dayCount;
  if (n <= 1) return `${md}（${WEEKDAYS[d.getDay()]}）`;
  return `${md} ほか${n - 1}日`;
}

/**
 * 実施日の総数を数える（**重複を除く**）。
 *
 * サーバーが `event_day_count` を返すのでふだんは使いませんが、手元に日付の
 * 配列しか無い場所（時系列の行・案件詳細）でも**同じ数え方**にするために置いてある。
 * `projectPhase` と同じく**両端だけ**を足す — 期間で埋めると飛び日
 * （10/01 と 10/07 だけ本番）の中日まで実施日になる。
 */
export function countEventDays(p: {
  dates?: { date: string | null }[] | null;
  event_start?: string | null;
  event_end?: string | null;
}): number {
  const all = [
    ...(p.dates ?? []).map((d) => d.date),
    p.event_start,
    p.event_end,
  ].filter((d): d is string => !!d);
  return new Set(all).size;
}

/** いちばん早い実施日。無ければ `null`（`eventDateLabel` の第1引数にそのまま渡せる） */
export function firstEventDate(p: {
  dates?: { date: string | null }[] | null;
  event_start?: string | null;
  event_end?: string | null;
}): string | null {
  const all = [
    ...(p.dates ?? []).map((d) => d.date),
    p.event_start,
    p.event_end,
  ].filter((d): d is string => !!d);
  if (all.length === 0) return null;
  return all.reduce((min, d) => (d < min ? d : min));
}
