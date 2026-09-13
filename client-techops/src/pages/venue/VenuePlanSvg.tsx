// 会場図面の線画（③仕上がり・運営マニュアルの `venue.layout` と共通の考え方）を
// 純粋な SVG で描く。設計: docs/design/v4/venue-layout.md §4-7「線で示す・面で塗らない」・
// §8-6「紙の1mバーは消せない」。**下敷き画像は使わない**（③・冊子とも線画だけ・§9-3）。
//
// mm を唯一の単位にする（§8-7）— `viewBox` を mm にし、px は一切計算しない。
// 品目の俯瞰記号（椅子・机…の実際のアイコン）は編集盤 `VenueBoard`（別担当）の領分なので、
// ここでは「線で示す」という規律だけ守った簡易な図形（矩形・円・折れ線）で描く。
import { useId, useMemo } from "react";
import type { VenueFixture, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { itemFootprintSize } from "@gmo-onair/shared/src/venue/geometry";

const KIND_COLOR: Record<string, string> = {
  catalog: "#005bac",
  camera: "#7c3aed",
  person: "#c2410e",
  shape: "#5d6470",
  text: "#5d6470",
  line: "#5d6470",
  dimension: "#9aa1ab",
};

const KIND_LABEL: Record<string, string> = {
  catalog: "備品",
  camera: "カメラ",
  person: "人",
  shape: "図形",
  text: "文字",
  line: "線",
  dimension: "寸法線",
};

export interface VenueBounds { x: number; y: number; w: number; h: number }

interface Props {
  bounds: VenueBounds;
  /** エリアの内法（無ければ外形は描かない＝階全体） */
  polygonMm?: [number, number][];
  fixtures?: VenueFixture[];
  items: VenueItem[];
  /** 通り芯（任意）。X/Y の座標(mm)の配列 */
  axisLinesMm?: { x: number[]; y: number[] };
  /** 1mバー（既定 1000mm）。書き出しでは常に描く（§8-6） */
  scaleBarMm?: number;
  showLegend?: boolean;
  className?: string;
  /**
   * 指定した縮尺で印刷したときの実寸（紙面上の mm）。渡すと `<svg>` の width/height を
   * この値に固定する（`bounds` の mm を `1/縮尺` に縮めて描く＝本当の縮尺表示）。
   * 省略時は親要素いっぱいに広げる（運営マニュアルへの差し込みなど、紙の実寸を
   * 気にしない使い方向け）。レビュー指摘（P1）: これが無いと `VenuePrintSheet.tsx` が
   * 縮尺の値に関わらず常に版面いっぱいに引き伸ばして描いてしまい、「1:50」も「1:400」も
   * 同じ大きさの図が出て、印刷物から実寸を測ると必ず食い違う。
   */
  renderWidthMm?: number;
  renderHeightMm?: number;
}

function ItemShape({ item, unit }: { item: VenueItem; unit: number }) {
  const color = KIND_COLOR[item.kind] ?? "#5d6470";
  const stroke = Math.max(unit * 0.06, 2);

  if (item.points && item.points.length >= 2) {
    return (
      <polyline
        points={item.points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={item.kind === "dimension" ? `${unit * 0.3} ${unit * 0.2}` : undefined}
      />
    );
  }
  if (item.kind === "text") {
    return (
      <text x={item.x} y={item.y} fontSize={unit * 1.6} fill={color} textAnchor="middle" dominantBaseline="middle">
        {item.label ?? ""}
      </text>
    );
  }
  if (typeof item.diameter === "number") {
    return (
      <circle
        cx={item.x}
        cy={item.y}
        r={item.diameter / 2}
        fill={`${color}1a`}
        stroke={color}
        strokeWidth={stroke}
      />
    );
  }
  const { w, d } = itemFootprintSize(item);
  return (
    <rect
      x={-w / 2}
      y={-d / 2}
      width={w}
      height={d}
      fill={`${color}1a`}
      stroke={color}
      strokeWidth={stroke}
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation || 0})`}
    />
  );
}

/** 1mバー（§8-6「消せない」）。右下・目盛りつき */
function ScaleBar({ bounds, lengthMm, unit }: { bounds: VenueBounds; lengthMm: number; unit: number }) {
  const margin = unit * 2.5;
  const x2 = bounds.x + bounds.w - margin;
  const x1 = x2 - lengthMm;
  const y = bounds.y + bounds.h - margin;
  const tick = unit * 0.6;
  const stroke = Math.max(unit * 0.08, 2);
  const label = lengthMm >= 1000 ? `${lengthMm / 1000}m` : `${lengthMm}mm`;
  return (
    <g stroke="#1a1d24" strokeWidth={stroke} fill="none">
      <line x1={x1} y1={y} x2={x2} y2={y} />
      <line x1={x1} y1={y - tick} x2={x1} y2={y + tick} />
      <line x1={x2} y1={y - tick} x2={x2} y2={y + tick} />
      <text x={(x1 + x2) / 2} y={y - tick - unit * 0.4} fontSize={unit * 1.4} fill="#1a1d24" stroke="none" textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

export default function VenuePlanSvg({
  bounds, polygonMm, fixtures = [], items, axisLinesMm, scaleBarMm = 1000, showLegend = true, className,
  renderWidthMm, renderHeightMm,
}: Props) {
  const clipId = useId();
  const unit = Math.max(1, Math.max(bounds.w, bounds.h) / 100);

  const usedKinds = useMemo(() => Array.from(new Set(items.map((i) => i.kind))).filter((k) => k !== "group"), [items]);
  const fixedSize = typeof renderWidthMm === "number" && typeof renderHeightMm === "number";

  return (
    <svg
      viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
      preserveAspectRatio="xMidYMid meet"
      className={fixedSize ? undefined : className}
      style={fixedSize ? { width: `${renderWidthMm}mm`, height: `${renderHeightMm}mm`, flexShrink: 0 } : undefined}
      role="img"
      aria-label="会場図面"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {/* 通り芯（任意） */}
        {axisLinesMm && (
          <g stroke="#c2410e" strokeWidth={Math.max(unit * 0.02, 0.5)} strokeDasharray={`${unit * 0.8} ${unit * 0.15} ${unit * 0.08} ${unit * 0.15}`}>
            {axisLinesMm.x.map((x) => (
              <line key={`ax-${x}`} x1={x} y1={bounds.y} x2={x} y2={bounds.y + bounds.h} />
            ))}
            {axisLinesMm.y.map((y) => (
              <line key={`ay-${y}`} x1={bounds.x} y1={y} x2={bounds.x + bounds.w} y2={y} />
            ))}
          </g>
        )}

        {/* エリアの内法（§4-7「線で示す・面で塗らない」） */}
        {polygonMm && polygonMm.length >= 3 && (
          <polygon
            points={polygonMm.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="#1a1d24"
            strokeWidth={Math.max(unit * 0.1, 3)}
          />
        )}

        {/* 固定物。白抜き（塗らない）— トラス脚は柱記号として同じ規律で描く（§4-7） */}
        {fixtures.filter((f) => !!f.bboxMm).map((f) => (
          <rect
            key={f.key}
            x={f.bboxMm!.x}
            y={f.bboxMm!.y}
            width={f.bboxMm!.w}
            height={f.bboxMm!.h}
            fill="none"
            stroke="#9aa1ab"
            strokeWidth={Math.max(unit * 0.06, 2)}
            strokeDasharray={f.kind === "truss" || f.kind === "wall" ? undefined : `${unit * 0.4} ${unit * 0.2}`}
          />
        ))}

        {/* 品目（線画・単色・薄い塗り・§4-3） */}
        {items.filter((i) => i.kind !== "group").map((item) => <ItemShape key={item.id} item={item} unit={unit} />)}

        <ScaleBar bounds={bounds} lengthMm={scaleBarMm} unit={unit} />
      </g>

      {showLegend && usedKinds.length > 0 && (
        <g transform={`translate(${bounds.x + unit}, ${bounds.y + unit})`}>
          {usedKinds.map((kind, i) => (
            <g key={kind} transform={`translate(0, ${i * unit * 1.8})`}>
              <rect width={unit} height={unit} fill={`${KIND_COLOR[kind] ?? "#5d6470"}1a`} stroke={KIND_COLOR[kind] ?? "#5d6470"} strokeWidth={unit * 0.08} />
              <text x={unit * 1.4} y={unit * 0.85} fontSize={unit * 1.2} fill="#3c424c">{KIND_LABEL[kind] ?? kind}</text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
