// ラック図の絵そのもの (ラック本体・セルの中身・U番号・ツールチップ) — v2.9.294 で切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { useMemo } from 'react';
import { Pencil } from 'lucide-react';
import { TYPE_BG } from '@/lib/constants';
import { CELL_H, RACK_W, slotToColumn, type CellConfig, type RackConfig } from './config';

export function ItemTooltip({ item, x, y }: { item: any; x: number; y: number }) {
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
      <div className="bg-card text-foreground rounded-lg shadow-xl border border-border p-3 space-y-1.5" style={{ width: TOOLTIP_W }}>
        <div className="font-bold text-sm leading-tight">{item.name}</div>
        {item.model_number && (
          <div className="text-xs text-muted-foreground leading-tight tracking-tight ">{item.model_number}</div>
        )}
        {item.manufacturer_name && (
          <div className="text-[11px] text-muted-foreground">{item.manufacturer_name}</div>
        )}
        <div className="border-t border-border pt-1.5 space-y-1">
          {item.serial_number && (
            <div className="flex gap-1.5 text-[11px]">
              <span className="text-muted-foreground shrink-0">S/N</span>
              <span className="font-semibold tracking-tight ">{item.serial_number}</span>
            </div>
          )}
          {(item.status || item.condition) && (
            <div className="flex gap-2 text-[11px]">
              {item.status && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.status === "active" ? "bg-emerald-100 text-emerald-800" : item.status === "repair" ? "bg-amber-100 text-amber-800" : item.status === "retired" ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </span>
              )}
              {item.condition && item.condition !== "good" && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${item.condition === "poor" ? "bg-amber-100 text-amber-800" : item.condition === "broken" ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>
                  {CONDITION_LABEL[item.condition] ?? item.condition}
                </span>
              )}
            </div>
          )}
          {item.notes && (
            <div className="text-[11px] text-muted-foreground leading-snug border-t border-border pt-1 mt-1">
              <span className="text-muted-foreground/60 text-[10px]">備考　</span>{item.notes}
            </div>
          )}
        </div>
        {item.eq_code && (
          <div className="text-[10px] text-muted-foreground/60 pt-0.5">{item.eq_code}</div>
        )}
      </div>
    </div>
  );
}

// ── CellConfigDialog ──────────────────────────────────────────────────────────

export function RackDisplay({ rackData, side, inventoryMode, inventoryMap, displayEditMode, rackConfig, onCellClick, onEmptySlotClick, onDeleteBlank, onEditRackSubtitle, onItemHover, onItemLeave }: {
  rackData: { location: any; items: any[]; blanks?: any[] };
  side: "front" | "back";
  inventoryMode: boolean;
  inventoryMap: Record<string, { id: string; found: boolean }>;
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
export function DefaultCellContent({ it, height }: { it: any; height: number }) {
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
export function ConfiguredCellContent({ it, cfg, height }: { it: any; cfg: CellConfig; height: number }) {
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
export function UnitBadge({ n, size }: { n: number | string; size: "sm" | "md" }) {
  const dim = size === "sm" ? "h-[18px] px-1.5 text-[10px]" : "h-5 px-1.5 text-[11px]";
  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center rounded-sm bg-slate-600 text-white font-bold leading-none tabular-nums ${dim}`}
    >
      {n}
    </span>
  );
}

// ── PrintRackArea (hidden on screen, visible in print) ────────────────────────
