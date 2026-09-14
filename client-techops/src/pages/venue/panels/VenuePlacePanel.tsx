// 会場図面 — 左パネル「追加」タブ（設計: docs/design/v4/venue-layout.md §6②）。
// 備品・カメラ・人・図形の4群。検索欄が先頭。品目カードに寸法と「追加した数／保有数」。
// 押すと表示範囲の中央に実寸で追加する（`onPlace`/`onPlaceShape` は呼び出し側 —
// `VenueEditorPage` — が history.commit へつなぐ）。
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { VenueCatalogItem, VenueItem } from "@gmo-onair/shared/src/venue/types";
import { SHAPE_DEFAULTS, type ShapeKey } from "../venueItemOps";

type Group = "furniture" | "camera" | "people" | "shape";
const GROUP_LABEL: Record<Group, string> = { furniture: "備品", camera: "カメラ", people: "人", shape: "図形" };
const SHAPE_LABEL: Record<ShapeKey, string> = { rect: "四角", circle: "丸", line: "線", text: "文字", dimension: "寸法線" };
const SHAPE_HINT: Record<ShapeKey, string> = {
  rect: `既定 ${SHAPE_DEFAULTS.rect.w}×${SHAPE_DEFAULTS.rect.d}`,
  circle: `既定 Ø${SHAPE_DEFAULTS.circle.diameter}`,
  line: `既定 ${SHAPE_DEFAULTS.line.length}`,
  text: "高さ200",
  dimension: "2点間のmmを表示",
};

function sizeText(cat: VenueCatalogItem): string {
  const fp = cat.footprint;
  if (fp.shape === "circle") return `Ø${fp.diameter.toLocaleString("ja-JP")}`;
  if (fp.shape === "line") return `長さ ${fp.length.toLocaleString("ja-JP")}`;
  if (fp.shape === "rect") return `${fp.w.toLocaleString("ja-JP")} × ${fp.d.toLocaleString("ja-JP")}`;
  const w = cat.sizeMm.w, d = cat.sizeMm.d;
  return typeof w === "number" && typeof d === "number" ? `${w.toLocaleString("ja-JP")} × ${d.toLocaleString("ja-JP")}` : "寸法未定";
}

// クレーンは TK-53AL だけを残す（2026-09-14 のご判断）。TK-53A と、その専用台車
// TI-04B（「53A 台車」）はメニューから外す。カタログの行自体は残す
// （既存の図面に置いてあれば表示・書き出しは今までどおり）
const HIDDEN_CATALOG_KEYS = new Set(["crane-tk53a", "crane-dolly-ti04b"]);

function categoryGroup(cat: VenueCatalogItem): Group | null {
  if (cat.fixed) return null; // 家電4件は「追加」タブに出さない（§11-1）
  if (HIDDEN_CATALOG_KEYS.has(cat.key)) return null;
  if (cat.category === "camera") return "camera";
  if (cat.category === "people") return "people";
  if (cat.category === "generic") return null; // 図形は catalog ではなくクライアント側の5種を使う
  return "furniture";
}

interface Props {
  catalog: VenueCatalogItem[];
  items: VenueItem[];
  editable: boolean;
  onPlace: (cat: VenueCatalogItem) => void;
  onPlaceShape: (shapeKey: ShapeKey) => void;
}

export default function VenuePlacePanel({ catalog, items, editable, onPlace, onPlaceShape }: Props) {
  const [group, setGroup] = useState<Group>("furniture");
  const [q, setQ] = useState("");

  const countByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) if (it.key) m.set(it.key, (m.get(it.key) ?? 0) + 1);
    return m;
  }, [items]);

  const query = q.trim();
  const list = useMemo(() => {
    if (query) return catalog.filter((c) => categoryGroup(c) && c.label.includes(query));
    return catalog.filter((c) => categoryGroup(c) === group);
  }, [catalog, group, query]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 p-3">
      <div className="flex h-8 items-center gap-1.5 rounded-control border border-input px-2.5 text-muted-foreground">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="品目を探す" className="h-7 border-0 p-0 text-xs shadow-none focus-visible:ring-0" />
      </div>

      {!query && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
            <button
              key={g} type="button" onClick={() => setGroup(g)}
              className={`h-[27px] rounded-control border px-2.5 text-[11.5px] font-bold ${g === group ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground"}`}
            >
              {GROUP_LABEL[g]}
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {(query ? false : group === "shape") ? (
          (Object.keys(SHAPE_DEFAULTS) as ShapeKey[]).map((s) => (
            <button
              key={s} type="button" disabled={!editable} onClick={() => onPlaceShape(s)}
              className="flex h-[42px] flex-col justify-center gap-0.5 rounded-control border border-border bg-background px-2.5 text-left hover:bg-muted/40 disabled:opacity-50"
            >
              <span className="text-xs font-bold">{SHAPE_LABEL[s]}</span>
              <span className="num text-[10.5px] text-muted-foreground">{SHAPE_HINT[s]}</span>
            </button>
          ))
        ) : (
          list.map((c) => {
            const n = countByKey.get(c.key) ?? 0;
            const over = c.qty != null && n > c.qty;
            return (
              <button
                key={c.key} type="button" disabled={!editable} onClick={() => onPlace(c)} title="押すと表示範囲の中央に実寸で追加します"
                className="flex h-[42px] flex-col justify-center gap-0.5 rounded-control border border-border bg-background px-2.5 text-left hover:bg-muted/40 disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">{c.label}</span>
                  <span className={`num shrink-0 text-[10.5px] font-bold ${over ? "text-destructive" : "text-muted-foreground"}`}>{n} / {c.qty ?? "—"}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="num text-[10.5px] text-muted-foreground">{sizeText(c)}</span>
                  {c.estimated && <span className="rounded border border-warning-border px-1 text-[9px] font-bold leading-[13px] text-warning">寸法は推定</span>}
                </span>
              </button>
            );
          })
        )}
        {!query && group !== "shape" && list.length === 0 && (
          <p className="p-2 text-[11px] text-muted-foreground">この群には品目がありません。</p>
        )}
      </div>

      <p className="text-[10.5px] leading-[1.5] text-muted-foreground">
        押すと表示範囲の中央に実寸で追加します。数字は 追加した数／保有数。
      </p>
    </div>
  );
}
