// テロップCG — 一覧・種類選択カードで使う「本物の絵」の小さいサムネイル。
//
// docs/design/v4/graphics-redesign.md §5「出す順」の行は
// 「番号｜種類アイコン｜サムネイル（96×54）｜文言｜…」— 一覧の行がスロット名やアイコンの
// 代わりに実際の描画を縮小して見せる。実装は `PageLivePreview.tsx`/`ConsolePreview.tsx` と
// **同じ考え方**（出力と同じ `renderGraphicsPage` を 1920×1080 の固定キャンバスに描き、
// `transform: scale` で枠に収める）を、行内に収まる小サイズ向けに切り出したもの。
// 別の簡略レンダラーを作らない —「プレビューは本物の絵」の規律をここでも守る。
import { useEffect, useRef, useState } from 'react';
import type { GraphicsPageRow, GraphicsThemeKey } from '@/lib/graphicsApi';
import { renderGraphicsPage } from './outputParts';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export default function TelopThumb({ page, theme, className }: {
  page: GraphicsPageRow;
  theme: GraphicsThemeKey;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (w: number) => setScale(w > 0 ? w / CANVAS_W : 0);
    measure(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 一覧の行に大量に並ぶため、カウントダウンの毎秒描き直し等はしない
  // （行の主目的は「どの絵か」の見分けであって、生きた時計を見せることではない）。
  const rendered = renderGraphicsPage(page, Date.now(), { theme });

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={`relative shrink-0 overflow-hidden rounded-control-md bg-[#0f1115] ${className ?? 'h-[45px] w-20'}`}
    >
      {rendered && (
        <div
          style={{
            position: 'absolute', top: 0, left: 0, width: CANVAS_W, height: CANVAS_H,
            transform: `scale(${scale})`, transformOrigin: 'top left',
          }}
        >
          {rendered}
        </div>
      )}
    </div>
  );
}
