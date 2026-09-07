/**
 * スライド1枚（1280×720）— GMO流会議フォーマットの枠（題・トークスクリプトの帯・フッター）＋部品
 *
 * キャンバス・一覧のサムネイル・通しで見る・前回との見比べ、**すべて同じこの部品**を
 * 縮尺だけ変えて描く（別々に描くと「一覧では出ているのにキャンバスに無い」が起きる）。
 * 枠の位置と色は `shared/src/keepReport/templates.ts`（pptx 出力と共通・**実物の pptx から読んだインチ**）と
 * `renderers/slideStyle.ts`。ワードマーク・帯のスピーカーは実物から取り出した SVG（`shared/src/keepReport/formatAssets.ts`）。
 */
import { memo, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { FORMAT_CHROME, FORMAT_FONT, FORMAT_FOOTER, SLIDE_TEMPLATES, TALK_BANDS } from '@gmo-onair/shared/src/keepReport/templates';
import { formatAssetDataUri } from '@gmo-onair/shared/src/keepReport/formatAssets';
import type { KeepDeck, KeepReportPack, SlidePage } from '@gmo-onair/shared/src/keepReport/types';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { PartRenderer } from './PartRenderer';
import { SLIDE_H, SLIDE_W, bandIconStyle, bandNoteStyle, bandStyle, fitPx, footer, frameStyle, titleStyle } from './renderers/slideStyle';

/** 実物から取り出した絵（data URI）。読み込み時に 1 度だけ組む */
const TALK_ICON = formatAssetDataUri('talkIcon');
const WORDMARK = formatAssetDataUri('wordmark');

export interface SlideFrameProps {
  page: SlidePage;
  /** 出力のページ番号（消したページを飛ばして数えたもの） */
  pageNo: number;
  pack: KeepReportPack | null;
  deck?: KeepDeck | null;
  meeting?: string | null;
  selectedPartId?: string | null;
  onSelectPart?: (partId: string | null) => void;
  thumb?: boolean;
}

function Chrome({ page, pageNo }: { page: SlidePage; pageNo: number }) {
  const tpl = SLIDE_TEMPLATES[page.template];
  const header = tpl?.header ?? 'title';
  const bands = header === 'bands-report' ? TALK_BANDS.report : header === 'bands-owner' ? TALK_BANDS.owner : null;
  return (
    <>
      {header !== 'none' && (
        // 題は 1 行。長い題は pptx の自動調整（normAutofit）と同じ見積もりで小さくする
        <div style={{ ...titleStyle, fontSize: fitPx(page.title, FORMAT_FONT.title, FORMAT_CHROME.title.w) }}>{page.title}</div>
      )}
      {bands?.map((b, i) => (
        <div key={i} style={bandStyle(b.tone, i)}>
          <span>{b.text}</span>
          {'note' in b && b.note && <span style={bandNoteStyle}>{b.note}</span>}
        </div>
      ))}
      {bands?.map((_, i) => <img key={`icon-${i}`} src={TALK_ICON} alt="" style={bandIconStyle(i)} />)}
      {/* フッターはスライドマスターの絵なので表紙にも出る（実物と同じ）。罫線は無い */}
      <img src={WORDMARK} alt={FORMAT_FOOTER.logo} style={footer.logo} />
      <div style={footer.tag}>{FORMAT_FOOTER.tag}</div>
      <div style={footer.confidential}>{FORMAT_FOOTER.confidential}</div>
      <div style={footer.pageNo}>{pageNo}</div>
    </>
  );
}

export const SlideFrame = memo(function SlideFrame({ page, pageNo, pack, deck, meeting, selectedPartId, onSelectPart, thumb }: SlideFrameProps) {
  const needsDeck = page.template === 'agenda';
  return (
    <div
      style={{ ...frameStyle, ...(thumb ? { pointerEvents: 'none' } : {}) }}
      onClick={onSelectPart ? () => onSelectPart(null) : undefined}
      data-slide-page={page.id}
    >
      <Chrome page={page} pageNo={pageNo} />
      {page.parts.map((part) => {
        const selected = !!selectedPartId && selectedPartId === part.id;
        const style: CSSProperties = {
          position: 'absolute', left: `${part.x}%`, top: `${part.y}%`, width: `${part.w}%`, height: `${part.h}%`,
          overflow: 'hidden', boxSizing: 'border-box',
        };
        return (
          <div
            key={part.id}
            data-part-id={part.id}
            style={style}
            className={cn(onSelectPart && 'cursor-pointer', selected && 'outline outline-2 outline-offset-4 outline-primary')}
            onClick={onSelectPart ? (e) => { e.stopPropagation(); onSelectPart(part.id); } : undefined}
          >
            <PartRenderer pack={pack} page={page} part={part} deck={needsDeck ? deck : null} meeting={meeting} thumb={thumb} />
          </div>
        );
      })}
    </div>
  );
});

/** 縮尺つきの入れ物。`scale` × 1280×720 の場所を取り、中を transform で縮める */
export function ScaledSlide({ scale, className, ...rest }: SlideFrameProps & { scale: number; className?: string }) {
  return (
    <div className={className} style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: SLIDE_W, height: SLIDE_H }}>
        <SlideFrame {...rest} />
      </div>
    </div>
  );
}

/** 一覧のサムネイル（64×36 = 0.05 倍）。同じ描き手を縮めるだけ */
export function SlideThumb(props: Omit<SlideFrameProps, 'thumb' | 'selectedPartId' | 'onSelectPart'>) {
  return (
    <div className="h-9 w-16 shrink-0 overflow-hidden rounded-badge-xs border border-border bg-card" aria-hidden="true">
      <ScaledSlide {...props} thumb scale={64 / SLIDE_W} />
    </div>
  );
}

/** 入れ物の大きさに 16:9 を収める縮尺（ResizeObserver）。`padding` は入れ物の内側の余白 */
export function useFitScale(ref: RefObject<HTMLElement | null>, padding = 0, maxScale = 1): number {
  const [scale, setScale] = useState(0.5);
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth - padding * 2;
    const h = el.clientHeight - padding * 2;
    if (w <= 0 || h <= 0) return;
    setScale(Math.min(maxScale, w / SLIDE_W, h / SLIDE_H));
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current]);
  return scale;
}

/** 出力のページ番号（消したページを飛ばす）。一覧・キャンバス・通しで見るが同じ番号を使う */
export function pageNumbers(pages: SlidePage[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const p of pages) {
    if (p.removed) continue;
    n += 1;
    map.set(p.id, n);
  }
  return map;
}
