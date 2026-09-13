// 自由ブロック「図形」の中身（段B）。矩形・角丸・円・線・矢印・吹き出しの6種
// （production-manual.md §4-3）を素の SVG で描く。塗りはデフォルト無し（枠線のみ）
// — §6-6「インクを使わない組み方」に沿うが、`style["background-color"]` があれば
// 塗る（利用者が後で選べるようにする分は止めない）。線の色・太さは
// `style["border-color"]` / `style["border-width"]`（BlockInspector が書く）。
import { useId } from "react";
import type { ManualShapeContent, ManualShapeKind } from "@gmo-onair/shared/src/opsmanual/types";

interface Props {
  content: ManualShapeContent;
  style: Record<string, string | number>;
}

function readShape(shape: ManualShapeKind, stroke: string, strokeWidth: number, fill: string, arrowMarkerId: string) {
  const common = { stroke, strokeWidth, fill };
  switch (shape) {
    case "rounded-rect":
      return <rect x={strokeWidth / 2} y={strokeWidth / 2} width={100 - strokeWidth} height={100 - strokeWidth} rx={10} ry={10} {...common} />;
    case "ellipse":
      return <ellipse cx={50} cy={50} rx={50 - strokeWidth / 2} ry={50 - strokeWidth / 2} {...common} />;
    case "line":
      return <line x1={2} y1={50} x2={98} y2={50} stroke={stroke} strokeWidth={strokeWidth} />;
    case "arrow":
      return (
        <>
          <defs>
            <marker id={arrowMarkerId} markerWidth={8} markerHeight={8} refX={6} refY={4} orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={stroke} />
            </marker>
          </defs>
          <line x1={2} y1={50} x2={92} y2={50} stroke={stroke} strokeWidth={strokeWidth} markerEnd={`url(#${arrowMarkerId})`} />
        </>
      );
    case "callout":
      return (
        <>
          <rect x={strokeWidth / 2} y={strokeWidth / 2} width={100 - strokeWidth} height={72 - strokeWidth} rx={8} ry={8} {...common} />
          <path d="M20,72 L14,94 L36,72 Z" {...common} />
        </>
      );
    case "rect":
    default:
      return <rect x={strokeWidth / 2} y={strokeWidth / 2} width={100 - strokeWidth} height={100 - strokeWidth} {...common} />;
  }
}

export default function ShapeBlockContent({ content, style }: Props) {
  const arrowMarkerId = `manual-arrow-${useId()}`;
  const stroke = String(style["border-color"] ?? "#0f172a");
  const strokeWidth = Math.max(0.6, (Number(style["border-width"]) || 1) * 1.4);
  const fill = String(style["background-color"] ?? "none");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      {readShape(content.shape, stroke, strokeWidth, fill, arrowMarkerId)}
    </svg>
  );
}
