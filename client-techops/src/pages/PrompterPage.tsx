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
  const lastSyncCueRef = useRef<number>(-1);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["qsheet-document", id],
    queryFn: async () => {
      const res = await api.get(`/techops/documents/${id}`);
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

  // Force dark mode (放送モード)
  useEffect(() => {
    const html = document.documentElement;
    const wasAlreadyDark = html.classList.contains("dark");
    if (!wasAlreadyDark) html.classList.add("dark");
    return () => {
      if (!wasAlreadyDark) html.classList.remove("dark");
    };
  }, []);

  // Socket.IO: OnAir の進行に追随する。OnAir が送る cue:update はサーバーが
  // cue:sync に載せ替えて中継する (server/src/contexts/qsheet/socket.ts) ため、
  // クライアント側で受けるイベント名は cue:sync。
  useEffect(() => {
    if (!id) return;
    const socket = getQsheetSocket(id);

    socket.on('cue:sync', (data: { currentCue: number }) => {
      if (typeof data?.currentCue !== 'number') return;
      // cue:sync は経過秒の更新でも毎秒届くので、cue が変わったときだけ頭出しする
      if (lastSyncCueRef.current === data.currentCue) return;
      lastSyncCueRef.current = data.currentCue;
      // OnAir 停止中は currentCue = -1。プロンプターは先頭 cue に留める
      setCurrentCue(Math.max(0, data.currentCue));
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
      if (e.key === 'Escape') navigate(`/techops/editor/${id}`);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [id, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-border border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  // 取得に失敗した（存在しない・権限が無い）ときは、進行・ランダウンと同じく
  // 脱出できる形にする。error を見ないと「読み込み中の輪」のまま手詰まりになる
  if (error || !doc) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p className="text-muted-foreground">台本が見つかりません</p>
        <Button variant="outline" size="lg" onClick={() => navigate(`/techops/editor/${id}`)}>
          エディターに戻る
        </Button>
      </div>
    );
  }

  const current = flatCues[currentCue];
  const blocks = doc.data.blocks || [];
  const scenarioText = current ? getScenarioText(current.row, blocks) : '';

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
      onMouseMove={resetControlsTimer}
      onClick={() => setIsScrolling(p => !p)}
    >
      {/* Controls overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 transition-opacity duration-500 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 狭い画面では「戻る＋題名」と操作群を2段に折る。`w-full` を使うのは、
            `flex-1`（flex-basis 0）だと折り返しの計算で幅0と数えられ、
            操作群が同じ行に押し込まれて画面外へ出るため */}
        <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1">
          <Button
            variant="ghost"
            size="icon"
            className="min-h-tap min-w-tap shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent lg:h-8 lg:w-8 lg:min-h-0 lg:min-w-0"
            aria-label="エディターに戻る"
            onClick={() => navigate(`/techops/editor/${id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground lg:max-w-xs lg:flex-none">{doc.title}</span>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-x-3 gap-y-1 lg:w-auto">
          {/* Font size */}
          <div className="flex items-center gap-1">
            <button
              className="inline-flex min-h-tap min-w-tap items-center justify-center text-muted-foreground hover:text-foreground lg:h-9 lg:w-9 lg:min-h-0 lg:min-w-0"
              aria-label="文字を小さく"
              onClick={() => setFontSize(p => Math.max(p - 4, 16))}
            >
              <span className="text-xs">A-</span>
            </button>
            <span className="text-xs text-muted-foreground w-8 text-center">{fontSize}px</span>
            <button
              className="inline-flex min-h-tap min-w-tap items-center justify-center text-muted-foreground hover:text-foreground lg:h-9 lg:w-9 lg:min-h-0 lg:min-w-0"
              aria-label="文字を大きく"
              onClick={() => setFontSize(p => Math.min(p + 4, 80))}
            >
              <span className="text-sm font-bold">A+</span>
            </button>
          </div>

          {/* Scroll speed */}
          <div className="flex items-center gap-1">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/80" />
            <input
              type="range" min={10} max={200} step={10}
              value={scrollSpeed}
              onChange={e => setScrollSpeed(Number(e.target.value))}
              className="w-20 accent-white"
            />
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/80" />
          </div>

          {/* Mirror */}
          <button
            className={`inline-flex min-h-tap items-center justify-center rounded border px-2 text-xs transition lg:min-h-0 lg:py-1 ${mirror ? 'border-foreground/60 text-foreground' : 'border-border text-muted-foreground'}`}
            onClick={() => setMirror(p => !p)}
          >
            <Settings2 className="h-3 w-3 inline mr-1" />鏡像
          </button>

          {/* Cue info */}
          <span className="text-xs text-muted-foreground/80">
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
          <span className="inline-block text-xs text-muted-foreground/60 bg-muted/30 px-3 py-1 rounded-full">
            {current.sectionLabel}
          </span>
        </div>
      )}

      {/* Teleprompter text */}
      <div
        ref={textRef}
        // 台本は画面より高いのが仕様。送るのは自動スクロール（`scrollTop` を
        // 毎フレーム進める）で、スクロールバーは出さない。検査には
        // 「切ると決めた箱」だと伝える
        data-clip-ok
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
            <span className="text-muted-foreground/40">（台本なし）</span>
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
        {/* キーボードの説明。タッチ端末では意味が無く、狭い画面では3列が潰れて台本に重なる */}
        <div className="hidden lg:flex items-center gap-4 text-xs text-muted-foreground/80">
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
