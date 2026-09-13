// 会場図面 — 左パネル「並べる」タブ（設計: docs/design/v4/venue-layout.md §7）。
// 「入力 → 薄いプレビュー → 置く」の3手。純粋な計算は `shared/src/venue/arrange.ts`
// （触らない・そのまま使う）。ここは入力欄の組み立てとプレビューの表示だけを持つ。
//
// ⚠️ v1 の割り切り: `arrange.ts` は「向き先」（客席を任意の点へ向ける）や
// 「起点をつかんで動かす」引数を持たない純粋関数のため、その2つはこの画面には
// 出さない（既定の向き・起点のまま置く。§7 の残りの入力はすべて出す）。
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VenueCatalogItem } from "@gmo-onair/shared/src/venue/types";
import {
  ARRANGE_PRESETS,
  arrangeGrid,
  translateArrangeResult,
  type VenueArrangePreset,
  type VenueArrangeParams,
  type VenueArrangeResult,
} from "@gmo-onair/shared/src/venue/arrange";
import type { VenueItem } from "@gmo-onair/shared/src/venue/types";
import { renderVenueSymbolBody } from "../venueSymbols";
import { genVenueItemId } from "../venueItemOps";

const PRESET_LABEL: Record<VenueArrangePreset, string> = {
  grid: "格子に並べる", theater: "劇場形式", classroom: "スクール形式", island: "島形式",
  round: "円卓", "u-shape": "コの字", "o-shape": "ロの字",
};

interface FieldDef { key: keyof VenueArrangeParams; label: string; step: number; min: number; max: number }
const FIELDS: Record<VenueArrangePreset, FieldDef[]> = {
  grid: [
    { key: "rows", label: "行", step: 1, min: 1, max: 20 }, { key: "cols", label: "列", step: 1, min: 1, max: 20 },
  ],
  theater: [
    { key: "rows", label: "行", step: 1, min: 1, max: 20 }, { key: "cols", label: "列", step: 1, min: 1, max: 24 },
    { key: "pitchXMmTheater", label: "横ピッチ", step: 50, min: 400, max: 1200 }, { key: "pitchYMmTheater", label: "縦ピッチ", step: 50, min: 600, max: 1600 },
    { key: "centerAisleMm", label: "中央通路", step: 100, min: 0, max: 3000 }, { key: "sideAisleMm", label: "脇", step: 100, min: 0, max: 2000 },
    { key: "frontClearanceMm", label: "前の空き", step: 100, min: 0, max: 6000 },
  ],
  classroom: [
    { key: "tablesPerRow", label: "机（列）", step: 1, min: 1, max: 8 }, { key: "rows", label: "行", step: 1, min: 1, max: 10 },
    { key: "chairsPerTable", label: "机1台の椅子", step: 1, min: 1, max: 4 }, { key: "rowPitchMm", label: "行ピッチ", step: 100, min: 900, max: 2400 },
    { key: "centerAisleMm", label: "中央通路", step: 100, min: 0, max: 3000 },
  ],
  island: [
    { key: "islands", label: "島の数", step: 1, min: 1, max: 12 }, { key: "chairsPerSide", label: "片側の椅子", step: 1, min: 1, max: 6 },
    { key: "islandGapMm", label: "島の間", step: 100, min: 500, max: 3000 },
  ],
  round: [
    { key: "chairs", label: "椅子の数", step: 1, min: 2, max: 12 }, { key: "radiusMm", label: "半径", step: 50, min: 300, max: 1500 },
  ],
  "u-shape": [
    { key: "widthTables", label: "幅（机の数）", step: 1, min: 1, max: 8 }, { key: "depthTables", label: "奥行（机の数）", step: 1, min: 0, max: 6 },
    { key: "innerClearanceMm", label: "内側の空き", step: 100, min: 600, max: 4000 },
  ],
  "o-shape": [
    { key: "widthTables", label: "幅（机の数）", step: 1, min: 1, max: 8 }, { key: "depthTables", label: "奥行（机の数）", step: 1, min: 0, max: 6 },
    { key: "innerClearanceMm", label: "内側の空き", step: 100, min: 600, max: 4000 },
  ],
};

const USED_ITEMS: Record<VenueArrangePreset, string> = {
  grid: "選んだ品目", theater: "ルベックチェア", classroom: "長机（白）＋ルベックチェア", island: "長机（白）＋ルベックチェア",
  round: "ハイテーブル＋ハイチェア", "u-shape": "長机（白）＋ルベックチェア", "o-shape": "長机（白）＋ルベックチェア",
};

function computeResult(preset: VenueArrangePreset, params: VenueArrangeParams, gridItem: VenueCatalogItem | undefined, groupId: string): VenueArrangeResult {
  if (preset === "grid") {
    const w = gridItem?.footprint.shape === "rect" ? gridItem.footprint.w : gridItem?.footprint.shape === "circle" ? gridItem.footprint.diameter : 500;
    const d = gridItem?.footprint.shape === "rect" ? gridItem.footprint.d : gridItem?.footprint.shape === "circle" ? gridItem.footprint.diameter : 500;
    return arrangeGrid(gridItem?.key ?? "rubeck-chair", w, d, params, groupId);
  }
  return ARRANGE_PRESETS[preset](params, groupId);
}

