// テロップCG ティッカーの速度と尺の計算（純粋関数・I/O なし）。
//
// 数値の正は docs/design/v4/graphics-design-specs.md §6:
//   高さ 72px・速度 110px/s（90–130・読速4文字/秒から逆算）。
// 「読み切れること」が優先なので、速度は px/s で固定し、尺（アニメーションの
// duration）を文の長さから逆算する — duration を固定して速度が文の長さで
// 変わる形にはしない。
//
// 文字幅は「1文字 ≒ フォントサイズ × 1.05」の概算で見積もる（44px の全角
// ベタ組み＋わずかな字間）。描画側（outputPartsExtra.tsx）はマウント時に
// 実測して上書きするので、この概算は初期値・フォールバック専用。

export type GraphicsTickerSpeed = 'slow' | 'normal' | 'fast';

/** ティッカー本文のフォントサイズ（px @1080） */
export const TICKER_FONT_SIZE = 44;

/** 論理キャンバスの横幅（px）。specs §0 */
export const TICKER_CANVAS_WIDTH = 1920;

/** 速度の3段（px/s）。normal=110 が読速4文字/秒からの逆算値（specs §6） */
export const TICKER_PX_PER_SEC: Record<GraphicsTickerSpeed, number> = {
  slow: 90,
  normal: 110,
  fast: 130,
};

/** fields.speed（unknown）を速度 px/s に解決する。知らない値は normal 扱い */
export function tickerPxPerSec(speed: unknown): number {
  if (speed === 'slow' || speed === 'fast' || speed === 'normal') {
    return TICKER_PX_PER_SEC[speed];
  }
  return TICKER_PX_PER_SEC.normal;
}

/** 本文の横幅の概算（px）。1文字 ≒ 44px × 1.05（全角ベタ組み＋わずかな字間） */
export function estimateTickerTextWidth(text: string): number {
  return Array.from(text).length * TICKER_FONT_SIZE * 1.05;
}

/**
 * 本文が画面右端から入って左端へ完全に抜けるまでの概算秒数。
 * duration = (文の幅 + 画面幅 1920) ÷ 速度(px/s)。
 * 送出コンソールで「この文は何秒で読み切れるか」を出すのにも使える。
 */
export function estimateDurationSec(text: string, speed?: unknown): number {
  const px = tickerPxPerSec(speed);
  return (estimateTickerTextWidth(text) + TICKER_CANVAS_WIDTH) / px;
}
