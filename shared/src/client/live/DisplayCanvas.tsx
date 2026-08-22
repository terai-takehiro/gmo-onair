/**
 * 計時・視聴者 — 表示画面の自由配置レイアウトを描画する共有レンダラー。
 *
 * 入力: レイアウトJSON + 現在の値（タイマー状態・視聴者数）→ 絶対配置で描画するだけの
 * 純粋な表示部品。データ取得・ポーリング・Socket購読は一切持たない
 * （`TimerDisplayPage.tsx` / エディタのプレビューがそれぞれ既存の手段でデータを取り、
 *  この部品には値として渡すだけ）。
 *
 * ⚠️ 色定数（フェーズ色・プラットフォーム色）は `client-live/src/pages/TimerDisplayPage.tsx`
 * の `phaseBarColors` / `VIEWER_ITEMS` と一字一句同じ値。ズレる事故を防ぐため、
 * 色を変えるときは両方を同時に直すこと（値を型で縛れないため、実装は移すだけにとどめ、
 * 新しい色は作らない）。
 *
 * 設計: docs/design/v4/qsheet-v4-coding/13-live-display-layout-editor.md §4-2
 */
import { Component, type CSSProperties, type ReactNode } from 'react';
import type { TimerPhase } from './useTimer';
import type { DisplayElementLayout, DisplayLayout } from './displayLayout';

// TimerDisplayPage.tsx の phaseBarColors と完全に同じ値
export const phaseBarColors: Record<TimerPhase, string> = {
  idle: 'rgba(128,128,128,0.35)',
  countdown: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
};

type ViewerKey = 'youtube' | 'jstream' | 'zoom' | 'teams' | 'total';

// TimerDisplayPage.tsx の VIEWER_ITEMS と完全に同じ値（label・color）
const VIEWER_ITEMS: Record<ViewerKey, { label: string; color: string }> = {
  youtube: { label: 'YouTube', color: '#ef4444' },
  jstream: { label: 'Jstream', color: '#06b6d4' },
  zoom:    { label: 'Zoom',    color: '#2D8CFF' },
  teams:   { label: 'Teams',   color: '#6264A7' },
  total:   { label: '合計',    color: '#a855f7' },
};

function formatCount(n: number): string {
  if (n >= 10000) return Math.floor(n / 1000) + 'K';
  return n.toLocaleString('ja-JP');
}

// TimerDisplayPage.tsx の timerColor() と同じ配色（クラス名ではなく実際の色値で表現）。
// red フェーズだけは静的な色を返さない — CSS カスケードの詳細度により、実際の描画は
// パルスするアニメーション色（TimerDisplayPage.tsx の index.css 側の規則）であって
// 静止した固定色ではないため。ここでは undefined を返し、呼び出し側が
// `display-canvas-timer-red`（下の DisplayCanvasStyles）でパルス＋グローを掛ける。
function timerColor(phase: TimerPhase, light: boolean): string | undefined {
  if (phase === 'yellow') return light ? '#d97706' /* amber-600 */ : '#fbbf24' /* amber-400 */;
  if (phase === 'red') return undefined;
  return light ? '#1a1d24' : '#ffffff';
}

/**
 * `.phase-red` / `.timer-glow-red` / `.timer-progress-fill`（`client-live/src/index.css`）と
 * 同じ見た目を、この共有部品が自力で持つための埋め込みスタイル。
 *
 * DisplayCanvas は `client-live` 以外（エディタのプレビュー・PR3）からも呼ばれる想定の
 * 純粋な描画部品なので、`client-live` の index.css が読み込まれている前提を置けない。
 * グローバル CSS に依存せず完結させるため、キーフレーム・トランジションをここに埋め込む。
 */
function DisplayCanvasStyles() {
  return (
    <style>{`
      @keyframes display-canvas-pulse-text {
        0%, 100% { color: #dc2626; }
        50% { color: #f87171; }
      }
      .display-canvas-timer-red {
        animation: display-canvas-pulse-text 0.8s ease-in-out infinite;
        text-shadow: 0 0 24px rgba(220, 38, 38, 0.55), 0 0 72px rgba(220, 38, 38, 0.25);
      }
      .display-canvas-progress-fill {
        transition: width 0.35s linear, background-color 0.5s ease;
      }
    `}</style>
  );
}

