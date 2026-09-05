import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { RackList, type RackSummary } from "./rack/RackList";
import {
  CELL_H, RACK_W, PANEL_LABEL, slotToColumn, loadRackConfigs, saveRackConfigs,
  type CellConfig, type RackConfig,
} from "./rack/printConstants";
import { DefaultCellContent, ConfiguredCellContent } from "./rack/cellContent";
import { PrintRackArea } from "./rack/PrintRackArea";
import { RackUnitTable, type RackUnitRow } from "./rack/RackUnitTable";
import { RackSubtitleDialog } from "./rack/RackSubtitleDialog";
import { CellConfigDialog } from "./rack/CellConfigDialog";
import { ItemTooltip } from "./rack/ItemTooltip";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { notifyApiError } from "@gmo-onair/shared/src/client/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Loader2, Server, ClipboardCheck, Pencil, RefreshCw, AlertCircle, Printer } from "lucide-react";
import { RACK_SLOT_OPTIONS, TYPE_BG } from "@/lib/constants";

/** 棚卸しチェック項目。found は 0/1/2 の INTEGER 列（1=確認できた・2=見つからない）— ブール化して送り返すと Postgres で型エラーになる */
type InventoryEntry = {
  id: string;
  found: number;
  actual_location: string | null;
  condition: string | null;
  note: string | null;
};

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

  const [selectedRackId, setSelectedRackId] = useState<string>("");
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
    queryKey: ["inventory-checks"],
    queryFn: async () => (await api.get("/equipment/inventory-checks")).data.data,
  });

  const { data: inventoryDetail } = useQuery({
    // 棚卸し画面 (CheckDetail/MobileScanSession) と同じ鍵にして相互に更新が伝わるようにする
    queryKey: ["inventory-check", selectedCheckId],
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
    const m: Record<string, InventoryEntry> = {};
    if (!inventoryDetail?.items) return m;
    for (const item of inventoryDetail.items) {
      // found は 0/1/2 のまま持つ（2=見つからない を 0 に潰さない）。実地・状態・メモは保存時に送り返す
      m[item.equipment_id] = {
        id: item.id,
        found: item.found,
        actual_location: item.actual_location ?? null,
        condition: item.condition ?? null,
        note: item.note ?? null,
      };
    }
    return m;
  }, [inventoryDetail]);

  const totalChecked = useMemo(() => Object.values(inventoryMap).filter((v) => v.found === 1).length, [inventoryMap]);
  const totalItems = Object.keys(inventoryMap).length;

  const toggleFoundMutation = useMutation({
    mutationFn: async ({ checkId, itemId, found, entry }: { checkId: string; itemId: string; found: number; entry: InventoryEntry }) => {
      // サーバーは未指定の実地・状態・メモを null で上書きするため、CheckDetail と同じ形で全部送る
      await api.put(`/equipment/inventory-checks/${checkId}/items/${itemId}`, {
        found,
        actual_location: entry.actual_location,
        condition: entry.condition,
        note: entry.note,
      });
    },
    onError: (e) => notifyApiError("確認を記録できませんでした", e),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-check", selectedCheckId] });
    },
  });

  const syncInventoryMutation = useMutation({
    mutationFn: (checkId: string) => api.post(`/equipment/inventory-checks/${checkId}/sync`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["inventory-check", selectedCheckId] });
      const added = res.data?.data?.added ?? 0;
      showNotice(added > 0 ? `${added}件の機材をチェックリストに追加しました` : "取り込む機材はありませんでした");
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
        showNotice("この機材はチェックリストにありません。「機材を取り込む」で追加できます");
        return;
      }
      toggleFoundMutation.mutate({
        checkId: selectedCheckId,
        itemId: mapEntry.id,
        // 2状態トグル: 「見つからない」(2) からのクリックも「確認できた」(1) に倒す
        found: mapEntry.found === 1 ? 0 : 1,
        entry: mapEntry,
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

  /**
   * v4 大④: **12本を横に並べるのをやめて、左に一覧・右に1本**にした。
   * 横並びだと1本が画面に収まらず、どのラックを見ているかも分からなくなる。
   * **印刷は今までどおり `filteredRacks` を全部出す**（紙は全部並べるためのもの）。
   */
  const rackSummaries: RackSummary[] = useMemo(() => filteredRacks.map((r: any) => {
    const units: number = r.location.rack_units ?? 20;
    // 実装Uは**面をまたいで数える**（前面だけで数えると背面に詰まっているラックが空いて見える）。
    // 同じUを前後で使っていても1つと数える
    const used = new Set<number>();
    for (const it of (r.items ?? [])) {
      const pos = it.rack_position ?? 0;
      for (let u = pos; u < pos + (it.rack_height ?? 1); u++) used.add(u);
    }
    return {
      id: r.location.id,
      name: r.location.name,
      units,
      used: used.size,
      branchName: r.location.branch_name ?? null,
      where: [r.location.rack_type_name, r.location.building, r.location.floor].filter(Boolean).join(" ") || null,
    };
  }), [filteredRacks]);

  const currentRack = filteredRacks.find((r: any) => r.location.id === selectedRackId) ?? filteredRacks[0];
  const currentUnits: number = currentRack?.location.rack_units ?? 20;

  /** 開いている面に実装されているもの（機材＋パネル）。**表はここから作る** */
  const currentRows: RackUnitRow[] = useMemo(() => {
    if (!currentRack) return [];
    const items = (currentRack.items ?? [])
      .filter((it: any) => it.rack_side === side)
      .map((it: any) => ({
        id: it.id,
        position: it.rack_position ?? 0,
        height: it.rack_height ?? 1,
        slot: it.rack_slot ?? "full",
        code: it.management_no ?? it.asset_no ?? null,
        name: it.name,
        model: it.model_number ?? null,
        category: it.category_name ?? null,
        isPanel: false,
      }));
    const panels = (currentRack.blanks ?? [])
      .filter((b: any) => b.rack_side === side)
      .map((b: any) => ({
        id: b.id,
        position: b.rack_position ?? 0,
        height: b.rack_height ?? 1,
        slot: b.rack_slot ?? "full",
        code: null,
        name: b.label || PANEL_LABEL[b.panel_type] || "パネル",
        model: null,
        category: null,
        isPanel: true,
      }));
    return [...items, ...panels];
  }, [currentRack, side]);

  const totalUsed = rackSummaries.reduce((n, r) => n + r.used, 0);
  const totalSize = rackSummaries.reduce((n, r) => n + r.units, 0);

  const oppositeSideHasContent = useMemo(() => {
    const opposite = side === "front" ? "back" : "front";
    // 表示中の1本だけで判定する（絞り込んだ全ラックで見ると、別ラックの反対面でも点いてしまう）
    return (currentRack?.items ?? []).some((it: any) => it.rack_side === opposite);
  }, [currentRack, side]);

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
        <p className="text-sm">ラック図を読み込めませんでした。</p>
        <p className="text-xs">通信が途切れたのかもしれません。ページを開き直してください。</p>
      </div>
    );
  }

  return (
    <>
    {/*
      **画面の中身は印刷から外す** (`print:hidden` = display:none)。
      `body * { visibility: hidden }` だけだと**場所は取ったまま**なので、
      印刷用の図を刷り終わったあとに**白紙のページが1枚増えます**
      （v4 大④ で左に一覧を置いたときに実測: 2ページ → 3ページ）。
      印刷用の領域はこの外に置いてあるので影響を受けません。
    */}
    <div className="space-y-3 p-3 sm:p-4 lg:p-6 print:hidden">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="heading-page text-lg sm:text-xl lg:text-2xl flex items-center gap-2">
            <Server className="h-5 w-5 text-amber-500" />
            ラック図
            <span className="text-sub font-normal text-muted-foreground">
              ラック <span className="font-number font-bold">{rackSummaries.length}本</span>
              {" ・ "}実装 <span className="font-number font-bold">{totalUsed}U</span>
              {" ／ "}<span className="font-number">{totalSize}U</span>
            </span>
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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <strong>表示変更モード：</strong>機材ブロックをクリックして表示項目をカスタマイズします。空きスペースのクリックは無効です。
        </div>
      )}

      {inventoryMode && (
        <div className="rounded-lg border bg-muted/30 p-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">棚卸し選択:</span>
            <Select value={selectedCheckId || "none"} onValueChange={(v) => setSelectedCheckId(v === "none" ? "" : v)}>
              <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="棚卸しを選ぶ" /></SelectTrigger>
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
                  機材を取り込む
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  <div className="h-2 w-40 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: totalItems > 0 ? `${(totalChecked / totalItems) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">{totalChecked}/{totalItems}</span>
                </div>
              </>
            )}
          </div>
          {inventoryNotice && (
            <div className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5">
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
          <p className="text-xs">設定の「保管場所」でラックを追加してください</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-start gap-3.5 lg:flex-row">
            <RackList racks={rackSummaries} value={currentRack?.location.id ?? ""} onChange={setSelectedRackId} />

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {currentRack && (
                <div className="rounded-card flex flex-col items-start gap-5 border border-border bg-card p-4 lg:flex-row">
                  <div className="overflow-x-auto">
                    <RackDisplay
                      key={currentRack.location.id}
                      rackData={currentRack}
                      side={side}
                      inventoryMode={inventoryMode && !!selectedCheckId}
                      inventoryMap={inventoryMap}
                      displayEditMode={displayEditMode}
                      rackConfig={rackConfigs[currentRack.location.id]}
                      onCellClick={handleCellClick}
                      onEmptySlotClick={handleEmptySlotClick}
                      onDeleteBlank={handleDeleteBlank}
                      onEditRackSubtitle={handleEditRackSubtitle}
                      onItemHover={handleItemHover}
                      onItemLeave={handleItemLeave}
                    />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                    <p className="text-note flex items-center gap-1.5 text-muted-foreground">
                      <span className="inline-block h-3 w-3 shrink-0 rounded-sm bg-warning" aria-hidden="true" />
                      右のU番号が色付き＝<strong className="font-bold">反対の面にも機材がある</strong>（抜く前に裏を見る）
                    </p>
                    <RackUnitTable
                      units={currentUnits}
                      rows={currentRows}
                      canEdit={!displayEditMode && !inventoryMode}
                      onOpen={(id) => {
                        const it = (currentRack.items ?? []).find((x: any) => x.id === id);
                        if (it) handleCellClick(it);
                      }}
                      onAddPanel={() => handleEmptySlotClick(currentRack.location.id, 1)}
                    />
                  </div>
                </div>
              )}
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
      <FormDialog open={!!blankDialog} onOpenChange={(o) => { if (!o) setBlankDialog(null); }} title="パネルを追加"
        footer={
          <FormDialogFooter>
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
          </FormDialogFooter>
        }
      >
        <div className="space-y-3">
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
        </div>
      </FormDialog>

      {/* 重複機材ダイアログ */}
      <Dialog open={!!overlapDialog} onOpenChange={(o) => { if (!o) setOverlapDialog(null); }}>
        <DialogContent>
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
        <DialogContent size="sm">
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

    {/* 印刷用ラック実装図（スクリーンでは非表示）。**画面の枠の外**に置く */}
    <PrintRackArea
      racks={filteredRacks}
      side={side}
      rackConfigs={rackConfigs}
      colors={colors}
    />
    </>
  );
}

