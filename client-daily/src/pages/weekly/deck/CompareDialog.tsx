/**
 * 前回の資料と見比べる — 前回の会議日の構成を左に、今回を右に並べる
 *
 * 前回の構成は `GET /dailyops/keep/decks/:previous_meeting_date`（読むだけ。ここでは保存しない）。
 * 「今回には無い」「今回から」「削除」の印で、何が動いたかが一覧で分かるようにする。
 */
import { useMemo, useRef, useState } from 'react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { KeepDeck, KeepReportPack, SlidePage } from '@gmo-onair/shared/src/keepReport/types';
import { useDeckReadOnly } from '@/lib/deckApi';
import { KIND_CLASS, formatMeetingDate, pageKind, pageListTitle, shortMd } from './deckLabels';
import { useDeckStore } from './deckState';
import { ScaledSlide, SlideThumb, pageNumbers, useFitScale } from './SlideFrame';

interface Picked { side: 'prev' | 'now'; id: string }

function Column({ title, deck, pack, meeting, mark, picked, onPick, side }: {
  title: string;
  deck: KeepDeck;
  pack: KeepReportPack | null;
  meeting: string | null;
  mark: (p: SlidePage) => string | null;
  picked: Picked | null;
  onPick: (p: Picked) => void;
  side: Picked['side'];
}) {
  const numbers = useMemo(() => pageNumbers(deck.pages), [deck]);
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-card border border-border bg-card">
      <div className="text-cardtitle border-b border-border-faint px-3 py-2">{title} <span className="font-number text-sub-sm text-muted-foreground">{numbers.size}ページ</span></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {deck.pages.map((p) => {
          const m = mark(p);
          const active = picked?.side === side && picked.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick({ side, id: p.id })}
              className={cn('flex w-full items-center gap-2 rounded-control-md px-1.5 py-1 text-left', active ? 'bg-primary-surface' : 'hover:bg-background', p.removed && 'opacity-60')}
            >
              <span className="font-number text-badge w-5 shrink-0 text-right text-muted-foreground">{numbers.get(p.id) ?? '—'}</span>
              <SlideThumb page={p} pageNo={numbers.get(p.id) ?? 0} pack={pack} deck={p.template === 'agenda' ? deck : null} meeting={meeting} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn('text-sub-sm truncate', active ? 'font-bold text-primary' : 'text-foreground', p.removed && 'line-through')}>{pageListTitle(p, pack)}</span>
                <span className="flex items-center gap-1">
                  <span className={cn('text-badge inline-flex h-4 items-center rounded-badge-xs px-1.5', KIND_CLASS[pageKind(p)])}>{pageKind(p)}</span>
                  {m && <span className="text-badge inline-flex h-4 items-center rounded-badge-xs bg-warning-surface px-1.5 text-warning">{m}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CompareDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const deck = useDeckStore((s) => s.deck);
  const pack = useDeckStore((s) => s.pack);
  const meeting = useDeckStore((s) => s.meeting);
  const previous = useDeckStore((s) => s.previousMeetingDate);
  const prev = useDeckReadOnly(previous, open);
  const [picked, setPicked] = useState<Picked | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const scale = useFitScale(ref, 8);

  const nowTitles = useMemo(() => new Set((deck?.pages ?? []).filter((p) => !p.removed).map((p) => pageListTitle(p, pack))), [deck, pack]);
  const prevTitles = useMemo(() => new Set((prev.data?.deck.pages ?? []).filter((p) => !p.removed).map((p) => pageListTitle(p, prev.data?.pack ?? null))), [prev.data]);

  const pickedPage = picked?.side === 'prev'
    ? prev.data?.deck.pages.find((p) => p.id === picked.id)
    : deck?.pages.find((p) => p.id === picked?.id);
  const pickedPack = picked?.side === 'prev' ? prev.data?.pack ?? null : pack;
  const pickedDeck = picked?.side === 'prev' ? prev.data?.deck ?? null : deck;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="前回の資料と見比べる"
      sub={previous ? `前回 ${formatMeetingDate(previous)} ・ 今回 ${formatMeetingDate(meeting)}` : '前回の資料がありません'}
      size="full"
    >
      {!previous ? (
        <EmptyState
          title="前回の資料がありません"
          description="この会議日より前に作った資料が無いので、標準の構成から組んでいます。次回からここに前回の構成が出ます。"
        />
      ) : prev.isError ? (
        <ErrorPanel title="前回の資料を読み込めませんでした" error={prev.error} onRetry={() => prev.refetch()} />
      ) : prev.data === null ? (
        <EmptyState
          title={`前回（${shortMd(previous)}）の資料はまだ作られていません`}
          description="前回の会議日に「資料をつくる」を開いた人がいないので、見比べる相手がありません（ここからは作りません）。"
        />
      ) : !prev.data ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid h-[38vh] grid-cols-2 gap-3">
            <Column
              side="prev"
              title={`前回（${shortMd(previous)}）`}
              deck={prev.data.deck}
              pack={prev.data.pack}
              meeting={previous}
              mark={(p) => (p.removed ? '前回も削除' : nowTitles.has(pageListTitle(p, prev.data?.pack ?? null)) ? null : '今回には無い')}
              picked={picked}
              onPick={setPicked}
            />
            {deck && (
              <Column
                side="now"
                title={`今回（${shortMd(meeting)}）`}
                deck={deck}
                pack={pack}
                meeting={meeting}
                mark={(p) => (p.removed ? '削除' : prevTitles.has(pageListTitle(p, pack)) ? null : '今回から')}
                picked={picked}
                onPick={setPicked}
              />
            )}
          </div>
          <div ref={ref} className="flex h-[34vh] items-center justify-center rounded-card bg-muted">
            {pickedPage && pickedDeck ? (
              <ScaledSlide scale={scale} page={pickedPage} pageNo={pageNumbers(pickedDeck.pages).get(pickedPage.id) ?? 0} pack={pickedPack} deck={pickedDeck} meeting={picked?.side === 'prev' ? previous : meeting} className="shadow-lg" />
            ) : (
              <p className="text-sub text-muted-foreground">上の一覧でページを押すと、ここに大きく出ます</p>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
