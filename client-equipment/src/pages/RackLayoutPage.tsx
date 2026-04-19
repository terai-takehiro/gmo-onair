import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Server, ClipboardCheck } from "lucide-react";

// rack_slot → CSS grid-column
function slotToColumn(slot: string): { start: number; span: number } {
  switch (slot) {
    case "left-1_2":  return { start: 1, span: 3 };
    case "right-1_2": return { start: 4, span: 3 };
    case "left-1_3":  return { start: 1, span: 2 };
    case "mid-1_3":   return { start: 3, span: 2 };
    case "right-1_3": return { start: 5, span: 2 };
    default:          return { start: 1, span: 6 }; // full
  }
}

// equipment_type_code → fallback bg color
const TYPE_BG: Record<string, string> = {
  V: "#ede9fe", C: "#e0f2fe", A: "#fef9c3", IC: "#ccfbf1",
  NW: "#cffafe", L: "#fefce8", XR: "#fce7f3", E: "#f3f4f6",
};

export default function RackLayoutPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [side, setSide] = useState<"front" | "back">("front");
  const [inventoryMode, setInventoryMode] = useState(false);
  const [selectedCheckId, setSelectedCheckId] = useState<string>("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  // Fetch racks
  const { data: racksData, isLoading: racksLoading } = useQuery({
    queryKey: ["equipment-racks"],
    queryFn: async () => (await api.get("/equipment/racks")).data.data,
  });

  // Fetch colors for legend
  const { data: colorsData } = useQuery({
    queryKey: ["equipment-colors"],
    queryFn: async () => (await api.get("/equipment/colors")).data.data,
  });

  // Fetch inventory checks (for mode)
  const { data: inventoryChecksData } = useQuery({
    queryKey: ["equipment-inventory-checks"],
    queryFn: async () => (await api.get("/equipment/inventory-checks")).data.data,
  });

  // Fetch selected inventory check details (items list)
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

  // Map: equipment_id → { checkItemId, found }
  const inventoryMap = useMemo(() => {
    if (!inventoryDetail?.items) return {};
    const m: Record<string, { id: string; found: boolean | null }> = {};
    for (const item of inventoryDetail.items) {
      m[item.equipment_id] = { id: item.id, found: item.found };
    }
    return m;
  }, [inventoryDetail]);

  // Progress
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

  // Filter racks by branch
  const filteredRacks = useMemo(() => {
    if (branchFilter === "all") return racks;
    return racks.filter((r: any) => r.location.location_code === branchFilter || r.location.building?.includes(branchFilter));
  }, [racks, branchFilter]);

  if (racksLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          {/* Branch filter */}
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全て</SelectItem>
              <SelectItem value="Y">用賀</SelectItem>
              <SelectItem value="S">渋谷</SelectItem>
            </SelectContent>
          </Select>

          {/* Front/Back tab */}
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

          {/* Inventory mode toggle */}
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

      {/* Inventory mode controls */}
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
          {/* Racks horizontal scroll area */}
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-6 min-w-max items-start">
              {filteredRacks.map((rackData: any) => (
                <RackDisplay
                  key={rackData.location.id}
                  rackData={rackData}
                  side={side}
                  inventoryMode={inventoryMode && !!selectedCheckId}
                  inventoryMap={inventoryMap}
                  onCellClick={handleCellClick}
                />
              ))}
            </div>
          </div>

          {/* Legend */}
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
    </div>
  );
}

function RackDisplay({ rackData, side, inventoryMode, inventoryMap, onCellClick }: {
  rackData: { location: any; items: any[] };
  side: "front" | "back";
  inventoryMode: boolean;
  inventoryMap: Record<string, { id: string; found: boolean | null }>;
  onCellClick: (item: any) => void;
}) {
  const { location, items } = rackData;
  const rackUnits: number = location.rack_units ?? 20;

  // Filter by side
  const sideItems = items.filter((it: any) => it.rack_side === side);

  // Detect overlaps: same (rack_position, rack_slot) pair
  const posSlotCount: Record<string, number> = {};
  for (const it of sideItems) {
    const key = `${it.rack_position}:${it.rack_slot}`;
    posSlotCount[key] = (posSlotCount[key] ?? 0) + 1;
  }

  const CELL_H = 28; // px per U
  const RACK_W = 240; // px total width

  return (
    <div className="shrink-0">
      {/* Rack name */}
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
          className="relative border-2 border-border bg-zinc-100 rounded-sm"
          style={{ width: RACK_W, height: rackUnits * CELL_H }}
        >
          {/* Grid lines */}
          {Array.from({ length: rackUnits }, (_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-b border-zinc-200/60"
              style={{ top: i * CELL_H, height: CELL_H }}
            />
          ))}

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
                className="absolute border border-white/60 rounded-[2px] overflow-hidden text-left hover:brightness-90 transition-all focus:outline-none focus:ring-1 focus:ring-primary"
                style={{ top, left, width, height, background: bg }}
                onClick={() => onCellClick(it)}
                title={`${it.name}${it.model_number ? ` / ${it.model_number}` : ""}${it.unit_number ? ` No.${it.unit_number}` : ""}`}
              >
                <div className={`flex flex-col justify-center h-full px-1 ${height <= CELL_H ? "py-0" : "py-0.5"}`}>
                  <span
                    className="font-medium leading-tight block truncate"
                    style={{ fontSize: height <= CELL_H ? 9 : 11 }}
                  >
                    {it.name}
                  </span>
                  {it.model_number && (
                    <span
                      className="font-mono leading-tight block truncate opacity-80"
                      style={{ fontSize: height <= CELL_H ? 8 : 10 }}
                    >
                      {it.model_number}
                    </span>
                  )}
                  {it.unit_number && (
                    <span
                      className="leading-tight opacity-70"
                      style={{ fontSize: height <= CELL_H ? 8 : 9 }}
                    >
                      No.{it.unit_number}
                    </span>
                  )}
                </div>
                {/* Overlap warning */}
                {isOverlap && (
                  <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-destructive border border-white" title="重複" />
                )}
                {/* Inventory status indicator */}
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

          {/* Empty placeholder when no items */}
          {sideItems.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
              機材なし
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

      {/* Rack unit count */}
      <div className="text-center text-[10px] text-muted-foreground mt-1">{rackUnits}U</div>
    </div>
  );
}
