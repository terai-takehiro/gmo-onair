import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  Loader2,
  ArrowLeft,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
} from "lucide-react";

interface CueRow {
  id: string;
  label: string;
  duration: number;
  scenario: string;
  video: string;
  audio: string;
  remarks: string;
  [key: string]: string | number | null | undefined;
}

interface Section {
  id: string;
  label: string;
  rows: CueRow[];
}

interface FlatCue {
  sectionLabel: string;
  row: CueRow;
  startTime: number;
  index: number;
}

const pad = (n: number) => n.toString().padStart(2, "0");
const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

export default function OnAirPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentCue, setCurrentCue] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const cueListRef = useRef<HTMLDivElement>(null);

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

  // Flatten sections into a single cue list
  const flatCues: FlatCue[] = [];
  if (doc?.data?.sections) {
    let time = 0;
    let idx = 0;
    for (const section of doc.data.sections as Section[]) {
      for (const row of section.rows) {
        flatCues.push({ sectionLabel: section.label, row, startTime: time, index: idx });
        time += row.duration || 0;
        idx++;
      }
    }
  }

  const totalDuration = flatCues.reduce((acc, c) => acc + (c.row.duration || 0), 0);
  const current = flatCues[currentCue];
  const next = flatCues[currentCue + 1];

  // Elapsed within current cue
  const cueElapsed = current ? elapsed - current.startTime : 0;
  const cueRemaining = current ? Math.max((current.row.duration || 0) - cueElapsed, 0) : 0;
  const cueProgress = current && current.row.duration
    ? Math.min(cueElapsed / current.row.duration, 1)
    : 0;

  // Progress bar color: green → amber → red
  const progressColor = cueProgress >= 0.9 ? "bg-red-500" : cueProgress >= 0.7 ? "bg-amber-400" : "bg-emerald-500";
  const totalProgressPercent = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

  // Timer
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying]);

  // Auto-advance
  useEffect(() => {
    if (!isPlaying || !current) return;
    const cueEnd = current.startTime + (current.row.duration || 0);
    if (elapsed >= cueEnd && currentCue < flatCues.length - 1) {
      setCurrentCue((prev) => prev + 1);
    } else if (elapsed >= totalDuration) {
      setIsPlaying(false);
    }
  }, [elapsed, isPlaying, current, currentCue, flatCues.length, totalDuration]);

  // Scroll to current cue
  useEffect(() => {
    const el = document.getElementById(`cue-${currentCue}`);
    if (el && cueListRef.current) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentCue]);

  // Keyboard shortcuts
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        if (currentCue < flatCues.length - 1) {
          setCurrentCue((prev) => prev + 1);
          if (!isPlaying) {
            const nextCue = flatCues[currentCue + 1];
            if (nextCue) setElapsed(nextCue.startTime);
          }
        }
      } else if (e.key === "p" || e.key === "P") {
        setIsPlaying((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsPlaying(false); setCurrentCue(0); setElapsed(0);
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentCue((prev) => Math.min(prev + 1, flatCues.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentCue((prev) => Math.max(prev - 1, 0));
      }
    },
    [currentCue, flatCues.length, isPlaying]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // Socket.IO
  const socketRef = useRef<ReturnType<typeof getQsheetSocket> | null>(null);
  useEffect(() => {
    if (!id) return;
    const socket = getQsheetSocket(id);
    socketRef.current = socket;
    socket.on("cue:next", () => setCurrentCue((prev) => Math.min(prev + 1, flatCues.length - 1)));
    socket.on("cue:prev", () => setCurrentCue((prev) => Math.max(prev - 1, 0)));
    socket.on("cue:jump", (data: { cueIndex: number }) => {
      setCurrentCue(data.cueIndex);
      if (flatCues[data.cueIndex]) setElapsed(flatCues[data.cueIndex].startTime);
    });
    socket.on("cue:play", () => setIsPlaying(true));
    socket.on("cue:pause", () => setIsPlaying(false));
    socket.on("cue:reset", () => { setIsPlaying(false); setCurrentCue(0); setElapsed(0); });
    return () => { disconnectQsheetSocket(); socketRef.current = null; };
  }, [id, flatCues.length]);

  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.emit("cue:update", { currentCue, elapsed, isPlaying });
  }, [currentCue, elapsed, isPlaying]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <Loader2 className="h-8 w-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!doc || flatCues.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black text-white gap-4">
        <p className="text-zinc-500">キューデータがありません</p>
        <button
          onClick={() => navigate(`/qsheet/editor/${id}`)}
          className="px-4 py-2 border border-zinc-700 rounded text-sm hover:bg-zinc-900"
        >
          エディターに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white select-none overflow-hidden" style={{ fontFamily: "'Oswald', 'Arial Narrow', sans-serif" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/qsheet/editor/${id}`)}
            className="text-zinc-500 hover:text-white transition-colors p-1"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm text-zinc-300 tracking-wider uppercase truncate max-w-[200px]">
            {doc.title || "ON AIR"}
          </span>
        </div>

        {/* ON AIR indicator */}
        <div className={cn(
          "flex items-center gap-2 px-4 py-1 rounded text-sm font-bold tracking-widest uppercase transition-all",
          isPlaying
            ? "bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.6)]"
            : "bg-zinc-900 text-zinc-600 border border-zinc-800"
        )}>
          <span className={cn("w-2 h-2 rounded-full", isPlaying ? "bg-white animate-pulse" : "bg-zinc-700")} />
          ON AIR
        </div>

        {/* Total time */}
        <div className="text-right">
          <div className="text-xs text-zinc-600 tracking-wider">TOTAL</div>
          <div className="font-mono text-sm text-zinc-400 tabular-nums">
            {formatTime(elapsed)} / {formatTime(totalDuration)}
          </div>
        </div>
      </div>

      {/* Total progress bar (thin) */}
      <div className="h-0.5 bg-zinc-900">
        <div
          className="h-full bg-zinc-600 transition-all duration-1000"
          style={{ width: `${totalProgressPercent}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Current cue — center stage */}
        <div className="flex-1 flex flex-col p-6 lg:p-10 overflow-auto">
          {current && (
            <>
              {/* Section label */}
              <div className="text-xs text-zinc-600 tracking-[0.2em] uppercase mb-4">
                {current.sectionLabel} &nbsp;— CUE {currentCue + 1} / {flatCues.length}
              </div>

              {/* Countdown clocks */}
              <div className="flex items-end gap-8 mb-6">
                {/* Cue remaining */}
                <div>
                  <div className="text-xs text-zinc-600 tracking-widest uppercase mb-1">残り</div>
                  <div
                    className={cn(
                      "font-mono tabular-nums transition-colors",
                      cueRemaining <= 10 && cueRemaining > 0 ? "text-red-400" : cueRemaining <= 30 ? "text-amber-400" : "text-emerald-400",
                      "text-6xl lg:text-8xl font-light"
                    )}
                    style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}
                  >
                    {formatTime(cueRemaining)}
                  </div>
                </div>
                {/* Cue start time */}
                <div className="mb-2">
                  <div className="text-xs text-zinc-600 tracking-widest uppercase mb-1">開始時刻</div>
                  <div className="font-mono tabular-nums text-2xl text-zinc-500" style={{ letterSpacing: "0.02em" }}>
                    {formatTime(current.startTime)}
                  </div>
                </div>
                {/* Cue duration */}
                <div className="mb-2">
                  <div className="text-xs text-zinc-600 tracking-widest uppercase mb-1">尺</div>
                  <div className="font-mono tabular-nums text-2xl text-zinc-500">
                    {current.row.duration}s
                  </div>
                </div>
              </div>

              {/* Cue progress bar */}
              <div className="h-2 bg-zinc-900 rounded-full mb-8 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-1000", progressColor)}
                  style={{ width: `${cueProgress * 100}%` }}
                />
              </div>

              {/* Content blocks */}
              <div className="space-y-4 max-w-3xl">
                {/* Scenario */}
                {(current.row.scenario as string) && (
                  <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-5">
                    <div className="text-xs text-zinc-600 tracking-widest uppercase mb-3">台本 / SCRIPT</div>
                    <p className="text-base lg:text-lg whitespace-pre-wrap leading-relaxed text-zinc-100" style={{ fontFamily: "inherit" }}>
                      {current.row.scenario as string}
                    </p>
                  </div>
                )}

                {/* Video + Audio in a grid */}
                {((current.row.video as string) || (current.row.audio as string)) && (
                  <div className="grid grid-cols-2 gap-3">
                    {(current.row.video as string) && (
                      <div className="bg-zinc-950 border border-blue-900/50 rounded-lg p-4">
                        <div className="text-xs text-blue-500 tracking-widest uppercase mb-2">映像 / VIDEO</div>
                        <p className="text-sm text-zinc-200">{current.row.video as string}</p>
                      </div>
                    )}
                    {(current.row.audio as string) && (
                      <div className="bg-zinc-950 border border-emerald-900/50 rounded-lg p-4">
                        <div className="text-xs text-emerald-500 tracking-widest uppercase mb-2">音声 / AUDIO</div>
                        <p className="text-sm text-zinc-200">{current.row.audio as string}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Right panel: Next + Cue list */}
        <div className="w-72 lg:w-80 border-l border-zinc-800 flex flex-col bg-zinc-950 shrink-0">
          {/* Next cue */}
          {next && (
            <div className="p-4 border-b border-zinc-800">
              <div className="text-xs text-zinc-600 tracking-widest uppercase mb-2">NEXT</div>
              <div className="text-sm text-zinc-400 mb-1">{next.sectionLabel}</div>
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-amber-400 text-lg tabular-nums">{formatTime(next.startTime)}</span>
                <span className="text-xs text-zinc-500">{next.row.duration}s</span>
              </div>
              <p className="text-sm text-zinc-300 mt-1 line-clamp-2">{(next.row.scenario as string) || next.row.label || "---"}</p>
            </div>
          )}

          {/* Cue list */}
          <div ref={cueListRef} className="flex-1 overflow-y-auto">
            {flatCues.map((cue, idx) => (
              <button
                key={cue.row.id}
                id={`cue-${idx}`}
                onClick={() => { setCurrentCue(idx); setElapsed(cue.startTime); }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left border-b border-zinc-900 transition-colors text-xs",
                  idx === currentCue
                    ? "bg-red-950 border-l-2 border-l-red-600 text-white"
                    : idx < currentCue
                    ? "text-zinc-700 hover:bg-zinc-900/50"
                    : "text-zinc-500 hover:bg-zinc-900/50"
                )}
              >
                <span className="font-mono w-5 text-right shrink-0 text-zinc-700">{idx + 1}</span>
                <span className="font-mono w-14 shrink-0 tabular-nums">{formatTime(cue.startTime)}</span>
                <span className="truncate flex-1">{(cue.row.scenario as string)?.slice(0, 30) || cue.row.label || "---"}</span>
                <span className="font-mono shrink-0 text-zinc-700">{cue.row.duration}s</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-zinc-800 bg-zinc-950">
        {/* Reset */}
        <button
          onClick={() => { setCurrentCue(0); setElapsed(0); setIsPlaying(false); }}
          className="p-2 rounded text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
          title="リセット (ESC)"
        >
          <Square className="h-4 w-4" />
        </button>
        {/* Prev */}
        <button
          onClick={() => {
            const prev = Math.max(currentCue - 1, 0);
            setCurrentCue(prev);
            setElapsed(flatCues[prev].startTime);
          }}
          className="p-2 rounded text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
          title="前へ (←)"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        {/* Play/Pause */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center transition-all font-bold",
            isPlaying
              ? "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]"
              : "bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)]"
          )}
          title="再生/停止 (P)"
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </button>
        {/* Next */}
        <button
          onClick={() => {
            const nxt = Math.min(currentCue + 1, flatCues.length - 1);
            setCurrentCue(nxt);
            setElapsed(flatCues[nxt].startTime);
          }}
          className="p-2 rounded text-zinc-600 hover:text-white hover:bg-zinc-800 transition-colors"
          title="次へ (Space / →)"
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <div className="ml-6 text-xs text-zinc-700 hidden sm:block tracking-wider">
          SPACE: 次へ &nbsp;/&nbsp; P: 再生停止 &nbsp;/&nbsp; ESC: リセット
        </div>
      </div>
    </div>
  );
}
