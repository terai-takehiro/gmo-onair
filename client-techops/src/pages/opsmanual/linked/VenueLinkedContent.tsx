// venue.layout（会場図面の線画）・venue.items（数量表）の中身描画（段C・E）。
// 設計: docs/design/v4/venue-layout.md §9-3。resolver
// （`server/src/contexts/qsheet/services/manual-resolvers/venue.resolver.ts`）が返す
// `data` は自己完結の線画データで、下敷き画像・外部URLを一切含まない
// （冊子の「線画で描く・インクを使わない」`production-manual.md` §6-6 と同じ規律）。
//
// `venue.layout` の実際の形（resolver 冒頭コメントより）:
//   { layoutId, docNo, rev, title, planLabel, floor, area, boundsMm, polygonMm,
//     fixtures, items, scale, updatedAt }
// `venue.items` の実際の形:
//   { layoutId, docNo, rev, title, planLabel, rows: [{key,label,placed,qty,unit,storage}], updatedAt }
//
// options（`link.options`。`LinkedBlockInspector.tsx` が書く）:
// - `venue.layout` の `legend`・`grid` はここで直接効かせる（クライアント側の見せ方の話）。
//   `range`・`scale` は resolver がまだ読んでいない値（resolver 冒頭コメント「あくまで
//   参考値」）なので、届いた `data.boundsMm`/`data.scale` は変えず、**紙の札の表記だけ**
//   `scale` があれば上書きする（sheet.excerpt の `sectionTitle` と同じ「クライアント側だけで
//   効かせられる範囲に留める」考え方）。
// - `venue.items` の `showCount`/`showQty`/`showStorage` は出す列を絞る。
import { asRecord, asRecordArray, LinkedEmpty, LinkedGrid, type Grid } from "./sharedLinkedContent";

interface Props {
  blockKey: "venue.layout" | "venue.items";
  data: unknown;
  options: Record<string, unknown>;
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

interface Bounds { x: number; y: number; w: number; h: number }

function asBounds(v: unknown): Bounds | null {
  const r = asRecord(v);
  if (typeof r.w !== "number" || typeof r.h !== "number") return null;
  return { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) };
}

function asPolygon(v: unknown): [number, number][] {
  if (!Array.isArray(v)) return [];
  return v.filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2).map((p) => [num(p[0]), num(p[1])]);
}

const KIND_COLOR: Record<string, string> = {
  catalog: "#005bac",
  camera: "#7c3aed",
  person: "#c2410e",
  shape: "#5d6470",
  text: "#5d6470",
  line: "#5d6470",
  dimension: "#9aa1ab",
};

function ItemMark({ item, unit }: { item: Record<string, unknown>; unit: number }) {
  const kind = str(item.kind) || "shape";
  const color = KIND_COLOR[kind] ?? "#5d6470";
  const x = num(item.x);
  const y = num(item.y);
  const stroke = Math.max(unit * 0.08, 1.5);
  const points = Array.isArray(item.points) ? (item.points as unknown[]) : null;

  if (points && points.length >= 2) {
    const pts = points
      .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
      .map((p) => `${num(p[0])},${num(p[1])}`)
      .join(" ");
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={stroke} />;
  }
  if (typeof item.diameter === "number") {
    return <circle cx={x} cy={y} r={item.diameter / 2} fill={`${color}1a`} stroke={color} strokeWidth={stroke} />;
  }
  const w = num(item.w, 0);
  const d = num(item.d, 0);
  if (w <= 0 || d <= 0) return null;
  return (
    <rect
      x={-w / 2}
      y={-d / 2}
      width={w}
      height={d}
      fill={`${color}1a`}
      stroke={color}
      strokeWidth={stroke}
      transform={`translate(${x} ${y}) rotate(${num(item.rotation)})`}
    />
  );
}

