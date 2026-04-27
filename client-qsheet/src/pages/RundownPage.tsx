import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseDur, fmtAbs } from "@/lib/time";
import {
  Loader2,
  ArrowLeft,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Sun,
  Moon,
  Columns3,
  X,
} from "lucide-react";

// ============================================================
// Types (shared with EditorPage / OnAirPage)
// ============================================================
interface CueRow {
  id: string;
  label: string;
  duration: string | number;
  cells?: Record<string, any>;
  [key: string]: any;
}

interface Section {
  id: string;
  label: string;
  rows: CueRow[];
  duration?: string | number;
  _break?: boolean;
  _pageBreak?: boolean;
  _vtr?: boolean;
}

interface Block {
  id: string;
  type: string;
  label: string;
  width: number;
}

interface DocumentData {
  meta: { title: string; draft: string; [key: string]: unknown };
  blocks: Block[];
  sections: Section[];
  masters: { persons: string[]; video: string[]; audio: string[]; telop: string[] };
}

interface FlatCue {
  sectionLabel: string;
  sectionIdx: number;
  row: CueRow;
  startTime: number;
  globalIndex: number;
}

// ============================================================
// Helpers
// ============================================================
const formatTime = (seconds: number): string => {
  const sign = seconds < 0 ? "-" : "";
  return `${sign}${fmtAbs(Math.abs(seconds))}`;
};

function extractCellText(row: CueRow, block: Block): string {
  const cell = row.cells?.[block.id];
  if (cell) {
    if (block.type === "scenario" && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.name ? `【${e.name}】` : ""}${(e.html || "").replace(/<[^>]*>/g, "")}`)
        .filter((s: string) => s)
        .join("\n");
    }
    if (["video", "audio", "telop"].includes(block.type) && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.label || ""}${e.memo ? " " + e.memo : ""}`)
        .filter((s: string) => s.trim())
        .join("\n");
    }
    if (typeof cell === "string") return cell;
    if (cell.value) return String(cell.value);
  }
  const val = row[block.id] || "";
  return typeof val === "string" ? val : String(val || "");
}

const STORAGE_KEY_COLUMNS = "rundown-visible-columns";
const STORAGE_KEY_THEME = "rundown-theme";

