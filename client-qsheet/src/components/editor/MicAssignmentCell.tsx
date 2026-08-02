import { useId } from "react";
import { Mic, ArrowDownToLine } from "lucide-react";

export type MicState = "on" | "off" | "standby";

export interface MicAssignment {
  ch: number;
  person: string;
  micType: string;
  state: MicState;
}

export interface MicChannelDef {
  ch: number;
  label?: string;
}

interface MicAssignmentCellProps {
  cell: { assignments?: MicAssignment[] } | undefined;
  channels: MicChannelDef[];
  persons: string[];
  micTypes: string[];
  onChange: (next: { assignments: MicAssignment[] }) => void;
  /** 直前 cue の assignments を引き継ぎたい時のハンドラ。指定があるとボタンが表示される */
  onInheritFromPrev?: () => void;
}

const DEFAULT_CHANNELS: MicChannelDef[] = [
  { ch: 1 }, { ch: 2 }, { ch: 3 }, { ch: 4 },
];

const STATE_CYCLE: Record<MicState, MicState> = {
  off: "standby",
  standby: "on",
  on: "off",
};

const STATE_LABEL: Record<MicState, string> = {
  on: "ON",
  standby: "STBY",
  off: "OFF",
};

const STATE_CLASS: Record<MicState, string> = {
  on: "bg-red-600 text-white",
  standby: "bg-amber-400 text-amber-950",
  off: "bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400",
};

export function getAssignment(
  cell: { assignments?: MicAssignment[] } | undefined,
  ch: number,
): MicAssignment {
  const found = cell?.assignments?.find((a) => a.ch === ch);
  return found || { ch, person: "", micType: "", state: "off" };
}

export default function MicAssignmentCell({
  cell,
  channels,
  persons,
  micTypes,
  onChange,
  onInheritFromPrev,
}: MicAssignmentCellProps) {
  const uid = useId();
  const personsListId = `mic-persons-${uid}`;
  const micTypesListId = `mic-types-${uid}`;
  const chList = channels.length > 0 ? channels : DEFAULT_CHANNELS;

  const update = (ch: number, patch: Partial<MicAssignment>) => {
    const current = cell?.assignments || [];
    const next = [...current];
    const idx = next.findIndex((a) => a.ch === ch);
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...patch };
    } else {
      next.push({ ch, person: "", micType: "", state: "off", ...patch });
    }
    next.sort((a, b) => a.ch - b.ch);
    onChange({ assignments: next });
  };

  const isEmpty = !cell?.assignments || cell.assignments.length === 0
    || (cell.assignments.every((a) => a.state === "off" && !a.person && !a.micType));

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {onInheritFromPrev && (
        <button
          type="button"
          onClick={onInheritFromPrev}
          className={`self-start inline-flex items-center gap-1 h-5 px-1.5 mb-0.5 rounded text-[10px] font-medium transition-colors ${
            isEmpty
              ? "text-pink-700 hover:bg-pink-50 dark:text-pink-400 dark:hover:bg-pink-950/40"
              : "text-zinc-400 hover:text-pink-700 dark:text-zinc-500 dark:hover:text-pink-400"
          }`}
          title="直前 cue のマイク状態をコピー"
          aria-label="前cueから継承"
        >
          <ArrowDownToLine size={11} aria-hidden />
          前cueから継承
        </button>
      )}
      {chList.map((c) => {
        const a = getAssignment(cell, c.ch);
        return (
          <div key={c.ch} className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => update(c.ch, { state: STATE_CYCLE[a.state] })}
              className={`flex-none h-5 px-1.5 rounded text-[10px] font-bold tracking-wide transition-colors ${STATE_CLASS[a.state]}`}
              title={`${a.state} → ${STATE_CYCLE[a.state]}`}
              aria-label={`Ch${c.ch} ${STATE_LABEL[a.state]}`}
            >
              {STATE_LABEL[a.state]}
            </button>
            <span
              className="flex-none text-[10px] font-bold w-7 text-zinc-500 dark:text-zinc-400 tabular-nums"
              style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
            >
              Ch{c.ch}
            </span>
            <input
              value={a.person}
              onChange={(e) => update(c.ch, { person: e.target.value })}
              list={personsListId}
              placeholder={c.label || "出演者"}
              className="flex-1 min-w-0 h-5 px-1 text-[11px] bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-zinc-300 dark:focus:border-zinc-600 rounded outline-none"
              aria-label={`Ch${c.ch} 出演者`}
            />
            <input
              value={a.micType}
              onChange={(e) => update(c.ch, { micType: e.target.value })}
              list={micTypesListId}
              placeholder="マイク"
              className="flex-none w-14 h-5 px-1 text-[11px] bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 focus:border-zinc-300 dark:focus:border-zinc-600 rounded outline-none"
              aria-label={`Ch${c.ch} マイク種類`}
            />
          </div>
        );
      })}
      {chList === DEFAULT_CHANNELS && (
        <p className="flex items-center gap-1 text-[9px] text-zinc-400 dark:text-zinc-500 italic mt-0.5">
          <Mic size={9} aria-hidden /> マスターでChを定義
        </p>
      )}
      <datalist id={personsListId}>
        {persons.map((p) => <option key={p} value={p} />)}
      </datalist>
      <datalist id={micTypesListId}>
        {micTypes.map((t) => <option key={t} value={t} />)}
      </datalist>
    </div>
  );
}

export function summarizeMicCell(
  cell: { assignments?: MicAssignment[] } | undefined,
): string {
  const list = (cell?.assignments || []).filter((a) => a.state !== "off");
  if (list.length === 0) return "";
  return list
    .sort((a, b) => a.ch - b.ch)
    .map((a) => {
      const tag = a.state === "on" ? "ON" : "STBY";
      const name = a.person ? ` ${a.person}` : "";
      const mic = a.micType ? `/${a.micType}` : "";
      return `Ch${a.ch}:${tag}${name}${mic}`;
    })
    .join(" / ");
}
