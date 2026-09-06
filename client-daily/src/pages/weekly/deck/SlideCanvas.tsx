/**
 * 真ん中のキャンバス — 選んだページを 1280×720 の比率で縮めて描き、部品を選んで直す
 *
 * - 縮尺は入れ物の大きさから決める（`useFitScale`）。スライドの中は `SlideFrame` が描く
 * - 選んだ部品には青い枠と、上に小さな道具（数字を更新／差し替え／複製／削除）。
 *   道具と四隅の印は**縮めない層**に置く（縮めると文字が読めなくなる）
 * - 下の点線の枠は右の部品の落とし口（「ここに置くと、このページの下に部品が入ります」）
 * - 消したページはその旨を重ねて出し「戻す」を置く
 */
import { useMemo, useRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Copy, Download, RefreshCw, Replace, Trash2, Undo2 } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { Button } from '@/components/ui/button';
import { pageListTitle, partLabel, templateLabel } from './deckLabels';
import { useDeckStore } from './deckState';
import { ScaledSlide, pageNumbers, useFitScale } from './SlideFrame';
import { SLIDE_H, SLIDE_W } from './renderers/slideStyle';

function ToolButton({ icon: Icon, label, onClick, disabled, active, title }: {
  icon: typeof Copy; label: string; onClick: () => void; disabled?: boolean; active?: boolean; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn('text-badge inline-flex h-8 items-center gap-1 rounded-control px-2 text-primary-foreground hover:bg-primary-800 disabled:opacity-50', active && 'bg-primary-900')}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />{label}
    </button>
  );
}

