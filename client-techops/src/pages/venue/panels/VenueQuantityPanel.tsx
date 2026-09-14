// 会場図面 — 左パネル「数量」タブ（設計: docs/design/v4/venue-layout.md §6②）。
// 品目・追加した数・保有数・保管場所の一覧。保有数を超えても止めない（赤字で
// 知らせるだけ・§4-4）。家電4件は動かせないため図面には出さない（§11-1）。
import { useMemo } from "react";
import type { VenueCatalogItem, VenueItem } from "@gmo-onair/shared/src/venue/types";

interface Props {
  catalog: VenueCatalogItem[];
  items: VenueItem[];
}

export default function VenueQuantityPanel({ catalog, items }: Props) {
  const rows = useMemo(() => {
    const byKey = new Map(catalog.map((c) => [c.key, c]));
    const counts = new Map<string, number>();
    for (const it of items) if (it.key) counts.set(it.key, (counts.get(it.key) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([key, n]) => ({ key, cat: byKey.get(key), n }))
      .filter((r) => r.cat)
      .sort((a, b) => (b.n > (b.cat!.qty ?? Infinity) ? 1 : 0) - (a.n > (a.cat!.qty ?? Infinity) ? 1 : 0));
  }, [catalog, items]);

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="flex items-center gap-1.5 border-b border-border pb-1.5 text-[10px] font-bold text-muted-foreground">
        <span className="flex-1">品目</span>
        <span className="num w-14 text-right">追加した数</span>
        <span className="num w-10 text-right">保有数</span>
        <span className="w-16 text-right">保管場所</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map(({ key, cat, n }) => {
          const over = cat!.qty != null && n > cat!.qty;
          return (
            <div key={key} className="flex items-center gap-1.5 border-b border-border/60 py-1.5 text-[11.5px]">
              <span className="min-w-0 flex-1 truncate font-bold">{cat!.label}</span>
              <span className={`num w-14 text-right font-bold ${over ? "text-destructive" : ""}`}>{n}</span>
              <span className="num w-10 text-right text-muted-foreground">{cat!.qty ?? "—"}</span>
              <span className="w-16 truncate text-right text-[10.5px] text-muted-foreground">{cat!.storage ?? "—"}</span>
            </div>
          );
        })}
        {rows.length === 0 && <p className="pt-3 text-[11px] text-muted-foreground">まだ何も追加していません。</p>}
      </div>
      <p className="pt-2 text-[10.5px] font-bold text-muted-foreground">
        品目 {items.length} 点
      </p>
      <p className="pt-2 text-[10.5px] leading-[1.6] text-muted-foreground">
        保有数を超えても追加できます（赤字で知らせるだけ）。同じ日の別の図面との合算はしません。家電4件は動かせないのでこの一覧には出しません。
      </p>
    </div>
  );
}
