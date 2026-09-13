// 会場図面 — スマホの閲覧専用画面（設計: docs/design/v4/venue-layout.md §14-5
// 「スマホは閲覧のみ」）。ピンチで見る・品目を押して札を読む・数量表を見るだけで、
// 編集はしない。逃げ先は常に①（一覧）。
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { Delayed, ErrorPanel, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { getVenueLayout, listVenueCatalog, listVenueFloors } from "@/lib/venueApi";
import { computeViewBox } from "./venueBoardMath";
import VenueUnderlay from "./VenueUnderlay";
import { renderVenueSymbolBody } from "./venueSymbols";
import { resolveArea } from "./venueAreaResolve";

export default function VenueEditorMobile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"drawing" | "quantity">("drawing");

  const layoutQuery = useQuery({ queryKey: ["venue-layouts", "detail", id], queryFn: () => getVenueLayout(id), enabled: !!id });
  const floorsQuery = useQuery({ queryKey: ["venue-floors"], queryFn: listVenueFloors });
  const catalogQuery = useQuery({ queryKey: ["venue-catalog"], queryFn: listVenueCatalog });
  const layout = layoutQuery.data;
  const floor = floorsQuery.data?.find((f) => f.id === layout?.floorId);
  const area = floor && layout ? resolveArea(floor, layout) : null;
  const catalogByKey = new Map((catalogQuery.data ?? []).map((c) => [c.key, c]));
  const viewBox = floor && area ? computeViewBox(area.bboxMm, floor, false) : null;

  return (
    <PageShell>
      <button type="button" onClick={() => navigate("/techops/venue-layouts")} className="flex min-h-tap w-fit items-center gap-1.5 text-sub text-muted-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />図面一覧に戻る
      </button>

      {layoutQuery.isLoading && <Delayed><SkeletonRows rows={3} /></Delayed>}
      {layoutQuery.isError && <ErrorPanel title="図面を読み込めませんでした" error={layoutQuery.error} onRetry={() => layoutQuery.refetch()} />}

      {layout && (
        <>
          <div>
            <h1 className="text-h1">{layout.title}</h1>
            <p className="text-note text-muted-foreground">{layout.docNo} ・ {floor?.floorLabel} {area?.label}</p>
          </div>

          <div className="flex h-9 rounded-control border border-border bg-muted/20 p-0.5">
            <button type="button" onClick={() => setTab("drawing")} className={`flex-1 rounded-control text-sub-sm font-bold ${tab === "drawing" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>図面</button>
            <button type="button" onClick={() => setTab("quantity")} className={`flex-1 rounded-control text-sub-sm font-bold ${tab === "quantity" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>数量</button>
          </div>

          {tab === "drawing" && floor && area && viewBox && (
            <div className="overflow-auto rounded-card border border-border">
              <svg
                width={Math.round(viewBox.w * 0.05)}
                height={Math.round(viewBox.h * 0.05)}
                viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
                className="block bg-white"
              >
                <VenueUnderlay floor={floor} area={area} viewBox={viewBox} showWholeFloor={false} showGrid={false} strokeMm={30} />
                {layout.items.map((it) => (
                  <g key={it.id} color="#1a1d24" transform={it.points ? undefined : `translate(${it.x} ${it.y}) rotate(${it.rotation})`}>
                    {it.points ? (
                      <line x1={it.points[0][0]} y1={it.points[0][1]} x2={it.points[1][0]} y2={it.points[1][1]} stroke="currentColor" strokeWidth={16} />
                    ) : (
                      renderVenueSymbolBody(it.key ? catalogByKey.get(it.key)?.symbol : undefined, it.w ?? it.diameter ?? 100, it.d ?? it.diameter ?? 100)
                    )}
                  </g>
                ))}
              </svg>
            </div>
          )}

          {tab === "quantity" && (
            <div className="rounded-card border border-border p-3">
              {Object.entries(countByKey(layout.items)).map(([key, n]) => {
                const cat = catalogByKey.get(key);
                return (
                  <div key={key} className="flex items-center justify-between border-b border-border/60 py-1.5 text-sub">
                    <span>{cat?.label ?? key}</span>
                    <span className="num font-bold">{n} / {cat?.qty ?? "—"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function countByKey(items: { key?: string }[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const it of items) if (it.key) m[it.key] = (m[it.key] ?? 0) + 1;
  return m;
}
