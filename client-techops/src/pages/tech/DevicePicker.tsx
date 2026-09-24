// 技術資料 ②映像パッチ — 機材の候補（設計: docs/design/v4/tech-docs.md §6②「機材を選ぶ」）。
// 先頭に検索欄、下に設置場所ごとの機材、末尾に「増設機材として手入力」。
// 増設機材を選んだセルは自由入力になり、右に「増設」の印が出る（PatchRowExtras.tsx）。
// 名称に TRK が付く系統（AV-1〜AV-9・SW-CP など）は機材ではなく端子盤として、候補の最後にまとめ、
// 選んだセルには「端子盤」の印を出す（patchDerive.ts の isTerminalDevice）。
import { useRef, useState, type RefObject } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import type { PatchDeviceOption } from "@gmo-onair/shared/src/tech/types";
import { deviceSubLabel, groupDevices, isTerminalDevice, type PanelKinds } from "./patchDerive";
import { FloatingPanel, usePopoverDismiss } from "./patchPopover";
import { ExtraTag, TerminalTag } from "./PatchRowExtras";

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
  const panelRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss([boxRef, panelRef], open, () => setOpen(false));

  const groups = groupDevices(devices, query);
  const typed = query.trim();
  const isTerminal = !isExtra && isTerminalDevice(devices.find((d) => d.device_name === deviceName));

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
            anchorRef={boxRef} panelRef={panelRef}
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
          {deviceName || "機材・端子盤"}
        </span>
        {isTerminal && <TerminalTag />}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      {open && (
        <DeviceList
          anchorRef={boxRef} panelRef={panelRef}
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
  anchorRef, panelRef, groups, kinds, query, typed, deviceName, onQuery, onPickDevice, onPickExtra,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLDivElement>;
  groups: ReturnType<typeof groupDevices>;
  kinds: PanelKinds;
  query: string;
  typed: string;
  deviceName: string;
  onQuery: (v: string) => void;
  onPickDevice: (d: PatchDeviceOption) => void;
  onPickExtra: (name: string) => void;
}) {
  // Enter で先頭の候補を選ぶ。候補が無ければ入力した名前を増設機材にする
  const pickFirst = () => {
    const first = groups[0]?.items[0];
    if (first) onPickDevice(first);
    else if (typed) onPickExtra(typed);
  };

  return (
    <FloatingPanel anchorRef={anchorRef} panelRef={panelRef} width={320}>
      <div className="shrink-0 p-2">
        <div className="flex h-9 items-center gap-2 rounded-control border border-primary-border bg-primary-surface px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          {/* 1文字ごとに絞り込む（BufferedInput は確定するまで値を渡さないので、検索には使わない） */}
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); pickFirst(); }
            }}
            autoFocus
            aria-label="機材・端子盤の名前で検索"
            placeholder="機材・端子盤の名前で検索"
            className="min-w-0 flex-1 border-0 bg-transparent text-list text-foreground outline-none"
          />
        </div>
      </div>
      <div className="max-h-80 min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <p className="px-3 py-3 text-sub text-muted-foreground">
            この名前の機材・端子盤はパッチ盤にありません。下の「増設機材として手入力」で入力してください。
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
        className="flex h-11 w-full shrink-0 items-center gap-2 border-t border-border px-3 text-left hover:bg-warning-surface disabled:opacity-50"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-badge bg-warning-surface">
          <Plus className="h-3 w-3 text-warning" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sub font-bold text-warning">
          増設機材として手入力{typed ? `: ${typed}` : ""}
        </span>
      </button>
    </FloatingPanel>
  );
}
