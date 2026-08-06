/**
 * 着手日を入れたときに工程がいつになるかの**下見**（④ 新規作成 ステップ3）
 *
 * ── 数え方はサーバーと同じ ──────────────────────────────────
 *
 * 正は `server/src/contexts/gpm/services/gpm.service.ts` の `expandTemplate()`:
 *
 *   ・工程の終わり = 始まり + (日数 − 1)   … 1日の工程は始まりと終わりが同じ日
 *   ・次の工程の始まり = 前の工程の終わりの翌日
 *   ・**曜日は見ない**（営業日で数えるかはまだ決めていない）
 *   ・着手日を入れていなければ日付を入れない（**推測しない**）
 *
 * ── なぜ画面でも計算するのか ────────────────────────────────
 *
 * 「保存してみないといつ終わるか分からない」形にすると、着手日を決めるために
 * 一度作って消すことになります。だから**入れた瞬間に出す**。
 *
 * 計算が2か所にあるので食い違い得ますが、**保存後に開く詳細画面は
 * サーバーが書いた日付をそのまま出す**ので、ずれていれば必ず見えます
 * （画面の値を保存に使うことはありません — 送るのは着手日とひな形の id だけ）。
 */

/** `2026-05-12` に `n` 日足す。UTC で計算するので時間帯でずれない */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface PreviewPhase {
  label: string;
  role: string | null;
  days: number;
  taskCount: number;
  start: string | null;
  end: string | null;
}

export interface PreviewSource {
  phases: { label: string; role: string | null; days: number; tasks: unknown[] }[];
}

/**
 * ひな形と着手日から工程の日程を組む。
 * 着手日が無いときは日付を `null` のまま返す（工程の並びだけ見せる）。
 */
export function previewSchedule(tpl: PreviewSource | undefined, startedOn: string): PreviewPhase[] {
  if (!tpl) return [];
  let cursor: string | null = startedOn || null;
  return tpl.phases.map((p) => {
    const days = Math.max(1, Number(p.days) || 1);
    const start: string | null = cursor;
    const end = start ? addDays(start, days - 1) : null;
    cursor = end ? addDays(end, 1) : null;
    return { label: p.label, role: p.role, days, taskCount: p.tasks.length, start, end };
  });
}

/** 完了見込み（最後の工程の終わり）。着手日が無ければ `null` */
export function previewEnd(rows: PreviewPhase[]): string | null {
  return rows.length ? rows[rows.length - 1].end : null;
}

/** 全部の工程の日数の合計（着手日を入れていなくても出せる） */
export function totalDays(rows: PreviewPhase[]): number {
  return rows.reduce((n, r) => n + r.days, 0);
}
