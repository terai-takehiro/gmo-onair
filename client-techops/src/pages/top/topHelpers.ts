// 制作技術支援トップ（/techops/top）— 一覧の組み立てに使う純粋関数。
// ProductionTopPage.tsx から分離（1ファイルが大きくなりすぎるのを防ぐ・check-file-size）。
//
// ── いつやるのかを1か所で決める（2026-09-08 のご指示）──────────────────
//
// この一覧は「番組・イベントを選ぶ入口」なので、**並びも表示も本番日（イベント・
// 放送が行われる日）を軸にする**。以前は日付を画面に一切出しておらず、
// 日付を持つものだけが暗黙に前へ来て、日付の無いものが末尾に溜まっていた
// （何がいつなのか・なぜその順なのかが画面から読めなかった）。
//
//   - `topItemSchedule()` … その項目の「いつ」を1つに決める（唯一の判断）
//   - `sortMainList()` …… その日付の昇順＝**放送順**。日程未定は最後
//   - `isArchived()` …… 終わったものを畳む
//
// 出す・出さないの絞り込み（工事・構築のプロジェクト＝旧 GLS-B・`GMO-` 系列と
// 失注を外す）は**サーバー側**（`server/src/contexts/qsheet/routes/top.routes.ts`）。
import { todayStr } from '@/lib/dateFmt';
import type { TopItem } from '@/lib/topApi';
import type { RecentTopEntry } from '@/lib/recentTop';

export type Segment = 'all' | 'gls' | 'own';
export type TopView = 'active' | 'archive';

/** 案件のステージのうち「本番はもう終わっている」もの（実施済＝財務処理中／完了） */
const FINISHED_STAGES = ['r_delivered', 's_completed'];

/**
 * その項目の「いつ」。**画面も並びもアーカイブ判定も、必ずここを通す。**
 *
 *   - `next`  … これから（きょう以降でいちばん近い本番・収録の日）
 *   - `ongoing` … 始まっているが最終日がまだ先（複数日のイベント。`event_start` は
 *                 過ぎたが `event_end` が残っている形）。**「開始日が無く終了日だけ未来」は
 *                 ここに入らない** — サーバーがその終了日を `next_date` に入れる
 *                 （始まった証拠が無いものを「開催中」と呼ばないため・Codex P2・PR #646）
 *   - `done`  … 最後の回が過ぎた
 *   - `none`  … 日付を1つも持たない（実施日未定）
 */
export type TopItemSchedule =
  | { kind: 'next'; date: string }
  | { kind: 'ongoing'; date: string }
  | { kind: 'done'; date: string }
  | { kind: 'none' };

export function topItemSchedule(item: TopItem, today: string = todayStr()): TopItemSchedule {
  // `next_date` はサーバーが「きょう以降でいちばん近い日」だけを入れている
  if (item.next_date) return { kind: 'next', date: item.next_date };
  if (item.last_date) {
    return item.last_date >= today
      ? { kind: 'ongoing', date: item.last_date }
      : { kind: 'done', date: item.last_date };
  }
  return { kind: 'none' };
}

/**
 * 終わった項目（アーカイブへ畳む）。
 *
 * ⚠️ **日付が1つも無いものはステージで判断する。** 以前は `last_date` が無いものを
 * 「終了しない扱い」にしていたため、実施日を入れないまま完了した案件が本体の一覧に
 * 永久に残っていた（ご指摘の「もう日付が過ぎているものも残っている」の一因）。
 * 日付が無いだけで**まだ動いている**案件（受注前・実施日調整中）は残す。
 */
export function isArchived(item: TopItem, today: string = todayStr()): boolean {
  const schedule = topItemSchedule(item, today);
  if (schedule.kind === 'next' || schedule.kind === 'ongoing') return false;
  if (schedule.kind === 'done') return true;
  return !!item.stage && FINISHED_STAGES.includes(item.stage);
}