// ── RackDisplay ───────────────────────────────────────────────────────────────
function RackDisplay({ rackData, side, inventoryMode, inventoryMap, displayEditMode, rackConfig, onCellClick, onEmptySlotClick, onDeleteBlank, onEditRackSubtitle, onItemHover, onItemLeave }: {
  rackData: { location: any; items: any[]; blanks?: any[] };
  side: "front" | "back";
  inventoryMode: boolean;
  inventoryMap: Record<string, InventoryEntry>;
  displayEditMode: boolean;
  rackConfig?: RackConfig;
  onCellClick: (item: any, overlapItems?: any[]) => void;
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

  const posSlotItems: Record<string, any[]> = {};
  for (const it of sideItems) {
    const key = `${it.rack_position}:${it.rack_slot}`;
    if (!posSlotItems[key]) posSlotItems[key] = [];
    posSlotItems[key].push(it);
  }
  const posSlotCount: Record<string, number> = Object.fromEntries(
    Object.entries(posSlotItems).map(([k, v]) => [k, v.length])
  );

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
                onClick={() => onCellClick(it, isOverlap ? posSlotItems[`${it.rack_position}:${it.rack_slot}`] : undefined)}
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
                      found === 1 ? "bg-emerald-500 text-white" : "bg-white text-muted-foreground"
                    }`}
                  >
                    {found === 1 ? "✓" : "○"}
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