// ============================================================
// RundownPage
// ============================================================
export default function RundownPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // State synced via Socket.IO from OnAirPage
  const [currentCue, setCurrentCue] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Local UI state
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    return (localStorage.getItem(STORAGE_KEY_THEME) as "light" | "dark") || "dark";
  });
  const [columnSelectorOpen, setColumnSelectorOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_COLUMNS);
      if (stored) return new Set(JSON.parse(stored));
    } catch { /* ignore */ }
    return new Set<string>(); // empty = show all
  });

  const socketRef = useRef<ReturnType<typeof getQsheetSocket> | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const localTimerRef = useRef<ReturnType<typeof setInterval>>();

  // Persist theme
  useEffect(() => { localStorage.setItem(STORAGE_KEY_THEME, theme); }, [theme]);

  // ============================================================
  // Fetch document
  // ============================================================
  const { data: doc, isLoading } = useQuery({
    queryKey: ["qsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/qsheet/documents/${id}`);
      const d = res.data.data;
      if (typeof d.data === "string") d.data = JSON.parse(d.data);
      return d as { id: string; title: string; data: DocumentData };
    },
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

  // ============================================================
  // Flatten cues
  // ============================================================
  const flatCues: FlatCue[] = useMemo(() => {
    if (!doc?.data?.sections) return [];
    const cues: FlatCue[] = [];
    let time = 0;
    let idx = 0;
    doc.data.sections.forEach((section, sIdx) => {
      if (section._pageBreak) return;
      // CM (break) は section 自体を1キューとして尺を積む
      if (section._break) {
        const dur = parseDur(section.duration);
        const cmRow: CueRow = { id: `cm-${sIdx}`, label: section.label || "CM", duration: dur };
        cues.push({ sectionLabel: section.label || "CM", sectionIdx: sIdx, row: cmRow, startTime: time, globalIndex: idx });
        time += dur;
        idx++;
        return;
      }
      // VTR も section 自体を1キューとして尺を積む
      if (section._vtr) {
        const dur = parseDur(section.duration);
        const vtrRow: CueRow = { id: `vtr-${sIdx}`, label: section.label || "VTR", duration: dur };
        cues.push({ sectionLabel: `VTR: ${section.label || ""}`.trim(), sectionIdx: sIdx, row: vtrRow, startTime: time, globalIndex: idx });
        time += dur;
        idx++;
        return;
      }
      // 通常ロール: 行ごとの duration 合計が 0 かつ section.duration が設定されていれば、ロール全体を 1 キューとする
      const rowSum = section.rows.reduce((a, r) => a + parseDur(r.duration), 0);
      const secDur = parseDur(section.duration);
      if (rowSum === 0 && secDur > 0) {
        const secRow: CueRow = { id: `sec-${sIdx}`, label: section.label || "", duration: secDur };
        cues.push({ sectionLabel: section.label, sectionIdx: sIdx, row: secRow, startTime: time, globalIndex: idx });
        time += secDur;
        idx++;
        return;
      }
      for (const row of section.rows) {
        cues.push({ sectionLabel: section.label, sectionIdx: sIdx, row, startTime: time, globalIndex: idx });
        time += parseDur(row.duration);
        idx++;
      }
    });
    return cues;
  }, [doc]);

  const totalDuration = useMemo(
    () => flatCues.reduce((acc, c) => acc + parseDur(c.row.duration), 0),
    [flatCues]
  );

  const blocks = doc?.data?.blocks || [];

  // Determine which columns are visible
  const activeBlocks = useMemo(() => {
    if (visibleColumns.size === 0) return blocks; // empty set = show all
    return blocks.filter((b) => visibleColumns.has(b.id));
  }, [blocks, visibleColumns]);

  // Save visible columns
  useEffect(() => {
    if (visibleColumns.size > 0) {
      localStorage.setItem(STORAGE_KEY_COLUMNS, JSON.stringify([...visibleColumns]));
    } else {
      localStorage.removeItem(STORAGE_KEY_COLUMNS);
    }
  }, [visibleColumns]);

  // ============================================================
  // Socket.IO: receive sync from OnAir + send commands
  // ============================================================
  useEffect(() => {
    if (!id) return;
    const socket = getQsheetSocket(id);
    socketRef.current = socket;

    socket.on("cue:sync", (data: { currentCue: number; elapsed: number; isPlaying: boolean }) => {
      setCurrentCue(data.currentCue);
      setElapsed(data.elapsed);
      setIsPlaying(data.isPlaying);
    });

    // Also listen to transport commands relayed from other Rundown instances
    socket.on("cue:next", () => setCurrentCue((prev) => Math.min(prev + 1, flatCues.length - 1)));
    socket.on("cue:prev", () => setCurrentCue((prev) => Math.max(prev - 1, 0)));
    socket.on("cue:jump", (data: { cueIndex: number }) => {
      setCurrentCue(data.cueIndex);
      if (flatCues[data.cueIndex]) setElapsed(flatCues[data.cueIndex].startTime);
    });
    socket.on("cue:play", () => setIsPlaying(true));
    socket.on("cue:pause", () => setIsPlaying(false));
    socket.on("cue:reset", () => { setIsPlaying(false); setCurrentCue(0); setElapsed(0); });

    return () => {
      disconnectQsheetSocket();
      socketRef.current = null;
    };
  }, [id, flatCues.length]);

  // Local timer: increment elapsed when playing (fallback if OnAir isn't broadcasting)
  useEffect(() => {
    if (isPlaying) {
      localTimerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(localTimerRef.current);
    }
    return () => clearInterval(localTimerRef.current);
  }, [isPlaying]);

  // ============================================================
  // Transport command helpers (emit to Socket.IO)
  // ============================================================
  const sendNext = useCallback(() => { socketRef.current?.emit("cue:next"); setCurrentCue((p) => Math.min(p + 1, flatCues.length - 1)); }, [flatCues.length]);
  const sendPrev = useCallback(() => { socketRef.current?.emit("cue:prev"); setCurrentCue((p) => Math.max(p - 1, 0)); }, []);
  const sendPlay = useCallback(() => { socketRef.current?.emit("cue:play"); setIsPlaying(true); }, []);
  const sendPause = useCallback(() => { socketRef.current?.emit("cue:pause"); setIsPlaying(false); }, []);
  const sendReset = useCallback(() => { socketRef.current?.emit("cue:reset"); setIsPlaying(false); setCurrentCue(0); setElapsed(0); }, []);
  const sendJump = useCallback((idx: number) => {
    socketRef.current?.emit("cue:jump", { cueIndex: idx });
    setCurrentCue(idx);
    if (flatCues[idx]) setElapsed(flatCues[idx].startTime);
  }, [flatCues]);

  // ============================================================
  // Auto-scroll to current cue
  // ============================================================
  useEffect(() => {
    const el = document.getElementById(`rundown-cue-${currentCue}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentCue]);

  // ============================================================
  // Keyboard shortcuts
  // ============================================================
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;

      if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        sendNext();
      } else if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        isPlaying ? sendPause() : sendPlay();
      } else if (e.key === "Escape") {
        sendReset();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        sendNext();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        sendPrev();
      } else if (e.key === "l" || e.key === "L") {
        setTheme((t) => (t === "light" ? "dark" : "light"));
      } else if (e.key === "d" || e.key === "D") {
        setTheme((t) => (t === "light" ? "dark" : "light"));
      }
    },
    [isPlaying, sendNext, sendPrev, sendPlay, sendPause, sendReset]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ============================================================
  // 押し/巻き calculation
  // ============================================================
  const currentCueData = flatCues[currentCue];
  const plannedTime = currentCueData?.startTime ?? 0;
  const oshimaki = elapsed - plannedTime; // positive = 押し (behind), negative = 巻き (ahead)

  const progressPercent = totalDuration > 0 ? Math.min((elapsed / totalDuration) * 100, 100) : 0;
  const remaining = Math.max(totalDuration - elapsed, 0);

  // ============================================================
  // Theme classes
  // ============================================================
  const isDark = theme === "dark";
  const bg = isDark ? "bg-slate-950" : "bg-white";
  const text = isDark ? "text-white" : "text-slate-900";
  const borderColor = isDark ? "border-slate-800" : "border-slate-200";
  const headerBg = isDark ? "bg-slate-900/50" : "bg-slate-50";
  const sectionBg = isDark ? "bg-slate-900/80" : "bg-slate-100";
  const rowHover = isDark ? "hover:bg-slate-800/50" : "hover:bg-slate-50";
  const mutedText = isDark ? "text-slate-500" : "text-slate-400";
  const pastCueText = isDark ? "text-slate-600" : "text-slate-300";

  // ============================================================
  // Render
  // ============================================================
  if (isLoading) {
    return (
      <div className={cn("flex h-screen items-center justify-center", bg)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!doc || flatCues.length === 0) {
    return (
      <div className={cn("flex h-screen flex-col items-center justify-center gap-4", bg, text)}>
        <p className={mutedText}>キューデータがありません</p>
        <Button variant="outline" onClick={() => navigate(`/qsheet/editor/${id}`)}>
          エディターに戻る
        </Button>
      </div>
    );
  }

  // Column toggle handler
  const toggleColumn = (blockId: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (prev.size === 0) {
        // Currently showing all — switch to "all except this one"
        blocks.forEach((b) => { if (b.id !== blockId) next.add(b.id); });
        return next;
      }
      if (next.has(blockId)) {
        next.delete(blockId);
        // If nothing selected, reset to show all
        if (next.size === 0) return new Set<string>();
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  // Track section boundaries for rendering section headers in the flat list
  let lastSectionIdx = -1;

  return (
    <div className={cn("flex flex-col h-screen select-none", bg, text)}>
      {/* ==================== Header bar ==================== */}
      <div className={cn("flex items-center justify-between px-4 py-2 border-b", borderColor, headerBg)}>
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className={cn("shrink-0", isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900")}
            onClick={() => navigate(`/qsheet/editor/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold truncate">
            {doc.data.meta.title || "ランダウン"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Column selector toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 gap-1 text-xs", isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900")}
            onClick={() => setColumnSelectorOpen(!columnSelectorOpen)}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">列選択</span>
          </Button>

          {/* Light/Dark toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900")}
            onClick={() => setTheme(isDark ? "light" : "dark")}
            title={isDark ? "ライトモード (L)" : "ダークモード (D)"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* ==================== Column selector popover ==================== */}
      {columnSelectorOpen && (
        <div className={cn("flex items-center gap-2 px-4 py-2 border-b flex-wrap", borderColor, headerBg)}>
          {blocks.map((block) => {
            const isActive = visibleColumns.size === 0 || visibleColumns.has(block.id);
            return (
              <button
                key={block.id}
                onClick={() => toggleColumn(block.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                  isActive
                    ? isDark
                      ? "bg-primary text-white border-primary"
                      : "bg-primary text-white border-primary"
                    : isDark
                      ? "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"
                      : "bg-white text-slate-400 border-slate-300 hover:border-slate-400"
                )}
              >
                {block.label}
              </button>
            );
          })}
          <button
            onClick={() => { setVisibleColumns(new Set<string>()); }}
            className={cn("px-3 py-1 rounded-full text-xs transition-colors", mutedText, rowHover)}
          >
            全表示
          </button>
          <button
            onClick={() => setColumnSelectorOpen(false)}
            className={cn("ml-auto", mutedText)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ==================== Timeline info bar (押し/巻き) ==================== */}
      <div className={cn("px-4 py-2 border-b", borderColor, headerBg)}>
        <div className="flex items-center gap-4 text-xs">
          <div>
            <span className={mutedText}>経過 </span>
            <span className="font-number font-semibold">{formatTime(elapsed)}</span>
          </div>
          <div className={cn("w-px h-4", isDark ? "bg-slate-700" : "bg-slate-300")} />
          <div>
            <span className={mutedText}>残り </span>
            <span className="font-number font-semibold">{formatTime(remaining)}</span>
          </div>
          <div className={cn("w-px h-4", isDark ? "bg-slate-700" : "bg-slate-300")} />
          <div>
            <span className={mutedText}>押し/巻き </span>
            <span
              className={cn(
                "font-number font-bold",
                oshimaki > 3 ? "text-red-500" : oshimaki < -3 ? "text-blue-400" : isDark ? "text-green-400" : "text-green-600"
              )}
            >
              {oshimaki > 0 ? "+" : ""}{formatTime(oshimaki)}
            </span>
          </div>
          <div className={cn("w-px h-4", isDark ? "bg-slate-700" : "bg-slate-300")} />
          <div className="font-number">
            {Math.round(progressPercent)}%
          </div>
        </div>
        {/* Progress bar */}
        <div className={cn("h-1 mt-1.5 rounded-full", isDark ? "bg-slate-800" : "bg-slate-200")}>
          <div
            className="h-full bg-primary rounded-full transition-all duration-1000"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* ==================== Table ==================== */}
      <div ref={tableRef} className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className={cn("sticky top-0 z-10", headerBg)}>
            <tr className={cn("border-b", borderColor)}>
              <th className="w-10 px-2 py-2 text-center text-xs font-medium opacity-60">#</th>
              <th className="w-20 px-2 py-2 text-left text-xs font-medium opacity-60">時刻</th>
              <th className="w-14 px-2 py-2 text-center text-xs font-medium opacity-60">尺</th>
              <th className="w-20 px-2 py-2 text-center text-xs font-medium opacity-60">実尺</th>
              {activeBlocks.map((block) => (
                <th key={block.id} className="px-3 py-2 text-left text-xs font-medium opacity-60 min-w-[120px]">
                  {block.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flatCues.map((cue) => {
              const isCurrent = cue.globalIndex === currentCue;
              const isPast = cue.globalIndex < currentCue;
              const showSectionHeader = cue.sectionIdx !== lastSectionIdx;
              lastSectionIdx = cue.sectionIdx;

              // Actual elapsed at this cue (if past or current)
              const actualElapsed = isPast || isCurrent ? elapsed - cue.startTime : null;

              return (
                <tr key={`section-${cue.sectionIdx}-row-${cue.row.id}`}>
                  <td colSpan={4 + activeBlocks.length}>
                    <div>
                      {/* Section header */}
                      {showSectionHeader && (
                        <div className={cn("px-3 py-1.5 text-xs font-semibold uppercase tracking-wider", sectionBg, mutedText)}>
                          {cue.sectionLabel}
                        </div>
                      )}
                      {/* Cue row */}
                      <button
                        id={`rundown-cue-${cue.globalIndex}`}
                        onClick={() => sendJump(cue.globalIndex)}
                        className={cn(
                          "w-full flex items-start border-b transition-colors text-left",
                          borderColor,
                          isCurrent
                            ? isDark
                              ? "bg-primary/20 border-l-4 border-l-primary"
                              : "bg-primary/10 border-l-4 border-l-primary"
                            : isPast
                              ? pastCueText
                              : rowHover
                        )}
                      >
                        {/* # */}
                        <div className="w-10 px-2 py-2 text-center text-xs font-number shrink-0">
                          {cue.globalIndex + 1}
                        </div>
                        {/* 時刻 */}
                        <div className="w-20 px-2 py-2 text-xs font-number shrink-0">
                          {formatTime(cue.startTime)}
                        </div>
                        {/* 尺 */}
                        <div className="w-14 px-2 py-2 text-center text-xs font-number shrink-0">
                          {(() => { const d = parseDur(cue.row.duration); const m = Math.floor(d / 60); const s = d % 60; return m > 0 ? `${m}分${s > 0 ? `${s}秒` : ''}` : `${s}秒`; })()}
                        </div>
                        {/* 実尺 */}
                        <div className="w-20 px-2 py-2 text-center text-xs font-number shrink-0">
                          {actualElapsed !== null && actualElapsed >= 0
                            ? `${Math.floor(actualElapsed)}秒`
                            : "--"
                          }
                        </div>
                        {/* Block columns */}
                        {activeBlocks.map((block) => (
                          <div
                            key={block.id}
                            className={cn(
                              "px-3 py-2 text-xs min-w-[120px] flex-1",
                              block.type === "scenario" ? "whitespace-pre-wrap" : "truncate"
                            )}
                          >
                            {extractCellText(cue.row, block)}
                          </div>
                        ))}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ==================== Transport controls ==================== */}
      <div className={cn("flex items-center justify-center gap-4 px-4 py-3 border-t", borderColor, headerBg)}>
        <Button
          variant="ghost"
          size="icon"
          className={cn(isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900")}
          onClick={sendReset}
        >
          <Square className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900")}
          onClick={sendPrev}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full",
            isPlaying
              ? "bg-primary hover:bg-primary/80 text-white"
              : isDark
                ? "bg-white text-slate-950 hover:bg-slate-200"
                : "bg-slate-900 text-white hover:bg-slate-700"
          )}
          onClick={() => (isPlaying ? sendPause() : sendPlay())}
        >
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(isDark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900")}
          onClick={sendNext}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
        <div className={cn("text-xs ml-4 hidden sm:block", mutedText)}>
          Space: 次へ / P: 再生/停止 / ESC: リセット / L/D: テーマ切替
        </div>
      </div>
    </div>
  );
}
