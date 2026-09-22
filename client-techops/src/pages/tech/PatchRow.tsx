// 技術資料 ②映像パッチ — 1行の描画と編集（設計: docs/design/v4/tech-docs.md §6②）。
// 列は `#｜送り 機材｜送り パッチ番号｜→｜受け 機材｜受け パッチ番号｜名称｜備考｜⋯`。
// 幅は `RowSlot` の7段から選ぶ（`docs/design/v4/_rules.md` 1. 縦の整列）。
import { useRef, useState } from "react";
import { ArrowRight, MoreHorizontal } from "lucide-react";
import { Row, RowMain, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import BufferedInput from "@/components/editor/BufferedInput";
import type { PatchDeviceOption, TechPatchRow } from "@gmo-onair/shared/src/tech/types";
import { jackChoicesFor, type JackChoice, type PanelKinds } from "./patchDerive";
import { usePopoverDismiss } from "./patchPopover";
import { DevicePicker } from "./DevicePicker";
import { JackPicker } from "./JackPicker";

interface Props {
  row: TechPatchRow;
  /** 表全体の通し番号 */
  no: number;
  rows: TechPatchRow[];
  devices: PatchDeviceOption[];
  kinds: PanelKinds;
  canEdit: boolean;
  onPatch: (patch: Partial<TechPatchRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}

export function PatchRow({ row, no, rows, devices, kinds, canEdit, onPatch, onDuplicate, onDelete, onMove }: Props) {
  const disabled = !canEdit;
  const fromDevice = devices.find((d) => d.device_name === row.from_device_text);
  const toDevice = devices.find((d) => d.device_name === row.to_device_text);

  /** 送りのパッチ番号を選んだら、名称が空のときだけ盤の名称を写す（§4-4） */
  const pickFromJack = (c: JackChoice) => {
    const patch: Partial<TechPatchRow> = { from_jack_id: c.id, from_jack_text: c.no };
    if (!row.label.trim() && c.label.trim()) patch.label = c.label.trim();
    onPatch(patch);
  };

  return (
    <Row density="table" divider className="gap-2 hover:bg-surface-subtle">
      <div className="num w-8 shrink-0 text-sub text-muted-foreground">{no}</div>

      <RowSlot w={128}>
        <DevicePicker
          deviceName={row.from_device_text} isExtra={row.from_is_extra} devices={devices} kinds={kinds}
          disabled={disabled} side="from"
          onPickDevice={(d) => onPatch({ from_device_text: d.device_name, from_is_extra: false, from_jack_id: null, from_jack_text: "" })}
          onPickExtra={(name) => onPatch({ from_device_text: name, from_is_extra: true, from_jack_id: null, from_jack_text: "" })}
          onCommitExtraName={(name) => onPatch({ from_device_text: name })}
        />
      </RowSlot>
      <RowSlot w={72}>
        <JackPicker
          jackText={row.from_jack_text} jackId={row.from_jack_id} isExtra={row.from_is_extra}
          deviceName={row.from_device_text} choices={jackChoicesFor(fromDevice, kinds, rows, row.id)}
          disabled={disabled} side="from"
          onPick={pickFromJack}
          onClear={() => onPatch({ from_jack_id: null, from_jack_text: "" })}
          onCommitText={(v) => onPatch({ from_jack_text: v })}
        />
      </RowSlot>

      <div className="flex w-6 shrink-0 justify-center">
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>

      <RowSlot w={128}>
        <DevicePicker
          deviceName={row.to_device_text} isExtra={row.to_is_extra} devices={devices} kinds={kinds}
          disabled={disabled} side="to"
          onPickDevice={(d) => onPatch({ to_device_text: d.device_name, to_is_extra: false, to_jack_id: null, to_jack_text: "" })}
          onPickExtra={(name) => onPatch({ to_device_text: name, to_is_extra: true, to_jack_id: null, to_jack_text: "" })}
          onCommitExtraName={(name) => onPatch({ to_device_text: name })}
        />
      </RowSlot>
      <RowSlot w={72}>
        <JackPicker
          jackText={row.to_jack_text} jackId={row.to_jack_id} isExtra={row.to_is_extra}
          deviceName={row.to_device_text} choices={jackChoicesFor(toDevice, kinds, rows, row.id)}
          disabled={disabled} side="to"
          onPick={(c) => onPatch({ to_jack_id: c.id, to_jack_text: c.no })}
          onClear={() => onPatch({ to_jack_id: null, to_jack_text: "" })}
          onCommitText={(v) => onPatch({ to_jack_text: v })}
        />
      </RowSlot>

      <RowMain className="min-w-[128px]">
        <BufferedInput
          value={row.label} onCommit={(v) => onPatch({ label: v })} disabled={disabled}
          aria-label="名称" placeholder="名称を入力"
          className="h-8 w-full min-w-0 rounded-control border border-transparent bg-transparent px-1.5 text-list text-foreground outline-none hover:border-border-faint focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
        />
      </RowMain>

      <RowSlot w={96}>
        <BufferedInput
          value={row.note} onCommit={(v) => onPatch({ note: v })} disabled={disabled}
          aria-label="備考" placeholder="備考"
          className="h-8 w-full min-w-0 rounded-control border border-transparent bg-transparent px-1.5 text-sub text-foreground outline-none hover:border-border-faint focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
        />
      </RowSlot>

      <RowMenu canEdit={canEdit} onDuplicate={onDuplicate} onDelete={onDelete} onMove={onMove} />
    </Row>
  );
}

function RowMenu({ canEdit, onDuplicate, onDelete, onMove }: {
  canEdit: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  usePopoverDismiss(boxRef, open, () => setOpen(false));
  const item = "flex h-9 w-full items-center px-3 text-left text-sub text-foreground hover:bg-muted/30";

  return (
    <div ref={boxRef} className="relative flex w-8 shrink-0 justify-end">
      <button
        type="button" disabled={!canEdit} aria-label="この行の操作"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-muted/30 disabled:opacity-40"
      >
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-card border border-border bg-card py-1 shadow-lg">
          <button type="button" className={item} onClick={() => { onDuplicate(); setOpen(false); }}>複製する</button>
          <button type="button" className={item} onClick={() => { onMove(-1); setOpen(false); }}>1つ上へ</button>
          <button type="button" className={item} onClick={() => { onMove(1); setOpen(false); }}>1つ下へ</button>
          <button
            type="button"
            className="flex h-9 w-full items-center px-3 text-left text-sub text-destructive hover:bg-destructive-surface"
            onClick={() => { onDelete(); setOpen(false); }}
          >
            削除
          </button>
        </div>
      )}
    </div>
  );
}
