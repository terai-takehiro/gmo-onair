import type { CSSProperties } from 'react';
import type { FitResult } from '../fitText';

interface Props {
  text: string;
  fit: FitResult;
  /** フォント・色・letter-spacing 等の見た目スタイル (内側 span に適用) */
  style?: CSSProperties;
  /** 行の上下マージン等 (外側ラッパに適用) */
  wrapperStyle?: CSSProperties;
}

/**
 * 中央揃え専用の「長体 (scaleX) フィット行」。
 *
 * これまで `fitStyle` は圧縮時に inline-block / block + text-align:center に切り替えて
 * いたが、テキストの自然幅が親より広い長文では CSS のオーバーフロー中央寄せが
 * ブラウザ依存で不安定 → `transformOrigin:center` の基点が親中央からずれ、
 * 「長体になった瞬間に左右へずれる」原因になっていた。
 *
 * 本コンポーネントは **flex (`justify-content:center`) で内側 span を中央寄せ** し、
 * その span に `scaleX` を `transform-origin:center` で適用する。flex の中央寄せは
 * オーバーフローしても左右対称で確実なため、内側 span の中心 = ラッパ中心 = 親中心 を
 * 常に指し、圧縮率がいくつでも中央に揃ったままになる。
 *
 * letter-spacing の末尾アキ (最後の文字の後ろに付く分) による僅かな左寄りは、
 * span に同量の paddingLeft を与えて相殺する (style 側で letterSpacing 指定時)。
 */
export default function FitLine({ text, fit, style, wrapperStyle }: Props) {
  // 折り返し (極端な長文): 通常の中央寄せブロック
  if (fit.wrap) {
    return (
      <div
        style={{
          ...wrapperStyle,
          ...style,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          textAlign: 'center',
        }}
      >
        {text}
      </div>
    );
  }

  // letter-spacing の末尾アキ相殺 (中央寄せ時に半文字ぶん左へ寄るのを補正)
  const ls = style?.letterSpacing;
  const compensate: CSSProperties =
    typeof ls === 'string' && ls.endsWith('em') ? { paddingLeft: ls } : {};

  return (
    <div
      style={{
        ...wrapperStyle,
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        maxWidth: '100%',
      }}
    >
      <span
        style={{
          ...style,
          ...compensate,
          flex: '0 0 auto',
          whiteSpace: 'nowrap',
          transform: fit.scaleX < 1 ? `scaleX(${fit.scaleX.toFixed(4)})` : undefined,
          transformOrigin: 'center center',
        }}
      >
        {text}
      </span>
    </div>
  );
}
