/**
 * 長体（scaleX）優先、75%未満なら折り返しにフォールバック。
 * Canvas API でフォントメトリクスを計測する。
 */

const MIN_SCALE = 0.75;

export function measureWidth(text: string, fontStr: string): number {
  if (!text || typeof document === 'undefined') return 0;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = fontStr;
    return ctx.measureText(text).width;
  } catch {
    return 0;
  }
}

export interface FitResult {
  scaleX: number;
  wrap: boolean;
}

/**
 * @param text       表示テキスト
 * @param containerW 利用可能な横幅（px、1920×1080 ピクセル座標）
 * @param fontStr    Canvas font 文字列  例: "900 38px 'Noto Sans JP', sans-serif"
 */
export function fitText(text: string, containerW: number, fontStr: string): FitResult {
  const w = measureWidth(text, fontStr);
  if (!w || w <= containerW) return { scaleX: 1, wrap: false };
  const s = containerW / w;
  return s >= MIN_SCALE ? { scaleX: s, wrap: false } : { scaleX: 1, wrap: true };
}

/** fitResult から CSS style オブジェクトを生成する。 */
export function fitStyle(fit: FitResult): React.CSSProperties {
  if (fit.wrap) {
    return { whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible' };
  }
  if (fit.scaleX < 1) {
    return {
      whiteSpace: 'nowrap',
      display: 'inline-block',
      transform: `scaleX(${fit.scaleX.toFixed(4)})`,
      transformOrigin: 'left center',
    };
  }
  return { whiteSpace: 'nowrap' };
}
