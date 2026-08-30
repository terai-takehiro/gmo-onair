// テロップCG — 送出コンソールの PGM / PVW プレビュー（モック②）。
//
// **本物の放送ピクセルを描く**: 出力画面（GraphicsOutputPage）と同じ
// `renderGraphicsPage`（./outputParts）を 1920×1080 の固定キャンバスに描き、
// `transform: scale` で枠に収める。別のミニ版レンダラーを作らない —
// 「PVW は本物のレンダリング（同じ HTML/CSS/フォント）」が §4 の規律で、
// 縮小コピーを別実装すると PVW で確認した絵と放送に出る絵がずれる。
//
// キャンバスの中は放送に出る絵（v4 トークンの対象外・outputParts と同じ例外扱い）
// なので背景グラデーションだけ生の色で書く。枠・見出しは v4 トークン。
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { GraphicsPageRow } from '@/lib/graphicsApi';
import { renderGraphicsPage } from './outputParts';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export interface PreviewItem {
  page: GraphicsPageRow;
  /**
   * 文脈用の薄表示（PVW 側で「他スロットの現在オンエア」を 40% で重ねる）。
   * 次に出す1枚がどこに重なるかを、実際の合成に近い形で確かめられる。
   */
  dim?: boolean;
}

/** 枠の実測幅（ResizeObserver）から 1920px キャンバスの縮尺を出す */
function useCanvasScale(): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width > 0 ? width / CANVAS_W : 0];
}

export function ConsolePreview({ tone, title, right, items, emptyText, serverNowMs }: {
  /** pgm = 赤（いま出ている合成後）／ pvw = 橙（次に出す1枚） */
  tone: 'pgm' | 'pvw';
  title: ReactNode;
  right?: ReactNode;
  items: PreviewItem[];
  /** 1枚も無いときにキャンバス中央に出す言葉（PGM「オンエアなし」など） */
  emptyText: string;
  serverNowMs: number;
}) {
  const [boxRef, scale] = useCanvasScale();
  const empty = items.length === 0;
  return (
    <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-card">
      <div className="flex min-h-[40px] items-center gap-2 border-b border-border-faint px-3 py-1.5">
        <span
          className={`inline-flex h-[22px] w-14 shrink-0 items-center justify-center rounded-badge-xs text-badge font-bold ${
            tone === 'pgm' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'
          }`}
        >
          {tone === 'pgm' ? 'PGM' : 'PVW'}
        </span>
        <span className="min-w-0 flex-1 truncate text-sub font-bold">{title}</span>
        {right}
      </div>
      <div
        ref={boxRef}
        className="relative aspect-video w-full overflow-hidden"
        // 放送キャンバスの下地（モック②と同じ暗色グラデ。v4 トークンの対象外）
        style={{ background: 'linear-gradient(160deg, #1b1f2a 0%, #12141b 70%)' }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {items.map((it) => (
            // opacity の入れ物は position: static のまま（絶対配置の基準はキャンバスに残る）
            <div key={it.page.id} style={it.dim ? { opacity: 0.4 } : undefined}>
              {renderGraphicsPage(it.page, serverNowMs)}
            </div>
          ))}
        </div>
        {empty && (
          <div
            className="absolute inset-0 flex items-center justify-center text-sub"
            // 暗色キャンバス上の案内文（放送には出ない・キャンバス側なので生の色）
            style={{ color: 'rgba(245, 245, 245, 0.65)' }}
          >
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
