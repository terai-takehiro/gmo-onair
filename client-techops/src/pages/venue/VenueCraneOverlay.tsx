// 会場図面 — クレーン（TK-53AL 等）のアーム・届く範囲・テールの重ね描き（§11-2）。
// `VenueItemView.tsx` から見た目だけを切り出したもの（1ファイル400行のラチェット対策）。
import type { PointerEvent as ReactPointerEvent } from "react";
import type { VenueCatalogItem } from "@gmo-onair/shared/src/venue/types";

export default function VenueCraneOverlay({
  armAngle, catalog, onArmStart, onArmMove, onArmEnd, strokeMm, rotateMm,
}: {
  armAngle: number;
  catalog?: VenueCatalogItem;
  onArmStart: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onArmMove: (e: ReactPointerEvent<SVGCircleElement>) => void;
  onArmEnd: () => void;
  strokeMm: number;
  rotateMm: number;
}) {
  const extra = catalog?.extra ?? {};
  const arm = Number(extra.armMm ?? extra.arm) || 3200;
  const tail = Number(extra.tailMm ?? extra.tail) || 1300;
  const sweep = Number(extra.sweepRadiusMm ?? catalog?.sizeMm?.sweepRadiusMm) || arm + 600;
  const camD = Number(extra.cameraDepthMm) || 800;
  return (
    <g transform={`rotate(${armAngle})`}>
      <circle cx={0} cy={0} r={sweep} fill="none" stroke="currentColor" strokeOpacity={0.5} strokeDasharray="140 90" strokeWidth={strokeMm} />
      <circle cx={0} cy={0} r={tail} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeDasharray="140 90" strokeWidth={strokeMm} />
      <line x1={0} y1={tail * 0.4} x2={0} y2={-arm} stroke="currentColor" strokeWidth={strokeMm * 26} strokeLinecap="round" />
      <rect x={-camD * 0.22} y={-arm - camD} width={camD * 0.44} height={camD} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={strokeMm * 10} rx={20} />
      <circle
        cx={0} cy={-arm} r={rotateMm * 0.8} fill="#ffffff" stroke="currentColor" strokeWidth={strokeMm * 1.4} style={{ cursor: "grab" }}
        onPointerDown={onArmStart} onPointerMove={onArmMove} onPointerUp={onArmEnd} onPointerCancel={onArmEnd}
      />
    </g>
  );
}
