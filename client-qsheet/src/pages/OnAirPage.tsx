import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
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
        flatCues.push({
          sectionLabel: section.label,
          row,
          startTime: time,
          index: idx,
        });
        time += row.duration || 0;
        idx++;
      }
    }
  }

  const totalDuration = flatCues.reduce((acc, c) => acc + (c.row.duration || 0), 0);
  const current = flatCues[currentCue];
  const next = flatCues[currentCue + 1];

  // Timer
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
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
    if (el && cueListRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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
        setIsPlaying(false);
        setCurrentCue(0);
        setElapsed(0);
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

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!doc || flatCues.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-slate-950 text-white gap-4">
        <p className="text-muted-foreground">キューデータがありません</p>
        <Button variant="outline" onClick={() => navigate(`/qsheet/editor/${id}`)}>
          エディターに戻る
        </Button>
      </div>
    );
  }

  const progressPercent = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-400 hover:text-white hover:bg-slate-800"
            onClick={() => navigate(`/qsheet/editor/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold truncate">{doc.title || "ON AIR"}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-number">{formatTime(elapsed)}</span>
          <span>/</span>
          <span className="font-number">{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div
          className="h-full bg-primary transition-all duration-1000"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Current cue display */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
          {current && (
            <>
              <div className="text-xs text-slate-500 mb-2 uppercase tracking-wider">
                {current.sectionLabel}
              </div>
              <div className="text-4xl lg:text-6xl font-number text-primary mb-6">
                {formatTime(current.startTime)}
              </div>
              <div className="max-w-2xl w-full space-y-4">
                <div className="bg-slate-900 rounded-lg p-6">
                  <div className="text-xs text-slate-500 mb-2">台本</div>
                  <p className="text-lg lg:text-xl whitespace-pre-wrap leading-relaxed">
                    {current.row.scenario || "---"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-900 rounded-lg p-4">
                    <div className="text-xs text-blue-400 mb-1">映像</div>
                    <p className="text-sm">{current.row.video || "---"}</p>
                  </div>
                  <div className="bg-slate-900 rounded-lg p-4">
                    <div className="text-xs text-green-400 mb-1">音声</div>
                    <p className="text-sm">{current.row.audio || "---"}</p>
                  </div>
                </div>
              </div>
              {/* Duration indicator */}
              <div className="mt-6 text-sm text-slate-500">
                尺: <span className="font-number text-slate-300">{current.row.duration}秒</span>
              </div>
            </>
          )}
        </div>

        {/* Next cue + cue list */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col">
          {/* Next up */}
          {next && (
            <div className="p-4 border-b border-slate-800 bg-slate-900/50">
              <div className="text-xs text-slate-500 mb-1">NEXT</div>
              <div className="flex items-baseline gap-2">
                <span className="font-number text-sm text-slate-400">
                  {formatTime(next.startTime)}
                </span>
                <span className="text-sm truncate">{next.row.scenario || next.sectionLabel}</span>
              </div>
            </div>
          )}

          {/* Cue list */}
          <div ref={cueListRef} className="flex-1 overflow-y-auto">
            {flatCues.map((cue, idx) => (
              <button
                key={cue.row.id}
                id={`cue-${idx}`}
                onClick={() => {
                  setCurrentCue(idx);
                  setElapsed(cue.startTime);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-left text-xs border-b border-slate-800/50 transition-colors",
                  idx === currentCue
                    ? "bg-primary/20 text-white"
                    : idx < currentCue
                    ? "text-slate-600"
                    : "text-slate-400 hover:bg-slate-800/50"
                )}
              >
                <span className="font-number w-6 text-right shrink-0">{idx + 1}</span>
                <span className="font-number w-16 shrink-0">{formatTime(cue.startTime)}</span>
                <span className="truncate">{cue.row.scenario || cue.row.label || "---"}</span>
                <span className="font-number ml-auto shrink-0">{cue.row.duration}s</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-slate-800 bg-slate-900/50">
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={() => {
            setCurrentCue(0);
            setElapsed(0);
            setIsPlaying(false);
          }}
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={() => {
            const prev = Math.max(currentCue - 1, 0);
            setCurrentCue(prev);
            setElapsed(flatCues[prev].startTime);
          }}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full",
            isPlaying ? "bg-primary hover:bg-primary/80" : "bg-white text-slate-950 hover:bg-slate-200"
          )}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-slate-400 hover:text-white hover:bg-slate-800"
          onClick={() => {
            const nxt = Math.min(currentCue + 1, flatCues.length - 1);
            setCurrentCue(nxt);
            setElapsed(flatCues[nxt].startTime);
          }}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <div className="text-xs text-slate-600 ml-4 hidden sm:block">
          Space: 次へ / P: 再生/停止 / ESC: リセット
        </div>
      </div>
    </div>
  );
}
