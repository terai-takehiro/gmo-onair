// 会場図面 — 品目の見下ろしSVGアイコン集。
// 設計: docs/design/v4/venue-layout.md §4-3（絵の規律）。
//
// ⚠️ 線画・単色・薄い塗り・線幅は mm で固定（縮尺に追従するので、どの倍率でも
// 同じ太さに見える）。正面は −y。品目名は絵の中に入れない（札に出す・§4-3）。
// ここは (w, d) mm から絶対座標のパスを組み立てる純粋な描画関数の集まりで、
// 呼び出し側（`VenueItemView`）が `translate(x,y) rotate(rot)` を掛けるだけで
// よい形にしてある——非等方な `scale()` を掛けると線幅が方向によって太さが
// 変わってしまうため、拡縮はしない。
//
// 2点で置く品目（線・寸法線・ベルトパーテーション）は絶対座標の2点をそのまま
// 使うため、ここではなく `VenueItemView.tsx` が直接描く（`points` を参照）。
import type { ReactNode } from "react";

export const SYMBOL_STROKE_MM = 20;

const FP = { fill: "currentColor", fillOpacity: 0.08, stroke: "currentColor", strokeWidth: SYMBOL_STROKE_MM, strokeLinejoin: "round" as const };
const SOFT = { fill: "currentColor", fillOpacity: 0.04, stroke: "currentColor", strokeWidth: SYMBOL_STROKE_MM / 2, strokeOpacity: 0.5 };
const LN = { fill: "none", stroke: "currentColor", strokeWidth: SYMBOL_STROKE_MM, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** 既知の絵記号キー（§4-3。points で置く belt-partition・line・dimension は含まない） */
export type VenueSymbolKey =
  | "table" | "chair" | "round-table" | "stool" | "stage" | "monitor" | "box" | "lectern" | "sign" | "easel"
  | "partition" | "hanger-rack" | "mirror" | "cart" | "pedestal" | "crane" | "dolly"
  | "person-standing" | "person-seated" | "wheelchair" | "generic-rect" | "generic-circle";

/** 品目1個の見下ろし絵。`w`/`d` は mm（丸は `w` を直径として扱う） */
export function renderVenueSymbolBody(symbol: string | undefined, w: number, d: number): ReactNode {
  const hw = w / 2;
  const hd = d / 2;
  const rx = Math.min(hw, hd) * 0.16;
  switch (symbol as VenueSymbolKey) {
    case "table":
      return <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx} />;
    case "chair":
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx} />
          {/* 背もたれ（正面 −y の反対側＝ +y 寄りの弧） */}
          <path {...LN} d={`M ${-hw * 0.42} ${hd * 0.4} Q 0 ${hd * 0.53} ${hw * 0.42} ${hd * 0.4}`} />
        </>
      );
    case "round-table":
      return (
        <>
          <circle {...FP} cx={0} cy={0} r={hw} />
          <circle fill="currentColor" cx={0} cy={0} r={Math.max(hw * 0.08, 12)} />
        </>
      );
    case "stool":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} rx={rx * 1.4} />
          <circle {...FP} cx={0} cy={0} r={Math.min(hw, hd) * 0.86} />
        </>
      );
    case "stage":
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} />
          <path fill="none" stroke="currentColor" strokeWidth={SYMBOL_STROKE_MM / 2} strokeOpacity={0.5} d={`M ${-hw} ${-hd} L ${hw} ${hd} M ${hw} ${-hd} L ${-hw} ${hd}`} />
        </>
      );
    case "monitor":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} rx={rx} />
          <rect {...FP} x={-hw * 0.97} y={hd * -0.34} width={w * 0.94} height={d * 0.24} />
          <path fill="currentColor" d={`M ${-hw * 0.14} ${hd * -0.4} L ${hw * 0.14} ${hd * -0.4} L 0 ${hd * -0.86} Z`} />
        </>
      );
    case "box":
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx * 0.5} />
          <path fill="none" stroke="currentColor" strokeWidth={SYMBOL_STROKE_MM / 2} strokeOpacity={0.6} d={`M ${-hw} 0 L ${hw} 0`} />
        </>
      );
    case "lectern":
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} />
          <path {...LN} strokeWidth={SYMBOL_STROKE_MM * 1.3} d={`M ${-hw * 0.86} ${-hd} L ${hw * 0.86} ${-hd}`} />
        </>
      );
    case "sign":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} rx={rx} />
          <rect {...FP} x={-hw * 0.55} y={-hd * 0.55} width={w * 1.1 * 0.5} height={d * 1.1 * 0.5} />
        </>
      );
    case "easel":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} rx={Math.min(hw, hd)} />
          <circle {...FP} cx={0} cy={0} r={Math.min(hw, hd) * 0.6} />
        </>
      );
    case "partition":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} />
          <path {...LN} strokeWidth={SYMBOL_STROKE_MM * 1.3} d={`M ${-hw} 0 L ${hw} 0`} />
        </>
      );
    case "hanger-rack":
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx} />
          <path fill="none" stroke="currentColor" strokeWidth={SYMBOL_STROKE_MM / 2} strokeOpacity={0.6} d={`M ${-hw * 0.7} ${-hd * 0.4} L ${hw * 0.7} ${-hd * 0.4} M ${-hw * 0.7} ${hd * 0.4} L ${hw * 0.7} ${hd * 0.4}`} />
        </>
      );
    case "mirror":
      return <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx * 2} />;
    case "cart":
    case "dolly":
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx} />
          <circle fill="currentColor" cx={-hw * 0.78} cy={-hd * 0.82} r={Math.min(w, d) * 0.05} />
          <circle fill="currentColor" cx={hw * 0.78} cy={-hd * 0.82} r={Math.min(w, d) * 0.05} />
          <circle fill="currentColor" cx={-hw * 0.78} cy={hd * 0.82} r={Math.min(w, d) * 0.05} />
          <circle fill="currentColor" cx={hw * 0.78} cy={hd * 0.82} r={Math.min(w, d) * 0.05} />
        </>
      );
    case "pedestal":
      return (
        <>
          <circle {...FP} cx={0} cy={0} r={hw} />
          <circle fill="currentColor" cx={0} cy={-hw * 0.82} r={hw * 0.08} />
          <circle fill="currentColor" cx={hw * 0.71} cy={hw * 0.41} r={hw * 0.08} />
          <circle fill="currentColor" cx={-hw * 0.71} cy={hw * 0.41} r={hw * 0.08} />
        </>
      );
    case "crane":
      // 台車の足元だけ（アーム・届く範囲は VenueItemView が extra 値から重ねて描く）
      return (
        <>
          <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx} />
          <circle fill="currentColor" cx={0} cy={hd * 0.3} r={Math.min(w, d) * 0.07} />
        </>
      );
    case "person-standing":
      return (
        <>
          <circle {...FP} cx={0} cy={-hd * 0.65} r={hw * 0.55} />
          <rect {...SOFT} x={-hw} y={-hd * 0.2} width={w} height={d * 1.2} rx={hw * 0.6} />
        </>
      );
    case "person-seated":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} rx={hw * 0.5} />
          <ellipse {...FP} cx={0} cy={hd * 0.25} rx={hw * 0.9} ry={hd * 0.38} />
          <circle {...FP} cx={0} cy={hd * 0.1} r={hw * 0.36} />
        </>
      );
    case "wheelchair":
      return (
        <>
          <rect {...SOFT} x={-hw} y={-hd} width={w} height={d} rx={hw * 0.3} />
          <path {...LN} d={`M ${-hw * 0.85} ${-hd * 0.4} L ${-hw * 0.85} ${hd * 0.55} M ${hw * 0.85} ${-hd * 0.4} L ${hw * 0.85} ${hd * 0.55}`} />
          <ellipse {...FP} cx={0} cy={hd * 0.15} rx={hw * 0.55} ry={hd * 0.32} />
        </>
      );
    case "generic-circle":
      return <circle {...FP} cx={0} cy={0} r={hw} />;
    case "generic-rect":
    default:
      return <rect {...FP} x={-hw} y={-hd} width={w} height={d} rx={rx} />;
  }
}
