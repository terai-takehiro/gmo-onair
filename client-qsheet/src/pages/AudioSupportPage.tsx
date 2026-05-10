import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mic, AlertTriangle, ArrowRight } from "lucide-react";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";

type MicState = "on" | "off" | "standby";

interface MicAssignment {
  ch: number;
  person: string;
  micType: string;
  state: MicState;
}

interface PublicCell {
  assignments: MicAssignment[];
}

interface PublicRow {
  duration: string;
  label: string;
  cells: Record<string, PublicCell>;
}

interface PublicSection {
  label: string;
  duration: string;
  _break?: boolean;
  _pageBreak?: boolean;
  _vtr?: boolean;
  rows: PublicRow[];
}

interface PublicMicBlock {
  id: string;
  type: string;
  label: string;
}

interface PublicMasters {
  persons: string[];
  micTypes: string[];
  micChannels: { ch: number; label?: string }[];
}

interface PublicDoc {
  id: string;
  meta: { title: string };
  blocks: PublicMicBlock[];
  sections: PublicSection[];
  masters: PublicMasters;
}

interface FlatCue {
  type: "cue" | "cm" | "vtr";
  label: string;
  rowIndex: number;
}

const STATE_BG: Record<MicState, string> = {
  on: "bg-red-600 ring-2 ring-red-300/40",
  standby: "bg-amber-400 ring-2 ring-amber-200/40",
  off: "bg-zinc-800 ring-1 ring-zinc-700",
};

const STATE_LABEL: Record<MicState, string> = {
  on: "ON",
  standby: "STBY",
  off: "OFF",
};

function flattenCues(sections: PublicSection[]): FlatCue[] {
  const cues: FlatCue[] = [];
  let rowIndex = 0;
  for (const sec of sections) {
    if (sec._pageBreak) continue;
    if (sec._break) {
      cues.push({ type: "cm", label: sec.label || "CM", rowIndex: -1 });
      continue;
    }
    if (sec._vtr) {
      cues.push({ type: "vtr", label: sec.label || "VTR", rowIndex: -1 });
      continue;
    }
    if (!sec.rows || sec.rows.length === 0) {
      cues.push({ type: "cue", label: sec.label || "", rowIndex: -1 });
      continue;
    }
    for (const r of sec.rows) {
      cues.push({ type: "cue", label: sec.label || r.label || "", rowIndex });
      rowIndex++;
    }
  }
  return cues;
}

function getAssignment(cell: PublicCell | undefined, ch: number): MicAssignment {
  const found = cell?.assignments?.find((a) => a.ch === ch);
  return found || { ch, person: "", micType: "", state: "off" };
}

// すべての section.rows を 1 本のフラット配列に潰す。indexはflattenCuesの rowIndex と対応。
function flattenRows(sections: PublicSection[]): PublicRow[] {
  const out: PublicRow[] = [];
  for (const sec of sections) {
    if (sec._pageBreak || sec._break || sec._vtr) continue;
    for (const r of (sec.rows || [])) out.push(r);
  }
  return out;
}

