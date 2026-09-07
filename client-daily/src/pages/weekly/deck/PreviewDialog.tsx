/**
 * 通しで見る — 出力に入るページを順に大きく見る（消したページは飛ばす）
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@/components/ui/button';
import { pageListTitle } from './deckLabels';
import { useDeckStore } from './deckState';
import { ScaledSlide, pageNumbers, useFitScale } from './SlideFrame';

export function PreviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const deck = useDeckStore((s) => s.deck);
  const pack = useDeckStore((s) => s.pack);
  const meeting = useDeckStore((s) => s.meeting);
  const selectedPageId = useDeckStore((s) => s.selectedPageId);
  const pages = useMemo(() => (deck?.pages ?? []).filter((p) => !p.removed), [deck]);
  const numbers = useMemo(() => pageNumbers(deck?.pages ?? []), [deck]);
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const scale = useFitScale(ref, 8);

  useEffect(() => {
    if (!open) return;
    const idx = pages.findIndex((p) => p.id === selectedPageId);
    setI(idx >= 0 ? idx : 0);
  }, [open, selectedPageId, pages]);

  const page = pages[Math.min(i, pages.length - 1)] ?? null;
  const prev = () => setI((v) => Math.max(0, v - 1));
  const next = () => setI((v) => Math.min(pages.length - 1, v + 1));

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="通しで見る"
      sub={page ? `${i + 1} ／ ${pages.length}　${pageListTitle(page, pack)}` : '出力に入るページがありません'}
      size="full"
      footer={(
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={prev} disabled={i <= 0}>
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />前へ
          </Button>
          <span className="text-note text-muted-foreground">← → キーでも送れます</span>
          <Button type="button" variant="outline" onClick={next} disabled={i >= pages.length - 1}>
            次へ<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    >
      <div
        ref={ref}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
          if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); next(); }
        }}
        className="flex h-[70vh] items-center justify-center rounded-card bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="スライド"
      >
        {page && (
          <ScaledSlide scale={scale} page={page} pageNo={numbers.get(page.id) ?? i + 1} pack={pack} deck={deck} meeting={meeting} className="shadow-lg" />
        )}
      </div>
    </Sheet>
  );
}
