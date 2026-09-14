// 会場図面 — PC の編集画面本体（設計: docs/design/v4/venue-layout.md §6②）。
// 資料の帯 → 道具の帯 → 3列（左=追加/並べ方/数量・中央=盤・右=品目の設定）。
// `<fieldset disabled={!editable}>` と `guardedCommit` の2か所に編集可否を寄せる
// （`ManualDetailPage.tsx` と同じ関所の作り方）。
import { useCallback, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { Delayed, ErrorPanel, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { useAuth } from "@/hooks/useAuth";
import {
  deleteVenueLayout, fixVenueLayout, getVenueLayout, isConflict, isLockError, listVenueCatalog, listVenueFloors, unfixVenueLayout, updateVenueLayout,
} from "@/lib/venueApi";
import { notifyError } from "@/lib/notify";
import type { VenueCatalogItem, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { useVenueEditLock } from "./hooks/useVenueEditLock";
import { useVenueAutosave } from "./hooks/useVenueAutosave";
import { useVenueHistory } from "./hooks/useVenueHistory";
import { resolveArea } from "./venueAreaResolve";
import { buildCatalogItem, buildShapeItem, nextZ, type ShapeKey } from "./venueItemOps";
import VenueResourceBand from "./VenueResourceBand";
import VenueToolbar from "./VenueToolbar";
import VenueBoard from "./VenueBoard";
import VenuePlacePanel from "./panels/VenuePlacePanel";
import VenueArrangePanel from "./panels/VenueArrangePanel";
import VenueQuantityPanel from "./panels/VenueQuantityPanel";
import VenueInspector from "./panels/VenueInspector";
import DeleteVenueLayoutDialog from "./DeleteVenueLayoutDialog";

type LeftTab = "place" | "arrange" | "quantity";

/** `?return=` は `/techops/` で始まる相対パスだけ受け付ける（§9-4。他は無視して①へ） */
function safeReturnTo(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith("/techops/") ? raw : null;
}

export default function VenueEditorDesktop() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("return"));

  const [tab, setTab] = useState<LeftTab>("place");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showWholeFloor, setShowWholeFloor] = useState(false);

  const layoutQuery = useQuery({ queryKey: ["venue-layouts", "detail", id], queryFn: () => getVenueLayout(id), enabled: !!id });
  const floorsQuery = useQuery({ queryKey: ["venue-floors"], queryFn: listVenueFloors });
  const catalogQuery = useQuery({ queryKey: ["venue-catalog"], queryFn: listVenueCatalog });
  const layout = layoutQuery.data;

  const invalidate = useCallback(() => queryClient.invalidateQueries({ queryKey: ["venue-layouts", "detail", id] }), [queryClient, id]);

  const { currentUser, hasPermission } = useAuth();
  const canEdit = hasPermission("qsheet", "editor");
  const canManage = hasPermission("qsheet", "manager");
  const isFixed = layout?.status === "fixed";
  const lockEnabled = !!layout && canEdit && !isFixed;
  const lock = useVenueEditLock(id, currentUser?.id, lockEnabled);
  const editable = lockEnabled && lock.held;

  const handleSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["venue-layouts", "list"] });
  }, [queryClient]);
  const autosave = useVenueAutosave(layout, handleSaved, invalidate);
  const guardedCommit = useCallback((next: VenueItem[]) => { if (editable) autosave.commitItems(next); }, [editable, autosave]);
  const history = useVenueHistory({ items: autosave.items, onCommit: guardedCommit, limit: 50 });

  const floor = floorsQuery.data?.find((f) => f.id === layout?.floorId);
  const area = useMemo(() => (floor && layout ? resolveArea(floor, layout) : null), [floor, layout]);
  const catalog: VenueCatalogItem[] = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const catalogByKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);

  const titleMutation = useMutation({
    mutationFn: (value: string) => updateVenueLayout(id, { title: value, expected_updated_at: layout?.updatedAt }),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      if (isLockError(err) || isConflict(err)) {
        notifyError("最新の内容を読み込み直します。");
        invalidate();
        return;
      }
      notifyError("名前を保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });
  const fixMutation = useMutation({ mutationFn: () => fixVenueLayout(id), onSuccess: invalidate, onError: () => notifyError("確定できませんでした。") });
  const unfixMutation = useMutation({ mutationFn: () => unfixVenueLayout(id), onSuccess: invalidate, onError: () => notifyError("確定を解けませんでした。") });
  // 一覧側（`VenueListPage.tsx`）の「削除…は編集画面から」の案内どおり、削除はここに置く
  // （`ManualDetailPage.tsx`・`deleteManualMutation` と同じ形）。削除の前に自動保存の
  // 保留分・進行中の送信を待ち切る（レビュー指摘・P1: 待たずに削除すると、進行中の
  // 保存があとから失敗し、自動再送タイマーが unmount を越えて生き残ってしまう）
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await autosave.flushAndWait();
      await deleteVenueLayout(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["venue-layouts", "list"] });
      navigate("/techops/venue-layouts");
    },
    onError: () => {
      setDeleteOpen(false);
      notifyError("会場図面を削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  const placeCenter = () => (area ? { x: area.bboxMm.x + area.bboxMm.w / 2, y: area.bboxMm.y + area.bboxMm.h / 2 } : { x: 0, y: 0 });

  function placeCatalogItem(cat: VenueCatalogItem) {
    const jitter = autosave.items.filter((it) => it.key === cat.key).length;
    const item = buildCatalogItem(cat, placeCenter(), nextZ(autosave.items), jitter);
    history.commit([...autosave.items, item]);
    setSelectedIds([item.id]);
  }
  function placeShape(key: ShapeKey) {
    const item = buildShapeItem(key, placeCenter(), nextZ(autosave.items));
    history.commit([...autosave.items, item]);
    setSelectedIds([item.id]);
  }
  function placeArrangedGroup(items: VenueItem[]) {
    history.commit([...autosave.items, ...items]);
    setSelectedIds(items.map((it) => it.id));
  }

  const loading = layoutQuery.isLoading || floorsQuery.isLoading || catalogQuery.isLoading;

  return (
    <PageShell className="h-full">
      {loading && <Delayed><SkeletonRows rows={4} /></Delayed>}
      {layoutQuery.isError && <ErrorPanel title="図面を読み込めませんでした" error={layoutQuery.error} onRetry={() => layoutQuery.refetch()} />}

      {layout && floor && area && (
        <div className="flex h-full min-h-0 flex-col gap-3">
          <VenueResourceBand
            docNo={layout.docNo} title={layout.title} status={layout.status} saving={autosave.saving}
            canEdit={canEdit} canManage={canManage} editable={editable} lock={lock} returnTo={returnTo}
            onTitleCommit={(v) => titleMutation.mutate(v)}
            onPreview={() => navigate(`/techops/venue-layouts/${id}/preview`)}
            onFix={() => fixMutation.mutate()} onUnfix={() => unfixMutation.mutate()}
            onDelete={() => setDeleteOpen(true)}
          />

          <VenueToolbar
            items={autosave.items} selectedIds={selectedIds} editable={editable} onCommit={history.commit} onPlaceShape={placeShape}
            onUndo={history.undo} onRedo={history.redo} canUndo={history.canUndo} canRedo={history.canRedo}
            showGrid={showGrid} onToggleGrid={() => setShowGrid((v) => !v)}
            showRuler={showRuler} onToggleRuler={() => setShowRuler((v) => !v)}
            snapEnabled={snapEnabled} onToggleSnap={() => setSnapEnabled((v) => !v)}
            zoom={zoom} onZoomChange={setZoom}
            floors={floorsQuery.data ?? []} floor={floor} area={area}
            onAreaChange={(areaId) => updateVenueLayout(id, { area_id: areaId }).then(invalidate)}
            showWholeFloor={showWholeFloor} onToggleWholeFloor={() => setShowWholeFloor((v) => !v)}
          />

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[280px_1fr_260px]">
            <fieldset disabled={!editable} className="contents">
              {/* `min-w-0` が無いと、グリッド項目の自動最小幅は中身の min-content になる
                  （固定 280px を指定していても効かない）。タブの中身（並べ方の品目名・
                  数量タブの列見出しなど）が280pxより広い最小幅を持つと、そのタブを開いた
                  瞬間だけ列が広がり、盤（中央 `1fr`）を含む3列レイアウト全体が動いて見えた */}
              <aside className="flex min-w-0 min-h-0 flex-col rounded-card border border-border bg-card">
                <div className="flex h-9 flex-shrink-0 border-b border-border">
                  {(["place", "arrange", "quantity"] as LeftTab[]).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                      className={`flex-1 border-b-2 text-[12px] font-bold ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
                      {t === "place" ? "追加" : t === "arrange" ? "並べ方" : "数量"}
                    </button>
                  ))}
                </div>
                {tab === "place" && <VenuePlacePanel catalog={catalog} items={autosave.items} editable={editable} onPlace={placeCatalogItem} onPlaceShape={placeShape} />}
                {tab === "arrange" && <VenueArrangePanel catalog={catalog} areaBboxMm={area.bboxMm} editable={editable} onPlace={placeArrangedGroup} />}
                {tab === "quantity" && <VenueQuantityPanel catalog={catalog} items={autosave.items} />}
              </aside>

              <VenueBoard
                floor={floor} area={area} catalogByKey={catalogByKey} items={autosave.items} editable={editable}
                selectedIds={selectedIds} onSelectionChange={setSelectedIds} onCommit={history.commit}
                onUndo={history.undo} onRedo={history.redo}
                showGrid={showGrid} showRuler={showRuler} snapEnabled={snapEnabled} showWholeFloor={showWholeFloor}
                zoom={zoom} onZoomChange={setZoom}
              />

              <aside className="min-h-0 min-w-0 rounded-card border border-border bg-card">
                <VenueInspector floor={floor} area={area} catalog={catalog} items={autosave.items} selectedIds={selectedIds} editable={editable} onCommit={history.commit} onSelectionChange={setSelectedIds} />
              </aside>
            </fieldset>
          </div>

          <DeleteVenueLayoutDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onConfirm={() => deleteMutation.mutate()}
            pending={deleteMutation.isPending}
          />
        </div>
      )}
    </PageShell>
  );
}
