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

/** fitResult から CSS style オブジェクトを生成する。
 *  origin: scaleX 圧縮の基点。左揃えレイアウトは既定の 'left center'、
 *  中央揃え (textAlign:center) コンテナ内では 'center' を渡すと左偏りを防げる。
 *
 *  origin==='center' のときは inline-block ではなく block + text-align:center で
 *  圧縮する。inline-block は自然幅が親より広い (長文) とオーバーフローの中央寄せが
 *  不安定で、transformOrigin の基点が親中央からずれて「長体になった瞬間に左右へずれる」
 *  原因になる。block + width:100% なら transformOrigin:center が確実に親 (= 写真) の
 *  中央 (50%) を指すため、圧縮しても中央に揃ったままになる。 */
export function fitStyle(fit: FitResult, origin: string = 'left center'): React.CSSProperties {
  if (fit.wrap) {
    return { whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible' };
  }
  if (fit.scaleX < 1) {
    const centered = origin === 'center';
    return {
      whiteSpace: 'nowrap',
      display: centered ? 'block' : 'inline-block',
      ...(centered ? { textAlign: 'center' as const } : {}),
      transform: `scaleX(${fit.scaleX.toFixed(4)})`,
      transformOrigin: origin,
    };
  }
  return { whiteSpace: 'nowrap' };
}
