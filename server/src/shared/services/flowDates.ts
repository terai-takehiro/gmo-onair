/**
 * 工程の期限を出す（標準工程テンプレート）
 *
 * ── 実施日からの逆算 ────────────────────────────────────────
 *
 * モックの工程は「**実施日 -60日**」「受付から 3日」の2種類で数えます。
 * 日付の足し算は**画面を見ても間違いに気づけない**ので、ここに切り出して
 * `shared/tests/flowDates.test.ts` で固定しています。
 *
 * ── 実施日が決まっていない案件がある ────────────────────────
 *
 * 引き合いの段階では実施日が未定です。そのとき「実施日 -60日」は**出せません**。
 * 適当な日を入れると、期限の一覧が嘘の日付で埋まります。
 * **`null` を返し、画面は「実施日が決まったら入ります」と出します。**
 */

export type FlowAnchor = 'intake' | 'event';

export interface FlowTaskSpec {
  anchor: FlowAnchor;
  /** 符号つき。実施日の 60 日前 = -60 */
  offset_days: number;
}

function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** `YYYY-MM-DD` に日数を足す。**うるう年も月末もカレンダーに任せる** */
export function addDays(date: string, days: number): string | null {
  const p = parseYmd(date);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  const z = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${z(t.getUTCMonth() + 1)}-${z(t.getUTCDate())}`;
}

/**
 * 工程1本の期限。
 *
 * @param intakeDate 受付日（案件をつくった日）。`YYYY-MM-DD`
 * @param eventDate  実施日。**未定なら null**
 * @returns 出せないときは `null`（推測の日付を作らない）
 */
export function dueOf(
  task: FlowTaskSpec,
  intakeDate: string | null,
  eventDate: string | null,
): string | null {
  if (task.anchor === 'intake') return intakeDate ? addDays(intakeDate, task.offset_days) : null;
  return eventDate ? addDays(eventDate, task.offset_days) : null;
}

/** 「実施日 -60日」「受付から 3日」「実施日 当日」の読める文 */
export function describeOffset(task: FlowTaskSpec): string {
  const { anchor, offset_days: d } = task;
  if (anchor === 'intake') return d === 0 ? '受付の当日' : `受付から ${d} 日`;
  if (d === 0) return '実施日 当日';
  return d < 0 ? `実施日 ${d} 日` : `実施日 +${d} 日`;
}

/**
 * 期限の早い順に並べ替える鍵。
 *
 * **期限が出せないものを先頭に持ってこない。** 実施日が決まっていない案件では
 * ほとんどの工程が `null` になり、先頭に集まると一覧が読めません。
 * 出せないものは最後に、テンプレートの並び順で置きます。
 */
export function sortKey(due: string | null): string {
  return due ?? '9999-99-99';
}