interface Props {
  catalog: VenueCatalogItem[];
  areaBboxMm: { x: number; y: number; w: number; h: number };
  editable: boolean;
  onPlace: (items: VenueItem[]) => void;
}

export default function VenueArrangePanel({ catalog, areaBboxMm, editable, onPlace }: Props) {
  const [preset, setPreset] = useState<VenueArrangePreset>("theater");
  const [params, setParams] = useState<VenueArrangeParams>({});
  const furniture = useMemo(() => catalog.filter((c) => c.category === "furniture" && c.footprint.shape !== "none"), [catalog]);
  const [gridKey, setGridKey] = useState<string>(furniture[0]?.key ?? "");
  const gridItem = catalog.find((c) => c.key === gridKey);
  const catalogByKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);

  const result = useMemo(() => computeResult(preset, params, gridItem, "preview"), [preset, params, gridItem]);
  const center = { x: areaBboxMm.x + areaBboxMm.w / 2, y: areaBboxMm.y + areaBboxMm.h / 2 };
  const dx = center.x - result.bbox.w / 2;
  const dy = center.y - result.bbox.h / 2;

  function setField(key: keyof VenueArrangeParams, value: number) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  function place() {
    const groupId = genVenueItemId("grp");
    const withGroup = { ...result, items: result.items.map((it) => ({ ...it, groupId, arrange: { preset, params } })) };
    onPlace(translateArrangeResult(withGroup, dx, dy));
    setParams({});
  }

  const scale = Math.min(220 / Math.max(result.bbox.w, 1), 140 / Math.max(result.bbox.h, 1), 0.06);
  const overStock = Object.entries(result.counts).some(([key, n]) => {
    const c = catalogByKey.get(key);
    return c?.qty != null && n > c.qty;
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto p-3">
      <div>
        <div className="text-[11px] font-bold text-muted-foreground">並べ方</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(PRESET_LABEL) as VenueArrangePreset[]).map((p) => (
            <button key={p} type="button" onClick={() => { setPreset(p); setParams({}); }}
              className={`h-7 rounded-control border px-2.5 text-[11.5px] font-bold ${p === preset ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}>
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-control border border-border px-2.5 py-1.5 text-[11.5px]">
        品目: <strong>{USED_ITEMS[preset]}</strong>
        {preset === "grid" && (
          <select value={gridKey} onChange={(e) => setGridKey(e.target.value)} className="ml-2 rounded border border-input bg-background px-1 py-0.5 text-[11px]">
            {furniture.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        )}
      </div>

      {FIELDS[preset].map((f) => (
        <div key={String(f.key)}>
          <div className="text-[10px] text-muted-foreground">{f.label}</div>
          <div className="mt-0.5 flex h-[30px] items-center overflow-hidden rounded-control border border-input">
            <button type="button" className="h-full w-7 text-sm font-bold" onClick={() => setField(f.key, Math.max(f.min, Number(params[f.key] ?? 0) - f.step))}>−</button>
            <span className="num flex-1 text-center text-xs font-bold">{Number(params[f.key] ?? "") || "既定"}</span>
            <button type="button" className="h-full w-7 text-sm font-bold" onClick={() => setField(f.key, Math.min(f.max, Number(params[f.key] ?? 0) + f.step))}>＋</button>
          </div>
        </div>
      ))}

      <div className="rounded-card border border-border bg-muted/20 p-2">
        <svg width="100%" height={150} viewBox={`0 0 ${220} ${140}`} className="block">
          <g transform={`translate(${110 - (result.bbox.w * scale) / 2} ${70 - (result.bbox.h * scale) / 2}) scale(${scale})`} color="#005bac">
            {result.items.map((it) => (
              <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}>
                {renderVenueSymbolBody(it.key ? catalogByKey.get(it.key)?.symbol : undefined, it.w ?? it.diameter ?? 100, it.d ?? it.diameter ?? 100)}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <p className={`num text-[10.5px] leading-[1.5] ${overStock ? "text-destructive" : "text-muted-foreground"}`}>
        {result.items.length} 点 ・ 外接 {Math.round(result.bbox.w).toLocaleString("ja-JP")} × {Math.round(result.bbox.h).toLocaleString("ja-JP")} mm
        {overStock && "（保有数を超えています。置くのは止めません）"}
      </p>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-dashed border-border pt-2.5">
        <Button type="button" disabled={!editable} onClick={place} className="h-9">置く</Button>
        <Button type="button" variant="outline" onClick={() => setParams({})} className="h-8">既定に戻す</Button>
      </div>
    </div>
  );
}