export default function AudioSupportPage() {
  const { id } = useParams<{ id: string }>();
  const [currentCue, setCurrentCue] = useState(0);
  const socketRef = useRef<ReturnType<typeof getQsheetSocket> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["qsheet-public-audio", id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/qsheet/documents/${id}/public-audio`, {
        credentials: "omit",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      return json.data as PublicDoc;
    },
    enabled: !!id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });

  // Socket.IO subscription — listen for cue:sync from OnAir
  useEffect(() => {
    if (!id) return;
    const sock = getQsheetSocket(id);
    socketRef.current = sock;

    const onSync = (payload: { currentCue: number }) => {
      if (typeof payload?.currentCue === "number") {
        setCurrentCue(payload.currentCue);
      }
    };
    const onJump = (payload: { cueIndex: number }) => {
      if (typeof payload?.cueIndex === "number") setCurrentCue(payload.cueIndex);
    };
    const onNext = () => setCurrentCue((c) => c + 1);
    const onPrev = () => setCurrentCue((c) => Math.max(0, c - 1));

    sock.on("cue:sync", onSync);
    sock.on("cue:jump", onJump);
    sock.on("cue:next", onNext);
    sock.on("cue:prev", onPrev);

    return () => {
      sock.off("cue:sync", onSync);
      sock.off("cue:jump", onJump);
      sock.off("cue:next", onNext);
      sock.off("cue:prev", onPrev);
      disconnectQsheetSocket();
      socketRef.current = null;
    };
  }, [id]);

  const cues = useMemo(() => data ? flattenCues(data.sections) : [], [data]);
  const rows = useMemo(() => data ? flattenRows(data.sections) : [], [data]);
  const micBlock = data?.blocks[0];
  const channels = data?.masters.micChannels && data.masters.micChannels.length > 0
    ? data.masters.micChannels
    : [{ ch: 1 }, { ch: 2 }, { ch: 3 }, { ch: 4 }];

  const currentLabel = cues[currentCue]?.label || "";
  const currentType = cues[currentCue]?.type || "cue";
  const currentRowIndex = cues[currentCue]?.rowIndex ?? -1;
  const currentRow: PublicRow | undefined = currentRowIndex >= 0 ? rows[currentRowIndex] : undefined;
  const currentCell = micBlock && currentRow ? currentRow.cells[micBlock.id] : undefined;

  // 次のキュー（直近で audio_mic セルを持つもの — 通常は次の row）
  const nextCueInfo = useMemo(() => {
    if (!micBlock) return null;
    for (let i = currentCue + 1; i < cues.length; i++) {
      const idx = cues[i]?.rowIndex ?? -1;
      if (idx < 0) continue;
      const cell = rows[idx]?.cells[micBlock.id];
      if (cell) {
        return { cue: cues[i], cell, offset: i - currentCue };
      }
    }
    return null;
  }, [cues, rows, currentCue, micBlock]);

  const diffs = useMemo(() => {
    if (!nextCueInfo) return [] as Array<{ ch: number; kind: "turn_on" | "turn_off" | "standby" | "person_change" | "mic_change"; from: MicAssignment; to: MicAssignment }>;
    const out: Array<{ ch: number; kind: "turn_on" | "turn_off" | "standby" | "person_change" | "mic_change"; from: MicAssignment; to: MicAssignment }> = [];
    for (const c of channels) {
      const from = getAssignment(currentCell, c.ch);
      const to = getAssignment(nextCueInfo.cell, c.ch);
      if (from.state === to.state && from.person === to.person && from.micType === to.micType) continue;
      let kind: "turn_on" | "turn_off" | "standby" | "person_change" | "mic_change";
      if (from.state !== to.state) {
        if (to.state === "on") kind = "turn_on";
        else if (to.state === "off") kind = "turn_off";
        else kind = "standby";
      } else if (from.person !== to.person) {
        kind = "person_change";
      } else {
        kind = "mic_change";
      }
      out.push({ ch: c.ch, kind, from, to });
    }
    return out;
  }, [nextCueInfo, channels, currentCell]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col items-center justify-center gap-3 p-6">
        <AlertTriangle className="h-12 w-12 text-amber-500" aria-hidden />
        <h1 className="text-xl font-bold">読み込めませんでした</h1>
        <p className="text-sm text-zinc-400">ドキュメントが存在しないか、共有が解除されている可能性があります</p>
      </div>
    );
  }

  if (!micBlock) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Mic className="h-12 w-12 text-zinc-600" aria-hidden />
        <h1 className="text-xl font-bold">マイク香盤が未設定です</h1>
        <p className="text-sm text-zinc-400">エディタで「マイク香盤」ブロックを追加してください</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="flex-none px-6 py-3 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Mic className="h-5 w-5 text-pink-500 flex-none" aria-hidden />
            <h1 className="text-base font-bold truncate">{data.meta.title || "音声サポート"}</h1>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full flex-none">マイク香盤</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-400 flex-none">
            <span className="hidden sm:inline">公開URL · リアルタイム同期中</span>
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
          </div>
        </div>
      </header>

      {/* Current cue banner */}
      <div className="flex-none px-6 py-4 bg-gradient-to-r from-pink-950/40 to-rose-950/30 border-b border-zinc-800">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-widest text-pink-400">現在のキュー</span>
          <span
            className="text-2xl sm:text-3xl font-bold tabular-nums text-zinc-400"
            style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
          >
            #{currentCue + 1}
          </span>
          <span className="text-lg sm:text-2xl font-bold truncate flex-1 min-w-0">{currentLabel || "—"}</span>
          {currentType !== "cue" && (
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {currentType}
            </span>
          )}
        </div>
      </div>

      {/* Next-cue diff bar */}
      {nextCueInfo && (
        <div className="flex-none px-6 py-3 bg-zinc-900/60 border-b border-zinc-800">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-none">
              <ArrowRight size={14} className="text-zinc-500" aria-hidden />
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                次のキュー{nextCueInfo.offset > 1 ? ` (${nextCueInfo.offset}先)` : ""}
              </span>
              <span
                className="text-base font-bold tabular-nums text-zinc-300 ml-1"
                style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
              >
                {nextCueInfo.cue.label || "—"}
              </span>
            </div>
            {diffs.length === 0 ? (
              <span className="text-xs text-zinc-500 italic">変化なし</span>
            ) : (
              <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                {diffs.map((d) => {
                  const config: Record<typeof d.kind, { bg: string; label: string }> = {
                    turn_on: { bg: "bg-red-600/30 border-red-500 text-red-100", label: "ON" },
                    turn_off: { bg: "bg-zinc-700/40 border-zinc-500 text-zinc-300", label: "OFF" },
                    standby: { bg: "bg-amber-600/30 border-amber-500 text-amber-100", label: "STBY" },
                    person_change: { bg: "bg-sky-600/30 border-sky-500 text-sky-100", label: "人物交代" },
                    mic_change: { bg: "bg-purple-600/30 border-purple-500 text-purple-100", label: "マイク変更" },
                  };
                  const c = config[d.kind];
                  return (
                    <span
                      key={d.ch}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${c.bg}`}
                      title={`${d.from.state} → ${d.to.state}${d.from.person !== d.to.person ? ` / ${d.from.person || "—"} → ${d.to.person || "—"}` : ""}${d.from.micType !== d.to.micType ? ` / ${d.from.micType || "—"} → ${d.to.micType || "—"}` : ""}`}
                    >
                      <span
                        className="font-bold tabular-nums"
                        style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
                      >
                        Ch{d.ch}
                      </span>
                      <span className="opacity-70">·</span>
                      <span>{c.label}</span>
                      {(d.kind === "person_change" || d.kind === "turn_on") && d.to.person && (
                        <span className="opacity-80 truncate max-w-[8rem]">{d.to.person}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main grid */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {channels.map((c) => {
            const a = getAssignment(currentCell, c.ch);
            return (
              <div
                key={c.ch}
                className={`rounded-2xl p-4 transition-all duration-300 ${STATE_BG[a.state]} ${
                  a.state === "off" ? "opacity-50" : "opacity-100"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div
                      className={`text-3xl font-bold tabular-nums leading-none ${
                        a.state === "off" ? "text-zinc-500" : "text-white"
                      }`}
                      style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
                    >
                      Ch{c.ch}
                    </div>
                    {c.label && (
                      <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${a.state === "off" ? "text-zinc-600" : "text-white/70"}`}>
                        {c.label}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${
                      a.state === "on"
                        ? "bg-white/20 text-white"
                        : a.state === "standby"
                        ? "bg-amber-900/50 text-amber-100"
                        : "bg-zinc-800 text-zinc-500"
                    }`}
                  >
                    {STATE_LABEL[a.state]}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <div className={`text-base font-bold truncate ${a.state === "off" ? "text-zinc-600" : "text-white"}`}>
                    {a.person || (a.state === "off" ? "—" : "(未割当)")}
                  </div>
                  <div className={`text-xs truncate ${a.state === "off" ? "text-zinc-600" : "text-white/70"}`}>
                    {a.micType || "—"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-none px-6 py-2 border-t border-zinc-800 bg-zinc-900/40 text-[11px] text-zinc-500">
        Ch数: {channels.length} · 全 {cues.length} キュー · この画面はリアルタイムで進行に追従します
      </footer>
    </div>
  );
}
