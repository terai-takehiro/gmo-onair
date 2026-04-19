import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
import { Loader2, Server, ClipboardCheck } from "lucide-react";

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

export default function RackLayoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [side, setSide] = useState<"front" | "back">("front");
  const [inventoryMode, setInventoryMode] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string>("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Blank panel dialog state
  const [blankDialog, setBlankDialog] = useState<{ locationId: string; uPos: number } | null>(null);
  const [blankForm, setBlankForm] = useState({ rack_height: "1", rack_slot: "full", panel_type: "blank" });
  const [confirmDeleteBlankId, setConfirmDeleteBlankId] = useState<string | null>(null);

  const { data: racksData, isLoading: racksLoading, isError: racksError } = useQuery({
    queryKey: ["equipment-racks"],
    queryFn: async () => (await api.get("/equipment/racks")).data.data,
  });

  const { data: colorsData } = useQuery({
    queryKey: ["equipment-colors"],
    queryFn: async () => (await api.get("/equipment/colors")).data.data,
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
  const inventoryChecks: any[] = (inventoryChecksData ?? []).filter(
    (c: any) => c.status === "draft" || c.status === "in_progress"
  );

  const inventoryMap = useMemo(() => {
    if (!inventoryDetail?.items) return {};
    const m: Record<string, { id: string; found: boolean | null }> = {};
    for (const item of inventoryDetail.items) {
      m[item.equipment_id] = { id: item.id, found: item.found };
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
    mutationFn: async ({ locationId, rack_position, rack_height, rack_slot, rack_side }: any) =>
      api.post(`/equipment/racks/${locationId}/blanks`, { rack_position, rack_height, rack_slot, rack_side }),
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

  const handleCellClick = (item: any) => {
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
    if (inventoryMode) return;
    setBlankForm({ rack_height: "1", rack_slot: "full", panel_type: "blank" });
    setBlankDialog({ locationId, uPos });
  };

  const handleDeleteBlank = (id: string) => {
    if (inventoryMode) return;
    setConfirmDeleteBlankId(id);
  };

  const filteredRacks = useMemo(() => {
    if (branchFilter === "all") return racks;
    return racks.filter((r: any) =>
      r.location.building?.includes(branchFilter) || r.location.name?.includes(branchFilter)
    );
  }, [racks, branchFilter]);

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
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="heading-page text-xl lg:text-2xl flex items-center gap-2">
          <Server className="h-5 w-5 text-amber-500" />
          ラック実装ビュー
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              <SelectItem value="Y">用賀</SelectItem>
              <SelectItem value="S">渋谷</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex rounded-lg overflow-hidden border">
            <button
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${side === "front" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSide("front")}
            >
              前面
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${side === "back" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              onClick={() => setSide("back")}
            >
              背面
            </button>
          </div>

          <Button
            size="sm"
            variant={inventoryMode ? "default" : "outline"}
            onClick={() => { setInventoryMode((v) => !v); }}
          >
            <ClipboardCheck className="h-4 w-4 mr-1" />
            棚卸し
          </Button>
        </div>
      </div>

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
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 min-w-max items-end">
              {filteredRacks.map((rackData: any) => (
                <RackDisplay
                  key={rackData.location.id}
                  rackData={rackData}
                  side={side}
                  inventoryMode={inventoryMode && !!selectedCheckId}
                  inventoryMap={inventoryMap}
                  onCellClick={handleCellClick}
                  onEmptySlotClick={handleEmptySlotClick}
                  onDeleteBlank={handleDeleteBlank}
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
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{blankForm.panel_type === "cable" ? "通線口" : "ブランクパネル"}を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>種別</Label>
              <div className="flex gap-2">
                {[{ value: "blank", label: "ブランクパネル" }, { value: "cable", label: "通線口" }].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex-1 py-1.5 text-sm rounded border transition-colors ${blankForm.panel_type === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                    onClick={() => setBlankForm(f => ({ ...f, panel_type: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
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
                disabled={addBlankMutation.isPending || !blankDialog?.uPos}
                onClick={() => {
                  if (!blankDialog) return;
                  addBlankMutation.mutate({
                    locationId: blankDialog.locationId,
                    rack_position: blankDialog.uPos,
                    rack_height: Number(blankForm.rack_height) || 1,
                    rack_slot: blankForm.rack_slot,
                    rack_side: side,
                    panel_type: blankForm.panel_type,
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
    </div>
  );
}

function RackDisplay({ rackData, side, inventoryMode, inventoryMap, onCellClick, onEmptySlotClick, onDeleteBlank }: {
  rackData: { location: any; items: any[]; blanks?: any[] };
  side: "front" | "back";
  inventoryMode: boolean;
  inventoryMap: Record<string, { id: string; found: boolean | null }>;
  onCellClick: (item: any) => void;
  onEmptySlotClick: (locationId: string, uPos: number) => void;
  onDeleteBlank: (id: string) => void;
}) {
  const { location, items, blanks = [] } = rackData;
  const rackUnits: number = location.rack_units ?? 20;

  const sideItems = items.filter((it: any) => it.rack_side === side);
  const sideBlanks = blanks.filter((b: any) => b.rack_side === side);

  const posSlotCount: Record<string, number> = {};
  for (const it of sideItems) {
    const key = `${it.rack_position}:${it.rack_slot}`;
    posSlotCount[key] = (posSlotCount[key] ?? 0) + 1;
  }

  const CELL_H = 28;
  const RACK_W = 240;

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
      <div className="text-center text-sm font-bold mb-1 px-2">{location.name}</div>
      {location.building && (
        <div className="text-center text-xs text-muted-foreground mb-2">{location.building}{location.floor ? ` ${location.floor}` : ""}</div>
      )}

      <div className="flex gap-1">
        {/* U numbers (left) */}
        <div className="flex flex-col shrink-0 pt-0.5" style={{ width: 24 }}>
          {Array.from({ length: rackUnits }, (_, i) => rackUnits - i).map((u) => (
            <div key={u} style={{ height: CELL_H, fontSize: 9 }} className="flex items-center justify-end pr-1 text-muted-foreground tabular-nums leading-none">
              {u}
            </div>
          ))}
        </div>

        {/* Rack body */}
        <div
          className="relative border-2 border-border bg-zinc-100 rounded-sm cursor-crosshair"
          style={{ width: RACK_W, height: rackUnits * CELL_H }}
          onClick={handleRackBodyClick}
        >
          {/* Grid lines */}
          {Array.from({ length: rackUnits }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-b border-zinc-200/60 pointer-events-none"
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
            const isCable = b.panel_type === "cable";
            return (
              <button
                key={b.id}
                className={`absolute rounded-[2px] overflow-hidden z-[2] transition-colors ${
                  isCable
                    ? "border border-dashed border-zinc-400 bg-white/60 hover:bg-zinc-100/80"
                    : "border border-zinc-300 bg-zinc-300 hover:bg-zinc-400"
                }`}
                style={{ top, left, width, height }}
                onClick={() => onDeleteBlank(b.id)}
                title="クリックで削除"
              >
                <span
                  className={`flex items-center justify-center h-full font-mono tracking-widest select-none ${
                    isCable ? "text-zinc-400" : "text-zinc-500"
                  }`}
                  style={{ fontSize: height <= CELL_H ? 8 : 10 }}
                >
                  {isCable ? "通線口" : "BLANK"}
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

            return (
              <button
                key={it.id}
                className="absolute border border-white/60 rounded-[2px] overflow-hidden text-left hover:brightness-90 transition-all focus:outline-none focus:ring-1 focus:ring-primary z-[2]"
                style={{ top, left, width, height, background: bg }}
                onClick={() => onCellClick(it)}
                title={`${it.name}${it.model_number ? ` / ${it.model_number}` : ""}${it.unit_number ? ` No.${it.unit_number}` : ""}`}
              >
                {height <= CELL_H ? (
                  /* 1U: 型名 + 丸バッジ番号 を1行 */
                  <div className="flex items-center h-full px-1.5 gap-1 min-w-0">
                    <span className="font-mono font-bold truncate leading-none" style={{ fontSize: 10 }}>
                      {it.model_number || it.name}
                    </span>
                    {it.unit_number && <UnitBadge n={it.unit_number} size="sm" />}
                  </div>
                ) : height <= CELL_H * 2 ? (
                  /* 2U: 型名 + バッジ を上段、機材名を下段 */
                  <div className="flex flex-col justify-center h-full px-1.5 py-0.5 gap-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-mono font-bold truncate leading-tight" style={{ fontSize: 11 }}>
                        {it.model_number || it.name}
                      </span>
                      {it.unit_number && <UnitBadge n={it.unit_number} size="md" />}
                    </div>
                    <span className="truncate leading-tight opacity-60" style={{ fontSize: 9 }}>
                      {it.name}
                    </span>
                  </div>
                ) : (
                  /* 3U+: 機材名 → 型名 + バッジ */
                  <div className="flex flex-col justify-center h-full px-1.5 py-1 gap-0.5">
                    <span className="font-medium truncate leading-tight" style={{ fontSize: 11 }}>
                      {it.name}
                    </span>
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="font-mono font-bold truncate leading-tight" style={{ fontSize: 11 }}>
                        {it.model_number}
                      </span>
                      {it.unit_number && <UnitBadge n={it.unit_number} size="md" />}
                    </div>
                  </div>
                )}
                {isOverlap && (
                  <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive border border-white" title="重複" />
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

        {/* U numbers (right) */}
        <div className="flex flex-col shrink-0 pt-0.5" style={{ width: 24 }}>
          {Array.from({ length: rackUnits }, (_, i) => rackUnits - i).map((u) => (
            <div key={u} style={{ height: CELL_H, fontSize: 9 }} className="flex items-center pl-1 text-muted-foreground tabular-nums leading-none">
              {u}
            </div>
          ))}
        </div>
      </div>

      <div className="text-center text-[10px] text-muted-foreground mt-1">{rackUnits}U</div>
    </div>
  );
}

function UnitBadge({ n, size }: { n: number | string; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-3.5 px-1 text-[8px]" : "h-4 px-1 text-[9px]";
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center rounded-sm bg-black/25 text-white font-bold leading-none tabular-nums ${dim}`}
    >
      {n}
    </span>
  );
}
