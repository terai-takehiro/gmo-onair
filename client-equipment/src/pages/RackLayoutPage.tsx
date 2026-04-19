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
import { Loader2, Server, ClipboardCheck, Pencil } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────
const CELL_H = 32;
const RACK_W = 240;

// ── Cell display config ───────────────────────────────────────────────────────
type CellConfig = {
  primary: "model" | "name" | "custom";
  showName: boolean;
  showModel: boolean;
  showNo: boolean;
  showCustom: boolean;
  customText: string;
};

// ── Rack subtitle config ──────────────────────────────────────────────────────
type RackConfig = {
  subtitleMode: "auto" | "hidden" | "custom";
  subtitleText: string;
};

const RACK_CONFIG_LS_KEY = "rack-header-configs-v1";

function loadRackConfigs(): Record<string, RackConfig> {
  try { return JSON.parse(localStorage.getItem(RACK_CONFIG_LS_KEY) ?? "{}"); }
  catch { return {}; }
}

function saveRackConfigs(configs: Record<string, RackConfig>) {
  localStorage.setItem(RACK_CONFIG_LS_KEY, JSON.stringify(configs));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function slotToColumn(slot: string): { start: number; span: number } {
  switch (slot) {
    case "left-1_2":  return { start: 1, span: 3 };
    case "right-1_2": return { start: 4, span: 3 };
    case "left-1_3":  return { start: 1, span: 2 };
    case "mid-1_3":   return { start: 3, span: 2 };
    case "right-1_3": return { start: 5, span: 2 };
    default:          return { start: 1, span: 6 };
  }
}

const TYPE_BG: Record<string, string> = {
  V: "#ede9fe", C: "#e0f2fe", A: "#fef9c3", IC: "#ccfbf1",
  NW: "#cffafe", L: "#fefce8", XR: "#fce7f3", E: "#f3f4f6",
};

const RACK_SLOT_OPTIONS = [
  { value: "full",      label: "全幅" },
  { value: "left-1_2",  label: "左1/2" },
  { value: "right-1_2", label: "右1/2" },
  { value: "left-1_3",  label: "左1/3" },
  { value: "mid-1_3",   label: "中央1/3" },
  { value: "right-1_3", label: "右1/3" },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RackLayoutPage() {
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

  // Display edit mode
  const [displayEditMode, setDisplayEditMode] = useState(false);
  const [configTarget, setConfigTarget] = useState<any>(null);
  const [rackConfigs, setRackConfigs] = useState<Record<string, RackConfig>>(loadRackConfigs);
  const [rackSubtitleTarget, setRackSubtitleTarget] = useState<{ locationId: string; config: RackConfig } | null>(null);

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

  // ブランチデータロード後に「GMOグローバルスタジオ」を自動選択（URLパラメータ未設定時のみ）
  const branchDefaultApplied = useRef(false);
  useEffect(() => {
    if (branchDefaultApplied.current || sp.get("branch") || branches.length === 0) return;
    const gls = branches.find((b: any) => /GMO|グローバル|GLS/i.test(b.name));
    const defaultId = gls?.id ?? branches[0]?.id;
    if (defaultId) {
      branchDefaultApplied.current = true;
      setSp(prev => { const n = new URLSearchParams(prev); n.set("branch", defaultId); return n; }, { replace: true });
    }
  }, [branches]);
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

  const handleCellClick = (item: any) => {
    if (displayEditMode) {
      setConfigTarget(item);
      return;
    }
    if (inventoryMode && selectedCheckId) {
      const mapEntry = inventoryMap[item.id];
      if (!mapEntry) return;
      toggleFoundMutation.mutate({
        checkId: selectedCheckId,
        itemId: mapEntry.id,
        found: !mapEntry.found,
      });
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
          <h1 className="heading-page text-lg sm:text-xl lg:text-2xl flex items-center gap-2">
            <Server className="h-5 w-5 text-amber-500" />
            ラック実装ビュー
          </h1>

          {/* 前面/背面 (モバイルでも常時表示) */}
          <div className="flex rounded-lg overflow-hidden border border-border shadow-sm shrink-0">
            <button
              className={`relative px-3 sm:px-4 h-9 text-sm font-semibold transition-colors ${side === "front" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSide("front")}
            >
              前面
              {side === "back" && oppositeSideHasContent && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_0_2px_white]" />
              )}
            </button>
            <button
              className={`relative px-3 sm:px-4 h-9 text-sm font-semibold transition-colors ${side === "back" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSide("back")}
            >
              背面
              {side === "front" && oppositeSideHasContent && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_0_2px_white]" />
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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>表示変更モード：</strong>機材ブロックをクリックして表示項目をカスタマイズします。空きスペースのクリックは無効です。
        </div>
      )}

      {inventoryMode && (
        <div className="rounded-lg border bg-muted/30 p-3 flex flex-wrap items-center gap-3">
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
            <div className="flex items-center gap-2 ml-auto">
              <div className="h-2 w-40 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: totalItems > 0 ? `${(totalChecked / totalItems) * 100}%` : "0%" }}
                />
              </div>
              <span className="text-xs text-muted-foreground">{totalChecked}/{totalItems}</span>
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
    </div>
  );
}

// ── RackSubtitleDialog ────────────────────────────────────────────────────────
function RackSubtitleDialog({ config, onSave, onClose }: {
  config: RackConfig;
  onSave: (c: RackConfig) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<RackConfig>(config);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>ラック名下テキスト設定</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          {[
            { value: "auto",   label: "自動（拠点・種別・建物情報）" },
            { value: "hidden", label: "非表示" },
            { value: "custom", label: "カスタム文字列" },
          ].map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio" name="subtitleMode" value={opt.value}
                checked={form.subtitleMode === opt.value}
                onChange={() => setForm(f => ({ ...f, subtitleMode: opt.value as RackConfig["subtitleMode"] }))}
                className="h-3.5 w-3.5 accent-primary"
              />
              {opt.label}
            </label>
          ))}
          {form.subtitleMode === "custom" && (
            <Input
              placeholder="表示するテキスト"
              value={form.subtitleText}
              onChange={(e) => setForm(f => ({ ...f, subtitleText: e.target.value }))}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
          <Button size="sm" onClick={() => onSave(form)}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── ItemTooltip ───────────────────────────────────────────────────────────────
function ItemTooltip({ item, x, y }: { item: any; x: number; y: number }) {
  const STATUS_LABEL: Record<string, string> = {
    active: "稼働中", spare: "予備", repair: "修理中", retired: "廃棄", lent: "貸出中",
  };
  const CONDITION_LABEL: Record<string, string> = {
    good: "良好", fair: "普通", poor: "要注意", broken: "故障",
  };

  // Clamp tooltip so it doesn't overflow viewport
  const TOOLTIP_W = 224;
  const vpW = typeof window !== "undefined" ? window.innerWidth : 800;
  const left = x + TOOLTIP_W > vpW ? x - TOOLTIP_W - 16 : x;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left, top: y, maxWidth: TOOLTIP_W }}
    >
      <div className="bg-zinc-900 text-zinc-100 rounded-lg shadow-2xl border border-zinc-700 p-3 space-y-1.5" style={{ width: TOOLTIP_W }}>
        <div className="font-bold text-sm leading-tight">{item.name}</div>
        {item.model_number && (
          <div className="text-xs text-zinc-300 leading-tight tracking-tight">{item.model_number}</div>
        )}
        {item.manufacturer_name && (
          <div className="text-[11px] text-zinc-400">{item.manufacturer_name}</div>
        )}
        <div className="border-t border-zinc-700 pt-1.5 space-y-1">
          {item.serial_number && (
            <div className="flex gap-1.5 text-[11px]">
              <span className="text-zinc-500 shrink-0">S/N</span>
              <span className="text-zinc-300 font-semibold tracking-tight">{item.serial_number}</span>
            </div>
          )}
          {(item.status || item.condition) && (
            <div className="flex gap-2 text-[11px]">
              {item.status && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.status === "active" ? "bg-emerald-700/60 text-emerald-200" : item.status === "repair" ? "bg-amber-700/60 text-amber-200" : item.status === "retired" ? "bg-red-800/60 text-red-200" : "bg-zinc-700 text-zinc-300"}`}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              )}
              {item.condition && item.condition !== "good" && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.condition === "poor" ? "bg-amber-700/60 text-amber-200" : item.condition === "broken" ? "bg-red-800/60 text-red-200" : "bg-zinc-700 text-zinc-300"}`}>
                  {CONDITION_LABEL[item.condition] ?? item.condition}
                </span>
              )}
            </div>
          )}
          {item.notes && (
            <div className="text-[11px] text-zinc-300 leading-snug border-t border-zinc-700 pt-1 mt-1">
              <span className="text-zinc-500 text-[10px]">備考　</span>{item.notes}
            </div>
          )}
        </div>
        {item.eq_code && (
          <div className="text-[10px] text-zinc-600 pt-0.5">{item.eq_code}</div>
        )}
      </div>
    </div>
  );
}

