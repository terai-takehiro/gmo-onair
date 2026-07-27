import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mic, AlertTriangle, Radio, ArrowRight } from "lucide-react";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import SyncStatusBadge from "@/components/SyncStatusBadge";

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

type DiffKind = "turn_on" | "turn_off" | "standby" | "person_change" | "mic_change";

const STATE_BG: Record<MicState, string> = {
  on: "bg-destructive",
  standby: "bg-warning",
  off: "bg-card",
};

const STATE_LABEL: Record<MicState, string> = {
  on: "ON",
  standby: "STBY",
  off: "OFF",
};

const DIFF_RING: Record<DiffKind, string> = {
  turn_on: "ring-4 ring-destructive/70",
  turn_off: "ring-4 ring-border/50",
  standby: "ring-4 ring-warning/70",
  person_change: "ring-4 ring-info/70",
  mic_change: "ring-4 ring-ai",
};

const DIFF_LABEL: Record<DiffKind, string> = {
  turn_on: "ON へ",
  turn_off: "OFF へ",
  standby: "STBY へ",
  person_change: "人物交代",
  mic_change: "マイク変更",
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

function flattenRows(sections: PublicSection[]): PublicRow[] {
  const out: PublicRow[] = [];
  for (const sec of sections) {
    if (sec._pageBreak || sec._break || sec._vtr) continue;
    for (const r of (sec.rows || [])) out.push(r);
  }
  return out;
}

function classifyDiff(from: MicAssignment, to: MicAssignment): DiffKind | null {
  if (from.state === to.state && from.person === to.person && from.micType === to.micType) return null;
  if (from.state !== to.state) {
    if (to.state === "on") return "turn_on";
    if (to.state === "off") return "turn_off";
    return "standby";
  }
  if (from.person !== to.person) return "person_change";
  return "mic_change";
}

// ─── ChCard ─────────────────────────────────────────────
function ChCard({
  ch,
  label,
  assignment,
  diff,
}: {
  ch: number;
  label?: string;
  assignment: MicAssignment;
  diff?: DiffKind | null;
}) {
  const a = assignment;
  return (
    <div
      className={`relative rounded-2xl p-4 transition-all duration-300 ${STATE_BG[a.state]} ${
        a.state === "off" ? "opacity-60" : "opacity-100"
      } ${diff ? DIFF_RING[diff] : ""}`}
    >
      {diff && (
        <span className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-white text-foreground text-[10px] font-bold shadow-md whitespace-nowrap">
          {DIFF_LABEL[diff]}
        </span>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div
            className={`text-3xl font-bold tabular-nums leading-none ${
              a.state === "off" ? "text-muted-foreground" : "text-white"
            }`}
            style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
          >
            Ch{ch}
          </div>
          {label && (
            <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${a.state === "off" ? "text-muted-foreground" : "text-white/70"}`}>
              {label}
            </div>
          )}
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-bold tracking-wide ${
            a.state === "on"
              ? "bg-white/20 text-white"
              : a.state === "standby"
              ? "bg-warning/50 text-warning-strong"
              : "bg-card text-muted-foreground"
          }`}
        >
          {STATE_LABEL[a.state]}
        </span>
      </div>
      <div className="space-y-0.5">
        <div className={`text-base font-bold truncate ${a.state === "off" ? "text-muted-foreground" : "text-white"}`}>
          {a.person || (a.state === "off" ? "—" : "(未割当)")}
        </div>
        <div className={`text-xs truncate ${a.state === "off" ? "text-muted-foreground" : "text-white/70"}`}>
          {a.micType || "—"}
        </div>
      </div>
    </div>
  );
}

// ─── CueColumn ──────────────────────────────────────────
function CueColumn({
  variant,
  cueIndex,
  cueLabel,
  cueType,
  channels,
  cell,
  diffMap,
  totalCues,
}: {
  variant: "oa" | "next";
  cueIndex: number | null;
  cueLabel: string;
  cueType?: "cue" | "cm" | "vtr";
  channels: { ch: number; label?: string }[];
  cell: PublicCell | undefined;
  diffMap?: Map<number, DiffKind>;
  totalCues: number;
}) {
  const isOA = variant === "oa";
  const accent = isOA
    ? { bg: "from-destructive/15 to-destructive/5", border: "border-destructive/60", text: "text-destructive", icon: <Radio size={16} /> }
    : { bg: "from-warning/15 to-warning/5", border: "border-warning/40", text: "text-warning-strong", icon: <ArrowRight size={16} /> };

  return (
    <section className={`flex flex-col min-h-0 rounded-2xl border ${accent.border} bg-background/30 overflow-hidden`}>
      {/* Section header */}
      <header className={`flex-none px-4 py-3 bg-gradient-to-r ${accent.bg} border-b ${accent.border}`}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest ${accent.text}`}>
            {accent.icon}
            {isOA ? "OA" : "NEXT"}
          </span>
          {cueIndex !== null && totalCues > 0 ? (
            <>
              <span
                className="text-2xl sm:text-3xl font-bold tabular-nums text-foreground"
                style={{ fontFamily: "'Roboto Condensed',sans-serif" }}
              >
                #{cueIndex + 1}
              </span>
              <span className="text-base sm:text-xl font-bold truncate flex-1 min-w-0 text-white">
                {cueLabel || "—"}
              </span>
              {cueType && cueType !== "cue" && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-card text-muted-foreground">
                  {cueType}
                </span>
              )}
            </>
          ) : (
            <span className="text-base font-bold text-muted-foreground italic">{isOA ? "—" : "(終端)"}</span>
          )}
        </div>
      </header>

      {/* Ch grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
        >
          {channels.map((c) => (
            <ChCard
              key={c.ch}
              ch={c.ch}
              label={c.label}
              assignment={getAssignment(cell, c.ch)}
              diff={diffMap?.get(c.ch) ?? null}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function AudioSupportPage() {
  const { id } = useParams<{ id: string }>();
  const [currentCue, setCurrentCue] = useState(0);
  const [syncConnected, setSyncConnected] = useState(false);
  const socketRef = useRef<ReturnType<typeof getQsheetSocket> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["qsheet-public-audio", id],
    queryFn: async () => {
      const res = await fetch(`/api/v1/internal/qsheet/documents/${id}/public-audio`, {
        credentials: "omit",
      });
      if (!res.ok) {
        // 410 = 配布をやめた URL。「間違えた」ではなく「もう配っていない」と伝える
        throw new Error(res.status === 410 ? "REVOKED" : `HTTP ${res.status}`);
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

    // 切れても最後に届いたキューが残り続けるので状態を出す (§4.13)
    const onConnect = () => setSyncConnected(true);
    const onDisconnect = () => setSyncConnected(false);
    sock.on("connect", onConnect);
    sock.on("disconnect", onDisconnect);
    setSyncConnected(sock.connected);

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
      sock.off("connect", onConnect);
      sock.off("disconnect", onDisconnect);
      disconnectQsheetSocket(id);
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
        return { cue: cues[i], cueIndex: i, cell, offset: i - currentCue };
      }
    }
    return null;
  }, [cues, rows, currentCue, micBlock]);

  // Ch ごとの差分を Map で持たせて NEXT 列のリングに使う
  const diffMap = useMemo(() => {
    const m = new Map<number, DiffKind>();
    if (!nextCueInfo) return m;
    for (const c of channels) {
      const from = getAssignment(currentCell, c.ch);
      const to = getAssignment(nextCueInfo.cell, c.ch);
      const kind = classifyDiff(from, to);
      if (kind) m.set(c.ch, kind);
    }
    return m;
  }, [nextCueInfo, channels, currentCell]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-3 p-6">
        <AlertTriangle className="h-12 w-12 text-warning-strong" aria-hidden />
        <h1 className="text-xl font-bold">
          {(error as Error | null)?.message === "REVOKED" ? "この配布URLは無効になりました" : "読み込めませんでした"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {(error as Error | null)?.message === "REVOKED"
            ? "番組が終わったため配布を止めています。まだ必要な場合は担当者に新しいURLを聞いてください。"
            : "ドキュメントが存在しないか、共有が解除されている可能性があります"}
        </p>
      </div>
    );
  }

  if (!micBlock) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Mic className="h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-bold">マイク香盤が未設定です</h1>
        <p className="text-sm text-muted-foreground">エディタで「マイク香盤」ブロックを追加してください</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-none px-6 py-3 border-b border-border bg-background/60 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Mic className="h-5 w-5 text-primary flex-none" aria-hidden />
            <h1 className="text-base font-bold truncate">{data.meta.title || "音声サポート"}</h1>
            <span className="text-xs text-muted-foreground bg-card px-2 py-0.5 rounded-full flex-none">マイク香盤</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-none">
            <span className="hidden sm:inline">公開URL</span>
            <SyncStatusBadge connected={syncConnected} />
          </div>
        </div>
      </header>

      {/* Main: OA / NEXT side-by-side */}
      <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 sm:p-4">
        <CueColumn
          variant="oa"
          cueIndex={cues.length > 0 ? currentCue : null}
          cueLabel={currentLabel}
          cueType={currentType}
          channels={channels}
          cell={currentCell}
          totalCues={cues.length}
        />
        <CueColumn
          variant="next"
          cueIndex={nextCueInfo ? nextCueInfo.cueIndex : null}
          cueLabel={nextCueInfo?.cue.label || ""}
          cueType={nextCueInfo?.cue.type}
          channels={channels}
          cell={nextCueInfo?.cell}
          diffMap={diffMap}
          totalCues={cues.length}
        />
      </main>

      {/* Footer */}
      <footer className="flex-none px-6 py-2 border-t border-border bg-background/40 text-[11px] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
        <span>Ch数: {channels.length} · 全 {cues.length} キュー</span>
        <span className="text-muted-foreground">差分: <span className="text-destructive">ON</span> / <span className="text-warning-strong">STBY</span> / <span className="text-muted-foreground">OFF</span> / <span className="text-info">人物交代</span> / <span className="text-cat-7">マイク変更</span></span>
      </footer>
    </div>
  );
}
