/**
 * ① 予定 / 一覧（モックの4枚目）
 *
 * 月をまたいで探すときと、印刷するときに使う形。列は**モックの並びそのまま**、
 * 幅だけ7段（`SlotWidth`）に寄せています:
 *
 *   日付   72px（モック 62）
 *   時間   96px（モック 96）
 *   予定   伸びる
 *   部屋   128px（モック 132）
 *   取込元 56px（モック 56）
 *   種別   72px（モック 70）
 */
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { sortForList, timeLabel, type CalEvent } from './calendarLayout';
import type { Holiday } from './useCalendarEvents';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

/** 取込元の札の色。**種別の色を流用しない**（意味が違うものに同じ色を当てると読み違える） */
const SOURCE_TONE: Record<string, string> = {
  Google: 'bg-success-surface text-success',
  Outlook: 'bg-info-surface text-info',
  ICS: 'bg-surface-subtle text-muted-foreground',
};

export function EventTable({
  events, holidays, onOpen,
}: {
  events: CalEvent[];
  holidays: Map<string, Holiday>;
  onOpen: (e: CalEvent) => void;
}) {
  const rows = sortForList(events);

  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card p-6">
        <EmptyState
          title="この期間に予定はありません"
          description="上の「出すもの」で外しているレイヤーがないか確かめてください。月を送ると別の期間を見られます。"
        />
      </div>
    );
  }

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <RowHeader className="hidden sm:flex">
        <RowSlot w={72}>日付</RowSlot>
        <RowSlot w={96}>時間</RowSlot>
        <RowMain>予定</RowMain>
        <RowSlot w={128}>部屋・担当</RowSlot>
        <RowSlot w={56} align="center">取込元</RowSlot>
        <RowSlot w={72} align="center">種別</RowSlot>
      </RowHeader>

      {rows.map((e) => {
        const day = e.start.slice(0, 10);
        const dow = new Date(`${day}T00:00:00`).getDay();
        const hol = holidays.get(day);
        const tone = dow === 0 || hol ? 'text-destructive' : dow === 6 ? 'text-info' : 'text-secondary-foreground';
        return (
          <Row key={e.key} density="table" divider interactive stackOnMobile onClick={() => onOpen(e)}>
            <RowSlot w={72}>
              <span className="flex items-center gap-1.5">
                <span className={cn('font-number text-sub font-bold', tone)}>{Number(day.slice(8))}</span>
                <span className={cn('text-sub-sm', tone)}>{DOW[dow]}</span>
              </span>
            </RowSlot>
            <RowSlot w={96}>
              <span className="font-number text-sub-sm text-secondary-foreground">{timeLabel(e)}</span>
            </RowSlot>
            <RowMain>
              <RowTitle>
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-badge-xs align-middle" style={{ backgroundColor: e.color }} />
                {e.title}
              </RowTitle>
              {e.tentative && <RowSub>仮押さえ</RowSub>}
            </RowMain>
            <RowSlot w={128}>
              <span className="text-sub-sm truncate text-muted-foreground">{e.sub || '—'}</span>
            </RowSlot>
            <RowSlot w={56} align="center">
              {e.source && (
                <span className={cn('text-badge rounded-badge-xs inline-block px-1.5 py-0.5 font-bold', SOURCE_TONE[e.source] ?? 'bg-surface-subtle text-muted-foreground')}>
                  {e.source}
                </span>
              )}
            </RowSlot>
            <RowSlot w={72} align="center">
              <span
                className="text-badge rounded-badge-xs inline-block w-full truncate px-1 py-0.5 text-center font-bold"
                style={{ backgroundColor: `${e.color}1f`, color: e.color }}
              >
                {e.typeLabel}
              </span>
            </RowSlot>
          </Row>
        );
      })}
    </div>
  );
}
