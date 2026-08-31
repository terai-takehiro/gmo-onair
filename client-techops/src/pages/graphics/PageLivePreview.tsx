// テロップCG — ページ編集フォームのライブプレビュー（段3）。
//
// フォームの現在の入力値から `GraphicsPageRow` 相当のダミーを組み立て、出力画面と
// 完全に同じレンダラー（outputParts.tsx の `renderGraphicsPage`）にそのまま渡す
// — 「本物の絵」でないプレビューは「確認したのに違った」を生む（docs/design/v4/graphics.md
// §3・§9-10「プレビューは本物の絵」）。**このファイルはレンダラーを呼ぶだけで、
// レンダラー自体（outputParts.tsx 等）は編集しない。**
//
// 背景は黒でも透過でもなく、放送映像を想定した中間輝度の「スタジオっぽい」CSS
// グラデーションにしてある。黒背景は何を置いてもそれらしく見えてしまう、というのが
// このプロジェクトの反省点（docs/design/v4/graphics-design-specs.md §9.7 末尾）。
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  GraphicsPageRow, GraphicsPartKey, GraphicsSlot, GraphicsThemeKey,
} from '@/lib/graphicsApi';
import type { GraphicsLang } from './langField';
import { renderGraphicsPage } from './outputParts';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

// 実写風の busy な背景（specs §9.7「黒背景でなく実写風の busy 背景に合成して判定する」）。
// 画像は持ち込まず、CSS グラデーションだけで「スタジオの暗がり」を近似する
const STUDIO_BACKGROUND: CSSProperties = {
  backgroundImage: [
    'radial-gradient(1100px 640px at 26% 18%, rgba(255,255,255,0.12), transparent 60%)',
    'radial-gradient(900px 620px at 78% 82%, rgba(126,150,205,0.22), transparent 58%)',
    'radial-gradient(700px 500px at 85% 15%, rgba(200,170,110,0.14), transparent 55%)',
    'linear-gradient(160deg, #3a4152 0%, #2b3241 42%, #1b202c 100%)',
  ].join(', '),
};

export default function PageLivePreview({
  name, partKey, slot, fields, theme, callNo,
}: {
  name: string;
  partKey: GraphicsPartKey;
  slot: GraphicsSlot;
  /** score の `entries` など、部品によっては文字列以外（配列）も乗る（pageFields.ts kind:'entries'） */
  fields: Record<string, unknown>;
  theme: GraphicsThemeKey;
  /** 編集中ページの呼出番号（新規作成時は無い） */
  callNo?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  // 試写用の日英切替（多言語対応・任意機能）。出力の ?lang= と同じレンダラーに渡すだけ
  const [previewLang, setPreviewLang] = useState<GraphicsLang>('ja');

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

  // countdown パーツは1秒ごとに描き直す（プレビュー用途のため Date.now() をそのまま使う —
  // サーバー時刻同期は出力画面側の役目）
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (partKey !== 'countdown' && slot !== 'clock') return;
    const timer = setInterval(() => forceTick((n) => (n + 1) % 1_000_000), 1000);
    return () => clearInterval(timer);
  }, [partKey, slot]);

  const page: GraphicsPageRow = useMemo(() => ({
    id: 'preview',
    projectId: 'preview',
    callNo: callNo ?? 0,
    slot,
    partKey,
    name: name.trim() || '（ページ名未入力）',
    fields,
    proofState: 'draft',
    sortOrder: 0,
    templateId: null,
  }), [slot, partKey, name, fields, callNo]);

  const rendered = renderGraphicsPage(page, Date.now(), { theme, lang: previewLang });

  return (
    <div>
      <div className="mb-1.5 inline-flex overflow-hidden rounded-control-md border border-border">
        <button
          type="button"
          onClick={() => setPreviewLang('ja')}
          className={`min-h-[44px] px-3 text-note font-bold ${
            previewLang === 'ja' ? 'bg-primary text-primary-foreground' : 'bg-surface-subtle text-muted-foreground'
          }`}
        >
          日本語
        </button>
        <button
          type="button"
          onClick={() => setPreviewLang('en')}
          className={`min-h-[44px] px-3 text-note font-bold ${
            previewLang === 'en' ? 'bg-primary text-primary-foreground' : 'bg-surface-subtle text-muted-foreground'
          }`}
        >
          English
        </button>
      </div>
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden rounded-card border border-border bg-surface-subtle"
        style={{ aspectRatio: `${CANVAS_W} / ${CANVAS_H}` }}
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
            ...STUDIO_BACKGROUND,
          }}
        >
          {rendered}
        </div>
        {!rendered && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70 px-6 text-center">
            <p className="text-sub text-muted-foreground">
              この部品はまだプレビューに対応していません
            </p>
          </div>
        )}
      </div>
      <p className="mt-1.5 text-note text-muted-foreground">実際の出力と同じ描画です。</p>
    </div>
  );
}
