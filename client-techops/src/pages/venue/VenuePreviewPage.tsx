// 会場図面 — 仕上がりと書き出し（`/techops/venue-layouts/:id/preview`・PC専用・段D）。
// 設計: docs/design/v4/venue-layout.md §6③。用紙・縮尺・凡例・数量表・通り芯の有無を
// 設定し、紙面プレビュー（`VenuePrintSheet`）を見ながら PNG／PDF を書き出す。
// 出す前の検査3つ（はみ出し・保有数超過・推定寸法）は**止めない**——0件でも
// 「安全」とは書かない（`venuePreflightChecks.ts`・§12-3）。
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Download, ImageDown, Lock, LockOpen, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { computeAutoScale } from "@gmo-onair/shared/src/venue/geometry";
import type { VenueCatalogItem } from "@gmo-onair/shared/src/venue/types";
import * as venueApi from "@/lib/venueApi";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { VENUE_STATUS_LABEL, VENUE_STATUS_BADGE_VARIANT } from "./venueStatus";
import { boundsForArea, boundsForFloor, polygonForArea, axisLinesMm } from "./venueBounds";
import { runVenuePreflightChecks } from "./venuePreflightChecks";
import VenuePreflightChecksPanel from "./VenuePreflightChecksPanel";
import VenuePreviewSettingsPanel, { VENUE_PAPER_SIZES, defaultVenuePreviewSettings, type VenuePreviewSettings } from "./VenuePreviewSettingsPanel";
import VenuePrintSheet, { type VenueQuantityRow } from "./VenuePrintSheet";
import { exportVenuePlanToPng, exportVenueToPdf } from "./venuePreviewExport";

const MM_TO_PX = 96 / 25.4; // CSS の mm は 96px/inch 換算（ManualPreviewPage.tsx と同じ）
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

function buildQuantityRows(items: { key?: string }[], catalog: Record<string, VenueCatalogItem>): VenueQuantityRow[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.key && catalog[item.key]) counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => {
      const cat = catalog[key];
      return { key, label: cat.label, count, qty: cat.qty, storage: cat.storage };
    })
    .sort((a, b) => b.count - a.count);
}

