/**
 * 受付の左「届いたもの」(v4 ②)
 *
 * 古いものが先頭。**待たせている時間**を必ず1行目に出します
 * (件数だけ見ていると、1件が3日待っていることに気づけない)。
 *
 * PC は3列のいちばん左に置きっぱなし、スマホでは**このリストだけ**を出し、
 * 押したら作業台に切り替えます (`InboxPage` 側で出し分け)。
 */
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { KINDS, titleOf, subtitleOf, type InboxItem } from './kinds';

/** 受信からの経過。**4時間で色を変える** — 半日放置に気づける最小の粒度 */
export function elapsedHours(receivedAt: string | null): number | null {
  if (!receivedAt) return null;
  const t = new Date(receivedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

export function formatElapsed(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}分`;
  if (hours < 24) return `${Math.round(hours)}時間`;
  return `${Math.floor(hours / 24)}日`;
}

/**
 * 待たせている時間。**トップページ（まだ v4 にしていない）も使う**ので
 * ここから出している。同じ「4時間で色を変える」判断を2か所に置かないため。
 */
export function ElapsedChip({ receivedAt, forceRed }: { receivedAt: string | null; forceRed?: boolean }) {
  const h = elapsedHours(receivedAt);
  const tone =
    forceRed || (h !== null && h >= 24) ? 'text-destructive'
      : h !== null && h >= 4 ? 'text-warning'
        : 'text-muted-foreground';
  return <span className={cn('font-number text-sub-sm', tone)}>{formatElapsed(h)}</span>;
}

export function InboxList({
  items, selectedKey, onSelect,
}: {
  items: InboxItem[];
  selectedKey: string | null;
  onSelect: (item: InboxItem) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="待たせているものはありません"
        description="受付は空です。この状態を保ちましょう。"
      />
    );
  }
  return (
    <div className="flex flex-col">
      {items.map((item) => {
        const k = KINDS[item.kind];
        const on = item.key === selectedKey;
        return (
          <Row
            key={item.key}
            divider
            interactive
            align="start"
            onClick={() => onSelect(item)}
            // 選んでいる行は**面で示す**。左に線を引くと行の頭がずれて縦が揃わなくなる
            className={cn(on && 'bg-accent')}
          >
            <RowMain>
              <div className="flex items-center gap-2">
                <TableBadge label={k.label} w={96} className={k.tone} />
                <ElapsedChip receivedAt={item.received_at} forceRed={item.kind === 'overdue_action'} />
              </div>
              <RowTitle className="mt-1">{titleOf(item)}</RowTitle>
              <RowSub>{subtitleOf(item)}</RowSub>
            </RowMain>
            <RowSlot w={56} align="right" hideOnMobile>
              {on ? <span className="text-sub-sm font-bold text-primary">確認中</span> : null}
            </RowSlot>
          </Row>
        );
      })}
    </div>
  );
}
