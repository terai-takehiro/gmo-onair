// 会場図面 — 盤の下敷き・方眼・通り芯・エリアの内法・固定物（重なりは下から
// この順。設計: docs/design/v4/venue-layout.md §6②・§4-7）。
// `VenueBoard.tsx` の `<svg viewBox="mm">` の中にそのまま置ける SVG 断片を返す
// だけの純粋な描画コンポーネント（1ファイル400行のラチェット対策の分割）。
//
// ⚠️ 下敷きは `<image>` に mm 単位の x/y/width/height を渡すだけで置ける
// （§8-3の式 `px=(mm-originMm)×pxPerMm` の逆＝ `mm = px / pxPerMm`）。
// X/Y で縮尺が違っても、mm 空間の中で画像だけが伸縮するので品目側は何も
// 補正しなくてよい。
import type { VenueArea, VenueFixture, VenueFloor } from "@gmo-onair/shared/src/venue/types";
import type { ViewBoxMm } from "./venueBoardMath";

interface Props {
  floor: VenueFloor;
  area: VenueArea;
  viewBox: ViewBoxMm;
  showWholeFloor: boolean;
  showGrid: boolean;
  strokeMm: number;
}

const AXIS_COLOR = "#c7243a";

export default function VenueUnderlay({ floor, area, viewBox, showWholeFloor, showGrid, strokeMm }: Props) {
  const underlay = area.underlay ?? floor.underlay;
  const fixtures = showWholeFloor ? floor.fixtures : floor.fixtures.filter((f) => !f.area || f.area === area.key);
  const gridStep = 1000; // 1m 方眼（§6②「方眼と通り芯」）

  return (
    <>
      {underlay && (
        <image
          // レビュー指摘（P1）: `underlay.file`（`/venue/floor-26f.png` のようなアプリ内
          // 相対パス。migration 299）に、ここでさらに `/venue/` を足していたため
          // `/venue//venue/floor-26f.png` になり常に404だった。加えて、この画像は
          // Vite の `public/`（`client-techops/public/venue/…`）に置くため、実際に
          // 配信されるURLは `vite.config.ts` の `base: '/techops/'` を経由する
          // （サーバーは client-techops/dist を `/techops` と `/qsheet` の二重マウント。
          // `server/src/app.ts`）。素の絶対パスのままだとどちらのマウントからも外れるので
          // `import.meta.env.BASE_URL` を必ず経由する。
          href={`${import.meta.env.BASE_URL}${underlay.file.replace(/^\//, '')}`}
          x={underlay.originMm.x}
          y={underlay.originMm.y}
          width={underlay.widthPx / underlay.pxPerMmX}
          height={underlay.heightPx / underlay.pxPerMmY}
          opacity={0.58}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      )}

      {showGrid && (
        <>
          <defs>
            <pattern id="venue-grid-1m" patternUnits="userSpaceOnUse" width={gridStep} height={gridStep}>
              <path d={`M ${gridStep} 0 L 0 0 L 0 ${gridStep}`} fill="none" stroke="#005bac" strokeOpacity={0.12} strokeWidth={strokeMm} />
            </pattern>
            <pattern id="venue-grid-5m" patternUnits="userSpaceOnUse" width={gridStep * 5} height={gridStep * 5}>
              <path d={`M ${gridStep * 5} 0 L 0 0 L 0 ${gridStep * 5}`} fill="none" stroke="#005bac" strokeOpacity={0.22} strokeWidth={strokeMm} />
            </pattern>
          </defs>
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#venue-grid-1m)" pointerEvents="none" />
          <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#venue-grid-5m)" pointerEvents="none" />
        </>
      )}

      {/* 通り芯（6,400ピッチ）。x[]/y[] のラベルに対応する位置は総延長を等分して求める */}
      {axisPositions(floor).map((a) => (
        <line
          key={`${a.axis}-${a.label}`}
          x1={a.axis === "x" ? a.pos : viewBox.x} y1={a.axis === "x" ? viewBox.y : a.pos}
          x2={a.axis === "x" ? a.pos : viewBox.x + viewBox.w} y2={a.axis === "x" ? viewBox.y + viewBox.h : a.pos}
          stroke={AXIS_COLOR} strokeOpacity={0.4} strokeWidth={strokeMm} strokeDasharray={`${strokeMm * 4} ${strokeMm * 2.4}`}
          pointerEvents="none"
        />
      ))}

      {/* エリアの内法（薄い塗り） */}
      <polygon
        points={(area.polygonMm.length >= 3 ? area.polygonMm : bboxPolygon(area.bboxMm)).map(([x, y]) => `${x},${y}`).join(" ")}
        fill="#005bac" fillOpacity={0.035} stroke="#005bac" strokeOpacity={0.55} strokeWidth={strokeMm * 1.3}
      />

      {/* 固定物: トラス脚などは白抜きの柱記号で残し、横の黒い矩形は下敷き取り込み時に消し込む（§4-7） */}
      {fixtures.map((f) => renderFixture(f, strokeMm))}
    </>
  );
}

function bboxPolygon(b: { x: number; y: number; w: number; h: number }): [number, number][] {
  return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
}

function renderFixture(f: VenueFixture, strokeMm: number) {
  if (f.bboxMm) {
    return (
      <rect
        key={f.key} x={f.bboxMm.x} y={f.bboxMm.y} width={f.bboxMm.w} height={f.bboxMm.h}
        fill={f.kind === "wall" ? "#1a1d24" : "#ffffff"} fillOpacity={f.kind === "wall" ? 1 : 0.6}
        stroke="#1a1d24" strokeOpacity={0.7} strokeWidth={strokeMm} pointerEvents="none"
      />
    );
  }
  return null;
}

/** 通り芯ラベル（`grid.x`/`grid.y`）の絶対 mm 位置。等ピッチ（`pitchMm`）で並ぶ前提（§10-1） */
function axisPositions(floor: VenueFloor): { axis: "x" | "y"; label: string; pos: number }[] {
  const pitch = floor.grid?.pitchMm || 0;
  if (!pitch) return [];
  const xs = (floor.grid.x ?? []).map((label, i) => ({ axis: "x" as const, label, pos: i * pitch }));
  const ys = (floor.grid.y ?? []).map((label, i) => ({ axis: "y" as const, label, pos: i * pitch }));
  return [...xs, ...ys];
}