export default function VenuePreviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("qsheet", "manager");

  const detailQuery = useQuery({
    queryKey: ["venue-layouts", "detail", id],
    queryFn: () => venueApi.getVenueLayout(id),
    enabled: !!id,
  });
  const layout = detailQuery.data;

  const floorsQuery = useQuery({ queryKey: ["venue-floors"], queryFn: venueApi.listVenueFloors });
  const catalogQuery = useQuery({ queryKey: ["venue-catalog"], queryFn: venueApi.listVenueCatalog });
  const catalogByKey = useMemo(() => {
    const map: Record<string, VenueCatalogItem> = {};
    for (const c of catalogQuery.data ?? []) map[c.key] = c;
    return map;
  }, [catalogQuery.data]);

  const afterFixChange = () => {
    detailQuery.refetch();
    queryClient.invalidateQueries({ queryKey: ["venue-layouts", "list"] });
  };
  const fixMutation = useMutation({
    mutationFn: () => venueApi.fixVenueLayout(id),
    onSuccess: () => { notifySuccess("確定しました。"); afterFixChange(); },
    onError: () => notifyError("確定できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });
  const unfixMutation = useMutation({
    mutationFn: () => venueApi.unfixVenueLayout(id),
    onSuccess: () => { notifySuccess("確定を解きました。"); afterFixChange(); },
    onError: () => notifyError("確定を解けませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });
  const handleFix = async () => {
    const ok = await confirmAction({
      tone: "danger",
      title: "確定しますか",
      description: "いまの品目の配置で版が固定されます。あとで「確定を解く」を押せば直せます。",
      confirmLabel: "確定する",
    });
    if (ok) fixMutation.mutate();
  };
  const handleUnfix = async () => {
    const nextRev = (layout?.rev ?? 0) + 1;
    const ok = await confirmAction({
      title: "確定を解きますか",
      description: `下書きに戻り、また直せるようになります。次に確定すると版が上がります（rev.${nextRev}）。`,
      confirmLabel: "確定を解く",
    });
    if (ok) unfixMutation.mutate();
  };

  const floor = floorsQuery.data?.find((f) => f.id === layout?.floorId) ?? null;
  const area = floor?.areas.find((a) => a.id === layout?.areaId) ?? null;

  const bounds = useMemo(() => {
    if (area) return boundsForArea(area);
    if (floor) return boundsForFloor(floor.areas, floor.fixtures);
    return null;
  }, [area, floor]);

  const [settings, setSettings] = useState<VenuePreviewSettings>(defaultVenuePreviewSettings());
  const paperSize = VENUE_PAPER_SIZES[settings.paper];
  const headerHeightMm = 12;
  const quantityRows = useMemo(() => (layout ? buildQuantityRows(layout.items, catalogByKey) : []), [layout, catalogByKey]);
  const showQuantity = settings.quantityTable && quantityRows.length > 0;
  const quantityHeightMm = showQuantity ? 34 : 0;
  const marginMm = 10;
  const printableWidthMm = paperSize.widthMm - marginMm * 2;
  const printableHeightMm = paperSize.heightMm - marginMm * 2 - headerHeightMm - quantityHeightMm;

  const scale = useMemo(() => {
    if (!bounds) return 100;
    if (settings.scaleMode !== "auto") return settings.scaleMode;
    return computeAutoScale(bounds.w, bounds.h, printableWidthMm, printableHeightMm);
  }, [bounds, settings.scaleMode, printableWidthMm, printableHeightMm]);

  const checks = useMemo(() => {
    if (!layout) return { overflowing: [], overQty: [], estimated: [] };
    return runVenuePreflightChecks(layout.items, area, floor?.fixtures ?? [], catalogByKey);
  }, [layout, area, floor, catalogByKey]);

  const dateLabel = new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });

  // ── プレビューの縮小表示（`ManualPreviewPage.tsx` と同じ transform: scale() の作法） ──
  const viewportRef = useRef<HTMLDivElement>(null);
  const previewSheetRef = useRef<HTMLDivElement>(null);
  const fitScaleRef = useRef(0.6);
  const [zoom, setZoomState] = useState(0.6);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const fitToWidth = () => {
      const available = el.clientWidth - 32;
      if (available <= 0) return;
      const fit = Math.max(ZOOM_MIN, Math.min(1, available / (paperSize.widthMm * MM_TO_PX)));
      fitScaleRef.current = fit;
      setZoomState(fit);
    };
    fitToWidth();
    const ro = new ResizeObserver(fitToWidth);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.paper]);

  const zoomBy = (delta: number) => setZoomState((s) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s + delta)) * 100) / 100);

  const sheetProps = layout && bounds ? {
    paperWidthMm: paperSize.widthMm,
    paperHeightMm: paperSize.heightMm,
    docNo: layout.docNo,
    rev: layout.rev,
    status: layout.status,
    title: layout.title,
    planLabel: layout.planLabel,
    venueName: floor?.venueName ?? "",
    floorLabel: floor?.floorLabel,
    areaLabel: area?.label ?? "階全体",
    scale,
    dateLabel,
    bounds,
    polygonMm: area ? polygonForArea(area) : undefined,
    fixtures: floor?.fixtures ?? [],
    items: layout.items,
    axisLinesMm: settings.axis ? axisLinesMm(floor?.grid) ?? undefined : undefined,
    showLegend: settings.legend,
    quantityRows: showQuantity ? quantityRows : null,
  } : null;

  const handleExportPdf = () => { if (sheetProps) exportVenueToPdf(sheetProps); };
  const handleExportPng = () => {
    const svg = previewSheetRef.current?.querySelector("svg");
    if (!svg || !layout) return;
    exportVenuePlanToPng(svg, `${layout.docNo ?? layout.title ?? "venue-layout"}.png`);
  };

  const isLoading = detailQuery.isLoading || floorsQuery.isLoading || catalogQuery.isLoading;

  return (
    <PageShell>
      <button
        type="button"
        onClick={() => navigate(`/techops/venue-layouts/${id}`)}
        className="inline-flex min-h-tap w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        会場図面の編集に戻る
      </button>

      {isLoading && (
        <Delayed>
          <SkeletonRows rows={3} />
        </Delayed>
      )}

      {detailQuery.isError && (
        <ErrorPanel title="会場図面を読み込めませんでした" error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      )}

      {layout && sheetProps && (
        <>
          <PageHeader
            title="仕上がりと書き出し"
            sub={
              <span className="flex flex-wrap items-center gap-2">
                {layout.docNo && <span className="font-number">{layout.docNo}</span>}
                <Badge variant={VENUE_STATUS_BADGE_VARIANT[layout.status]}>{VENUE_STATUS_LABEL[layout.status]}</Badge>
                <span>{layout.title}</span>
              </span>
            }
            primaryAction={
              <div className="flex items-center gap-2">
                {canManage && layout.status === "draft" && (
                  <Button variant="outline" className="min-h-tap" onClick={handleFix} disabled={fixMutation.isPending}>
                    <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {fixMutation.isPending ? "確定中…" : "確定する"}
                  </Button>
                )}
                {canManage && layout.status === "fixed" && (
                  <Button variant="outline" className="min-h-tap" onClick={handleUnfix} disabled={unfixMutation.isPending}>
                    <LockOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {unfixMutation.isPending ? "解除中…" : "確定を解く"}
                  </Button>
                )}
                <Button variant="outline" onClick={handleExportPng}>
                  <ImageDown className="mr-1.5 h-4 w-4" aria-hidden="true" />PNGで書き出す
                </Button>
                <Button onClick={handleExportPdf}>
                  <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />PDFで書き出す
                </Button>
              </div>
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sub-sm text-muted-foreground">
                  紙面のプレビュー（{VENUE_PAPER_SIZES[settings.paper].label}・縮尺 1:{scale}）
                </span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => zoomBy(-ZOOM_STEP)} aria-label="縮小">
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <span className="font-number w-10 text-center text-sub-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => zoomBy(ZOOM_STEP)} aria-label="拡大">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setZoomState(fitScaleRef.current)}>
                    幅に合わせる
                  </Button>
                </div>
              </div>

              <div ref={viewportRef} className="max-h-[75vh] min-h-[420px] overflow-auto rounded-card border border-border bg-muted/10 p-4">
                <div
                  style={{ width: `${paperSize.widthMm * zoom}mm`, height: `${paperSize.heightMm * zoom}mm` }}
                  className="relative mx-auto"
                >
                  <div
                    ref={previewSheetRef}
                    style={{ width: `${paperSize.widthMm}mm`, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                    className="bg-white text-foreground shadow"
                  >
                    <VenuePrintSheet {...sheetProps} />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <VenuePreviewSettingsPanel settings={settings} onChange={setSettings} />
              <VenuePreflightChecksPanel checks={checks} />
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
