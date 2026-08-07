/**
 * ラックのセルの中身（v4 大④でファイルから切り出し・**中身は1行も変えていない**）
 *
 * 画面と印刷の両方から使います。高さ（U数）で出す行を落とすので、
 * ここを変えると**印刷の1ページ収まりにも効きます**。
 */
import { CELL_H, type CellConfig } from "./printConstants";

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
