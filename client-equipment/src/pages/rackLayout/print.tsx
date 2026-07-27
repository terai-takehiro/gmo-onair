// ラック図の印刷用 (画面には出さず @media print でだけ出る) — v2.9.294 で切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { TYPE_BG } from '@/lib/constants';
import { PRINT_U_H, PRINT_U_H_MIN, PRINT_RACK_BODY_BUDGET_PX, PRINT_RACK_W, slotToColumn, type CellConfig, type RackConfig } from './config';

export function PrintRackArea({ racks, side, rackConfigs, colors }: {
  racks: any[];
  side: "front" | "back";
  rackConfigs: Record<string, RackConfig>;
  colors: any[];
}) {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  // 最も背の高いラックがA4縦1ページ内に収まるよう px/U を自動調整。
  // 全ラックで同じスケールを使うことで見た目の比較ができる。
  const maxUnits = racks.reduce(
    (m: number, r: any) => Math.max(m, r.location.rack_units ?? 20),
    1
  );
  const printUH = Math.max(
    PRINT_U_H_MIN,
    Math.min(PRINT_U_H, PRINT_RACK_BODY_BUDGET_PX / maxUnits)
  );
  const fontScale = printUH / PRINT_U_H;

  return (
    <div id="rack-print-area-wrapper">
      <div className="rack-print-title">
        ラック実装ビュー — {side === "front" ? "前面" : "背面"}
      </div>
      <div className="rack-print-meta">
        {today} ／ {racks.length} ラック
      </div>
      <div className="rack-print-grid">
        {racks.map((rackData: any) => (
          <PrintRackDisplay
            key={rackData.location.id}
            rackData={rackData}
            side={side}
            rackConfig={rackConfigs[rackData.location.id]}
            printUH={printUH}
            fontScale={fontScale}
          />
        ))}
      </div>
      {colors.length > 0 && (
        <div className="rack-print-legend">
          <div className="rack-print-legend-title">凡例</div>
          <div className="rack-print-legend-row">
            {colors.map((c: any) => (
              <div key={c.id} className="rack-print-legend-item">
                <span className="rack-print-legend-swatch" style={{ background: c.color_hex }} />
                <span>{c.name}</span>
                {c.description && <span style={{ opacity: 0.65 }}>（{c.description}）</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PrintRackDisplay({ rackData, side, rackConfig, printUH, fontScale }: {
  rackData: { location: any; items: any[]; blanks?: any[] };
  side: "front" | "back";
  rackConfig?: RackConfig;
  printUH: number;
  fontScale: number;
}) {
  const { location, items, blanks = [] } = rackData;
  const rackUnits: number = location.rack_units ?? 20;
  const sideItems = items.filter((it: any) => it.rack_side === side);
  const sideBlanks = blanks.filter((b: any) => b.rack_side === side);

  const autoSubtitle = [location.branch_name, location.rack_type_name, location.building, location.floor]
    .filter(Boolean).join(" ");
  const subtitle =
    rackConfig?.subtitleMode === "hidden" ? null :
    rackConfig?.subtitleMode === "custom" ? (rackConfig.subtitleText || null) :
    autoSubtitle || null;

  // 縮小時は U番号 / 本体内文字も比例して縮小（最低値で頭打ち）
  const uNumPx = Math.max(5, 5.5 * fontScale);
  const primaryPt = Math.max(4.5, 6.5 * fontScale);
  const secondaryPt = Math.max(4, 5.5 * fontScale);
  const noPt = Math.max(4, 5.5 * fontScale);

  return (
    <div className="rack-print-item">
      <div className="rack-print-rack-header">{location.name}</div>
      {subtitle && <div className="rack-print-rack-subtitle">{subtitle}</div>}
      <div className="rack-print-body-row">
        {/* Left U numbers (every 5 + U1) */}
        <div className="rack-print-u-col">
          {Array.from({ length: rackUnits }, (_, i) => rackUnits - i).map((u) => (
            <div key={u} className="rack-print-u-cell" style={{ height: printUH, fontSize: `${uNumPx}pt` }}>
              {(u % 5 === 0 || u === 1) ? u : ""}
            </div>
          ))}
        </div>

        {/* Rack body */}
        <div
          className="rack-print-body"
          style={{ width: PRINT_RACK_W, height: rackUnits * printUH }}
        >
          {Array.from({ length: rackUnits }, (_, i) => (
            <div
              key={i}
              className="rack-print-gridline"
              style={{ top: i * printUH, height: printUH }}
            />
          ))}

          {sideBlanks.map((b: any) => {
            const { start, span } = slotToColumn(b.rack_slot);
            const height = (b.rack_height ?? 1) * printUH;
            const top = (rackUnits - b.rack_position - (b.rack_height ?? 1) + 1) * printUH;
            const left = ((start - 1) / 6) * PRINT_RACK_W;
            const width = (span / 6) * PRINT_RACK_W;
            const label =
              b.panel_type === "cable"  ? "通線口" :
              b.panel_type === "drawer" ? "引出" :
              b.panel_type === "custom" ? (b.label || "—") : "";
            return (
              <div
                key={b.id}
                className="rack-print-blank-item"
                style={{ top, left, width, height, fontSize: `${noPt}pt` }}
              >
                {label}
              </div>
            );
          })}

          {sideItems.map((it: any) => {
            const { start, span } = slotToColumn(it.rack_slot);
            const height = (it.rack_height ?? 1) * printUH;
            const top = (rackUnits - it.rack_position - (it.rack_height ?? 1) + 1) * printUH;
            const left = ((start - 1) / 6) * PRINT_RACK_W;
            const width = (span / 6) * PRINT_RACK_W;
            const bg = it.color_hex ?? TYPE_BG[it.equipment_type_code] ?? "#e5e7eb";
            const cfg: CellConfig | undefined = it.display_config ?? undefined;

            const primary =
              cfg?.primary === "model"  ? (it.model_number || it.name) :
              cfg?.primary === "name"   ? it.name :
              cfg?.primary === "custom" ? (cfg.customText || "—") :
              (it.model_number || it.name);

            const secondary = !cfg || cfg.primary === "model" ? it.name :
              cfg.primary === "name" ? it.model_number : null;

            return (
              <div
                key={it.id}
                className="rack-print-cell-item"
                style={{ top, left, width, height, background: bg }}
              >
                <div
                  className="rack-print-cell-primary"
                  style={{ fontSize: `${primaryPt}pt` }}
                >
                  {primary}
                </div>
                {height > printUH && secondary && (
                  <div
                    className="rack-print-cell-secondary"
                    style={{ fontSize: `${secondaryPt}pt` }}
                  >
                    {secondary}
                  </div>
                )}
                {it.unit_number != null && (
                  <div
                    className="rack-print-cell-no"
                    style={{ fontSize: `${noPt}pt` }}
                  >
                    No.{it.unit_number}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right U numbers */}
        <div className="rack-print-u-col">
          {Array.from({ length: rackUnits }, (_, i) => rackUnits - i).map((u) => (
            <div key={u} className="rack-print-u-cell-r" style={{ height: printUH, fontSize: `${uNumPx}pt` }}>
              {(u % 5 === 0 || u === 1) ? u : ""}
            </div>
          ))}
        </div>
      </div>
      <div className="rack-print-u-footer">{rackUnits}U</div>
    </div>
  );
}
