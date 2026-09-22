/**
 * 時系列の並び — 日付の見出しで束ねる (v4・営業活動記録の作り直し)
 *
 * ── なぜ束ねるか ────────────────────────────────────────────
 *
 * 旧実装は活動日の列が行ごとに繰り返されるだけで、**同じ日のやり取りが
 * いくつあるか**が読めませんでした（日付が縦にずらりと並ぶので、目は
 * 日付の切れ目を探すのに使われます）。日付を見出しに上げると、行の側は
 * 「何を・どの案件で」に集中できます。
 *
 * ── 行そのものは `ActivityRows` をそのまま使う ──────────────
 *
 * 写すと、AI 作成の印・由来チップ・次のアクションの片づけ方が
 * 並びによって変わります。束ね方だけをここが持ち、行の描き方は1か所に残す。
 * 列見出しは束の外に1つだけ置く（`showHeader={false}`）。
 */
import { ActivityRows } from './ActivityRows';
import { shortDate, type ActivityLogRow } from './types';
import { RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import type { useNextActionActions } from './useNextActionActions';

/**
 * 活動日ごとに束ねる。**並び替えはしない** — 並び順はサーバーが決めており
 * （活動日が新しい順／次のアクション期限順）、画面で並べ直すと
 * 絞り込みとページ送りの結果が画面の中だけで変わる。
 */
export function groupByDate(rows: ActivityLogRow[]): { date: string; rows: ActivityLogRow[] }[] {
  const out: { date: string; rows: ActivityLogRow[] }[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.date === row.activity_date) last.rows.push(row);
    else out.push({ date: row.activity_date, rows: [row] });
  }
  return out;
}

export function TimelineGroups({
  rows, actions, onOpen,
}: {
  rows: ActivityLogRow[];
  actions: ReturnType<typeof useNextActionActions>;
  onOpen?: (row: ActivityLogRow) => void;
}) {
  const groups = groupByDate(rows);
  return (
    <div className="flex flex-col">
      <RowHeader className="hidden sm:flex">
        <RowSlot w={96}>活動日</RowSlot>
        <RowSlot w={72}>種別</RowSlot>
        <RowMain>件名 ・ 案件 ・ クライアント</RowMain>
        <RowSlot w={96}>担当</RowSlot>
      </RowHeader>

      {groups.map((g) => (
        <section key={g.date}>
          {/* 面は塗らず細い罫線だけ（色帯のカードは使わない） */}
          <p className="border-b border-border-faint bg-surface-subtle px-4 py-1.5 text-sub-sm text-muted-foreground">
            <span className="font-number">{shortDate(g.date)}</span> ・ {g.rows.length}件
          </p>
          <ActivityRows rows={g.rows} actions={actions} onOpen={onOpen} showHeader={false} />
        </section>
      ))}
    </div>
  );
}
