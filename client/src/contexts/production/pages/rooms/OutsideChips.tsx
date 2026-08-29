/**
 * ② 部屋の空き — 表示窓（8:00〜22:00）の外にだけある予約の印
 *
 * この画面は**横の余白＝空き**なので、窓の外の予約を無表示で捨てると
 * **深夜帯が埋まっている部屋が終日空きに見えます**（22:00〜翌2:00 の生放送が
 * 画面のどこにも出ていなかった — 監査 B-1）。週表（`calendar/TimeGrid.tsx`）が
 * 持っている「↑8時前 N件 / ↓22時後 N件」と同じものを部屋の行にも置きます。
 *
 * 押すと先頭の1件の詳細を開き、**全部の時刻と題名はツールチップ**（`title`）に出す。
 * 帯と違って時間の幅を持てないので、置く位置は左端（8時前）と右端（22時後）
 * ＝ その予約がある側の端です。
 */
import { DAY_START_H, DAY_END_H, type AvailLane } from './availability';

const line = (o: { timeLabel: string; title: string }) => `${o.timeLabel} ${o.title}`;

export function OutsideChips({ lane, onOpen }: {
  lane: Pick<AvailLane, 'before' | 'after'>;
  onOpen: (id: string) => void;
}) {
  const cls = 'text-badge rounded-badge absolute top-1/2 z-[2] -translate-y-1/2 border border-border-faint bg-surface-subtle px-1 text-muted-foreground';
  return (
    <>
      {lane.before.length > 0 && (
        <button
          type="button"
          onClick={() => onOpen(lane.before[0].id)}
          title={lane.before.map(line).join('\n')}
          className={`${cls} left-0`}
        >
          ↑{DAY_START_H}時前 {lane.before.length}件
        </button>
      )}
      {lane.after.length > 0 && (
        <button
          type="button"
          onClick={() => onOpen(lane.after[0].id)}
          title={lane.after.map(line).join('\n')}
          className={`${cls} right-0`}
        >
          ↓{DAY_END_H}時後 {lane.after.length}件
        </button>
      )}
    </>
  );
}
