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
  /** 計測バッファ。Canvas は太字 CJK を過小評価しがちなので既定 1.08
   *  (overflow:hidden の FitLine で長体が僅かに切れるのを防ぐため少し多めに見積もる) */
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
  const buffer = o.buffer ?? 1.08;
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

/** fitResult から CSS style オブジェクトを生成する (左揃えレイアウト用)。
 *  origin: scaleX 圧縮の基点 (既定 'left center')。
 *
 *  注意: 中央揃えで圧縮 (長体) する場合は inline-block / block + text-align:center だと
 *  自然幅が親より広い長文でオーバーフローの中央寄せが不安定になり「長体になった瞬間に
 *  左右へずれる」。中央揃えが必要なときは fitStyle ではなく `<FitLine>` (flex 中央寄せ +
 *  内側 span に中央基点 scaleX) を使うこと。 */
export function fitStyle(fit: FitResult, origin: string = 'left center'): React.CSSProperties {
  if (fit.wrap) {
    return { whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible' };
  }
  if (fit.scaleX < 1) {
    return {
      whiteSpace: 'nowrap',
      display: 'inline-block',
      transform: `scaleX(${fit.scaleX.toFixed(4)})`,
      transformOrigin: origin,
    };
  }
  return { whiteSpace: 'nowrap' };
}
