/** ラック図の機材ブロックにホバーしたとき出す詳細ツールチップ（300ms 遅延で表示） */
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
