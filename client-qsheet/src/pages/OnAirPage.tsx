import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import {
  Loader2, ArrowLeft, Play, Pause, Square, SkipForward, SkipBack, Radio,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (s: number) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
const fmtOffset = (s: number) => {
  const a = Math.abs(s);
  return `${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
};

function parseDur(str: string): number {
  if (!str?.trim()) return 0;
  const t = str.trim();
  let m = t.match(/^(\d+)[:°](\d+)[:'""]?(\d+)?/);
  if (m && m[3]) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  if (m) return +m[1] * 60 + +m[2];
  m = t.match(/^(\d+)$/);
  return m ? +m[1] : 0;
}

function cellText(cell: any): string {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell?.value === "string") return cell.value;
  if (Array.isArray(cell?.entries)) return cell.entries.map((e: any) => `${e.name ? `【${e.name}】` : ""}${e.html || ""}`).join(" ");
  return "";
}

// ── Types ────────────────────────────────────────────────
interface FlatItem {
  type: "section" | "cm" | "pagebreak" | "row";
  si: number;
  ri?: number;
  cueIdx?: number;
  label: string;
  durSec: number;
  startSec: number;
  sectionLabel?: string;
  text?: string;
}

// ── OnAirPage ────────────────────────────────────────────
export default function OnAirPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [started, setStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentCue, setCurrentCue] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [offset, setOffset] = useState(0);
  const [wallTime, setWallTime] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const socketRef = useRef<ReturnType<typeof getQsheetSocket> | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["qsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/qsheet/documents/${id}`);
      const d = res.data.data;
      if (typeof d.data === "string") d.data = JSON.parse(d.data);
      return d;
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  // Wall clock (1s)
  useEffect(() => {
    const t = setInterval(() => setWallTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Build flat display list from doc sections
  const flatList: FlatItem[] = [];
  if (doc?.data?.sections) {
    let abs = 0;
    let ci = 0;
    const blocks: any[] = doc.data.blocks || [];
    const sections: any[] = doc.data.sections;
    for (let si = 0; si < sections.length; si++) {
      const sec = sections[si];
      if (sec._pageBreak) {
        flatList.push({ type: "pagebreak", si, label: "", durSec: 0, startSec: abs });
        continue;
      }
      if (sec._break) {
        const d = parseDur(sec.duration || "");
        flatList.push({ type: "cm", si, label: sec.label || "CM", durSec: d, startSec: abs });
        abs += d;
        continue;
      }
      // Normal section header
      flatList.push({ type: "section", si, label: sec.label || "", durSec: parseDur(sec.duration || ""), startSec: abs });
      for (let ri = 0; ri < (sec.rows || []).length; ri++) {
        const row = sec.rows[ri];
        const d = parseDur(row.duration || "");
        let text = "";
        for (const blk of blocks) {
          if (blk.type === "scenario") {
            text = cellText(row.cells?.[blk.id]);
            if (text) break;
          }
        }
        flatList.push({
          type: "row",
          si, ri,
          cueIdx: ci,
          label: `${sec.label || ""}`,
          durSec: d,
          startSec: abs,
          sectionLabel: sec.label,
          text,
        });
        abs += d;
        ci++;
      }
    }
  }

  const flatRows = flatList.filter(i => i.type === "row");
  const totalDuration = flatRows.reduce((s, i) => s + i.durSec, 0);

  const current = flatRows[currentCue];
  const next = flatRows[currentCue + 1];
  const cueElapsed = current ? Math.max(elapsed - current.startSec, 0) : 0;
  const cueRemaining = current ? Math.max(current.durSec - cueElapsed, 0) : 0;
  const cueProgress = current && current.durSec > 0 ? Math.min(cueElapsed / current.durSec, 1) : 0;
  const totalProgress = totalDuration > 0 ? Math.min(elapsed / totalDuration, 1) : 0;
  const progressBarColor = cueProgress >= 0.9 ? "bg-red-500" : cueProgress >= 0.7 ? "bg-amber-400" : "bg-emerald-500";
  const progressTextColor = cueProgress >= 0.9 ? "text-red-400" : cueProgress >= 0.7 ? "text-amber-400" : "text-emerald-400";

  // Timer
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying]);

  // Auto-advance cue
  useEffect(() => {
    if (!isPlaying || !current || current.durSec <= 0) return;
    if (elapsed >= current.startSec + current.durSec && currentCue < flatRows.length - 1) {
      setCurrentCue(p => p + 1);
    }
  }, [elapsed, isPlaying, current, currentCue, flatRows.length]);

  // Scroll to current cue in the left list
  useEffect(() => {
    document.getElementById(`cue-${currentCue}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentCue]);

  // Keyboard shortcuts
  const handleKey = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (!started) { setStarted(true); setIsPlaying(true); return; }
      setCurrentCue(p => Math.min(p + 1, flatRows.length - 1));
    } else if (e.key === "p" || e.key === "P") {
      setIsPlaying(p => !p);
      setStarted(true);
    } else if (e.key === "Escape") {
      setIsPlaying(false); setCurrentCue(0); setElapsed(0); setStarted(false); setOffset(0);
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setCurrentCue(p => Math.min(p + 1, flatRows.length - 1));
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setCurrentCue(p => Math.max(p - 1, 0));
    }
  }, [flatRows.length, started]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Socket.IO
  useEffect(() => {
    if (!id) return;
    const socket = getQsheetSocket(id);
    socketRef.current = socket;
    socket.on("cue:next", () => setCurrentCue(p => Math.min(p + 1, flatRows.length - 1)));
    socket.on("cue:prev", () => setCurrentCue(p => Math.max(p - 1, 0)));
    socket.on("cue:jump", (data: { cueIndex: number }) => {
      setCurrentCue(data.cueIndex);
      if (flatRows[data.cueIndex]) setElapsed(flatRows[data.cueIndex].startSec);
    });
    socket.on("cue:play", () => { setIsPlaying(true); setStarted(true); });
    socket.on("cue:pause", () => setIsPlaying(false));
    socket.on("cue:reset", () => { setIsPlaying(false); setCurrentCue(0); setElapsed(0); setStarted(false); setOffset(0); });
    return () => { disconnectQsheetSocket(); socketRef.current = null; };
  }, [id, flatRows.length]);

  useEffect(() => {
    socketRef.current?.emit("cue:update", { currentCue, elapsed, isPlaying });
  }, [currentCue, elapsed, isPlaying]);

  // Transport actions
  const goNext = () => {
    const n = Math.min(currentCue + 1, flatRows.length - 1);
    setCurrentCue(n);
    if (flatRows[n]) setElapsed(flatRows[n].startSec);
  };
  const goPrev = () => {
    const p = Math.max(currentCue - 1, 0);
    setCurrentCue(p);
    if (flatRows[p]) setElapsed(flatRows[p].startSec);
  };
  const doStart = () => { setStarted(true); setIsPlaying(true); };
  const doStop = () => { setIsPlaying(false); setCurrentCue(0); setElapsed(0); setStarted(false); setOffset(0); };

  // ── Loading ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!doc || flatRows.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <p className="text-zinc-500">キューデータがありません</p>
        <button
          onClick={() => navigate(`/qsheet/editor/${id}`)}
          className="px-4 py-2 border border-zinc-700 rounded text-sm hover:bg-zinc-900 transition-colors"
        >
          エディターに戻る
        </button>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-black text-white select-none overflow-hidden" style={{ fontFamily: "'Oswald', 'Arial Narrow', sans-serif" }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-950 border-b border-zinc-800 flex-none">
        <button onClick={() => navigate(`/qsheet/editor/${id}`)} className="text-zinc-500 hover:text-white p-1 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <span className="text-sm text-zinc-300 tracking-wider truncate flex-1 max-w-xs">
          {doc?.data?.meta?.title || doc?.title || "ON AIR"}
        </span>
        <div className={`flex items-center gap-2 px-3 py-1 rounded text-xs font-bold tracking-widest uppercase transition-all ${
          isPlaying
            ? "bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.6)]"
            : "bg-zinc-900 text-zinc-600 border border-zinc-800"
        }`}>
          <span className={`w-2 h-2 rounded-full ${isPlaying ? "bg-white animate-pulse" : "bg-zinc-700"}`} />
          ON AIR
        </div>
        <div className="text-xs text-zinc-600 tabular-nums font-mono">
          {fmt(elapsed)} / {fmt(totalDuration)}
        </div>
      </div>

      {/* Total progress bar */}
      <div className="h-0.5 bg-zinc-900 flex-none">
        <div className="h-full bg-zinc-600 transition-all duration-1000" style={{ width: `${totalProgress * 100}%` }} />
      </div>

      {/* Body: left list + right panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Rundown list ── */}
        <div className="w-[420px] shrink-0 bg-[#0a0a0a] border-r border-zinc-900 overflow-y-auto flex flex-col">
          {flatList.map((item, idx) => {
            if (item.type === "pagebreak") return (
              <div key={idx} className="flex items-center gap-2 px-3 py-1 opacity-30">
                <div className="flex-1 border-t border-dashed border-zinc-600" />
                <span className="text-[10px] text-zinc-500">改ページ</span>
                <div className="flex-1 border-t border-dashed border-zinc-600" />
              </div>
            );

            if (item.type === "cm") return (
              <div key={idx} className="flex items-center gap-2 px-4 py-2 bg-zinc-800">
                <span className="text-[11px] text-zinc-400 font-mono tabular-nums">{fmt(item.startSec)}</span>
                <span className="text-[12px] font-bold text-zinc-200 tracking-wider flex-1">{item.label}</span>
                {item.durSec > 0 && <span className="text-[11px] text-zinc-500 font-mono">{fmt(item.durSec)}</span>}
              </div>
            );

            if (item.type === "section") return (
              <div key={idx} className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/30 border-b border-blue-900/20 sticky top-0">
                <span className="text-[11px] text-blue-400 font-mono tabular-nums shrink-0">{fmt(item.startSec)}</span>
                <span className="text-[12px] font-bold text-blue-200 tracking-wide flex-1 truncate">{item.label}</span>
              </div>
            );

            // Row
            const isCurrent = item.cueIdx === currentCue;
            const isNext = item.cueIdx === currentCue + 1;
            const isPast = (item.cueIdx ?? 0) < currentCue;
            return (
              <button
                key={idx}
                id={`cue-${item.cueIdx}`}
                onClick={() => {
                  setCurrentCue(item.cueIdx!);
                  if (flatRows[item.cueIdx!]) setElapsed(flatRows[item.cueIdx!].startSec);
                }}
                className={`w-full flex items-start gap-2 px-4 py-2 text-left border-b transition-colors text-xs ${
                  isCurrent
                    ? "bg-red-950/80 border-l-2 border-l-red-500 border-b-red-900/20"
                    : isNext
                    ? "bg-blue-950/50 border-l-2 border-l-blue-500 border-b-blue-900/20"
                    : isPast
                    ? "opacity-30 border-b-zinc-900 hover:opacity-50"
                    : "hover:bg-zinc-900/80 border-b-zinc-900"
                }`}
              >
                <span className="font-mono text-zinc-600 w-5 text-right shrink-0">{(item.cueIdx ?? 0) + 1}</span>
                <span className={`font-mono tabular-nums w-16 shrink-0 ${
                  isCurrent ? "text-red-400" : isNext ? "text-blue-400" : "text-zinc-600"
                }`}>
                  {fmt(item.startSec)}
                </span>
                <span className={`flex-1 truncate ${
                  isCurrent ? "text-white" : isNext ? "text-zinc-300" : "text-zinc-500"
                }`}>
                  {item.text?.slice(0, 50) || item.sectionLabel || "---"}
                </span>
                {item.durSec > 0 && (
                  <span className="font-mono text-zinc-700 shrink-0">{fmt(item.durSec)}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Right: Clock + Controls ── */}
        <div className="flex-1 flex flex-col items-center justify-between p-6 lg:p-10 overflow-auto">

          {/* Wall clock */}
          <div className="text-center">
            <div className="text-[10px] text-zinc-600 tracking-[0.3em] uppercase mb-2">CURRENT TIME</div>
            <div className="font-mono text-6xl lg:text-8xl font-light tabular-nums tracking-tight text-white">
              {pad(wallTime.getHours())}:{pad(wallTime.getMinutes())}:{pad(wallTime.getSeconds())}
            </div>
          </div>

          {/* Current cue info */}
          {current && (
            <div className="w-full max-w-lg space-y-4">
              <div className="text-center">
                <div className="text-[10px] text-zinc-600 tracking-widest uppercase mb-1">
                  {current.sectionLabel} — CUE {currentCue + 1} / {flatRows.length}
                </div>
                {current.text && (
                  <p className="text-sm text-zinc-300 line-clamp-2 mt-1">{current.text}</p>
                )}
              </div>

              {/* 3 counters: 経過 / 残り / 尺 */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-[10px] text-zinc-600 tracking-widest uppercase mb-1">経過</div>
                  <div className="font-mono text-2xl text-zinc-400 tabular-nums">{fmt(cueElapsed)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 tracking-widest uppercase mb-1">残り</div>
                  <div className={`font-mono text-3xl tabular-nums font-medium ${progressTextColor}`}>
                    {fmt(cueRemaining)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 tracking-widest uppercase mb-1">尺</div>
                  <div className="font-mono text-2xl text-zinc-400 tabular-nums">{fmt(current.durSec)}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${progressBarColor}`}
                  style={{ width: `${cueProgress * 100}%` }}
                />
              </div>

              {/* Push/Pull display */}
              {offset !== 0 && (
                <div className={`text-center text-sm font-mono font-bold ${offset > 0 ? "text-red-400" : "text-emerald-400"}`}>
                  {offset > 0 ? `▲ 押し +${fmtOffset(offset)}` : `▼ 巻き -${fmtOffset(Math.abs(offset))}`}
                </div>
              )}

              {/* NEXT */}
              {next && (
                <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                  <div className="text-[10px] text-zinc-600 tracking-widest uppercase mb-1.5">NEXT → CUE {currentCue + 2}</div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-blue-400 tabular-nums text-sm">{fmt(next.startSec)}</span>
                    {next.durSec > 0 && <span className="text-xs text-zinc-600">{fmt(next.durSec)}</span>}
                    <span className="text-sm text-zinc-400 truncate">{next.text?.slice(0, 40) || next.sectionLabel || "---"}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="space-y-3 w-full max-w-xs">
            {/* ±1m offset */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setOffset(p => p - 60)}
                className="px-4 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 text-xs font-bold hover:bg-emerald-900/70 transition-colors border border-emerald-900/50"
              >
                巻き −1m
              </button>
              {offset !== 0 && (
                <button onClick={() => setOffset(0)} className="px-2 py-1 rounded text-zinc-600 text-xs hover:text-zinc-400 transition-colors">
                  0
                </button>
              )}
              <button
                onClick={() => setOffset(p => p + 60)}
                className="px-4 py-1.5 rounded-lg bg-red-900/40 text-red-400 text-xs font-bold hover:bg-red-900/70 transition-colors border border-red-900/50"
              >
                押し +1m
              </button>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={doStop}
                className="p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                title="リセット (ESC)"
              >
                <Square size={16} />
              </button>
              <button
                onClick={goPrev}
                className="p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                title="前へ (←)"
              >
                <SkipBack size={16} />
              </button>
              <button
                onClick={() => { setIsPlaying(p => !p); setStarted(true); }}
                className={`w-16 h-16 rounded-full flex items-center justify-center font-bold transition-all ${
                  isPlaying
                    ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_24px_rgba(245,158,11,0.5)]"
                    : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_24px_rgba(16,185,129,0.5)]"
                }`}
                title="再生/停止 (P)"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
              </button>
              <button
                onClick={goNext}
                className="p-2 rounded-lg text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
                title="次へ (Space / →)"
              >
                <SkipForward size={16} />
              </button>
              <div className="w-8" />
            </div>

            <div className="text-center text-[10px] text-zinc-700 tracking-wider">
              SPACE: 次へ &nbsp;/&nbsp; P: 再生停止 &nbsp;/&nbsp; ESC: リセット
            </div>
          </div>
        </div>
      </div>

      {/* START overlay */}
      {!started && flatRows.length > 0 && (
        <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-6 z-50">
          <div className="text-[11px] text-zinc-500 tracking-[0.3em] uppercase">
            {doc?.data?.meta?.title || "ON AIR"}
          </div>
          <div className="font-mono text-5xl text-zinc-200 tabular-nums">
            {pad(wallTime.getHours())}:{pad(wallTime.getMinutes())}:{pad(wallTime.getSeconds())}
          </div>
          <button
            onClick={doStart}
            className="mt-4 w-40 h-40 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold tracking-widest uppercase transition-all shadow-[0_0_60px_rgba(220,38,38,0.6)] hover:shadow-[0_0_80px_rgba(220,38,38,0.9)] flex flex-col items-center justify-center gap-2"
          >
            <Radio size={32} className="animate-pulse" />
            <span className="text-sm">START</span>
          </button>
          <div className="text-xs text-zinc-600">
            {flatRows.length} キュー &nbsp;/&nbsp; 合計 {fmt(totalDuration)}
          </div>
        </div>
      )}
    </div>
  );
}