export function matchesSegment(item: TopItem, segment: Segment): boolean {
  if (segment === 'all') return true;
  return item.kind === segment;
}

export function matchesSearch(item: TopItem, rawQuery: string): boolean {
  const q = rawQuery.trim();
  if (!q) return true;
  return (
    item.name.includes(q) ||
    (item.gls_number ?? '').includes(q) ||
    (item.customer_name ?? '').includes(q) ||
    // 改番で退役した旧番号でも見つけられるようにする（2026年10月の事業再編・P1・§4.10）
    item.retired_numbers.some((n) => n.includes(q))
  );
}

/** GLS案件は「案件番号 ・ 得意先」、ここだけの番組は固定文言 */
export function topItemMeta(item: TopItem): string {
  if (item.kind === 'gls') {
    return item.customer_name ? `${item.gls_number ?? ''} ・ ${item.customer_name}` : (item.gls_number ?? '');
  }
  return 'ここだけの番組';
}

export function topItemHref(item: TopItem): string {
  return item.kind === 'gls' ? `/techops/projects/${item.id}` : `/techops/programs/${item.id}`;
}

export function recentEntryHref(entry: RecentTopEntry): string {
  return entry.kind === 'project' ? `/techops/projects/${entry.id}` : `/techops/programs/${entry.id}`;
}

/**
 * 本体の一覧＝**放送順**（本番日の昇順）。日程未定のものだけ最後にまとめる。
 *
 * 日付が同じときは名前で決める（サーバーの返す順＝案件番号の降順に依存すると、
 * 同じ日の2件が引くたびに入れ替わって見える）。
 */
export function sortMainList(items: TopItem[], today: string = todayStr()): TopItem[] {
  const keyOf = (item: TopItem) => {
    const schedule = topItemSchedule(item, today);
    return schedule.kind === 'none' ? null : schedule.date;
  };
  const withDate = items.filter((i) => keyOf(i) !== null);
  const withoutDate = items.filter((i) => keyOf(i) === null);
  withDate.sort((a, b) => (keyOf(a)!.localeCompare(keyOf(b)!)) || a.name.localeCompare(b.name, 'ja'));
  return [...withDate, ...withoutDate];
}

/** 「直近の本番・収録」— `next_date` 昇順で先頭 `limit` 件 */
export function upcomingItems(active: TopItem[], limit = 3): TopItem[] {
  return active
    .filter((i) => i.next_date)
    .sort((a, b) => a.next_date!.localeCompare(b.next_date!))
    .slice(0, limit);
}

/** アーカイブは「最後の回」が新しい順。日付を持たないもの（未定のまま完了）は最後 */
export function sortArchive(items: TopItem[]): TopItem[] {
  return [...items].sort((a, b) => (b.last_date ?? '').localeCompare(a.last_date ?? ''));
}

/**
 * 「最近開いた項目」に出してよい履歴だけを残す。
 *
 * ⚠️ **履歴は端末の `localStorage`（`recentTop.ts`）で、この一覧とは別の入れ物**なので、
 * サーバー側で外した案件（工事・構築のプロジェクト＝旧 GLS-B・`GMO-` 系列、失注）が
 * **前に開かれていれば、ここにだけ残り続けます**（直接URLで開いても足されます）。
 * それでは一覧から外した意味が無いので、**この一覧に居るものだけ**を通します
 * （Codex レビュー P2・PR #646）。
 *
 * **`localStorage` からは消しません** — 分類の付け間違いが直れば、また出てよい項目です
 * （消すと直したあとも戻りません）。出す・出さないは毎回ここで決めます。
 */
export function eligibleRecents(entries: RecentTopEntry[], items: TopItem[]): RecentTopEntry[] {
  // 履歴の `project`/`program` と一覧の `gls`/`own` は同じものの別名
  const alive = new Set(items.map((i) => `${i.kind === 'gls' ? 'project' : 'program'}-${i.id}`));
  return entries.filter((e) => alive.has(`${e.kind}-${e.id}`));
}
