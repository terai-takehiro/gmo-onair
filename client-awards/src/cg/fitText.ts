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

export interface FitOptions {
  /** true のとき折り返しを行わず scaleX のみで対応（グリッドカード・固定高さ行用） */
  noWrap?: boolean;
  /** CSS の letter-spacing (em)。Canvas 計測には含まれないため幅に加算する */
  letterSpacingEm?: number;
  /** 計測バッファ。Canvas は太字 CJK を過小評価しがちなので既定 1.05 */
  buffer?: number;
}

/**
 * @param text       表示テキスト
 * @param containerW 利用可能な横幅（px、1920×1080 ピクセル座標）
 * @param fontStr    Canvas font 文字列  例: "900 38px 'Noto Sans JP', sans-serif"
 * @param opts       boolean は noWrap の後方互換 (旧シグネチャ)
 */
export function fitText(
  text: string,
  containerW: number,
  fontStr: string,
  opts: boolean | FitOptions = {},
): FitResult {
  const o: FitOptions = typeof opts === 'boolean' ? { noWrap: opts } : opts;
  const buffer = o.buffer ?? 1.05;
  let w = measureWidth(text, fontStr) * buffer;
  if (w && o.letterSpacingEm) {
    const m = fontStr.match(/(\d+(?:\.\d+)?)px/);
    const fontPx = m ? parseFloat(m[1]) : 0;
    w += [...text].length * fontPx * o.letterSpacingEm;
  }
  if (!w || w <= containerW) return { scaleX: 1, wrap: false };
  const s = containerW / w;
  if (o.noWrap || s >= MIN_SCALE) return { scaleX: s, wrap: false };
  return { scaleX: 1, wrap: true };
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
