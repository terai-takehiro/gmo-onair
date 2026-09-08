// スケジュール表一覧の絞り込み（拠点・状態・題／案件の検索）。14-schedule-v2-plan.md §3 B6
//
// 「200 件固定で探せない」という穴を塞ぐための3つだけ。日付範囲は今回スコープ外
// （§3 B6 の一覧に無い。「今日から」の既定はそのまま）。
import { Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { SCHEDULE_STATUS_LABEL, SCHEDULE_STATUS_ORDER } from "@/components/schedule/scheduleStatus";
import type { StudioLocationOption } from "@/lib/scheduleApi";

export type StatusFilter = "all" | (typeof SCHEDULE_STATUS_ORDER)[number];

// Radix の Select は value="" を「未選択」と特別扱いするため使えない（実測: SelectItem が
// 例外を投げて Select 自体が描画されなくなる）。「すべて」はこの印で表し、呼ぶ側の
// URL クエリでは今までどおり空文字（＝パラメータなし）に対応させる
const ALL_LOCATIONS = "__all__";

interface Props {
  locations: StudioLocationOption[];
  locationId: string;
  onLocationChange: (v: string) => void;
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  search: string;
  onSearchChange: (v: string) => void;
}

export default function ScheduleListFilters({ locations, locationId, onLocationChange, status, onStatusChange, search, onSearchChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="題・案件で探す"
          className="min-h-tap pl-8"
          aria-label="題・案件で探す"
        />
      </div>
      <Select value={locationId || ALL_LOCATIONS} onValueChange={(v) => onLocationChange(v === ALL_LOCATIONS ? "" : v)}>
        <SelectTrigger className="min-h-tap w-full sm:w-40"><SelectValue placeholder="拠点: すべて" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_LOCATIONS}>拠点: すべて</SelectItem>
          {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="w-full sm:w-auto">
        <ToggleButtonGroup
          options={[
            { value: "all", label: "すべて" },
            ...SCHEDULE_STATUS_ORDER.map((s) => ({ value: s, label: SCHEDULE_STATUS_LABEL[s] })),
          ]}
          value={[status]}
          onChange={(next) => { const v = next[next.length - 1] as StatusFilter | undefined; if (v) onStatusChange(v); }}
          multi={false}
          cols={{ base: 4 }}
          size="sm"
          ariaLabel="状態で絞り込み"
        />
      </div>
    </div>
  );
}