/**
 * DisplayCanvas のレンダー中の例外から呼び出し元を守るエラーバウンダリ。
 *
 * design doc §8 リスク1「不正な形の layout JSON で表示画面がクラッシュする」への対処は
 * `isValidDisplayLayout()` の要素単位 validate が一次防御だが、エディタのプレビュー
 * （PR3・validate を経ない中間状態がありうる）や、未知の壊れ方に備えた二次防御として
 * ここに置く。`fallback` を渡さない既定は何も描かない（真っ白より「何も出ない」の方が、
 * 呼び出し元が `onError` で別の描画に切り替えるまでの一瞬として安全）。
 */
export class DisplayCanvasBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: (error: unknown) => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[DisplayCanvas] レンダリング中に例外が発生したため、フォールバック表示に切り替えます', error);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}

export interface DisplayCanvasProps {
  layout: DisplayLayout;
  timerDisplay: string;       // formatTimer 済みの文字列
  timerPhase: TimerPhase;
  progress: number | null;
  counts: { youtube: number; jstream: number; zoom: number; teams: number; total: number };
}

export function DisplayCanvas({ layout, timerDisplay, timerPhase, progress, counts }: DisplayCanvasProps) {
  const light = layout.background === 'light';
  return (
    <div
      className={`relative h-screen w-screen select-none overflow-hidden ${light ? 'bg-[#fafafa]' : 'bg-black'}`}
    >
      <DisplayCanvasStyles />
      {layout.elements
        // 呼び出し元が `isValidDisplayLayout` 等の validate を経由しない場合（エディタの
        // プレビュー・PR3）への保険。`el` が null/undefined でも落ちないようにする。
        .filter((el): el is DisplayElementLayout => !!el && el.visible)
        .map((el) => (
          <DisplayElement
            key={el.key}
            el={el}
            light={light}
            timerDisplay={timerDisplay}
            timerPhase={timerPhase}
            progress={progress}
            counts={counts}
          />
        ))}
    </div>
  );
}

function DisplayElement({
  el,
  light,
  timerDisplay,
  timerPhase,
  progress,
  counts,
}: {
  el: DisplayElementLayout;
  light: boolean;
  timerDisplay: string;
  timerPhase: TimerPhase;
  progress: number | null;
  counts: DisplayCanvasProps['counts'];
}) {
  const style: CSSProperties = {
    position: 'absolute',
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
  };

  if (el.key === 'timer') {
    const isRed = timerPhase === 'red';
    return (
      <div style={style} className="flex flex-col items-center justify-center">
        <div
          className={`font-bold leading-none tabular-nums ${isRed ? 'display-canvas-timer-red' : ''}`}
          style={{ color: timerColor(timerPhase, light), fontSize: 'min(16vw, 30vh)' }}
        >
          {timerDisplay}
        </div>
        {progress != null && (
          <div className={`mt-[3%] h-[6%] w-4/5 ${light ? 'bg-black/10' : 'bg-white/10'}`} aria-hidden="true">
            <div
              className="h-full display-canvas-progress-fill"
              style={{ width: `${progress * 100}%`, backgroundColor: phaseBarColors[timerPhase] }}
            />
          </div>
        )}
      </div>
    );
  }

  // 未知の key（不正な layout・エディタのプレビューが validate を経ない中間状態）は
  // 安全側で何も描かない。ここに来る前に isValidDisplayLayout() が弾く想定だが、
  // それを経由しない呼び出し元（PR3）向けの二次防御として残す。
  const item = VIEWER_ITEMS[el.key as ViewerKey];
  if (!item) return null;
  const count = counts[el.key as ViewerKey] ?? 0;
  return (
    <div style={style} className="flex flex-col items-center justify-center gap-[6%]">
      <span className="font-bold" style={{ color: item.color, fontSize: 'min(2.4vw, 4.5vh)' }}>
        {item.label}
      </span>
      <span
        className="font-bold leading-none tabular-nums"
        style={{ color: item.color, fontSize: 'min(6vw, 11vh)' }}
      >
        {formatCount(count)}
      </span>
    </div>
  );
}