// ── CellConfigDialog ──────────────────────────────────────────────────────────
function CellConfigDialog({
  item, config, onSave, onReset, onClose,
}: {
  item: any;
  config?: CellConfig;
  onSave: (c: CellConfig) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const defaultCfg: CellConfig = {
    primary: "model",
    showName: false,
    showModel: true,
    showNo: true,
    showCustom: false,
    customText: "",
  };
  const [form, setForm] = useState<CellConfig>(config ?? defaultCfg);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>表示設定 — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">優先表示</Label>
            <div className="flex flex-col gap-1.5">
              {[
                { value: "model", label: "型名を優先" },
                { value: "name",  label: "機材名を優先" },
                { value: "custom", label: "任意文字列" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="primary"
                    value={opt.value}
                    checked={form.primary === opt.value}
                    onChange={() => setForm(f => ({ ...f, primary: opt.value as CellConfig["primary"] }))}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {form.primary === "custom" && (
              <Input
                placeholder="表示するテキスト"
                value={form.customText}
                onChange={(e) => setForm(f => ({ ...f, customText: e.target.value }))}
                className="mt-1"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">追加表示項目</Label>
            <div className="flex flex-col gap-1.5">
              {[
                { key: "showName",   label: "機材名" },
                { key: "showModel",  label: "型名" },
                { key: "showNo",     label: "No." },
                { key: "showCustom", label: "任意文字列" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={form[key as keyof CellConfig] as boolean}
                    onChange={(e) => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
            {form.showCustom && form.primary !== "custom" && (
              <Input
                placeholder="追加表示するテキスト"
                value={form.customText}
                onChange={(e) => setForm(f => ({ ...f, customText: e.target.value }))}
                className="mt-1"
              />
            )}
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground text-xs">
            デフォルトに戻す
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>キャンセル</Button>
            <Button size="sm" onClick={() => onSave(form)}>保存</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── RackDisplay ───────────────────────────────────────────────────────────────
function RackDisplay({ rackData, side, inventoryMode, inventoryMap, displayEditMode, rackConfig, onCellClick, onEmptySlotClick, onDeleteBlank, onEditRackSubtitle, onItemHover, onItemLeave }: {
  rackData: { location: any; items: any[]; blanks?: any[] };
  side: "front" | "back";
  inventoryMode: boolean;
  inventoryMap: Record<string, { id: string; found: boolean }>;
  displayEditMode: boolean;
  rackConfig?: RackConfig;
  onCellClick: (item: any) => void;
  onEmptySlotClick: (locationId: string, uPos: number) => void;
  onDeleteBlank: (id: string) => void;
  onEditRackSubtitle: (locationId: string) => void;
  onItemHover: (item: any, e: React.MouseEvent) => void;
  onItemLeave: () => void;
}) {
  const { location, items, blanks = [] } = rackData;
  const rackUnits: number = location.rack_units ?? 20;

  const sideItems = items.filter((it: any) => it.rack_side === side);
  const sideBlanks = blanks.filter((b: any) => b.rack_side === side);
  const oppositeItems = items.filter((it: any) => it.rack_side !== side);

  // Compute subtitle text
  const autoSubtitle = [location.branch_name, location.rack_type_name, location.building, location.floor]
    .filter(Boolean).join(" ");
  const subtitle =
    rackConfig?.subtitleMode === "hidden" ? null :
    rackConfig?.subtitleMode === "custom"  ? (rackConfig.subtitleText || null) :
    autoSubtitle || null;

  // 背面機材が占有するU位置セット（右U列のハイライト用）
  const oppositeUSet = useMemo(() => {
    const s = new Set<number>();
    for (const it of oppositeItems) {
      const pos = it.rack_position ?? 0;
      const h = it.rack_height ?? 1;
      for (let u = pos; u < pos + h; u++) s.add(u);
    }
    return s;
  }, [oppositeItems]);

  const posSlotCount: Record<string, number> = {};
  for (const it of sideItems) {
    const key = `${it.rack_position}:${it.rack_slot}`;
    posSlotCount[key] = (posSlotCount[key] ?? 0) + 1;
  }

  const handleRackBodyClick = (e: React.MouseEvent<HTMLDivElement>) => {
    let el: HTMLElement | null = e.target as HTMLElement;
    while (el && el !== e.currentTarget) {
      if (el.tagName === "BUTTON") return;
      el = el.parentElement;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const rowFromTop = Math.floor((e.clientY - rect.top) / CELL_H);
    const uPos = rackUnits - rowFromTop;
    if (uPos >= 1 && uPos <= rackUnits) onEmptySlotClick(location.id, uPos);
  };

  return (
    <div className="shrink-0">
      <div className="text-center mb-2 px-2">
        <div className="inline-flex items-center gap-1.5 justify-center text-sm font-bold tracking-wide">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {location.name}
        </div>
        <div
          className={`text-[10px] mt-0.5 min-h-[14px] tracking-wide ${
            displayEditMode
              ? "cursor-pointer text-amber-600 hover:underline"
              : "text-muted-foreground/80"
          }`}
          onClick={displayEditMode ? () => onEditRackSubtitle(location.id) : undefined}
          title={displayEditMode ? "クリックでサブタイトルを変更" : undefined}
        >
          {subtitle ?? (displayEditMode ? <span className="opacity-40">（サブタイトルなし）</span> : <span>&nbsp;</span>)}
        </div>
      </div>

      <div className="flex gap-0.5">
        {/* U numbers (left) */}
        <div className="flex flex-col shrink-0" style={{ width: 22 }}>
          {Array.from({ length: rackUnits }, (_, i) => rackUnits - i).map((u) => (
            <div key={u} style={{ height: CELL_H, fontSize: 9 }} className="flex items-center justify-end pr-1.5 text-zinc-500 tabular-nums leading-none font-semibold">
              {u}
            </div>
          ))}
        </div>

        {/* Rack body */}
        <div
          className={`relative border border-zinc-950/80 bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-md shadow-[inset_0_2px_8px_rgba(0,0,0,0.5),0_2px_6px_rgba(0,0,0,0.15)] ${displayEditMode ? "cursor-default" : "cursor-crosshair"}`}
          style={{ width: RACK_W, height: rackUnits * CELL_H }}
          onClick={handleRackBodyClick}
        >
          {/* Grid lines (rack rails) */}
          {Array.from({ length: rackUnits }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-b border-zinc-700/40 pointer-events-none"
              style={{ top: i * CELL_H, height: CELL_H }}
            />
          ))}


          {/* Blank panels & 通線口 */}
          {sideBlanks.map((b: any) => {
            const { start, span } = slotToColumn(b.rack_slot);
            const height = (b.rack_height ?? 1) * CELL_H;
            const top = (rackUnits - b.rack_position - (b.rack_height ?? 1) + 1) * CELL_H;
            const left = ((start - 1) / 6) * RACK_W;
            const width = (span / 6) * RACK_W;
            const panelType = b.panel_type ?? "blank";
            const panelStyle =
              panelType === "cable"   ? "border border-dashed border-zinc-500/80 bg-zinc-900/40 hover:bg-zinc-900/60" :
              panelType === "drawer"  ? "border border-zinc-900 bg-gradient-to-b from-zinc-500 to-zinc-600 hover:from-zinc-400 hover:to-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" :
              panelType === "custom"  ? "border border-slate-500 bg-gradient-to-b from-slate-300 to-slate-400 hover:from-slate-200 hover:to-slate-300" :
                                        "border border-zinc-900 bg-gradient-to-b from-zinc-600 to-zinc-700 hover:from-zinc-500 hover:to-zinc-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]";
            const panelTextColor =
              panelType === "cable"   ? "text-zinc-400" :
              panelType === "drawer"  ? "text-zinc-100" :
              panelType === "custom"  ? "text-slate-900 font-bold" :
                                        "text-zinc-300";
            const panelLabel =
              panelType === "cable"   ? "通線口" :
              panelType === "drawer"  ? "引き出し" :
              panelType === "custom"  ? (b.label || "—") :
                                        "BLANK";
            return (
              <button
                key={b.id}
                className={`absolute rounded-sm overflow-hidden z-[2] transition-all ${panelStyle}`}
                style={{ top, left, width, height }}
                onClick={() => onDeleteBlank(b.id)}
                title="クリックで削除"
              >
                {panelType === "drawer" && (
                  <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 flex flex-col gap-[3px] pointer-events-none">
                    {Array.from({ length: Math.min(3, Math.floor(height / CELL_H)) }).map((_, i) => (
                      <div key={i} className="h-[2px] bg-zinc-300/40 rounded-full" />
                    ))}
                  </div>
                )}
                <span
                  className={`flex items-center justify-center h-full font-bold tracking-widest select-none ${panelTextColor}`}
                  style={{ fontSize: height <= CELL_H ? 10 : 11 }}
                >
                  {panelLabel}
                </span>
              </button>
            );
          })}

          {/* Items */}
          {sideItems.map((it: any) => {
            const { start, span } = slotToColumn(it.rack_slot);
            const height = (it.rack_height ?? 1) * CELL_H;
            const top = (rackUnits - it.rack_position - (it.rack_height ?? 1) + 1) * CELL_H;
            const left = ((start - 1) / 6) * RACK_W;
            const width = (span / 6) * RACK_W;
            const bg = it.color_hex ?? TYPE_BG[it.equipment_type_code] ?? "#f3f4f6";
            const isOverlap = posSlotCount[`${it.rack_position}:${it.rack_slot}`] > 1;
            const mapEntry = inventoryMap[it.id];
            const found = mapEntry?.found;
            const cfg: CellConfig | undefined = it.display_config ?? undefined;

            return (
              <button
                key={it.id}
                className={`absolute border border-zinc-950/60 rounded-sm overflow-hidden text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary z-[2] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.2)] ${
                  displayEditMode
                    ? "hover:ring-2 hover:ring-amber-400 hover:brightness-95 cursor-pointer"
                    : "hover:brightness-95 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_2px_4px_rgba(0,0,0,0.3)]"
                }`}
                style={{ top, left, width, height, background: bg }}
                onClick={() => onCellClick(it)}
                onMouseEnter={(e) => onItemHover(it, e)}
                onMouseLeave={onItemLeave}
              >
                {cfg
                  ? <ConfiguredCellContent it={it} cfg={cfg} height={height} />
                  : <DefaultCellContent it={it} height={height} />
                }
                {isOverlap && (
                  <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive border border-white" title="重複" />
                )}
                {displayEditMode && (
                  <span className="absolute bottom-0.5 right-0.5 opacity-60">
                    <Pencil className="h-2.5 w-2.5 text-gray-600" />
                  </span>
                )}
                {inventoryMode && mapEntry && (
                  <span
                    className={`absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white flex items-center justify-center text-[8px] font-bold ${
                      found === true ? "bg-emerald-500 text-white" : "bg-white text-muted-foreground"
                    }`}
                  >
                    {found === true ? "✓" : "○"}
                  </span>
                )}
              </button>
            );
          })}

          {sideItems.length === 0 && sideBlanks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50 pointer-events-none">
              クリックでブランクパネルを追加
            </div>
          )}
        </div>

        {/* U numbers (right) — 背面機材があるU位置をアンバーでハイライト */}
        <div className="flex flex-col shrink-0" style={{ width: 24 }}>
          {Array.from({ length: rackUnits }, (_, i) => rackUnits - i).map((u) => {
            const hasBack = oppositeUSet.has(u);
            return (
              <div
                key={u}
                style={{ height: CELL_H, fontSize: 9 }}
                className={`relative flex items-center pl-1.5 tabular-nums leading-none font-semibold ${hasBack ? "text-amber-500" : "text-zinc-500"}`}
              >
                {hasBack && (
                  <span className="absolute left-0 inset-y-0 w-[3px] bg-amber-500 rounded-r-sm" />
                )}
                <span className="pl-1">{u}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-[10px] text-zinc-500 font-semibold tracking-widest mt-1.5 uppercase">{rackUnits}U</div>
    </div>
  );
}

// ── Default cell rendering ────────────────────────────────────────────────────
function DefaultCellContent({ it, height }: { it: any; height: number }) {
  if (height <= CELL_H) {
    // 1U: 型名 + No.バッジ
    return (
      <div className="flex items-center h-full px-2 gap-1.5 min-w-0">
        <span className="font-bold truncate leading-none tracking-tight" style={{ fontSize: 12 }}>
          {it.model_number || it.name}
        </span>
        {it.unit_number && <UnitBadge n={it.unit_number} size="sm" />}
      </div>
    );
  }
  if (height <= CELL_H * 2) {
    // 2U: 型名+バッジ上段、機材名下段
    return (
      <div className="flex flex-col justify-center h-full px-2 py-1 gap-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-bold truncate leading-tight tracking-tight" style={{ fontSize: 13 }}>
            {it.model_number || it.name}
          </span>
          {it.unit_number && <UnitBadge n={it.unit_number} size="md" />}
        </div>
        <span className="font-semibold truncate leading-tight opacity-60" style={{ fontSize: 11 }}>
          {it.name}
        </span>
      </div>
    );
  }
  // 3U+: 機材名上段、型名+バッジ下段
  return (
    <div className="flex flex-col justify-center h-full px-2 py-1 gap-0.5">
      <span className="font-bold truncate leading-tight" style={{ fontSize: 13 }}>
        {it.name}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold truncate leading-tight opacity-80 tracking-tight" style={{ fontSize: 12 }}>
          {it.model_number}
        </span>
        {it.unit_number && <UnitBadge n={it.unit_number} size="md" />}
      </div>
    </div>
  );
}

// ── Configured cell rendering ─────────────────────────────────────────────────
function ConfiguredCellContent({ it, cfg, height }: { it: any; cfg: CellConfig; height: number }) {
  const is1U = height <= CELL_H;

  const primaryText =
    cfg.primary === "model" ? (it.model_number || it.name) :
    cfg.primary === "name"  ? it.name :
    cfg.customText || "—";

  const extras: { text: string; mono?: boolean }[] = [];
  if (cfg.showName  && cfg.primary !== "name"   && it.name)         extras.push({ text: it.name });
  if (cfg.showModel && cfg.primary !== "model"  && it.model_number) extras.push({ text: it.model_number, mono: true });
  if (cfg.showCustom && cfg.primary !== "custom" && cfg.customText)  extras.push({ text: cfg.customText });

  if (is1U) {
    return (
      <div className="flex items-center h-full px-2 gap-1.5 min-w-0">
        <span className="truncate leading-none font-bold tracking-tight" style={{ fontSize: 12 }}>
          {primaryText}
        </span>
        {cfg.showNo && it.unit_number && <UnitBadge n={it.unit_number} size="sm" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center h-full px-2 py-1 gap-0.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="truncate leading-tight font-bold tracking-tight" style={{ fontSize: 13 }}>
          {primaryText}
        </span>
        {cfg.showNo && it.unit_number && <UnitBadge n={it.unit_number} size="md" />}
      </div>
      {extras.map((ex, i) => (
        <span key={i} className="truncate leading-tight font-semibold opacity-60" style={{ fontSize: 11 }}>
          {ex.text}
        </span>
      ))}
    </div>
  );
}

// ── UnitBadge ─────────────────────────────────────────────────────────────────
function UnitBadge({ n, size }: { n: number | string; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-[18px] px-1.5 text-[10px]" : "h-5 px-1.5 text-[11px]";
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center rounded-sm bg-slate-600 text-white font-bold leading-none tabular-nums ${dim}`}
    >
      {n}
    </span>
  );
}
