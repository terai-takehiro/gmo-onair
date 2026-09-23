// 技術資料 ②映像パッチ — 機材の候補（設計: docs/design/v4/tech-docs.md §6②「機材を選ぶ」）。
// 先頭に検索欄、下に設置場所ごとの機材、末尾に「増設機材として手入力」。
// 増設機材を選んだセルは自由入力になり、右に「増設」の印が出る（PatchRowExtras.tsx）。
import { useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import type { PatchDeviceOption } from "@gmo-onair/shared/src/tech/types";
import { deviceSubLabel, groupDevices, type PanelKinds } from "./patchDerive";
import { usePopoverDismiss } from "./patchPopover";
import { ExtraTag } from "./PatchRowExtras";

interface Props {
  /** いま入っている機材名 */
  deviceName: string;
  isExtra: boolean;
  devices: PatchDeviceOption[];
  kinds: PanelKinds;
  disabled: boolean;
  /** 「送り」か「受け」か。候補の見出しに出す */
  side: "from" | "to";
  onPickDevice: (device: PatchDeviceOption) => void;
  onPickExtra: (name: string) => void;
  onCommitExtraName: (name: string) => void;
}

export function DevicePicker({
  deviceName, isExtra, devices, kinds, disabled, side, onPickDevice, onPickExtra, onCommitExtraName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(boxRef, open, () => setOpen(false));

  const groups = groupDevices(devices, query);
  const typed = query.trim();

  // 増設機材のセルは自由入力。台帳に無い機材なので候補から選び直すこともできる
  if (isExtra) {
    return (
      <div ref={boxRef} className="relative flex w-full items-center gap-1">
        <BufferedInput
          value={deviceName}
          onCommit={onCommitExtraName}
          disabled={disabled}
          aria-label={side === "from" ? "送りの機材" : "受けの機材"}
          placeholder="機材名"
          className="h-9 min-w-0 flex-1 rounded-control border border-border-faint bg-background px-2 text-list text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
        />
        <ExtraTag />
        <button
          type="button"
          disabled={disabled}
          aria-label="機材を変更"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-6 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted/30 disabled:opacity-50"
        >
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {open && (
          <DeviceList
            groups={groups} kinds={kinds} query={query} typed={typed} deviceName={deviceName}
            onQuery={setQuery}
            onPickDevice={(d) => { onPickDevice(d); setOpen(false); setQuery(""); }}
            onPickExtra={(name) => { onPickExtra(name); setOpen(false); setQuery(""); }}
          />
        )}
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-full items-center gap-1 rounded-control border px-2 text-left disabled:opacity-70 ${
          open ? "border-primary bg-background" : "border-border-faint bg-surface-subtle hover:border-primary-border"
        }`}
      >
        <span className={`min-w-0 flex-1 truncate text-list ${deviceName ? "text-foreground" : "text-muted-foreground"}`}>
          {deviceName || "機材を選ぶ"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <DeviceList
          groups={groups} kinds={kinds} query={query} typed={typed} deviceName={deviceName}
          onQuery={setQuery}
          onPickDevice={(d) => { onPickDevice(d); setOpen(false); setQuery(""); }}
          onPickExtra={(name) => { onPickExtra(name); setOpen(false); setQuery(""); }}
        />
      )}
    </div>
  );
}

function DeviceList({
  groups, kinds, query, typed, deviceName, onQuery, onPickDevice, onPickExtra,
}: {
  groups: ReturnType<typeof groupDevices>;
  kinds: PanelKinds;
  query: string;
  typed: string;
  deviceName: string;
  onQuery: (v: string) => void;
  onPickDevice: (d: PatchDeviceOption) => void;
  onPickExtra: (name: string) => void;
}) {
  return (
    <div className="absolute left-0 top-full z-20 mt-1 w-80 overflow-hidden rounded-card border border-border bg-card shadow-lg">
      <div className="p-2">
        <div className="flex h-9 items-center gap-2 rounded-control border border-primary-border bg-primary-surface px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <BufferedInput
            value={query}
            onCommit={onQuery}
            autoFocus
            aria-label="機材名で検索"
            placeholder="機材名で検索"
            className="min-w-0 flex-1 border-0 bg-transparent text-list text-foreground outline-none"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {groups.length === 0 && (
          <p className="px-3 py-3 text-sub text-muted-foreground">
            この名前の機材はパッチ盤にありません。下の「増設機材として手入力」で入力してください。
          </p>
        )}
        {groups.map((g) => (
          <div key={g.area}>
            <div className="px-3 pt-2 text-th text-muted-foreground">{g.area}</div>
            {g.items.map((d) => (
              <button
                key={`${g.area}/${d.device_name}`}
                type="button"
                onClick={() => onPickDevice(d)}
                className={`flex h-11 w-full items-center gap-2 px-3 text-left hover:bg-primary-surface-weak ${
                  d.device_name === deviceName ? "bg-primary-surface-weak" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-list text-foreground">{d.device_name}</span>
                  <span className="num block truncate text-sub-sm text-muted-foreground">{deviceSubLabel(d, kinds)}</span>
                </span>
                {d.device_name === deviceName && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={!typed}
        onClick={() => onPickExtra(typed)}
        className="flex h-11 w-full items-center gap-2 border-t border-border px-3 text-left hover:bg-warning-surface disabled:opacity-50"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-badge bg-warning-surface">
          <Plus className="h-3 w-3 text-warning" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sub font-bold text-warning">
          増設機材として手入力{typed ? `: ${typed}` : ""}
        </span>
      </button>
    </div>
  );
}
