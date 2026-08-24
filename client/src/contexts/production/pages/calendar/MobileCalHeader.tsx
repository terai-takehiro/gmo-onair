/**
 * ① 予定・スマホ / 月表・週表の見出しと切替
 *
 * ── なぜ足したか ─────────────────────────────────────────────
 *
 * スマホ（`MobileToday.tsx`）は月表＋選んだ日のアジェンダに固定していて、
 * 「幅が狭くなると日しか見られない」というご指摘があった。実際には月表は
 * 出ていたが、**週だけを見る手段がどこにも無かった**。ここは見出し・
 * 前後送り・「今日」・月/週の切替をまとめた部品にして、`MobileToday.tsx`
 * 側は月表と週表のどちらを描くかだけを持てばよいようにする
 * （1ファイル400行の上限に収めるための切り出しでもある）。
 *
 * PC の月/週/一覧の切替（`DesktopToolbar.tsx`）と同じ「押した状態が沈む
 * ピル」の見た目に合わせた。前後送りは月と週で意味が変わる
 * （月送り／週送り）ため、月名のような固定ラベルは持たず、
 * 呼ぶ側が組み立てた `title` と `onPrev`/`onNext` をそのまま使う。
 */
import { ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@gmo-onair/shared/src/client/utils';

export type MobileCalView = 'month' | 'week';

const VIEWS: { key: MobileCalView; label: string }[] = [
  { key: 'month', label: '月' },
  { key: 'week', label: '週' },
];

export function MobileCalHeader({
  view, onView, title, onPrev, onNext, onToday, onLayers,
}: {
  view: MobileCalView;
  onView: (v: MobileCalView) => void;
  /** 「2026年8月」「8/17 – 8/23」など、月表・週表それぞれで組み立てたもの */
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onLayers: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrev}
          aria-label="前へ"
          className="min-h-tap min-w-tap flex items-center justify-center rounded-note text-secondary-foreground"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>

        <span className="flex items-center gap-0.5 rounded-control-md border border-border bg-surface-subtle p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => onView(v.key)}
              aria-pressed={view === v.key}
              className={cn(
                'min-h-tap rounded-control px-3 text-note font-bold',
                view === v.key ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </span>

        <button
          type="button"
          onClick={onNext}
          aria-label="次へ"
          className="min-h-tap min-w-tap flex items-center justify-center rounded-note text-secondary-foreground"
        >
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </button>

        <span className="flex-1" />
        <Button variant="outline" size="sm" onClick={onToday}>今日</Button>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-h1 min-w-0 flex-1 [overflow-wrap:anywhere]">{title}</h2>
        <Button
          variant="outline" size="icon" aria-label="出すものを選ぶ"
          onClick={onLayers}
        >
          <Layers className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
