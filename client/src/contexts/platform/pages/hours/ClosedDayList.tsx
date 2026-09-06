/**
 * ⑥ 休日・営業時間 — **休業日の表**（`HoursPage` から切り出し）
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * 全社の休みと、この拠点だけの休み（`kind !== 'holiday'`）を並べる枠だけ。
 * 祝日は件数も操作も別（`HolidayList.tsx`）なので混ぜていない。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `HoursPage.tsx` が 400 行（このリポジトリの1ファイルの上限）を超えたため、
 * **画面の中の表ごと**に分けた。読み込み・保存・状態はすべて `HoursPage` に
 * 残したままで、ここは受け取ったものを描くだけ（`del` / `setDialog` は
 * 呼び出し元のものをそのまま渡してもらう）。
 * **JSX は1文字も変えずに移してある。**
 */
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { AVAILABILITY, KIND_LABEL, KIND_TONE, label, type ClosedDay, type LocationRow } from './hoursTypes';

export function ClosedDayList({
  others, site, canEdit, setDialog, del,
}: {
  /** 祝日を除いた休業日（並べ替え・絞り込みは呼び出し元が済ませている） */
  others: ClosedDay[];
  site: LocationRow | null;
  canEdit: boolean;
  setDialog: (s: { open: boolean; day: ClosedDay | null }) => void;
  del: { mutate: (id: string) => void };
}) {
  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-faint px-4 py-3">
        <span className="text-cardtitle shrink-0">休業日</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          全社の休みと、この拠点だけの休み
        </span>
      </div>

      {others.length === 0 ? (
        <EmptyState title="休業日はありません" description="年末年始や設備点検を入れておくと、その期間の予約に注意が出ます。" />
      ) : (
        <>
          {/*
            375pxで実測して見つけた崩れ（このタスクで修正）: 本文行は
            `stackOnMobile` で縦積みだが表頭だけ無く、4列が横一列に
            はみ出して見出し文字が重なっていた（`拠点・部屋`と同じ理由）。
            祝日の表は元々表頭が無く本文だけで読めているので、ここも隠す
          */}
          <RowHeader className="hidden sm:flex">
            <RowMain>期間</RowMain>
            <RowSlot w={200}>名前</RowSlot>
            <RowSlot w={72}>種類</RowSlot>
            <RowSlot w={128}>受付</RowSlot>
            {canEdit && <RowSlot w={96} align="right"> </RowSlot>}
          </RowHeader>
          {others.map((c) => (
            <Row key={c.id} density="table" divider stackOnMobile>
              <RowMain>
                <DateRange start={c.from_date} end={c.to_date} short className="text-list block" />
                <span className="text-note block text-muted-foreground">
                  {c.location_id ? site?.name : '全拠点'}
                </span>
              </RowMain>
              <RowSlot w={200}><span className="text-sub truncate">{c.name}</span></RowSlot>
              <RowSlot w={72}>
                <span className={cn('rounded-note text-note px-2 py-0.5 font-bold', KIND_TONE[c.kind])}>
                  {KIND_LABEL[c.kind]}
                </span>
              </RowSlot>
              <RowSlot w={128}>
                <span className={cn('rounded-note text-note px-2 py-0.5 font-bold', label(AVAILABILITY, c.availability).tone)}>
                  {label(AVAILABILITY, c.availability).label}
                </span>
              </RowSlot>
              {canEdit && (
                <RowSlot w={96} align="right">
                  <div className="flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8" title="編集"
                      onClick={() => setDialog({ open: true, day: c })}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="削除"
                      onClick={() => confirmAction({
                        title: `${c.name} を消しますか`,
                        description: 'この期間の予約は消えません（もともと消していません）。注意が出なくなるだけです。',
                        confirmLabel: '削除', tone: 'danger',
                      }).then((ok) => ok && del.mutate(c.id))}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </RowSlot>
              )}
            </Row>
          ))}
        </>
      )}
    </div>
  );
}
