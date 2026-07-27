import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { getQsheetSocket, disconnectQsheetSocket } from "@/lib/socket";
import { parseDur, fmtAbs } from "@/lib/time";
import { notifySuccess, notifyError } from "@/lib/notify";
import LiveRoleSwitch from "@/components/LiveRoleSwitch";
import {
  ChevronLeft,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Minus,
  Plus,
  Loader2,
} from "lucide-react";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

// ============================================================
// Types
// ============================================================
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
  _break?: boolean;
  _pageBreak?: boolean;
  _vtr?: boolean;
  duration?: string;
}

interface FlatCue {
  type: "cue" | "cm" | "vtr";
  label: string;
  duration: number;
  start: number;
  oa: number;
  row?: CueRow;
}

// ============================================================
// Helpers
// ============================================================
const safe = (n: number) => (isNaN(n) || !isFinite(n)) ? 0 : Math.floor(n);

const mm = (s: number): string => {
  const v = safe(s);
  const a = Math.abs(v);
  const m = Math.floor(a / 60);
  return `${v < 0 ? "-" : ""}${String(m).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
};

const hms = (s: number): string => {
  const sign = s < 0 ? "-" : "";
  return `${sign}${fmtAbs(Math.abs(s))}`;
};

const oaFmt = (s: number): string => fmtAbs(s);

function buildCues(data: { sections?: Section[]; meta?: { broadcastStartTime?: string } }): FlatCue[] {
  if (!data?.sections) return [];
  const cues: FlatCue[] = [];
  const bst = data.meta?.broadcastStartTime || "19:00";
  const bp = bst.split(":");
  const base = (+bp[0] || 19) * 3600 + (+bp[1] || 0) * 60;
  let acc = 0;

  for (const s of data.sections) {
    if ((s as Section & { _pageBreak?: boolean })._pageBreak) continue;
    if ((s as Section)._break) {
      const d = parseDur((s as Section).duration);
      cues.push({ type: "cm", label: s.label || "CM", duration: d, start: acc, oa: base + acc });
      acc += d;
    } else if ((s as Section)._vtr) {
      const d = parseDur((s as Section).duration);
      cues.push({ type: "vtr", label: s.label || "VTR", duration: d, start: acc, oa: base + acc });
      acc += d;
    } else {
      // ロール全体の尺設定がありつつ行の尺合計が 0 なら、ロール自体を 1 キューとして扱う
      const rowSum = s.rows.reduce((a, r) => a + parseDur(r.duration), 0);
      const secDur = parseDur((s as Section & { duration?: string }).duration);
      if (rowSum === 0 && secDur > 0) {
        cues.push({ type: "cue", label: s.label || "", duration: secDur, start: acc, oa: base + acc });
        acc += secDur;
        continue;
      }
      for (const row of s.rows) {
        const d = parseDur(row.duration);
        cues.push({ type: "cue", label: s.label || row.label || "", duration: d, start: acc, oa: base + acc, row });
        acc += d;
      }
    }
  }
  return cues;
}

// Number display component (Roboto Condensed)
function F({
  children,
  size,
  weight = 700,
  color = "#fff",
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  size: number;
  weight?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`tabular-nums ${className}`}
      style={{
        fontFamily: "'Roboto Condensed','Arial Narrow',sans-serif",
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ============================================================
// OnAirPage
// ============================================================
export default function OnAirPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // State — pre-show: cur=-1, running=false
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cur, setCur] = useState(-1);
  const [showEl, setShowEl] = useState(0);
  const [cueEl, setCueEl] = useState(0);
  const [offset, setOffset] = useState(0);
  const [clock, setClock] = useState(new Date());

  const showStart = useRef<number | null>(null);
  const cueStart = useRef<number | null>(null);
  const pauseAt = useRef<number | null>(null);
  const activeRef = useRef<HTMLDivElement | null>(null);

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

  // useMemo は必須 (見た目の都合ではない): これを毎レンダー作り直すと配列の
  // 同一性が毎回変わり、下の「CMの自動送り」effect の依存が毎回変わる。
  // 時計は 100ms ごとに動くので、**毎秒10回キュー全体を組み直して
  // effect を走らせていた**。番組が長いほど本番中に重くなる。
  const cues = useMemo(() => (doc?.data ? buildCues(doc.data) : []), [doc]);
  const total = useMemo(() => cues.reduce((s, c) => s + c.duration, 0), [cues]);

  // 100ms timer for smooth updates
  useEffect(() => {
    const iv = setInterval(() => {
      setClock(new Date());
      if (running && !paused) {
        const t = Date.now();
        if (showStart.current) setShowEl((t - showStart.current) / 1000 + offset);
        if (cueStart.current) setCueEl((t - cueStart.current) / 1000);
      }
    }, 100);
    return () => clearInterval(iv);
  }, [running, paused, offset]);

  // Auto-advance for CM cues
  useEffect(() => {
    if (!running || paused || cur < 0) return;
    const c = cues[cur];
    if (c?.type === "cm" && c.duration > 0 && cueEl >= c.duration && cur < cues.length - 1) {
      setCur((p) => p + 1);
      cueStart.current = Date.now();
      setCueEl(0);
    }
  }, [running, paused, cur, cueEl, cues]);

  // Scroll to current cue
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [cur]);

  // Controls
  const go = useCallback(() => {
    const t = Date.now();
    showStart.current = t;
    cueStart.current = t;
    setRunning(true);
    setPaused(false);
    setCur(0);
    setShowEl(0);
    setCueEl(0);
    setOffset(0);
  }, []);

  const next = useCallback(() => {
    if (cur < cues.length - 1) {
      setCur((p) => p + 1);
      cueStart.current = Date.now();
      setCueEl(0);
    } else {
      setRunning(false);
      setPaused(false);
    }
  }, [cur, cues.length]);

  const prev = useCallback(() => {
    if (cur > 0) {
      setCur((p) => p - 1);
      cueStart.current = Date.now();
      setCueEl(0);
    }
  }, [cur]);

  const tog = useCallback(() => {
    if (paused) {
      const d = Date.now() - (pauseAt.current || Date.now());
      if (showStart.current) showStart.current += d;
      if (cueStart.current) cueStart.current += d;
      setPaused(false);
    } else {
      pauseAt.current = Date.now();
      setPaused(true);
    }
  }, [paused]);

  const stop = useCallback(() => {
    setRunning(false);
    setPaused(false);
    setCur(-1);
    setShowEl(0);
    setCueEl(0);
    setOffset(0);
    showStart.current = null;
    cueStart.current = null;
  }, []);

  // 本番中の誤操作防止: 計時が走行中の停止/リセットは確認する。
  // (走行していないときは確認なしで停止・戻る)
  const confirmStop = useCallback(async () => {
    if (running && !(await confirmAction({ title: "計時を停止して番組をリセットします。よろしいですか？", confirmLabel: 'リセットする', tone: 'danger' }))) return false;
    stop();
    return true;
  }, [running, stop]);

  // Keyboard shortcuts
  useEffect(() => {
    // 確認ダイアログを待つ必要があるので async。
    // (同期のままだと `if (confirmStop() && id)` が Promise を truthy と見て
    //  **「やめる」を押しても画面を離れてしまう** — 本番中に起きたら事故になる)
    const h = async (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          !running ? go() : next();
          break;
        case "ArrowRight":
          e.preventDefault();
          running && next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          running && prev();
          break;
        case "KeyP":
          e.preventDefault();
          running && tog();
          break;
        case "Escape":
          e.preventDefault();
          if ((await confirmStop()) && id) navigate(`/qsheet/editor/${id}`);
          break;
        case "ArrowUp":
          e.preventDefault();
          setOffset((p) => p + 60);
          break;
        case "ArrowDown":
          e.preventDefault();
          setOffset((p) => p - 60);
          break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [running, go, next, prev, tog, stop, confirmStop, id, navigate]);

  // 放送モードはダークテーマ強制 (DADS の .dark トークンに統一)
  useEffect(() => {
    const html = document.documentElement;
    const wasAlreadyDark = html.classList.contains("dark");
    if (!wasAlreadyDark) html.classList.add("dark");
    return () => {
      if (!wasAlreadyDark) html.classList.remove("dark");
    };
  }, []);

  // ── ランダウンからの遠隔操作 (Socket.IO) ───────────────────────────
  //
  // **この effect は id が変わるまで作り直さない。** v2.9.288 まで
  // 依存に running / go / next / prev / tog / stop が入っていたため、
  // 本番中に次が起きていた:
  //   ・再生・一時停止・キューを送るたびに接続を切って張り直す
  //     → そのたびに「放送同期が切断されました」が画面に出る
  //   ・受け口 (cue:next 等) を off せずに毎回 on していたので受け口が積み上がり、
  //     **ディレクターが「次へ」を1回押すとキューが複数進む**
  //
  // 押した回数と進む数が合わないのは本番では致命的なので、
  // 受け口は id につき1組だけ張り、中身は ref で最新の関数を呼ぶ形にした
  // (最新の状態を見たいだけで、受け口を作り直す必要は無い)。
  const socketRef = useRef<ReturnType<typeof getQsheetSocket> | null>(null);
  const wasConnectedRef = useRef(false);
  const closingRef = useRef(false);

  // 受け口が呼ぶ「いまの」操作。毎レンダーで最新に差し替える (再接続はしない)
  const opsRef = useRef({ go, next, prev, tog, stop, running });
  opsRef.current = { go, next, prev, tog, stop, running };

  useEffect(() => {
    if (!id) return;
    closingRef.current = false;
    const socket = getQsheetSocket(id);
    socketRef.current = socket;

    const onConnect = () => {
      if (wasConnectedRef.current) notifySuccess("放送同期に再接続しました");
      wasConnectedRef.current = true;
    };
    // 自分で閉じたときは知らせない (「切れた」ではないので、出すと嘘になる)
    const onDisconnect = () => {
      if (closingRef.current) return;
      notifyError("放送同期が切断されました", { description: "ネットワーク接続を確認してください。" });
    };
    const onNext = () => opsRef.current.next();
    const onPrev = () => opsRef.current.prev();
    const onJump = (data: { cueIndex: number }) => {
      setCur(data.cueIndex);
      cueStart.current = Date.now();
      setCueEl(0);
    };
    const onPlay = () => { if (!opsRef.current.running) opsRef.current.go(); };
    const onPause = () => opsRef.current.tog();
    const onReset = () => opsRef.current.stop();

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("cue:next", onNext);
    socket.on("cue:prev", onPrev);
    socket.on("cue:jump", onJump);
    socket.on("cue:play", onPlay);
    socket.on("cue:pause", onPause);
    socket.on("cue:reset", onReset);

    return () => {
      closingRef.current = true;
      // 張った受け口は**全部**外す (1つでも残すと、次に開いたとき二重に進む)
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("cue:next", onNext);
      socket.off("cue:prev", onPrev);
      socket.off("cue:jump", onJump);
      socket.off("cue:play", onPlay);
      socket.off("cue:pause", onPause);
      socket.off("cue:reset", onReset);
      disconnectQsheetSocket(id);
      socketRef.current = null;
      wasConnectedRef.current = false;
    };
  }, [id]);

  // ── ランダウンへ「いまどこか」を送る ──────────────────────────────
  //
  // 経過秒 (showEl) は 100ms ごとに変わるので、そのまま依存に入れると
  // **毎秒10回送っていた** (受ける側も毎秒10回描き直す)。
  // ランダウンに要るのは「いまのキュー・走っているか・だいたいの経過」なので、
  // キュー/再生状態が変わったときは即座に送り、経過だけの変化は 1 秒に 1 回に落とす。
  const lastSentRef = useRef({ at: 0, cur: -2, playing: false });
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const playing = running && !paused;
    const last = lastSentRef.current;
    const changed = last.cur !== cur || last.playing !== playing;
    if (!changed && Date.now() - last.at < 1000) return;
    lastSentRef.current = { at: Date.now(), cur, playing };
    socket.emit("cue:update", { currentCue: cur, elapsed: showEl, isPlaying: playing });
  }, [cur, showEl, running, paused]);

  // Derived values
  const ov = cur >= 0 ? showEl - cues.slice(0, cur + 1).reduce((s, c) => s + c.duration, 0) : 0;
  const cc = cur >= 0 ? cues[cur] : null;
  const nc = cur + 1 < cues.length ? cues[cur + 1] : null;
  const cDur = cc?.duration || 0;
  const cRem = cDur - cueEl;
  const prog = cDur > 0 ? Math.min(cueEl / cDur, 1) : 0;
  const clk = clock.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  // ============================================================
  // Render
  // ============================================================
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
      </div>
    );
  }

  if (!doc || cues.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background text-foreground gap-4">
        <p className="text-base font-bold">このQシートにはまだキューがありません</p>
        <p className="text-sm text-muted-foreground">台本でロールと尺を入れると、ここで計時できます。</p>
        <button
          onClick={() => navigate(`/qsheet/editor/${id}`)}
          className="px-4 py-2 border border-border rounded text-sm hover:bg-accent"
        >
          エディターに戻る
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden select-none">
      {/* ===== HEADER ===== */}
      <header className="flex-none h-10 flex items-center justify-between px-5 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/qsheet/editor/${id}`)} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft size={18} />
          </button>
          <span className="text-base font-bold text-foreground">{doc.data?.meta?.title || doc.title}</span>
          {running && !paused && (
            <span className="ml-2 text-sm font-black tracking-[0.2em] text-red-500 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
              ON AIR
            </span>
          )}
          {paused && <span className="ml-2 text-sm font-black tracking-wider text-warning">PAUSE</span>}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm font-bold text-muted-foreground hidden lg:flex gap-6">
            <span>SPACE 次へ</span>
            <span>P 一時停止</span>
            <span>↑↓ ±1分</span>
            <span>ESC 終了</span>
          </div>
          {/* 本番の役割切替 (§4.13) — 別のURLを教え直さずここから移れる */}
          {id && <LiveRoleSwitch docId={id} current="onair" />}
        </div>
      </header>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* ===== LEFT: RUNDOWN LIST ===== */}
        <div className="w-full md:w-[500px] h-[40vh] md:h-auto flex-shrink-0 flex flex-col bg-background border-b-2 md:border-b-0 md:border-r-2 border-border">
          {/* Column headers */}
          <div className="flex-none flex items-center h-10 px-2 bg-muted border-b-2 border-border">
            <div className="w-[120px] text-center text-sm font-black text-foreground tracking-[0.15em]" style={{ fontFamily: "'Roboto Condensed',sans-serif" }}>TIME</div>
            <div className="flex-1 text-sm font-black text-foreground tracking-[0.15em]" style={{ fontFamily: "'Roboto Condensed',sans-serif" }}>CUE</div>
            <div className="w-[90px] text-right pr-4 text-sm font-black text-foreground tracking-[0.15em]" style={{ fontFamily: "'Roboto Condensed',sans-serif" }}>DUR</div>
          </div>

          {/* Cue list */}
          <div className="flex-1 overflow-y-auto">
            {cues.map((c, i) => {
              const isCur = i === cur;
              const isNxt = i === cur + 1;
              const past = i < cur;
              const cm = c.type === "cm";
              return (
                <div
                  key={i}
                  ref={isCur ? activeRef : null}
                  onClick={() => {
                    if (running) {
                      setCur(i);
                      cueStart.current = Date.now();
                      setCueEl(0);
                    }
                  }}
                  className={`relative flex items-center cursor-pointer transition-all border-b-2 ${
                    isCur
                      ? "bg-destructive/20 border-destructive/40"
                      : isNxt
                      ? "bg-info/20 border-info/40"
                      : past
                      ? "opacity-20 border-border/40"
                      : "border-border/40 hover:bg-card"
                  }`}
                >
                  {isCur && <div className="absolute left-0 top-0 bottom-0 w-1 bg-destructive" />}
                  {isNxt && <div className="absolute left-0 top-0 bottom-0 w-1 bg-info" />}

                  <div className="w-[120px] flex-shrink-0 text-center py-4">
                    <F size={isCur ? 28 : 24} weight={700} color={isCur ? "#fff" : past ? "#333" : "#999"}>
                      {oaFmt(c.oa)}
                    </F>
                  </div>

                  <div className="flex-1 py-4 min-w-0">
                    <div className="flex items-center gap-3">
                      {isCur && (
                        <span className="text-sm font-black px-3 py-1 rounded bg-destructive text-destructive-foreground tracking-wider animate-[pulse_1.5s_infinite] flex-shrink-0">
                          現在
                        </span>
                      )}
                      {isNxt && (
                        <span className="text-sm font-black px-3 py-1 rounded bg-primary text-primary-foreground tracking-wider flex-shrink-0">
                          NEXT
                        </span>
                      )}
                      <span className={`text-xl font-black truncate ${cm ? "text-warning" : isCur ? "text-foreground" : "text-foreground"}`}>
                        {c.label}
                      </span>
                    </div>
                  </div>

                  <div className="w-[90px] flex-shrink-0 text-right pr-4 py-4">
                    <F size={isCur ? 28 : 24} weight={700} color={isCur ? "#fff" : cm ? "#fbbf24" : "#777"}>
                      {mm(c.duration)}
                    </F>
                  </div>

                  {/* Progress bar on current cue */}
                  {isCur && cDur > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-muted">
                      <div
                        className={`h-full ${prog >= 1 ? "bg-destructive" : "bg-success"}`}
                        style={{ width: `${prog * 100}%`, transition: "width 0.1s linear" }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex-none h-10 flex items-center justify-between px-4 bg-muted border-t-2 border-border">
            <span className="text-sm font-bold text-foreground">{cues.length} CUE</span>
            <F size={18} weight={700} color="#ddd">
              合計 {mm(total)}
            </F>
          </div>
        </div>

        {/* ===== RIGHT: MAIN DISPLAY ===== */}
        <div className="flex-1 flex flex-col">
          {/* Clock */}
          <div className="flex-none h-16 flex items-center justify-center bg-background border-b-2 border-border">
            <F size={32} weight={400} color="#ddd" style={{ letterSpacing: "0.1em" }}>
              {clk}
            </F>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 gap-3 sm:gap-6 overflow-y-auto">
            {/* ===== PRE-SHOW ===== */}
            {!running && cur === -1 && (
              <div className="text-center">
                <div className="text-2xl font-black text-foreground mb-2">{doc.data?.meta?.title || doc.title}</div>
                <div className="text-lg font-bold text-muted-foreground mb-10">
                  {cues.length} CUE · {mm(total)}
                </div>
                <button
                  onClick={go}
                  className="px-14 py-5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-2xl font-black rounded-xl transition-all active:scale-95"
                  style={{ boxShadow: "0 0 60px rgba(220,38,38,0.5)" }}
                >
                  <span className="flex items-center gap-3">
                    <Play size={28} />
                    ON AIR
                  </span>
                </button>
              </div>
            )}

            {/* ===== RUNNING ===== */}
            {running && (
              <>
                {/* Program elapsed */}
                <div className="text-center">
                  <div className="text-lg font-black text-foreground tracking-[0.3em] mb-2">番組経過</div>
                  <F size={60} weight={700} color="#fff" style={{ lineHeight: 1 }}>
                    {hms(showEl)}
                  </F>
                </div>

                {/* Current cue card */}
                {cc && (
                  <div className="w-full max-w-3xl rounded-lg overflow-hidden bg-card border-2 border-border">
                    {/* Card header */}
                    <div className="flex items-center justify-between px-6 py-3 bg-destructive/15 border-b-2 border-border">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-black px-3 py-1 rounded bg-destructive text-destructive-foreground tracking-wider animate-[pulse_1.5s_infinite]">
                          現在
                        </span>
                        <span className="text-2xl font-black text-foreground">{cc.label}</span>
                      </div>
                      <F size={20} weight={700} color="#ddd">
                        {oaFmt(cc.oa)}
                      </F>
                    </div>

                    {/* 3-column timing */}
                    <div className="grid grid-cols-3">
                      <div className="py-3 sm:py-6 text-center border-r-2 border-border">
                        <div className="text-xs sm:text-base font-black text-foreground tracking-[0.2em] mb-1 sm:mb-3">経過</div>
                        <F size={36} weight={700} color="#34d399">
                          {mm(cueEl)}
                        </F>
                      </div>
                      <div className="py-3 sm:py-6 text-center border-r-2 border-border">
                        <div className="text-xs sm:text-base font-black text-foreground tracking-[0.2em] mb-1 sm:mb-3">残り</div>
                        <F
                          size={36}
                          weight={700}
                          color={cRem < 0 ? "#f87171" : cRem < 30 ? "#fbbf24" : "#e5e5e5"}
                          style={cRem < 0 ? { animation: "pulse 1s infinite" } : {}}
                        >
                          {mm(cRem)}
                        </F>
                      </div>
                      <div className="py-3 sm:py-6 text-center">
                        <div className="text-xs sm:text-base font-black text-foreground tracking-[0.2em] mb-1 sm:mb-3">予定尺</div>
                        <F size={36} weight={700} color="#bbb">
                          {mm(cDur)}
                        </F>
                      </div>
                    </div>

                    {/* Cue progress bar */}
                    <div className="h-1.5 bg-muted">
                      <div
                        className={`h-full ${prog >= 1 ? "bg-destructive" : prog > 0.8 ? "bg-warning" : "bg-success"}`}
                        style={{ width: `${Math.min(prog * 100, 100)}%`, transition: "width 0.1s linear" }}
                      />
                    </div>
                  </div>
                )}

                {/* Push/Pull + Next */}
                <div className="w-full max-w-3xl flex gap-2 sm:gap-4">
                  <div className="flex-1 rounded-lg p-3 sm:p-5 text-center bg-card border-2 border-border">
                    <div className="text-xs sm:text-base font-black text-foreground tracking-[0.2em] mb-1 sm:mb-2">押し / 巻き</div>
                    <F size={32} weight={700} color={ov > 30 ? "#f87171" : ov < -30 ? "#34d399" : "#777"}>
                      {ov > 0 ? "+" : ""}
                      {mm(ov)}
                    </F>
                  </div>
                  {nc && (
                    <div className="flex-1 rounded-lg p-3 sm:p-5 bg-info/15 border-2 border-info/40">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-black px-2.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider">NEXT</span>
                        <F size={16} weight={700} color="#ccc">
                          {oaFmt(nc.oa)}
                        </F>
                      </div>
                      <div className={`text-xl font-black ${nc.type === "cm" ? "text-warning" : "text-foreground"}`}>{nc.label}</div>
                      <F size={18} weight={700} color="#ccc" className="mt-1 block">
                        {mm(nc.duration)}
                      </F>
                    </div>
                  )}
                </div>

                {/* Transport controls */}
                <div className="flex items-center gap-3">
                  <button onClick={prev} title="前のキューへ" aria-label="前のキューへ" className="p-3 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold transition-all active:scale-90">
                    <SkipBack size={22} />
                  </button>
                  <button
                    onClick={tog}
                    title={paused ? "計時を再開" : "計時を一時停止"}
                    aria-label={paused ? "計時を再開" : "計時を一時停止"}
                    className={`p-4 rounded-lg transition-all active:scale-90 text-foreground font-bold ${paused ? "bg-success hover:bg-success/90" : "bg-warning hover:bg-warning/90"}`}
                  >
                    {paused ? <Play size={26} /> : <Pause size={26} />}
                  </button>
                  <button
                    onClick={next}
                    title="次のキューへ"
                    aria-label="次のキューへ"
                    className="p-4 rounded-lg bg-destructive hover:bg-destructive/90 text-foreground font-bold transition-all active:scale-90"
                    style={{ boxShadow: "0 0 30px rgba(220,38,38,0.4)" }}
                  >
                    <SkipForward size={26} />
                  </button>
                  <button onClick={confirmStop} title="停止してリセット" aria-label="停止してリセット" className="p-3 rounded-lg bg-muted hover:bg-muted/80 text-foreground font-bold transition-all active:scale-90">
                    <Square size={22} />
                  </button>
                  <div className="w-px h-8 bg-muted/80 mx-2" />
                  <button
                    onClick={() => setOffset((p) => p - 60)}
                    title="番組の想定尺を1分短くする"
                    aria-label="番組の想定尺を1分短くする"
                    className="min-w-11 min-h-11 flex items-center justify-center rounded bg-muted hover:bg-muted/80 text-foreground font-bold transition-all active:scale-90"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="text-sm font-black text-muted-foreground w-8 text-center">±1m</span>
                  <button
                    onClick={() => setOffset((p) => p + 60)}
                    title="番組の想定尺を1分長くする"
                    aria-label="番組の想定尺を1分長くする"
                    className="min-w-11 min-h-11 flex items-center justify-center rounded bg-muted hover:bg-muted/80 text-foreground font-bold transition-all active:scale-90"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Program progress bar */}
                <div className="w-full max-w-3xl h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full"
                    style={{ width: `${Math.min((showEl / total) * 100, 100)}%`, transition: "width 0.1s linear" }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
