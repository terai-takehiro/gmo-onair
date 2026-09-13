// 会場図面 — ③仕上がりの書き出し設定（用紙・縮尺・凡例・数量表・通り芯の有無・§6③）。
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SCALE_STEPS } from "@gmo-onair/shared/src/venue/geometry";

export type VenuePaperSize = "a4" | "a3";

export interface VenuePreviewSettings {
  paper: VenuePaperSize;
  /** "auto" = 収まる最大の切りのよい縮尺（§9-1） */
  scaleMode: "auto" | number;
  legend: boolean;
  quantityTable: boolean;
  axis: boolean;
}

export const VENUE_PAPER_SIZES: Record<VenuePaperSize, { widthMm: number; heightMm: number; label: string }> = {
  a4: { widthMm: 297, heightMm: 210, label: "A4横" },
  a3: { widthMm: 420, heightMm: 297, label: "A3横" },
};

export function defaultVenuePreviewSettings(): VenuePreviewSettings {
  return { paper: "a4", scaleMode: "auto", legend: true, quantityTable: true, axis: false };
}

interface Props {
  settings: VenuePreviewSettings;
  onChange: (next: VenuePreviewSettings) => void;
}

const FIELD_LABEL = "flex items-center justify-between gap-2 text-sub-sm text-muted-foreground";

export default function VenuePreviewSettingsPanel({ settings, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <h2 className="text-sub-sm font-medium text-foreground">書き出し設定</h2>

      <div>
        <Label>用紙</Label>
        <div className="mt-1">
          <ToggleButtonGroup
            options={[{ value: "a4", label: "A4横" }, { value: "a3", label: "A3横" }]}
            value={[settings.paper]}
            onChange={(next) => {
              const v = next[next.length - 1] as VenuePaperSize | undefined;
              if (v) onChange({ ...settings, paper: v });
            }}
            multi={false}
            cols={{ base: 2 }}
            size="sm"
            ariaLabel="用紙"
          />
        </div>
      </div>

      <div>
        <Label>縮尺</Label>
        <Select
          value={settings.scaleMode === "auto" ? "auto" : String(settings.scaleMode)}
          onValueChange={(v) => onChange({ ...settings, scaleMode: v === "auto" ? "auto" : Number(v) })}
        >
          <SelectTrigger className="mt-1 min-h-tap"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">自動（収まる最大の縮尺）</SelectItem>
            {SCALE_STEPS.map((s) => <SelectItem key={s} value={String(s)}>1:{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <label className={FIELD_LABEL}>
        凡例
        <input type="checkbox" checked={settings.legend} onChange={(e) => onChange({ ...settings, legend: e.target.checked })} className="h-4 w-4" />
      </label>
      <label className={FIELD_LABEL}>
        数量表
        <input type="checkbox" checked={settings.quantityTable} onChange={(e) => onChange({ ...settings, quantityTable: e.target.checked })} className="h-4 w-4" />
      </label>
      <label className={FIELD_LABEL}>
        通り芯
        <input type="checkbox" checked={settings.axis} onChange={(e) => onChange({ ...settings, axis: e.target.checked })} className="h-4 w-4" />
      </label>
    </div>
  );
}
