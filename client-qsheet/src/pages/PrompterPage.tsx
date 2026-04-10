import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Settings2, ChevronUp, ChevronDown } from "lucide-react";

interface CueRow {
  id: string;
  label: string;
  duration: number;
  scenario?: string;
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
  index: number;
}

// Extract scenario block text from a row
function getScenarioText(row: CueRow, blocks: { id: string; type: string }[]): string {
  const scenarioBlock = blocks.find(b => b.type === 'scenario');
  if (scenarioBlock) {
    // New data model: row.cells[blockId].entries
    const cell = (row as any).cells?.[scenarioBlock.id];
    if (cell?.entries && Array.isArray(cell.entries)) {
      return cell.entries
        .map((e: any) => `${e.name ? `【${e.name}】` : ''}${(e.html || '').replace(/<[^>]*>/g, '')}`)
        .filter((s: string) => s)
        .join('\n');
    }
    if (typeof cell === 'string') return cell;
    if (cell?.value) return String(cell.value);
    // Old data model fallback
    const val = row[scenarioBlock.id];
    if (typeof val === 'string') return val;
  }
  return '';
}

export default function PrompterPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [currentCue, setCurrentCue] = useState(0);
  const [fontSize, setFontSize] = useState(32);
  const [scrollSpeed, setScrollSpeed] = useState(60); // px/s
  const [isScrolling, setIsScrolling] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [mirror, setMirror] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout>>();

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

  // Flatten cues
  const flatCues: FlatCue[] = [];
  if (doc?.data?.sections) {
    let idx = 0;
    for (const section of doc.data.sections as Section[]) {
      for (const row of section.rows) {
        flatCues.push({ sectionLabel: section.label, row, index: idx++ });
      }
    }
  }

  // Socket.IO: listen for cue:update from OnAir page
  useEffect(() => {
    if (!id) return;
    const socket = getQsheetSocket(id);

    socket.on('cue:update', (data: { currentCue: number }) => {
      setCurrentCue(data.currentCue);
      // Jump scroll to top for new cue
      if (textRef.current) {
        scrollRef.current = 0;
        textRef.current.scrollTop = 0;
      }
    });
    socket.on('cue:next', () => {
      setCurrentCue(prev => prev + 1);
      if (textRef.current) {
        scrollRef.current = 0;
        textRef.current.scrollTop = 0;
      }
    });
    socket.on('cue:prev', () => {
      setCurrentCue(prev => Math.max(0, prev - 1));
      if (textRef.current) {
        scrollRef.current = 0;
        textRef.current.scrollTop = 0;
      }
    });
    socket.on('cue:jump', (data: { cueIndex: number }) => {
      setCurrentCue(data.cueIndex);
      if (textRef.current) {
        scrollRef.current = 0;
        textRef.current.scrollTop = 0;
      }
    });

    return () => { disconnectQsheetSocket(); };
  }, [id]);

  // Auto-scroll animation
  useEffect(() => {
    if (!isScrolling || !textRef.current) return;

    const animate = (time: number) => {
      if (!textRef.current) return;
      if (lastTimeRef.current) {
        const delta = (time - lastTimeRef.current) / 1000;
        scrollRef.current += scrollSpeed * delta;
        textRef.current.scrollTop = scrollRef.current;
      }
      lastTimeRef.current = time;
      rafRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isScrolling, scrollSpeed]);

  // Auto-hide controls
  const resetControlsTimer = () => {
    setShowControls(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    resetControlsTimer();
    return () => clearTimeout(controlsTimerRef.current);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      resetControlsTimer();
      if (e.key === ' ') { e.preventDefault(); setIsScrolling(p => !p); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setFontSize(p => Math.min(p + 4, 80)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setFontSize(p => Math.max(p - 4, 16)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setScrollSpeed(p => Math.min(p + 10, 200)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setScrollSpeed(p => Math.max(p - 10, 10)); }
      if (e.key === 'Escape') navigate(`/qsheet/editor/${id}`);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [id, navigate]);

  if (isLoading || !doc) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
      </div>
    );
  }

  const current = flatCues[currentCue];
  const blocks = doc.data.blocks || [];
  const scenarioText = current ? getScenarioText(current.row, blocks) : '';

  return (
    <div
      className="flex flex-col h-screen bg-black text-white overflow-hidden"
      onMouseMove={resetControlsTimer}
      onClick={() => setIsScrolling(p => !p)}
    >
      {/* Controls overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-white/60 hover:text-white hover:bg-white/10 h-8 w-8"
            onClick={() => navigate(`/qsheet/editor/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-white/60 truncate max-w-xs">{doc.title}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Font size */}
          <div className="flex items-center gap-1">
            <button
              className="text-white/50 hover:text-white p-1"
              onClick={() => setFontSize(p => Math.max(p - 4, 16))}
            >
              <span className="text-xs">A-</span>
            </button>
            <span className="text-xs text-white/50 w-8 text-center">{fontSize}px</span>
            <button
              className="text-white/50 hover:text-white p-1"
              onClick={() => setFontSize(p => Math.min(p + 4, 80))}
            >
              <span className="text-sm font-bold">A+</span>
            </button>
          </div>

          {/* Scroll speed */}
          <div className="flex items-center gap-1">
            <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            <input
              type="range" min={10} max={200} step={10}
              value={scrollSpeed}
              onChange={e => setScrollSpeed(Number(e.target.value))}
              className="w-20 accent-white"
            />
            <ChevronUp className="h-3.5 w-3.5 text-white/40" />
          </div>

          {/* Mirror */}
          <button
            className={`text-xs px-2 py-1 rounded border transition ${mirror ? 'border-white/40 text-white' : 'border-white/20 text-white/40'}`}
            onClick={() => setMirror(p => !p)}
          >
            <Settings2 className="h-3 w-3 inline mr-1" />鏡像
          </button>

          {/* Cue info */}
          <span className="text-xs text-white/40">
            {currentCue + 1} / {flatCues.length}
          </span>
        </div>
      </div>

      {/* Section label */}
      {current && showControls && (
        <div
          className="absolute top-12 left-0 right-0 z-10 text-center transition-opacity duration-500"
          onClick={e => e.stopPropagation()}
        >
          <span className="inline-block text-xs text-white/30 bg-white/5 px-3 py-1 rounded-full">
            {current.sectionLabel}
          </span>
        </div>
      )}

      {/* Teleprompter text */}
      <div
        ref={textRef}
        className="flex-1 overflow-hidden relative"
        style={{
          transform: mirror ? 'scaleX(-1)' : undefined,
        }}
      >
        {/* Gradient overlays */}
        <div
          className="absolute top-0 left-0 right-0 h-24 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, black, transparent)' }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-24 z-10 pointer-events-none"
          style={{ background: 'linear-gradient(to top, black, transparent)' }}
        />

        {/* Center line indicator */}
        <div
          className="absolute left-0 right-0 z-10 pointer-events-none"
          style={{
            top: '50%',
            height: '2px',
            background: 'linear-gradient(to right, transparent, rgba(255,100,100,0.3), transparent)',
          }}
        />

        <div
          className="px-8 md:px-16 lg:px-32 py-[50vh] leading-relaxed whitespace-pre-wrap"
          style={{
            fontSize: `${fontSize}px`,
            lineHeight: 1.5,
            fontFamily: '"Noto Sans JP", sans-serif',
            color: 'rgba(255,255,255,0.95)',
          }}
        >
          {scenarioText || (
            <span className="text-white/20">（台本なし）</span>
          )}
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center pb-4 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 text-xs text-white/40">
          <span>クリック / スペース: {isScrolling ? 'スクロール停止' : 'スクロール開始'}</span>
          <span>↑↓: フォントサイズ</span>
          <span>←→: スクロール速度</span>
          <span>ESC: 終了</span>
        </div>
      </div>

      {/* Play indicator */}
      <div
        className={`absolute bottom-12 right-6 z-20 transition-opacity duration-300 ${
          isScrolling ? 'opacity-40' : 'opacity-0'
        }`}
      >
        <div className="flex gap-1">
          <div className="w-1 h-4 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-4 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
          <div className="w-1 h-4 bg-green-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
        </div>
      </div>
    </div>
  );
}