function VenueLayoutContent({ data, options }: { data: unknown; options: Record<string, unknown> }) {
  const obj = asRecord(data);
  const bounds = asBounds(obj.boundsMm);
  if (!bounds || bounds.w <= 0 || bounds.h <= 0) return <LinkedEmpty text="図面の範囲が分かりません" />;

  const polygon = asPolygon(obj.polygonMm);
  const fixtures = asRecordArray(obj.fixtures).filter((f) => asBounds(f.bboxMm));
  const items = asRecordArray(obj.items);
  const showLegend = options.legend !== false; // 既定 true
  const showGrid = options.grid === true; // 既定 false
  // options.scale は `LinkedBlockInspector.tsx` の <select> が文字列で書く（"auto" | "50"…）
  const scaleOption = typeof options.scale === "string" && options.scale !== "auto" ? Number(options.scale) : null;
  const scaleLabel = scaleOption && Number.isFinite(scaleOption) ? scaleOption : num(obj.scale, 100);
  const unit = Math.max(1, Math.max(bounds.w, bounds.h) / 100);
  const usedKinds = Array.from(new Set(items.map((i) => str(i.kind) || "shape")));

  const tag = [
    obj.docNo ? `${str(obj.docNo)}${obj.rev ? ` rev.${num(obj.rev)}` : ""}` : null,
    `1:${scaleLabel}`,
    [str(obj.floor), str(obj.area)].filter(Boolean).join(" "),
  ].filter(Boolean).join(" ・ ");

  return (
    <div className="flex h-full w-full flex-col gap-0.5 overflow-hidden p-1">
      <div className="font-number shrink-0 truncate text-[8px] font-medium text-foreground">{tag}</div>
      <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`} preserveAspectRatio="xMidYMid meet" className="min-h-0 w-full flex-1">
        {showGrid && (
          <g stroke="#c2410e" strokeWidth={Math.max(unit * 0.02, 0.3)} strokeDasharray={`${unit * 0.6} ${unit * 0.15}`}>
            {[0.33, 0.66].map((f) => (
              <line key={`gx-${f}`} x1={bounds.x + bounds.w * f} y1={bounds.y} x2={bounds.x + bounds.w * f} y2={bounds.y + bounds.h} />
            ))}
            {[0.33, 0.66].map((f) => (
              <line key={`gy-${f}`} x1={bounds.x} y1={bounds.y + bounds.h * f} x2={bounds.x + bounds.w} y2={bounds.y + bounds.h * f} />
            ))}
          </g>
        )}
        {polygon.length >= 3 && (
          <polygon points={polygon.map((p) => p.join(",")).join(" ")} fill="none" stroke="#1a1d24" strokeWidth={Math.max(unit * 0.1, 2)} />
        )}
        {fixtures.map((f, i) => {
          const b = asBounds(f.bboxMm)!;
          return <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#9aa1ab" strokeWidth={Math.max(unit * 0.06, 1.5)} />;
        })}
        {items.map((item, i) => <ItemMark key={str(item.id) || i} item={item} unit={unit} />)}
        {/* 1mバー（§8-6「消せない」）。右下固定 */}
        <g stroke="#1a1d24" strokeWidth={Math.max(unit * 0.08, 1.5)}>
          <line x1={bounds.x + bounds.w - unit * 2.5 - 1000} y1={bounds.y + bounds.h - unit * 2.5} x2={bounds.x + bounds.w - unit * 2.5} y2={bounds.y + bounds.h - unit * 2.5} />
        </g>
        <text x={bounds.x + bounds.w - unit * 2.5 - 500} y={bounds.y + bounds.h - unit * 3} fontSize={unit * 1.4} fill="#1a1d24" textAnchor="middle">1m</text>
      </svg>
      {showLegend && usedKinds.length > 0 && (
        <div className="flex shrink-0 flex-wrap gap-x-2 text-[7px] text-muted-foreground">
          {usedKinds.map((k) => (
            <span key={k} className="inline-flex items-center gap-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: KIND_COLOR[k] ?? "#5d6470" }} />
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface VenueRow { key: string; label: string; placed: number; qty: number | null; unit: string | null; storage: string | null }

function normalizeVenueRows(data: unknown): VenueRow[] {
  const obj = asRecord(data);
  return asRecordArray(obj.rows).map((r) => ({
    key: str(r.key),
    label: str(r.label) || str(r.key),
    placed: num(r.placed),
    qty: typeof r.qty === "number" ? r.qty : null,
    unit: typeof r.unit === "string" ? r.unit : null,
    storage: typeof r.storage === "string" ? r.storage : null,
  }));
}

function VenueItemsContent({ data, options }: { data: unknown; options: Record<string, unknown> }) {
  const rows = normalizeVenueRows(data);
  if (rows.length === 0) return <LinkedEmpty text="置かれている品目がありません" />;

  const showCount = options.showCount !== false;
  const showQty = options.showQty !== false;
  const showStorage = options.showStorage !== false;

  const columns = ["品目", ...(showCount ? ["数"] : []), ...(showQty ? ["保有数"] : []), ...(showStorage ? ["保管場所"] : [])];
  const grid: Grid = {
    columns,
    rows: rows.map((r) => [
      r.label,
      ...(showCount ? [`${r.placed}${r.unit ?? ""}`] : []),
      ...(showQty ? [r.qty == null ? "—" : String(r.qty)] : []),
      ...(showStorage ? [r.storage ?? "—"] : []),
    ]),
  };
  return <LinkedGrid grid={grid} />;
}

export default function VenueLinkedContent({ blockKey, data, options }: Props) {
  if (blockKey === "venue.items") return <VenueItemsContent data={data} options={options} />;
  return <VenueLayoutContent data={data} options={options} />;
}
