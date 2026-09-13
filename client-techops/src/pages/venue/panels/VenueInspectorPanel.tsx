// 会場図面 — 右パネルの共通描画（設計: docs/design/v4/venue-layout.md §6②の右列）。
// 「選択中の品目」「グループ」「図面の情報（未選択）」の3ケースはどれも
// 見出し・行・チップ・ステッパー・ボタン・警告・注記という同じ形をしているので、
// `VenueInspector.tsx` が組み立てた記述（`InspectorPanelData`）をここで描くだけにする。
export interface InspectorRow { label: string; value: string; danger?: boolean }
export interface InspectorChip { label: string; active: boolean; onClick: () => void }
export interface InspectorChipGroup { title: string; chips: InspectorChip[] }
export interface InspectorStepper { label: string; value: string; onDec: () => void; onInc: () => void }
export interface InspectorButton { label: string; onClick: () => void; danger?: boolean; primary?: boolean; disabled?: boolean }
export interface InspectorPanelData {
  title: string;
  badge?: string;
  rows: InspectorRow[];
  chipGroups?: InspectorChipGroup[];
  steppers?: InspectorStepper[];
  buttons?: InspectorButton[];
  warning?: { title: string; body: string } | null;
  note: { title: string; body: string };
}

export default function VenueInspectorPanel({ data }: { data: InspectorPanelData }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <span className="min-w-0 flex-1 truncate text-xs font-extrabold">{data.title}</span>
        {data.badge && <span className="shrink-0 rounded-badge bg-primary/10 px-1.5 text-[10.5px] font-bold text-primary">{data.badge}</span>}
      </div>

      {data.rows.map((r) => (
        <div key={r.label} className="flex items-start gap-2 border-b border-border/50 py-1.5">
          <span className="w-16 shrink-0 pt-px text-[11px] text-muted-foreground">{r.label}</span>
          <span className={`num min-w-0 flex-1 text-xs font-bold leading-[1.4] ${r.danger ? "text-destructive" : ""}`}>{r.value}</span>
        </div>
      ))}

      {(data.chipGroups ?? []).map((g) => (
        <div key={g.title} className="mt-2.5">
          <div className="text-[11px] font-bold text-muted-foreground">{g.title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {g.chips.map((c) => (
              <button key={c.label} type="button" onClick={c.onClick}
                className={`h-7 rounded-control border px-2.5 text-[11.5px] font-bold ${c.active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      ))}

      {data.steppers && data.steppers.length > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {data.steppers.map((s) => (
            <div key={s.label} className="min-w-0">
              <div className="truncate text-[10px] text-muted-foreground">{s.label}</div>
              <div className="mt-0.5 flex h-[30px] items-center overflow-hidden rounded-control border border-input">
                <button type="button" className="h-full w-7 text-sm font-bold" onClick={s.onDec}>−</button>
                <span className="num flex-1 text-center text-xs font-extrabold">{s.value}</span>
                <button type="button" className="h-full w-7 text-sm font-bold" onClick={s.onInc}>＋</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.buttons && data.buttons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.buttons.map((b) => (
            <button key={b.label} type="button" onClick={b.onClick} disabled={b.disabled}
              className={`h-[30px] rounded-control border px-2.5 text-[11.5px] font-bold disabled:opacity-50 ${
                b.primary ? "border-primary bg-primary text-white" : b.danger ? "border-destructive/40 text-destructive" : "border-border bg-background"
              }`}>
              {b.label}
            </button>
          ))}
        </div>
      )}

      {data.warning && (
        <div className="mt-2.5 rounded-note border border-destructive/40 bg-destructive/5 p-2.5">
          <div className="text-[11.5px] font-extrabold text-destructive">{data.warning.title}</div>
          <div className="mt-0.5 text-[11px] leading-[1.5] text-destructive/90">{data.warning.body}</div>
        </div>
      )}

      <div className="mt-3 rounded-note border border-info-border bg-info-surface p-2.5">
        <div className="text-[11.5px] font-extrabold text-primary">{data.note.title}</div>
        <div className="mt-1 text-[11px] leading-[1.55]">{data.note.body}</div>
      </div>

      <p className="mt-3 text-[10.5px] leading-[1.6] text-muted-foreground">
        寸法は mm。位置は品目の中心・エリア左上からの距離。px は出しません。
      </p>
    </div>
  );
}
