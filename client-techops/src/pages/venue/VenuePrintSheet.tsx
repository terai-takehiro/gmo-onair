// 会場図面の紙面1枚（③仕上がり・PDF書き出しの両方が使う共通の見た目）。
// 設計: docs/design/v4/venue-layout.md §6③「紙面には資料番号・案・版・階とエリア・
// 縮尺・1mバー・『◯月◯日時点』が必ず載る」。CSS の mm 単位で組む
// （`ManualPrintDocument.tsx` と同じ考え方。1mm=96/25.4px は呼び出し側の画面表示にだけ使う）。
import type { ReactNode } from "react";
import type { VenueFixture, VenueItem } from "@gmo-onair/shared/src/venue/types";
import VenuePlanSvg, { type VenueBounds } from "./VenuePlanSvg";

export interface VenueQuantityRow {
  key: string;
  label: string;
  count: number;
  qty: number | null;
  storage: string | null;
}

export interface VenuePrintSheetProps {
  paperWidthMm: number;
  paperHeightMm: number;
  docNo: string | null;
  rev: number;
  status: "draft" | "fixed" | "archived";
  title: string;
  planLabel: string | null;
  venueName: string;
  floorLabel?: string;
  areaLabel: string;
  scale: number;
  dateLabel: string;
  bounds: VenueBounds;
  polygonMm?: [number, number][];
  fixtures?: VenueFixture[];
  items: VenueItem[];
  axisLinesMm?: { x: number[]; y: number[] };
  showLegend: boolean;
  quantityRows?: VenueQuantityRow[] | null;
}

const SHEET_PADDING_MM = 10;

function Field({ children }: { children: ReactNode }) {
  return <span style={{ marginRight: 12 }}>{children}</span>;
}

export default function VenuePrintSheet({
  paperWidthMm,
  paperHeightMm,
  docNo,
  rev,
  status,
  title,
  planLabel,
  venueName,
  floorLabel,
  areaLabel,
  scale,
  dateLabel,
  bounds,
  polygonMm,
  fixtures,
  items,
  axisLinesMm,
  showLegend,
  quantityRows,
}: VenuePrintSheetProps) {
  const innerWidth = paperWidthMm - SHEET_PADDING_MM * 2;
  const innerHeight = paperHeightMm - SHEET_PADDING_MM * 2;
  const headerHeight = 12;
  const quantityHeight = quantityRows && quantityRows.length > 0 ? 30 : 0;
  const planHeight = innerHeight - headerHeight - quantityHeight - (quantityHeight > 0 ? 4 : 0);

  return (
    <div
      style={{
        width: `${paperWidthMm}mm`,
        height: `${paperHeightMm}mm`,
        padding: `${SHEET_PADDING_MM}mm`,
        background: "#fff",
        color: "#1a1d24",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'LINE Seed JP','Noto Sans JP',-apple-system,'Hiragino Sans','BIZ UDPGothic','Meiryo',sans-serif",
      }}
    >
      <div style={{ height: `${headerHeight}mm`, display: "flex", alignItems: "center", fontSize: "9pt", flexShrink: 0 }}>
        <Field><strong>{docNo ?? "（資料番号なし）"}</strong>{status === "fixed" && rev > 0 && ` rev.${rev}`}</Field>
        {planLabel && <Field>{planLabel}</Field>}
        <Field>{title}</Field>
        <span style={{ flex: 1 }} />
        <Field>{venueName} {floorLabel} {areaLabel}</Field>
        <Field>縮尺 1:{scale}</Field>
        <Field>{dateLabel} 時点</Field>
        {status === "draft" && <Field>下書き</Field>}
      </div>

      <div
        style={{
          width: `${innerWidth}mm`, height: `${planHeight}mm`, border: "0.3mm solid #e6e9ed", flexShrink: 0,
          overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {/* レビュー指摘（P1）: 縮尺を選んでも図の見た目の大きさが変わらず、印刷物から
            実寸を測ると縮尺の表記と食い違っていた。`bounds`（mm）を選んだ縮尺で割った
            「紙の上の実寸」を `<svg>` に固定で渡す（版面より大きければこの枠がはみ出し分を
            切る＝プレビューでも実際の印刷でも同じ範囲だけが見える）。 */}
        <VenuePlanSvg
          bounds={bounds}
          polygonMm={polygonMm}
          fixtures={fixtures}
          items={items}
          axisLinesMm={axisLinesMm}
          showLegend={showLegend}
          renderWidthMm={bounds.w / scale}
          renderHeightMm={bounds.h / scale}
        />
      </div>

      {quantityRows && quantityRows.length > 0 && (
        <div style={{ marginTop: "4mm", fontSize: "8pt" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["品目", "数", "保有数", "保管場所"].map((c) => (
                  <th key={c} style={{ textAlign: "left", borderBottom: "0.3mm solid #1a1d24", padding: "1mm 2mm" }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quantityRows.map((r) => (
                <tr key={r.key}>
                  <td style={{ padding: "1mm 2mm", borderBottom: "0.2mm solid #e6e9ed" }}>{r.label}</td>
                  <td style={{ padding: "1mm 2mm", borderBottom: "0.2mm solid #e6e9ed" }}>{r.count}</td>
                  <td style={{ padding: "1mm 2mm", borderBottom: "0.2mm solid #e6e9ed" }}>{r.qty ?? "—"}</td>
                  <td style={{ padding: "1mm 2mm", borderBottom: "0.2mm solid #e6e9ed" }}>{r.storage ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
