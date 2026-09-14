// 会場図面 — 左パネル「並べ方」タブ（設計: docs/design/v4/venue-layout.md §7）。
// 「入力 → 薄いプレビュー → 追加」の3手。純粋な計算は `shared/src/venue/arrange.ts`
// （触らない・そのまま使う）。入力欄の構成は `../venueArrangeConfig.ts`
// （`VenueInspector` の「並べ直す」と共有する）。
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { VenueCatalogItem, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { translateArrangeResult, type VenueArrangeParams, type VenueArrangePreset } from "@gmo-onair/shared/src/venue/arrange";
import { renderVenueSymbolBody } from "../venueSymbols";
import { genVenueItemId } from "../venueItemOps";
import { ARRANGE_FIELDS, ARRANGE_USED_ITEMS, PRESET_LABEL, computeArrangeResult, serializeArrangeParams, summarizeArrangeResult } from "../venueArrangeConfig";

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

  const result = useMemo(() => computeArrangeResult(preset, params, gridItem, "preview"), [preset, params, gridItem]);
  const summary = summarizeArrangeResult(result, catalogByKey);
  const center = { x: areaBboxMm.x + areaBboxMm.w / 2, y: areaBboxMm.y + areaBboxMm.h / 2 };
  const dx = center.x - result.bbox.w / 2;
  const dy = center.y - result.bbox.h / 2;

  function setField(key: keyof VenueArrangeParams, value: number) {
    setParams((p) => ({ ...p, [key]: value }));
  }

  function place() {
    const groupId = genVenueItemId("grp");
    // grid は品目の選択がステートに別枠（`gridKey`）で持っているため、並べ直す
    // ときに引けるよう `arrange.params.itemKey` として一緒に持たせておく
    const savedParams = serializeArrangeParams(preset === "grid" ? { ...params, itemKey: gridKey } : params);
    const withGroup = { ...result, items: result.items.map((it) => ({ ...it, groupId, arrange: { preset, params: savedParams } })) };
    onPlace(translateArrangeResult(withGroup, dx, dy));
    setParams({});
  }

  // 幅だけで縮尺を決め、高さはそれに追従させる（プレビューの箱を縦にも伸ばせる・
  // 左パネルは overflow-y-auto でスクロールする）。以前は高さも 140 に収めようとしたため、
  // 行数の多い並べ方（劇場形式を目一杯など）ほど幅・高さ両方の制約で二重に縮み、
  // 数が増えるほど品目が見えなくなっていた（幅だけなら実測で最大でも高さ 250 前後に収まる）
  const scale = Math.min(220 / Math.max(result.bbox.w, 1), 0.06);
  const previewHeight = Math.max(90, result.bbox.h * scale);

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
        品目: <strong>{ARRANGE_USED_ITEMS[preset]}</strong>
        {preset === "grid" && (
          <select value={gridKey} onChange={(e) => setGridKey(e.target.value)} className="ml-2 rounded border border-input bg-background px-1 py-0.5 text-[11px]">
            {furniture.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        )}
      </div>

      {ARRANGE_FIELDS[preset].map((f) => (
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
        <svg width="100%" height={previewHeight} viewBox={`0 0 220 ${previewHeight}`} className="block">
          <g transform={`translate(${110 - (result.bbox.w * scale) / 2} ${previewHeight / 2 - (result.bbox.h * scale) / 2}) scale(${scale})`} color="#005bac">
            {result.items.map((it) => (
              <g key={it.id} transform={`translate(${it.x} ${it.y}) rotate(${it.rotation})`}>
                {renderVenueSymbolBody(it.key ? catalogByKey.get(it.key)?.symbol : undefined, it.w ?? it.diameter ?? 100, it.d ?? it.diameter ?? 100)}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <p className={`num text-[10.5px] leading-[1.5] ${summary.isOverStock ? "text-destructive" : "text-muted-foreground"}`}>
        {summary.count} 点 ・ 外接 {Math.round(summary.bbox.w).toLocaleString("ja-JP")} × {Math.round(summary.bbox.h).toLocaleString("ja-JP")} mm
        {summary.isOverStock && "（保有数を超えています。追加は止めません）"}
      </p>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-dashed border-border pt-2.5">
        <Button type="button" disabled={!editable} onClick={place} className="h-9">追加</Button>
        <Button type="button" variant="outline" onClick={() => setParams({})} className="h-8">既定に戻す</Button>
      </div>
    </div>
  );
}
