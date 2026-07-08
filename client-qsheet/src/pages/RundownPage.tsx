import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseDur, fmtAbs } from "@/lib/time";
import { StageDiagramPreview } from "@/components/editor/StageDiagramCell";
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
  masters: {
    persons: string[];
    video: string[];
    audio: string[];
    telop: string[];
    micTypes?: string[];
    micChannels?: { ch: number; label?: string }[];
  };
  stageTemplates?: { name: string; elements: any[] }[];
  ledScenes?: { id: string; name: string; wall: string; floor: string }[];
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
    if (block.type === "audio_mic" && Array.isArray(cell.assignments)) {
      return cell.assignments
        .filter((a: any) => a.state && a.state !== "off")
        .sort((a: any, b: any) => (a.ch || 0) - (b.ch || 0))
        .map((a: any) => {
          const tag = a.state === "on" ? "ON" : "STBY";
          const name = a.person ? ` ${a.person}` : "";
          const mic = a.micType ? `/${a.micType}` : "";
          return `Ch${a.ch}:${tag}${name}${mic}`;
        })
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
  // 現在キューに入った時点の経過秒 (実尺 = elapsed - これ)。予定尺と切り離して必ず 0 から進む
  const [cueEnteredElapsed, setCueEnteredElapsed] = useState(0);
  // 通過済みキューの実測尺 (NEXT で進んだときに記録)
  const [actualDurations, setActualDurations] = useState<Record<number, number>>({});
  const prevCueRef = useRef(0);
  const elapsedRef = useRef(0);
  useEffect(() => { elapsedRef.current = elapsed; }, [elapsed]);

  // キューが切り替わったら: 直前キューの実測尺を記録し、実尺の起点を現在時刻に
  useEffect(() => {
    const prev = prevCueRef.current;
    if (prev === currentCue) return;
    const spent = Math.max(0, elapsedRef.current - (cueEnteredElapsed ?? 0));
    if (currentCue === prev + 1 && spent > 0) {
      // 順送りのときだけ実測として記録 (ジャンプ/巻き戻しは計測として無意味なので記録しない)
      setActualDurations((m) => ({ ...m, [prev]: spent }));
    }
    prevCueRef.current = currentCue;
    setCueEnteredElapsed(elapsedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCue]);

  const resetCueTiming = useCallback(() => {
    prevCueRef.current = 0;
    setCueEnteredElapsed(0);
    setActualDurations({});
  }, []);

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

  // Persist theme + sync to <html class="dark"> for DADS semantic tokens
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_THEME, theme);
    const html = document.documentElement;
    const wasAlreadyDark = html.classList.contains("dark");
    if (theme === "dark") {
      if (!wasAlreadyDark) html.classList.add("dark");
    }
    return () => {
      if (theme === "dark" && !wasAlreadyDark) html.classList.remove("dark");
    };
  }, [theme]);

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
    socket.on("cue:reset", () => { setIsPlaying(false); setCurrentCue(0); setElapsed(0); resetCueTiming(); });

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
  const sendNext = useCallback(() => {
    socketRef.current?.emit("cue:next");
    setCurrentCue((p) => Math.min(p + 1, flatCues.length - 1));
    // NEXT で進んだのに計時が止まっている場合は自動で走らせる (「次のキューで計時が進まない」対策)
    setIsPlaying((playing) => {
      if (!playing) socketRef.current?.emit("cue:play");
      return true;
    });
  }, [flatCues.length]);
  const sendPrev = useCallback(() => { socketRef.current?.emit("cue:prev"); setCurrentCue((p) => Math.max(p - 1, 0)); }, []);
  const sendPlay = useCallback(() => { socketRef.current?.emit("cue:play"); setIsPlaying(true); }, []);
  const sendPause = useCallback(() => { socketRef.current?.emit("cue:pause"); setIsPlaying(false); }, []);
  const sendReset = useCallback(() => {
    if (!window.confirm("計時をリセットしますか？ (経過時間と実尺の記録がクリアされます)")) return;
    socketRef.current?.emit("cue:reset");
    setIsPlaying(false); setCurrentCue(0); setElapsed(0); resetCueTiming();
  }, [resetCueTiming]);
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
  // DADS semantic tokens (light/dark の切替は <html class="dark"> で自動)
  const bg = "bg-background";
  const text = "text-foreground";
  const borderColor = "border-border";
  const headerBg = "bg-card/50";
  const sectionBg = "bg-card/80";
  const rowHover = "hover:bg-accent/50";
  const mutedText = "text-muted-foreground";
  const pastCueText = "text-muted-foreground/60";

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
            className={cn("shrink-0", isDark ? "text-muted-foreground hover:text-foreground hover:bg-accent" : "text-muted-foreground hover:text-foreground")}
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
            className={cn("h-8 gap-1 text-xs", isDark ? "text-muted-foreground hover:text-foreground hover:bg-accent" : "text-muted-foreground hover:text-foreground")}
            onClick={() => setColumnSelectorOpen(!columnSelectorOpen)}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">列選択</span>
          </Button>

          {/* Light/Dark toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", isDark ? "text-muted-foreground hover:text-foreground hover:bg-accent" : "text-muted-foreground hover:text-foreground")}
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
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-primary text-primary-foreground border-primary"
                    : isDark
                      ? "bg-muted text-muted-foreground border-border hover:border-foreground/40"
                      : "bg-card text-muted-foreground border-border hover:border-foreground/40"
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
          <div className={cn("w-px h-4", null, "bg-border")} />
          <div>
            <span className={mutedText}>残り </span>
            <span className="font-number font-semibold">{formatTime(remaining)}</span>
          </div>
          <div className={cn("w-px h-4", null, "bg-border")} />
          <div>
            <span className={mutedText}>押し/巻き </span>
            <span
              className={cn(
                "font-number font-bold",
                oshimaki > 3 ? "text-red-500" : oshimaki < -3 ? "text-info" : isDark ? "text-success" : "text-success"
              )}
            >
              {oshimaki > 0 ? "+" : ""}{formatTime(oshimaki)}
            </span>
          </div>
          <div className={cn("w-px h-4", null, "bg-border")} />
          <div className="font-number">
            {Math.round(progressPercent)}%
          </div>
        </div>
        {/* Progress bar */}
        <div className={cn("h-1 mt-1.5 rounded-full", null, "bg-muted")}>
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

              // 実尺: 現在キュー = このキューに入ってからの経過 (必ず 0 から進む)、
              // 通過済み = NEXT 時に記録した実測尺 (旧実装の「elapsed - 予定開始時刻」は
              // 予定より早く進めると負になり "--" 表示 = 計時が止まって見えるバグがあった)
              const actualElapsed = isCurrent
                ? Math.max(0, elapsed - cueEnteredElapsed)
                : isPast
                  ? (actualDurations[cue.globalIndex] ?? null)
                  : null;

              // 任意エントリのハイライト色（最初に見つかったものを採用）
              const scenarioBlk = blocks.find((b) => b.type === "scenario");
              const cueHighlight = scenarioBlk
                ? ((cue.row.cells?.[scenarioBlk.id]?.entries || []) as any[])
                    .map((e) => e?.highlight)
                    .find((h) => !!h)
                : undefined;

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
                        style={cueHighlight && !isCurrent ? { backgroundColor: isDark ? `${cueHighlight}33` : cueHighlight } : undefined}
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
                        {activeBlocks.map((block) => {
                          const cell = cue.row.cells?.[block.id];
                          // LED/XR: シーン名 + 壁/床 + トリガー
                          if (block.type === "led_xr") {
                            const entries: any[] = Array.isArray(cell?.entries) ? cell.entries : [];
                            return (
                              <div key={block.id} className="px-3 py-2 text-xs min-w-[120px] flex-1 leading-tight">
                                {entries.map((en, ei) => {
                                  const scene = doc?.data?.ledScenes?.find((s) => s.id === en?.sceneId);
                                  const cueLabel = en?.cueType === "custom" ? (en.cueCustom || "") : (en?.cueType || "");
                                  const transLabel = en?.transition === "custom" ? (en.transitionCustom || "") : (en?.transition || "");
                                  const trigger = cueLabel && transLabel ? `${cueLabel}で${transLabel}` : (cueLabel || transLabel || "");
                                  if (!scene && !trigger) return null;
                                  return (
                                    <div key={ei} className="mb-1 last:mb-0">
                                      {scene?.name && <div className="font-bold text-violet-400">【{scene.name}】</div>}
                                      {scene?.wall && <div>壁: {scene.wall}</div>}
                                      {scene?.floor && <div>床: {scene.floor}</div>}
                                      {trigger && <div className={cn("text-[11px]", mutedText)}>［{trigger}］</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          // 立ち位置図: テンプレを SVG レンダリング
                          if (block.type === "stage_diagram") {
                            const tmplIdx = cell?.templateIndex ?? -1;
                            const tmpl = tmplIdx >= 0 ? doc?.data?.stageTemplates?.[tmplIdx] : null;
                            return (
                              <div key={block.id} className="px-3 py-2 text-xs min-w-[120px] flex-1">
                                {tmpl?.elements ? (
                                  <StageDiagramPreview elements={tmpl.elements} />
                                ) : (
                                  <span className={mutedText}>—</span>
                                )}
                                {cell?.note && <div className={cn("mt-1 text-[11px]", mutedText)}>{cell.note}</div>}
                              </div>
                            );
                          }
                          // シナリオ/映像/音声/テロップ: テキスト + 添付画像
                          if (["scenario", "video", "audio", "telop"].includes(block.type)) {
                            const entries: any[] = Array.isArray(cell?.entries) ? cell.entries : [];
                            const images = entries.map((e) => e?.image).filter(Boolean) as string[];
                            return (
                              <div
                                key={block.id}
                                className={cn(
                                  "px-3 py-2 text-xs min-w-[120px] flex-1",
                                  block.type === "scenario" ? "whitespace-pre-wrap" : ""
                                )}
                              >
                                <div className={block.type === "scenario" ? "" : "truncate"}>
                                  {extractCellText(cue.row, block)}
                                </div>
                                {images.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {images.map((src, i) => (
                                      <img
                                        key={i}
                                        src={src}
                                        alt=""
                                        className="max-h-24 max-w-full rounded border border-border object-contain"
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={block.id}
                              className="px-3 py-2 text-xs min-w-[120px] flex-1 truncate"
                            >
                              {extractCellText(cue.row, block)}
                            </div>
                          );
                        })}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ==================== Transport controls (iPad/タッチ操作向けに大型化) ==================== */}
      <div
        className={cn("border-t px-3 pt-2 pb-2", borderColor, headerBg)}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
      >
        <div className="flex items-stretch gap-2 max-w-4xl mx-auto">
          {/* RESET (誤タップ防止に小さめ + confirm) */}
          <button
            onClick={sendReset}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 w-16 min-h-[64px] rounded-xl border transition-colors select-none",
              borderColor,
              "text-muted-foreground hover:text-destructive hover:border-destructive/50 hover:bg-destructive/10 active:bg-destructive/20"
            )}
            aria-label="リセット"
          >
            <Square className="h-5 w-5" aria-hidden />
            <span className="text-[10px] font-bold tracking-wider">RESET</span>
          </button>
          {/* BACK */}
          <button
            onClick={sendPrev}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[64px] rounded-xl border transition-colors select-none",
              borderColor,
              "hover:bg-accent active:bg-accent/80"
            )}
            aria-label="前のキューへ"
          >
            <SkipBack className="h-6 w-6" aria-hidden />
            <span className="text-xs font-bold tracking-wider">BACK</span>
          </button>
          {/* PLAY / PAUSE */}
          <button
            onClick={() => (isPlaying ? sendPause() : sendPlay())}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[64px] rounded-xl transition-colors select-none font-bold",
              isPlaying
                ? "bg-warning/15 text-warning border border-warning/40 hover:bg-warning/25 active:bg-warning/30"
                : "bg-success/15 text-success border border-success/40 hover:bg-success/25 active:bg-success/30"
            )}
            aria-label={isPlaying ? "一時停止" : "再生"}
          >
            {isPlaying ? <Pause className="h-6 w-6" aria-hidden /> : <Play className="h-6 w-6 ml-0.5" aria-hidden />}
            <span className="text-xs tracking-wider">{isPlaying ? "PAUSE" : "PLAY"}</span>
          </button>
          {/* NEXT (最重要 = 最大) */}
          <button
            onClick={sendNext}
            className="flex items-center justify-center gap-2 flex-[2] min-h-[64px] rounded-xl bg-primary text-primary-foreground font-black shadow-lg shadow-primary/25 hover:bg-primary/90 active:scale-[0.98] transition-all select-none"
            aria-label="次のキューへ"
          >
            <span className="text-lg tracking-widest">NEXT</span>
            <SkipForward className="h-7 w-7" aria-hidden />
          </button>
        </div>
        <div className={cn("text-xs mt-1.5 text-center hidden lg:block", mutedText)}>
          Space/↓: 次へ / ↑: 前へ / P: 再生/停止 / ESC: リセット / L/D: テーマ切替
        </div>
      </div>
    </div>
  );
}