export function SlideCanvas({ onRefreshNumbers, refreshing }: { onRefreshNumbers: () => void; refreshing: boolean }) {
  const deck = useDeckStore((s) => s.deck);
  const pack = useDeckStore((s) => s.pack);
  const meeting = useDeckStore((s) => s.meeting);
  const packFrozen = useDeckStore((s) => s.packFrozen);
  const selectedPageId = useDeckStore((s) => s.selectedPageId);
  const selectedPartId = useDeckStore((s) => s.selectedPartId);
  const replaceTargetPartId = useDeckStore((s) => s.replaceTargetPartId);
  const select = useDeckStore((s) => s.select);
  const selectPart = useDeckStore((s) => s.selectPart);
  const removePage = useDeckStore((s) => s.removePage);
  const restorePage = useDeckStore((s) => s.restorePage);
  const duplicatePart = useDeckStore((s) => s.duplicatePart);
  const removePart = useDeckStore((s) => s.removePart);
  const setReplaceTarget = useDeckStore((s) => s.setReplaceTarget);

  const pages = deck?.pages ?? [];
  const numbers = useMemo(() => pageNumbers(pages), [pages]);
  const idx = pages.findIndex((p) => p.id === selectedPageId);
  const page = idx >= 0 ? pages[idx] : null;
  const part = page?.parts.find((p) => p.id === selectedPartId) ?? null;
  const prev = idx > 0 ? pages[idx - 1] : null;
  const next = idx >= 0 && idx < pages.length - 1 ? pages[idx + 1] : null;

  const ref = useRef<HTMLDivElement>(null);
  const scale = useFitScale(ref, 24);
  const W = SLIDE_W * scale;
  const H = SLIDE_H * scale;
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop', data: { type: 'canvas' } });

  const onRemovePart = async () => {
    if (!page || !part) return;
    const ok = await confirmAction({
      title: 'この部品を削除しますか',
      description: `「${partLabel(part, page)}」をこのページから外します。数字は元のデータに残るので、右の「部品」からまた置けます。`,
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (ok) removePart(page.id, part.id);
  };
  const onRemovePage = async () => {
    if (!page) return;
    const ok = await confirmAction({
      title: 'このページを削除しますか',
      description: `「${pageListTitle(page, pack)}」を出力から外します。左の一覧には薄く残り、「戻す」でいつでも元に戻せます。次回の資料ではこのページを省いた構成が既定になります。`,
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (ok) removePage(page.id);
  };

  // 道具の置き場所: 部品の上。上に余地が無ければ部品の下
  const partTop = part ? (part.y / 100) * H : 0;
  const toolTop = part ? (partTop >= 40 ? partTop - 36 : ((part.y + part.h) / 100) * H + 8) : 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-cardtitle whitespace-nowrap">
          <span className="font-number">{page ? numbers.get(page.id) ?? '—' : '—'}</span> ／ <span className="font-number">{numbers.size}</span>
        </span>
        <span className="text-sub-sm min-w-0 truncate text-muted-foreground">
          {page ? `${pageListTitle(page, pack)} ・ テンプレート「${templateLabel(page.template)}」` : 'ページを選んでください'}
        </span>
        <span className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => prev && select(prev.id)} disabled={!prev} aria-label="前のページ">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => next && select(next.id)} disabled={!next} aria-label="次のページ">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        {page && !page.removed && (
          <Button type="button" variant="outline" size="sm" onClick={onRemovePage}>
            <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />ページを削除
          </Button>
        )}
      </div>

      <div ref={ref} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-card border border-border bg-muted">
        {page ? (
          <div className="relative shadow-lg" style={{ width: W, height: H }} data-slide-canvas>
            <ScaledSlide
              scale={scale}
              page={page}
              pageNo={numbers.get(page.id) ?? 0}
              pack={pack}
              deck={deck}
              meeting={meeting}
              selectedPartId={selectedPartId}
              onSelectPart={selectPart}
            />
            {part && !page.removed && (
              <>
                {[[0, 0], [1, 0], [0, 1], [1, 1]].map(([cx, cy]) => (
                  <span
                    key={`${cx}${cy}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute z-10 h-2 w-2 rounded-badge-xs border-2 border-primary bg-card"
                    style={{
                      left: ((part.x + cx * part.w) / 100) * W - 5 + (cx ? 4 : -4),
                      top: ((part.y + cy * part.h) / 100) * H - 5 + (cy ? 4 : -4),
                    }}
                  />
                ))}
                <div
                  className="absolute z-20 flex items-center gap-0.5 rounded-control-md bg-primary p-0.5 shadow-md"
                  style={{ left: Math.max(0, (part.x / 100) * W), top: toolTop }}
                  data-part-toolbar
                >
                  <ToolButton
                    icon={RefreshCw} label="数字を更新" onClick={onRefreshNumbers}
                    disabled={packFrozen || refreshing || !part.binding}
                    title={packFrozen ? '週報を確定した時点の数字で凍結しています' : !part.binding ? '人が置いた部品には ONAiR の数字がありません' : 'いまの ONAiR の数字で組み直します'}
                  />
                  <ToolButton icon={Replace} label="差し替え" onClick={() => setReplaceTarget(replaceTargetPartId === part.id ? null : part.id)} active={replaceTargetPartId === part.id} title="右の「部品」の＋で、この部品を置き換えます" />
                  <ToolButton icon={Copy} label="複製" onClick={() => duplicatePart(page.id, part.id)} />
                  <ToolButton icon={Trash2} label="削除" onClick={() => { void onRemovePart(); }} />
                </div>
              </>
            )}
            <div
              ref={setNodeRef}
              className={cn(
                'text-badge absolute inset-x-4 z-10 flex items-center justify-center gap-2 rounded-control-md border-2 border-dashed transition-colors',
                isOver ? 'border-primary bg-primary-surface text-primary' : 'border-primary-border-strong bg-primary-surface-weak text-primary',
              )}
              style={{ top: H * 0.855, height: 34 }}
              data-canvas-drop
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              ここに置くと、このページの下に部品が入ります（表・グラフ・写真・文）
            </div>
            {page.removed && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/70">
                <div className="flex flex-col items-center gap-2 rounded-note border border-border bg-card px-5 py-4 text-center shadow-md">
                  <p className="text-list">このページは削除してあります（出力に入りません）</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => restorePage(page.id)}>
                    <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />戻す
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            className="m-6 bg-card"
            title="ページがありません"
            description="右の「部品」から案件ページや表を置くか、左の「追加…」からテンプレートを選んでください。"
          />
        )}
      </div>
      <p className="text-sub-sm text-muted-foreground">
        数字を含むページは「自動」。人が直した箇所は残り、次回も同じ場所に入ります ・ 部品を選んで Delete キーで削除
      </p>
    </div>
  );
}
