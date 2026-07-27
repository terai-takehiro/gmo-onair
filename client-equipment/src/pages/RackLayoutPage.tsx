import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Server, ClipboardCheck, Pencil, RefreshCw, AlertCircle, Printer } from "lucide-react";
import { RACK_SLOT_OPTIONS, TYPE_BG } from "@/lib/constants";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

import {
  loadRackConfigs, saveRackConfigs,
  type CellConfig, type RackConfig,
} from './rackLayout/config';
import { RackSubtitleDialog, CellConfigDialog } from './rackLayout/dialogs';
import { RackDisplay, ItemTooltip } from './rackLayout/RackDisplay';
import { PrintRackArea } from './rackLayout/print';

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RackLayoutPage({ embedded }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();

  // URL search params でビュー状態を管理（戻るボタンで復元される）
  const side = (sp.get("side") as "front" | "back") ?? "front";
  const branchFilter = sp.get("branch") ?? "all";
  const rackTypeFilter = sp.get("rackType") ?? "rt-rack";

  const setSide = (v: "front" | "back") =>
    setSp(prev => { const n = new URLSearchParams(prev); n.set("side", v); return n; }, { replace: true });
  const setBranchFilter = (v: string) =>
    setSp(prev => { const n = new URLSearchParams(prev); n.set("branch", v); return n; }, { replace: true });
  const setRackTypeFilter = (v: string) =>
    setSp(prev => { const n = new URLSearchParams(prev); n.set("rackType", v); return n; }, { replace: true });

  const [inventoryMode, setInventoryMode] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string>("");
  const [inventoryNotice, setInventoryNotice] = useState<string>("");
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevCheckIdRef = useRef<string>("");

  // Display edit mode
  const [displayEditMode, setDisplayEditMode] = useState(false);
  const [configTarget, setConfigTarget] = useState<any>(null);
  const [rackConfigs, setRackConfigs] = useState<Record<string, RackConfig>>(loadRackConfigs);
  const [rackSubtitleTarget, setRackSubtitleTarget] = useState<{ locationId: string; config: RackConfig } | null>(null);

  // Overlap conflict dialog
  const [overlapDialog, setOverlapDialog] = useState<{ items: any[]; pos: number; slot: string } | null>(null);

  // Hover tooltip state
  const [tooltip, setTooltip] = useState<{ item: any; x: number; y: number } | null>(null);
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleItemHover = useCallback((item: any, e: React.MouseEvent) => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    // currentTarget は React の synthetic event 後に null になるので先にキャプチャ
    const el = e.currentTarget as HTMLElement;
    tooltipTimeout.current = setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setTooltip({ item, x: rect.right + 8, y: rect.top });
    }, 300);
  }, []);

  const handleItemLeave = useCallback(() => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip(null);
  }, []);

  useEffect(() => () => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); }, []);

  // Blank panel dialog state
  const [blankDialog, setBlankDialog] = useState<{ locationId: string; uPos: number } | null>(null);
  const [blankForm, setBlankForm] = useState({ rack_height: "1", rack_slot: "full", panel_type: "blank", label: "" });
  const [confirmDeleteBlankId, setConfirmDeleteBlankId] = useState<string | null>(null);

  const { data: racksData, isLoading: racksLoading, isError: racksError } = useQuery({
    queryKey: ["equipment-racks"],
    queryFn: async () => (await api.get("/equipment/racks")).data.data,
  });

  const { data: colorsData } = useQuery({
    queryKey: ["equipment-colors"],
    queryFn: async () => (await api.get("/equipment/colors")).data.data,
  });

  const { data: branchesData } = useQuery({
    queryKey: ["equipment-branches"],
    queryFn: async () => (await api.get("/equipment/branches")).data.data,
  });

  const { data: rackTypesData } = useQuery({
    queryKey: ["equipment-rack-types"],
    queryFn: async () => (await api.get("/equipment/rack-types")).data.data,
  });

  const { data: inventoryChecksData } = useQuery({
    queryKey: ["equipment-inventory-checks"],
    queryFn: async () => (await api.get("/equipment/inventory-checks")).data.data,
  });

  const { data: inventoryDetail } = useQuery({
    queryKey: ["equipment-inventory-check-detail", selectedCheckId],
    queryFn: async () => (await api.get(`/equipment/inventory-checks/${selectedCheckId}`)).data.data,
    enabled: !!selectedCheckId && inventoryMode,
  });

  const racks: any[] = racksData ?? [];
  const colors: any[] = colorsData ?? [];
  const branches: any[] = branchesData ?? [];
  const rackTypes: any[] = rackTypesData ?? [];

  // ブランチデータロード後に「GMOサムライスタジオ用賀」(旧 GMOグローバルスタジオ) を自動選択（URLパラメータ未設定時のみ）
  const branchDefaultApplied = useRef(false);
  useEffect(() => {
    if (branchDefaultApplied.current || sp.get("branch") || branches.length === 0) return;
    const gls = branches.find((b: any) => /GMO|グローバル|サムライ|用賀|GLS/i.test(b.name));
    const defaultId = gls?.id ?? branches[0]?.id;
    if (defaultId) {
      branchDefaultApplied.current = true;
      setSp(prev => { const n = new URLSearchParams(prev); n.set("branch", defaultId); return n; }, { replace: true });
    }
  }, [branches]);

  // localStorage → サーバー移行（v1.1.18以前の cell display configs を一回だけ移行）
  const lsMigrationDone = useRef(false);
  useEffect(() => {
    if (lsMigrationDone.current || !racksData) return;
    lsMigrationDone.current = true;
    const lsRaw = localStorage.getItem("rack-cell-configs-v1");
    if (!lsRaw) return;
    let oldConfigs: Record<string, CellConfig> = {};
    try { oldConfigs = JSON.parse(lsRaw); } catch { return; }
    if (Object.keys(oldConfigs).length === 0) { localStorage.removeItem("rack-cell-configs-v1"); return; }
    const allItems: any[] = racksData.flatMap((r: any) => r.items ?? []);
    const toMigrate = allItems.filter((it: any) => it.display_config == null && oldConfigs[it.id]);
    if (toMigrate.length === 0) { localStorage.removeItem("rack-cell-configs-v1"); return; }
    Promise.all(
      toMigrate.map((it: any) => api.patch(`/equipment/items/${it.id}`, { display_config: oldConfigs[it.id] }))
    ).then(() => {
      localStorage.removeItem("rack-cell-configs-v1");
      qc.invalidateQueries({ queryKey: ["equipment-racks"] });
    }).catch(() => { lsMigrationDone.current = false; });
  }, [racksData]);
  const inventoryChecks: any[] = (inventoryChecksData ?? []).filter(
    (c: any) => c.status === "draft" || c.status === "in_progress"
  );

  const inventoryMap = useMemo(() => {
    if (!inventoryDetail?.items) return {};
    const m: Record<string, { id: string; found: boolean }> = {};
    for (const item of inventoryDetail.items) {
      m[item.equipment_id] = { id: item.id, found: item.found === 1 };
    }
    return m;
  }, [inventoryDetail]);

  const totalChecked = useMemo(() => Object.values(inventoryMap).filter((v) => v.found === true).length, [inventoryMap]);
  const totalItems = Object.keys(inventoryMap).length;

  const toggleFoundMutation = useMutation({
    mutationFn: async ({ checkId, itemId, found }: { checkId: string; itemId: string; found: boolean }) => {
      await api.put(`/equipment/inventory-checks/${checkId}/items/${itemId}`, { found });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-inventory-check-detail", selectedCheckId] });
    },
  });

  const syncInventoryMutation = useMutation({
    mutationFn: (checkId: string) => api.post(`/equipment/inventory-checks/${checkId}/sync`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["equipment-inventory-check-detail", selectedCheckId] });
      const added = res.data?.data?.added ?? 0;
      showNotice(added > 0 ? `${added}件の機材をチェックリストに追加しました` : "同期完了（追加なし）");
    },
  });

  const addBlankMutation = useMutation({
    mutationFn: async ({ locationId, rack_position, rack_height, rack_slot, rack_side, panel_type, label }: any) =>
      api.post(`/equipment/racks/${locationId}/blanks`, { rack_position, rack_height, rack_slot, rack_side, panel_type, label }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-racks"] });
      setBlankDialog(null);
    },
  });

  const deleteBlankMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/equipment/racks/blanks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["equipment-racks"] });
      setConfirmDeleteBlankId(null);
    },
  });

  type DisplayConfigVars = { itemId: string; config: CellConfig | null };
  type DisplayConfigCtx = { previous: unknown };

  const saveDisplayConfigMutation = useMutation<unknown, unknown, DisplayConfigVars, DisplayConfigCtx>({
    mutationFn: ({ itemId, config }: DisplayConfigVars) =>
      api.patch(`/equipment/items/${itemId}`, { display_config: config }),
    onMutate: async ({ itemId, config }: DisplayConfigVars): Promise<DisplayConfigCtx> => {
      await qc.cancelQueries({ queryKey: ["equipment-racks"] });
      const previous = qc.getQueryData(["equipment-racks"]);
      qc.setQueryData(["equipment-racks"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((rack: any) => ({
          ...rack,
          items: rack.items.map((it: any) =>
            it.id === itemId ? { ...it, display_config: config } : it
          ),
        }));
      });
      return { previous };
    },
    onError: (_err: unknown, _vars: DisplayConfigVars, context: DisplayConfigCtx | undefined) => {
      if (context?.previous) qc.setQueryData(["equipment-racks"], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["equipment-racks"] }),
  });

  const showNotice = useCallback((msg: string) => {
    setInventoryNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setInventoryNotice(""), 3500);
  }, []);

  const handlePrint = useCallback(() => {
    document.body.classList.add("print-rack");
    window.print();
  }, []);

  useEffect(() => {
    const cleanup = () => document.body.classList.remove("print-rack");
    window.addEventListener("afterprint", cleanup);
    return () => {
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove("print-rack");
    };
  }, []);

  // 棚卸しを選択したら自動同期（ラック内の全機材をチェックリストに追加）
  useEffect(() => {
    if (selectedCheckId && inventoryMode && selectedCheckId !== prevCheckIdRef.current) {
      prevCheckIdRef.current = selectedCheckId;
      syncInventoryMutation.mutate(selectedCheckId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCheckId, inventoryMode]);

  const handleCellClick = (item: any, overlapItems?: any[]) => {
    if (displayEditMode) {
      setConfigTarget(item);
      return;
    }
    if (overlapItems && overlapItems.length > 1 && !inventoryMode) {
      setOverlapDialog({ items: overlapItems, pos: item.rack_position, slot: item.rack_slot });
      return;
    }
    if (inventoryMode && selectedCheckId) {
      const mapEntry = inventoryMap[item.id];
      if (!mapEntry) {
        showNotice("この機材はチェックリストに未登録です。「同期」ボタンで追加できます");
        return;
      }
      toggleFoundMutation.mutate({
        checkId: selectedCheckId,
        itemId: mapEntry.id,
        found: !mapEntry.found,
      });
    } else if (inventoryMode && !selectedCheckId) {
      showNotice("棚卸しを選択してください");
    } else {
      navigate(`/equipment/items/${item.id}`);
    }
  };

  const handleEmptySlotClick = (locationId: string, uPos: number) => {
    if (inventoryMode || displayEditMode) return;
    setBlankForm({ rack_height: "1", rack_slot: "full", panel_type: "blank", label: "" });
    setBlankDialog({ locationId, uPos });
  };

  const handleDeleteBlank = (id: string) => {
    if (inventoryMode || displayEditMode) return;
    setConfirmDeleteBlankId(id);
  };

  const handleSaveCellConfig = (itemId: string, config: CellConfig) => {
    saveDisplayConfigMutation.mutate({ itemId, config });
    setConfigTarget(null);
  };

  const handleEditRackSubtitle = (locationId: string) => {
    setRackSubtitleTarget({
      locationId,
      config: rackConfigs[locationId] ?? { subtitleMode: "auto", subtitleText: "" },
    });
  };

  const handleSaveRackConfig = (locationId: string, config: RackConfig) => {
    const next = { ...rackConfigs, [locationId]: config };
    setRackConfigs(next);
    saveRackConfigs(next);
    setRackSubtitleTarget(null);
  };

  const handleResetCellConfig = (itemId: string) => {
    saveDisplayConfigMutation.mutate({ itemId, config: null });
    setConfigTarget(null);
  };

  const filteredRacks = useMemo(() => {
    return racks.filter((r: any) => {
      if (branchFilter !== "all" && r.location.branch_id !== branchFilter) return false;
      if (rackTypeFilter !== "all" && r.location.rack_type_id !== rackTypeFilter) return false;
      return true;
    });
  }, [racks, branchFilter, rackTypeFilter]);

  const oppositeSideHasContent = useMemo(() => {
    const opposite = side === "front" ? "back" : "front";
    return filteredRacks.some((r: any) => r.items?.some((it: any) => it.rack_side === opposite));
  }, [filteredRacks, side]);

  if (racksLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (racksError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
        <Server className="h-12 w-12 opacity-20" />
        <p className="text-sm">ラックデータの取得に失敗しました</p>
        <p className="text-xs">サーバーエラーが発生しました。しばらく待ってから再試行してください。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <PageTitle
            className={embedded ? "hidden" : undefined}
            icon={<Server className="h-5 w-5 text-warning-strong" />}
          >
            ラック実装ビュー
          </PageTitle>

          {/* 前面/背面 (モバイルでも常時表示) */}
          <div className="flex rounded-lg overflow-hidden border border-border shadow-sm shrink-0">
            <button
              className={`relative px-3 sm:px-4 h-9 text-sm font-semibold transition-colors ${side === "front" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSide("front")}
            >
              前面
              {side === "back" && oppositeSideHasContent && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-warning shadow-[0_0_0_2px_white]" />
              )}
            </button>
            <button
              className={`relative px-3 sm:px-4 h-9 text-sm font-semibold transition-colors ${side === "back" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSide("back")}
            >
              背面
              {side === "front" && oppositeSideHasContent && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-warning shadow-[0_0_0_2px_white]" />
              )}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {branches.length > 0 && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="min-w-[120px] max-w-[200px] h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全拠点</SelectItem>
                {branches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {rackTypes.length > 0 && (
            <Select value={rackTypeFilter} onValueChange={setRackTypeFilter}>
              <SelectTrigger className="min-w-[120px] max-w-[200px] h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全種別</SelectItem>
                {rackTypes.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex gap-1.5 sm:gap-2">
            <Button
              size="sm" className="h-9 px-2.5 sm:px-3"
              variant="outline"
              onClick={handlePrint}
              disabled={filteredRacks.length === 0}
              title="ラック実装図を印刷"
            >
              <Printer className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">印刷</span>
            </Button>

            <Button
              size="sm" className="h-9 px-2.5 sm:px-3"
              variant={displayEditMode ? "default" : "outline"}
              onClick={() => { setDisplayEditMode((v) => !v); if (inventoryMode) setInventoryMode(false); }}
            >
              <Pencil className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">表示変更</span>
            </Button>

            <Button
              size="sm" className="h-9 px-2.5 sm:px-3"
              variant={inventoryMode ? "default" : "outline"}
              onClick={() => { setInventoryMode((v) => !v); if (displayEditMode) setDisplayEditMode(false); }}
            >
              <ClipboardCheck className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">棚卸し</span>
            </Button>
          </div>
        </div>
      </div>

      {displayEditMode && (
        <div className="rounded-lg border border-warning bg-warning-surface p-3 text-sm text-warning-strong">
          <strong>表示変更モード：</strong>機材ブロックをクリックして表示項目をカスタマイズします。空きスペースのクリックは無効です。
        </div>
      )}

      {inventoryMode && (
        <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">棚卸し選択:</span>
            <Select value={selectedCheckId || "none"} onValueChange={(v) => setSelectedCheckId(v === "none" ? "" : v)}>
              <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="棚卸しを選択..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">選択なし</SelectItem>
                {inventoryChecks.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.title} ({c.check_date})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCheckId && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  disabled={syncInventoryMutation.isPending}
                  onClick={() => syncInventoryMutation.mutate(selectedCheckId)}
                >
                  {syncInventoryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  同期
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  <div className="h-2 w-40 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-success transition-all"
                      style={{ width: totalItems > 0 ? `${(totalChecked / totalItems) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{totalChecked}/{totalItems}</span>
                </div>
              </>
            )}
          </div>
          {inventoryNotice && (
            <div className="flex items-center gap-1.5 text-sm text-warning-strong bg-warning-surface border border-warning rounded px-2.5 py-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {inventoryNotice}
            </div>
          )}
        </div>
      )}

      {filteredRacks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Server className="h-16 w-16 opacity-20" />
          <p className="text-sm">ラックが登録されていません</p>
          <p className="text-xs">「保管場所管理」でラックを追加してください</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto pb-4 -mx-3 sm:-mx-0 px-3 sm:px-0">
            <div className="flex gap-3 sm:gap-5 lg:gap-6 min-w-max items-end">
              {filteredRacks.map((rackData: any) => (
                <RackDisplay
                  key={rackData.location.id}
                  rackData={rackData}
                  side={side}
                  inventoryMode={inventoryMode && !!selectedCheckId}
                  inventoryMap={inventoryMap}
                  displayEditMode={displayEditMode}
                  rackConfig={rackConfigs[rackData.location.id]}
                  onCellClick={handleCellClick}
                  onEmptySlotClick={handleEmptySlotClick}
                  onDeleteBlank={handleDeleteBlank}
                  onEditRackSubtitle={handleEditRackSubtitle}
                  onItemHover={handleItemHover}
                  onItemLeave={handleItemLeave}
                />
              ))}
            </div>
          </div>

          {colors.length > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">凡例</p>
              <div className="flex flex-wrap gap-3">
                {colors.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-1.5 text-xs">
                    <span className="h-3.5 w-3.5 rounded-sm border border-border/40 shrink-0" style={{ background: c.color_hex }} />
                    <span>{c.name}</span>
                    {c.description && <span className="text-muted-foreground">({c.description})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ブランクパネル追加ダイアログ */}
      <Dialog open={!!blankDialog} onOpenChange={(o) => { if (!o) setBlankDialog(null); }}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>パネルを追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>種別</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "blank",  label: "ブランクパネル" },
                  { value: "cable",  label: "通線口" },
                  { value: "drawer", label: "引き出し" },
                  { value: "custom", label: "自由記述" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`py-1.5 text-sm rounded border transition-colors ${blankForm.panel_type === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setBlankForm(f => ({ ...f, panel_type: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {blankForm.panel_type === "custom" && (
              <div className="space-y-1">
                <Label>表示テキスト</Label>
                <Input
                  placeholder="例: スイッチングハブ"
                  value={blankForm.label}
                  onChange={(e) => setBlankForm(f => ({ ...f, label: e.target.value }))}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>U位置 (下端)</Label>
              <Input
                type="number" min="1"
                value={blankDialog?.uPos ?? ""}
                onChange={(e) => setBlankDialog(d => d ? { ...d, uPos: Number(e.target.value) } : d)}
              />
            </div>
            <div className="space-y-1">
              <Label>高さ (U)</Label>
              <Input
                type="number" min="1"
                value={blankForm.rack_height}
                onChange={(e) => setBlankForm(f => ({ ...f, rack_height: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>横位置</Label>
              <Select value={blankForm.rack_slot} onValueChange={(v) => setBlankForm(f => ({ ...f, rack_slot: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RACK_SLOT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setBlankDialog(null)}>キャンセル</Button>
              <Button
                size="sm"
                disabled={addBlankMutation.isPending || !blankDialog?.uPos || (blankForm.panel_type === "custom" && !blankForm.label.trim())}
                onClick={() => {
                  if (!blankDialog) return;
                  addBlankMutation.mutate({
                    locationId: blankDialog.locationId,
                    rack_position: blankDialog.uPos,
                    rack_height: Number(blankForm.rack_height) || 1,
                    rack_slot: blankForm.rack_slot,
                    rack_side: side,
                    panel_type: blankForm.panel_type,
                    label: blankForm.panel_type === "custom" ? blankForm.label : null,
                  });
                }}
              >
                {addBlankMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                追加
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 重複機材ダイアログ */}
      <Dialog open={!!overlapDialog} onOpenChange={(o) => { if (!o) setOverlapDialog(null); }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" />
              重複機材 — U{overlapDialog?.pos}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">同一U位置・同一スロットに複数の機材が登録されています。機材の詳細ページからU位置またはスロットを変更してください。</p>
          <div className="space-y-2 pt-1">
            {overlapDialog?.items.map((it: any) => (
              <div key={it.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className="h-8 w-2 rounded-full shrink-0"
                  style={{ background: it.color_hex ?? TYPE_BG[it.equipment_type_code] ?? "#e5e7eb" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{it.name}{it.unit_number != null ? ` No.${it.unit_number}` : ""}</div>
                  <div className="text-xs text-muted-foreground truncate">{it.model_number || "—"}</div>
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => { setOverlapDialog(null); navigate(`/equipment/items/${it.id}`); }}
                >
                  編集
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ブランクパネル削除確認 */}
      <Dialog open={!!confirmDeleteBlankId} onOpenChange={(o) => { if (!o) setConfirmDeleteBlankId(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>ブランクパネルを削除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">このブランクパネルを削除しますか？</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDeleteBlankId(null)}>キャンセル</Button>
            <Button
              variant="destructive" size="sm"
              disabled={deleteBlankMutation.isPending}
              onClick={() => { if (confirmDeleteBlankId) deleteBlankMutation.mutate(confirmDeleteBlankId); }}
            >
              {deleteBlankMutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              削除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ラックサブタイトル設定ダイアログ */}
      {rackSubtitleTarget && (
        <RackSubtitleDialog
          config={rackSubtitleTarget.config}
          onSave={(cfg) => handleSaveRackConfig(rackSubtitleTarget.locationId, cfg)}
          onClose={() => setRackSubtitleTarget(null)}
        />
      )}

      {/* セル表示設定ダイアログ */}
      {configTarget && (
        <CellConfigDialog
          item={configTarget}
          config={configTarget.display_config ?? undefined}
          onSave={(cfg) => handleSaveCellConfig(configTarget.id, cfg)}
          onReset={() => handleResetCellConfig(configTarget.id)}
          onClose={() => setConfigTarget(null)}
        />
      )}

      {/* ホバーツールチップ */}
      {tooltip && <ItemTooltip item={tooltip.item} x={tooltip.x} y={tooltip.y} />}

      {/* 印刷用ラック実装図（スクリーンでは非表示） */}
      <PrintRackArea
        racks={filteredRacks}
        side={side}
        rackConfigs={rackConfigs}
        colors={colors}
      />
    </div>
  );
}
