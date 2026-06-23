import { useMemo, useEffect, useRef, useState, useCallback, Component, type ReactNode, type ErrorInfo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAwardsCue } from '@/hooks/useAwardsCue';
import { cn } from '@/lib/utils';
import { ChevronLeft, ExternalLink, Tv, Radio, Subtitles, Send, X, Maximize2, Minimize2, Vote, HelpCircle } from 'lucide-react';
import type { CgStep, OneshotStyle, CgCategory, CgCueState, AwardPattern, CgSurvey } from '@/cg/types';
import CGFrame from '@/cg/CGFrame';

// CG プレビューが mount/update でクラッシュしても operator UI 全体は維持する。
class CGErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error, info: ErrorInfo) { console.error('[CG ErrorBoundary]', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', flexDirection: 'column', gap: 8, color: '#f5a76e', background: 'rgba(80,30,15,0.4)', padding: 16, fontSize: 11, textAlign: 'center' }}>
          <div style={{ fontWeight: 900 }}>CG プレビュー エラー</div>
          <div style={{ opacity: 0.85 }}>{this.state.err.message}</div>
          <button onClick={() => this.setState({ err: null })} className="mt-2 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-200">再試行</button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { CG_W, CG_H } from '@/cg/types';
import { useFullscreen } from '@/hooks/useFullscreen';

type PreviewLang = 'ja' | 'en' | 'both';

interface AwardsEventDetail {
  id: number; name: string; subtitle: string | null; categories: CgCategory[];
  surveys?: CgSurvey[];
}
interface AwardGroup { name: string; divisions: CgCategory[] }

function groupByAward(cats: CgCategory[]): AwardGroup[] {
  const map = new Map<string, CgCategory[]>();
  const order: string[] = [];
  for (const c of cats) {
    if (!map.has(c.name)) { map.set(c.name, []); order.push(c.name); }
    map.get(c.name)!.push(c);
  }
  return order.map((name) => ({ name, divisions: map.get(name)! }));
}

type StepDef = { step: CgStep; label: string; desc: string; color: 'neutral' | 'live' | 'award' };

// パターン別ステップシーケンス
const STEPS_DIRECT: StepDef[] = [
  { step: 'idle',        label: 'IDLE',       desc: '透過',                    color: 'neutral' },
  { step: 'title',       label: 'TITLE',      desc: 'タイトルカード',          color: 'neutral' },
  { step: 'nominees',    label: 'NOMINEES',   desc: 'ノミネート一覧',          color: 'live'    },
  { step: 'ranks52',     label: 'RANKS 5→2',  desc: '5位→2位発表 (ランキングバー)', color: 'live' },
  { step: 'winner-bar',  label: 'WINNER BAR', desc: '1位ランキングバー (大賞引き)', color: 'award' },
  { step: 'oneshot',     label: 'ONE SHOT',   desc: '大賞フルスクリーン',      color: 'award'   },
  { step: 'celebration', label: 'CELEB',      desc: '全部門 No.1 + 紙吹雪',    color: 'award'   },
];
const STEPS_VOTE: StepDef[] = [
  { step: 'idle',         label: 'IDLE',       desc: '透過',                    color: 'neutral' },
  { step: 'title',        label: 'TITLE',      desc: 'タイトルカード',          color: 'neutral' },
  { step: 'nominees',     label: 'NOMINEES',   desc: 'ノミネート一覧',          color: 'live'    },
  { step: 'top3',         label: 'BEST 3',     desc: 'TOP3 発表',               color: 'live'    },
  { step: 'final-pitch',  label: 'PITCH',      desc: 'ファイナルピッチ (3名→1名)', color: 'live' },
  { step: 'celebration',  label: 'CELEB',      desc: '全部門 No.1 + 紙吹雪',    color: 'award'   },
];
// v2.9.63: 連動アンケートを持つ部門でだけ末尾に追加する「アンケート No.1 発表」ステップ
const SURVEY_STEP: StepDef = { step: 'survey-oneshot', label: 'SURVEY No.1', desc: 'アンケートNo.1発表', color: 'award' };
const ONESHOT_STYLES: { style: OneshotStyle; label: string }[] = [
  { style: 'classic',   label: 'Classic'   },
  { style: 'shards',    label: 'Shards'    },
  { style: 'spotlight', label: 'Spotlight' },
  { style: 'slit',      label: 'Slit'      },
];
const LIVE_STEPS: CgStep[] = ['nominees', 'ranks52', 'top3', 'final-pitch', 'winner-bar', 'oneshot', 'celebration', 'survey-oneshot'];

export default function ControlPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: event } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });

  const { cue, sendCue, sendNextCue } = useAwardsCue(eventId);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const awardGroups = useMemo(() => groupByAward(event?.categories ?? []), [event]);
  // v2.9.124: アンケート票数確定をリロード無しで反映するため、surveys は event 本体
  // (60s staleTime・refetch なし) ではなく軽量エンドポイントを 3s ごとにポーリング。
  const { data: polledSurveys } = useQuery({
    queryKey: ['awards-surveys', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}/surveys`);
      return res.data.data as CgSurvey[];
    },
    refetchInterval: 3000,
    refetchOnMount: 'always',
  });
  const surveys = useMemo<CgSurvey[]>(
    () => polledSurveys ?? event?.surveys ?? [],
    [polledSurveys, event],
  );
  const liveCategory = event?.categories.find((c) => c.id === cue.categoryId) ?? null;
  const isLive = LIVE_STEPS.includes(cue.step);

  // ── NEXT (preview / 送出予約) state ──────────────────────
  const [nextStep, setNextStep] = useState<CgStep>('idle');
  const [nextCategoryId, setNextCategoryId] = useState<number | null>(null);
  const [nextStyle, setNextStyle] = useState<OneshotStyle>('classic');
  // 手動選択 No.1 (vote + アンケート未紐づけ時)。カテゴリ切替でリセット。
  const [nextWinnerId, setNextWinnerId] = useState<number | null>(null);
  useEffect(() => { setNextWinnerId(null); }, [nextCategoryId]);

  // ── NEXT category の演出パターンに応じてステップ一覧を切替
  const nextCategoryRaw = event?.categories.find((c) => c.id === nextCategoryId) ?? null;
  const pattern: AwardPattern = nextCategoryRaw?.award_pattern === 'vote' ? 'vote' : 'direct';
  // CELEB (全部門 No.1 + 紙吹雪) は「その賞 (award name) の最後の部門」にだけ出す
  const isLastDivisionOfAward = useMemo(() => {
    if (!nextCategoryRaw) return false;
    const group = awardGroups.find((g) => g.name === nextCategoryRaw.name);
    if (!group) return false;
    return group.divisions[group.divisions.length - 1]?.id === nextCategoryRaw.id;
  }, [awardGroups, nextCategoryRaw]);
  // NEXT 部門が連動 (top-reveal) アンケートを持つか
  const nextCategoryHasSurvey = useMemo(
    () => nextCategoryId != null && surveys.some((s) => s.link_category_id === nextCategoryId),
    [surveys, nextCategoryId],
  );
  // 投票No.1決定(vote)でアンケート未紐づけのときは final-pitch を出さず、
  // operator が手動で No.1 を選び CELEB(紙吹雪) で発表する。
  const voteManualWinner = pattern === 'vote' && !nextCategoryHasSurvey;
  // ランキング棒グラフの開始順位 (2〜5 で実在する最上位)。人数が少なければ自動で繰り上げ、
  // RANKS ステップのボタン名も「RANKS 4→2」等に追従させる。
  const rankStart = useMemo(() => {
    const ranks = (nextCategoryRaw?.entries ?? [])
      .map((e) => e.rank ?? 99)
      .filter((r) => r >= 2 && r <= 5);
    return ranks.length ? Math.max(...ranks) : 5;
  }, [nextCategoryRaw]);
  const STEPS = useMemo(() => {
    let base = pattern === 'vote' ? STEPS_VOTE : STEPS_DIRECT;
    if (voteManualWinner) base = base.filter((s) => s.step !== 'final-pitch');
    let steps = isLastDivisionOfAward ? base : base.filter((s) => s.step !== 'celebration');
    if (nextCategoryHasSurvey) {
      // 連動アンケートを持つ部門は「アンケート No.1 発表」を末尾に追加。
      // この場合「全部門 No.1 + 紙吹雪 (CELEB)」は出さない (No.1 発表に一本化)。
      steps = steps.filter((s) => s.step !== 'celebration');
      steps = [...steps, SURVEY_STEP];
    }
    // RANKS ステップのラベルを開始順位に合わせて変更 (RANKS 5→2 / 4→2 / 3→2 / 2)。
    steps = steps.map((s) =>
      s.step === 'ranks52'
        ? {
            ...s,
            label: rankStart <= 2 ? 'RANKS 2' : `RANKS ${rankStart}→2`,
            desc: rankStart <= 2 ? '2位発表 (ランキングバー)' : `${rankStart}位→2位発表 (ランキングバー)`,
          }
        : s,
    );
    return steps;
  }, [pattern, isLastDivisionOfAward, nextCategoryHasSurvey, voteManualWinner, rankStart]);
  const liveStep = [...STEPS_DIRECT, ...STEPS_VOTE].find((s) => s.step === cue.step);

  // 初期: LIVE 状態を NEXT にコピー (新規イベント or リロード時)
  const initFromLiveRef = useRef(false);
  useEffect(() => {
    if (initFromLiveRef.current) return;
    if (!event) return;
    setNextStep(cue.step);
    setNextCategoryId(cue.categoryId ?? event.categories[0]?.id ?? null);
    setNextStyle(cue.oneshotStyle);
    initFromLiveRef.current = true;
  }, [event, cue]);

  const nextCategory = nextCategoryRaw;
  const nextStepDef = STEPS.find((s) => s.step === nextStep) ?? [...STEPS_DIRECT, ...STEPS_VOTE].find((s) => s.step === nextStep);

  // パターン切替 / 部門切替 (celebration 可否の変化) で現 nextStep が新 STEPS に
  // 存在しなくなる場合は idle に戻す
  useEffect(() => {
    if (!STEPS.some((s) => s.step === nextStep)) {
      setNextStep('idle');
    }
  }, [STEPS]); // eslint-disable-line react-hooks/exhaustive-deps

  // NEXT の broadcast (NEXT 出力 URL 用): preview 変化のたびに socket emit
  useEffect(() => {
    if (!event) return;
    sendNextCue({
      step: nextStep,
      categoryId: nextCategoryId,
      oneshotStyle: nextStyle,
      voteDisplay: cue.voteDisplay,
      pollStartedAt: null,
      revealPhase: 0,
      winnerEntryId: voteManualWinner ? (nextWinnerId ?? null) : null,
    });
  }, [event, nextStep, nextCategoryId, nextStyle, cue.voteDisplay, sendNextCue, voteManualWinner, nextWinnerId]);

  // 全カテゴリ一覧 (NEXT ↑↓ 循環 + TAKE 自動進行で使用)
  const allCats = event?.categories ?? [];

  const take = useCallback(() => {
    // final-pitch: TAKE で ピックアップ トグル (3人並び → 1番ピック、それ以外 → 3人並びに戻す)。
    //   詳細な n 番ピックは下の PICK ボタンで revealPhase を直接指定する。
    if (nextStep === 'final-pitch' && cue.step === 'final-pitch') {
      const cur = cue.revealPhase;
      sendCue({ revealPhase: cur === 0 ? 1 : 0 });
      return;
    }

    // v2.9.63: survey-oneshot は TAKE で revealPhase を 0→1→2 (ロール→ロック→No.1) に進める。
    //   phase 2 到達後の TAKE で次のカテゴリの idle へ。
    if (nextStep === 'survey-oneshot' && cue.step === 'survey-oneshot') {
      if (cue.revealPhase < 2) {
        sendCue({ revealPhase: (cue.revealPhase + 1) as 0 | 1 | 2 | 3 });
      } else {
        const catIdx = allCats.findIndex((c) => c.id === nextCategoryId);
        if (catIdx >= 0 && catIdx < allCats.length - 1) {
          setNextCategoryId(allCats[catIdx + 1].id);
          setNextStep('idle');
        }
      }
      return;
    }

    sendCue({
      step: nextStep,
      categoryId: nextCategoryId,
      oneshotStyle: nextStyle,
      pollStartedAt: null,
      revealPhase: 0,
      // 手動選択 No.1 (vote + アンケート未紐づけ時のみ。それ以外は null で従来の rank=1)
      winnerEntryId: voteManualWinner ? (nextWinnerId ?? null) : null,
    });

    // survey-oneshot を新規送出した直後は NEXT ポインタを据え置き
    // (次の TAKE で revealPhase を進めるため。下の自動進行はスキップ)。
    if (nextStep === 'survey-oneshot') return;

    // v2.9.43: TAKE 後に NEXT ポインタを自動進行 (「TAKE を押していったらどんどん次に送れる」)。
    //   - STEPS 内で次のステップへ
    //   - 最終ステップの場合は次のカテゴリの最初のステップ (idle) に進む
    //     (賞の最後の部門では celebration が最終、それ以外は oneshot / final-pitch が最終)
    //   - 最終カテゴリの最終ステップでは据置 (循環したくないので明示操作を求める)
    const idx = STEPS.findIndex((s) => s.step === nextStep);
    if (idx >= 0 && idx < STEPS.length - 1) {
      setNextStep(STEPS[idx + 1].step);
    } else if (idx === STEPS.length - 1) {
      const catIdx = allCats.findIndex((c) => c.id === nextCategoryId);
      if (catIdx >= 0 && catIdx < allCats.length - 1) {
        setNextCategoryId(allCats[catIdx + 1].id);
        setNextStep('idle');
      }
    }
  }, [sendCue, nextStep, nextCategoryId, nextStyle, nextWinnerId, voteManualWinner, cue.step, cue.revealPhase, STEPS, allCats]);

  const clear = useCallback(() => {
    sendCue({ step: 'idle', pollStartedAt: null, revealPhase: 0 });
  }, [sendCue]);

  // ── プレビュー / 出力用 言語選択（localStorage で永続化）
  const [previewLang, setPreviewLang] = useState<PreviewLang>(() => {
    const v = localStorage.getItem('awards-preview-lang');
    return v === 'en' || v === 'both' ? v : 'ja';
  });
  useEffect(() => { localStorage.setItem('awards-preview-lang', previewLang); }, [previewLang]);

  // ── PROGRAM (LIVE) preview: scale to fit container (letterbox)
  const programRef = useRef<HTMLDivElement>(null);
  const [programScale, setProgramScale] = useState(0.3);
  const [programOff, setProgramOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = programRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setProgramScale(s);
      setProgramOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── NEXT thumbnail: scale to fit
  const nextThumbRef = useRef<HTMLDivElement>(null);
  const [thumbScale, setThumbScale] = useState(0.18);
  const [thumbOff, setThumbOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = nextThumbRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setThumbScale(s);
      setThumbOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // NEXT preview に渡す cue (LIVE と独立に NEXT 状態を描画)
  const nextCueForPreview: CgCueState = useMemo(() => ({
    step: nextStep,
    categoryId: nextCategoryId,
    oneshotStyle: nextStyle,
    voteDisplay: cue.voteDisplay,
    pollStartedAt: null,
    revealPhase: 0,
    winnerEntryId: voteManualWinner ? (nextWinnerId ?? null) : null,
    scrimOpacity: cue.scrimOpacity,
  }), [nextStep, nextCategoryId, nextStyle, cue.voteDisplay, voteManualWinner, nextWinnerId, cue.scrimOpacity]);

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-y-auto lg:overflow-hidden">
      {/* モバイル: スクロール許可 (v2.9.35). lg+ では従来通り overflow-hidden で固定レイアウト。 */}

      {/* ── Header (v2.9.34 統一 + v2.9.35 モバイル コンパクト化) ──────── */}
      {/* v2.9.88: 統合コックピットに埋め込む場合 (embedded) はヘッダーを隠す */}
      {!embedded && (
      <header className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 h-14 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          title="イベント詳細へ戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <Tv className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-black text-slate-200 tracking-wider hidden sm:inline">リアルタイムCG</span>
          <span className="text-xs font-black text-slate-200 tracking-wider sm:hidden">Ranking</span>
        </div>
        {event && <span className="text-xs text-slate-400 truncate hidden md:block">{event.name}</span>}
        <div className="flex-1 min-w-0" />
        {/* ── 3-way 回遊ナビ (sm+ のみ表示) ── */}
        <button
          onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="字幕スーパー (下部テロップ) コントロールへ"
        >
          <Subtitles className="h-3.5 w-3.5" />
          <span className="hidden md:inline">字幕スーパー</span>
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/quiz-stack/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="クイズ / アンケートCG コントロールへ"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden md:inline">クイズ</span>
        </button>
        {/* ON AIR バッジ: モバイルは dot のみ */}
        <div className={cn(
          'flex items-center gap-1.5 rounded-full text-xs font-black tracking-widest uppercase transition-all shrink-0',
          'px-2 py-1.5 sm:px-3',
          isLive
            ? 'bg-red-950/70 text-red-400 border border-red-800/50'
            : 'bg-slate-800/70 text-slate-300 border border-slate-700/50',
        )}>
          <Radio className={cn('h-3 w-3 shrink-0', isLive && 'animate-pulse')} />
          <span className="hidden sm:inline">{isLive ? 'ON AIR' : 'STANDBY'}</span>
        </div>
        <LangPicker value={previewLang} onChange={setPreviewLang} />
        <a
          href={`/awards/output/${eventId}?lang=${previewLang}`}
          target="_blank"
          rel="noreferrer"
          title={`OA 出力 (${previewLang.toUpperCase()})`}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 h-9 w-9 sm:w-auto sm:px-3 sm:py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors shrink-0"
        >
          <ExternalLink className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
          <span className="hidden sm:inline">出力</span>
        </a>
        {/* 全画面ボタン: モバイルでは hidden (タッチデバイスでは必要性低) */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '全画面解除 (F)' : '全画面表示 (F)'}
          className="hidden sm:flex items-center justify-center h-9 w-9 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors shrink-0"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </header>
      )}

      {/* ── Middle: PROGRAM (left) + Category (right) ─── */}
      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden min-h-0">

        {/* PROGRAM (LIVE) — モバイルは max-h で抑えて操作系を優先 / lg+ は flex で残スペースを埋める */}
        <div
          ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 max-h-[35vh] lg:max-h-none relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 lg:shrink"
        >
          {event && (
            <div
              style={{
                position: 'absolute',
                left: programOff.x,
                top: programOff.y,
                width: CG_W * programScale,
                height: CG_H * programScale,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: CG_W,
                  height: CG_H,
                  transform: `scale(${programScale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                }}
              >
                <CGErrorBoundary>
                  <CGFrame
                    lang={previewLang}
                    cue={cue}
                    category={liveCategory}
                    allCategories={event.categories}
                    surveys={surveys}
                    eventName={event.name}
                    eventSubtitle={event.subtitle}
                  />
                </CGErrorBoundary>
              </div>
            </div>
          )}
          <div
            className={cn(
              'absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase border',
              isLive
                ? 'bg-red-950/70 border-red-800/60 text-red-400'
                : 'bg-slate-900/80 border-slate-700/60 text-slate-300',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', isLive ? 'bg-red-500 animate-pulse' : 'bg-slate-600')} />
            {isLive ? `OA · ON AIR (${previewLang.toUpperCase()})` : `OA · ${cue.step.toUpperCase()} (${previewLang.toUpperCase()})`}
          </div>
        </div>

        {/* Right panel: Status + Category */}
        <div className="w-full lg:w-80 xl:w-96 flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <StatusBar isLive={isLive} liveStep={liveStep} liveCategory={liveCategory} nextStep={nextStepDef} nextCategory={nextCategory} />
          <div className="flex-1 overflow-y-auto p-3">
            <CategoryPanel
              awardGroups={awardGroups}
              liveCategoryId={cue.categoryId}
              nextCategoryId={nextCategoryId}
              onSelect={setNextCategoryId}
            />
          </div>
        </div>
      </div>

      {/* ── Bottom: NEXT thumb + Step selection + OneShot style + TAKE ── */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-900/50">
        {/* mobile/tablet (< xl) NEXT info strip */}
        <div className="xl:hidden flex items-center gap-2 px-3 py-1.5 text-[11px] border-b border-slate-800/80 bg-black/30">
          <span className="font-black tracking-widest uppercase text-amber-500 shrink-0">
            NEXT · {previewLang === 'both' ? 'JA+EN' : previewLang.toUpperCase()}
          </span>
          <span className="text-slate-200 truncate font-bold">{nextStepDef?.label ?? '—'}</span>
          {nextCategory && (
            <>
              <span className="text-slate-400 shrink-0">·</span>
              <span className="text-slate-400 truncate">{nextCategory.description || nextCategory.name}</span>
            </>
          )}
        </div>

        <div className="p-3">
          <div className="flex flex-col xl:flex-row gap-3">
            {/* NEXT thumbnail (xl+) */}
            <div className="hidden xl:flex flex-col gap-1.5 shrink-0 w-full xl:w-[320px]">
              <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase text-amber-500">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                NEXT · 送出予約 ({previewLang.toUpperCase()})
              </div>
              <div
                ref={nextThumbRef}
                className="relative w-full aspect-video bg-black rounded border border-slate-800 overflow-hidden"
              >
                {event && (
                  <div
                    style={{
                      position: 'absolute',
                      left: thumbOff.x,
                      top: thumbOff.y,
                      width: CG_W * thumbScale,
                      height: CG_H * thumbScale,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: CG_W,
                        height: CG_H,
                        transform: `scale(${thumbScale})`,
                        transformOrigin: 'top left',
                        position: 'absolute',
                      }}
                    >
                      <CGErrorBoundary>
                        <CGFrame
                          lang={previewLang}
                          cue={nextCueForPreview}
                          category={nextCategory}
                          allCategories={event.categories}
                          surveys={surveys}
                          eventName={event.name}
                          eventSubtitle={event.subtitle}
                        />
                      </CGErrorBoundary>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Controls column */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 text-[10px] font-black tracking-widest uppercase">
                <span className="text-slate-500">PATTERN</span>
                <span className={cn(
                  'rounded px-2 py-0.5 border',
                  pattern === 'vote'
                    ? 'bg-amber-950/40 border-amber-700/60 text-amber-300'
                    : 'bg-slate-800/40 border-slate-700/50 text-slate-300',
                )}>
                  {pattern === 'vote' ? (
                    <span className="inline-flex items-center gap-1"><Vote className="h-3 w-3" />ファイナルピッチ</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><Tv className="h-3 w-3" />No.1発表</span>
                  )}
                </span>
              </div>
              <StepRow steps={STEPS} liveStep={cue.step} nextStep={nextStep} onSelect={setNextStep} />
              {/* ピックアップ用ボタン (Final Pitch ステップ LIVE 中のみ表示) */}
              {pattern === 'vote' && cue.step === 'final-pitch' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] text-slate-400 font-bold tracking-widest uppercase shrink-0">PICK</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[0, 1, 2, 3].map((idx) => (
                      <button
                        key={idx}
                        onClick={() => sendCue({ revealPhase: idx as 0|1|2|3 })}
                        className={cn(
                          'rounded-md border px-3 py-1 text-xs font-bold transition-all',
                          cue.revealPhase === idx
                            ? 'border-amber-500 bg-amber-900/40 text-amber-300'
                            : 'border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100',
                        )}
                      >
                        {idx === 0 ? '3人並び' : `${idx}番をピック`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* 投票No.1決定 (アンケート未紐づけ) は CELEB の No.1 を手動選択 */}
              {voteManualWinner && nextCategory && nextCategory.entries.length > 0 && (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-2 space-y-1.5">
                  <div className="text-[11px] font-bold text-amber-300 tracking-wider">No.1 を選択（紙吹雪で発表）</div>
                  <div className="flex flex-wrap gap-1.5">
                    {nextCategory.entries.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setNextWinnerId(e.id)}
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-all',
                          nextWinnerId === e.id
                            ? 'border-amber-500 bg-amber-900/50 text-amber-200'
                            : 'border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100',
                        )}
                      >
                        {e.name}
                      </button>
                    ))}
                  </div>
                  {nextWinnerId == null && (
                    <div className="text-[10px] text-amber-200/60">未選択のときは順位1位を No.1 として発表します</div>
                  )}
                </div>
              )}
              <StyleRow styles={ONESHOT_STYLES} liveStyle={cue.oneshotStyle} nextStyle={nextStyle} onSelect={setNextStyle} />
              {/* v2.9.128: 半透明黒ベースの濃さをライブ調整 (cue で即時配信)。No.1発表系には適用されない。 */}
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black tracking-widest uppercase text-slate-400 shrink-0">黒ベース濃さ</span>
                <input
                  type="range" min={0} max={0.95} step={0.05}
                  value={cue.scrimOpacity ?? 0.72}
                  onChange={(e) => sendCue({ scrimOpacity: Number(e.target.value) })}
                  className="flex-1 accent-slate-200"
                  aria-label="ランキング演出の黒ベースの濃さ"
                />
                <span className="text-xs font-bold text-slate-200 tabular-nums w-10 text-right">
                  {Math.round((cue.scrimOpacity ?? 0.72) * 100)}%
                </span>
              </div>
              <SendActionRow isLive={isLive} onTake={take} onClear={clear} />
              <div className="hidden sm:flex items-center gap-3 text-[9px] text-slate-500 tracking-widest uppercase font-medium flex-wrap">
                <span><kbd className="px-1 rounded bg-slate-800 text-slate-300">0–5</kbd> ステップ</span>
                <span><kbd className="px-1 rounded bg-slate-800 text-slate-300">↑↓</kbd> 部門</span>
                <span><kbd className="px-1 rounded bg-slate-800 text-slate-300">Space</kbd> TAKE</span>
                <span><kbd className="px-1 rounded bg-slate-800 text-slate-300">X</kbd> / <kbd className="px-1 rounded bg-slate-800 text-slate-300">Esc</kbd> CLEAR</span>
                <span><kbd className="px-1 rounded bg-slate-800 text-slate-300">F</kbd> 全画面</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── StatusBar (compact, inside right panel top) ───────────
function StatusBar({ isLive, liveStep, liveCategory, nextStep, nextCategory }: {
  isLive: boolean;
  liveStep: StepDef | undefined;
  liveCategory: CgCategory | null;
  nextStep: StepDef | undefined;
  nextCategory: CgCategory | null;
}) {
  return (
    <div className="shrink-0 border-b border-slate-800">
      <div className={cn(
        'px-3 py-2 transition-all',
        isLive ? 'bg-red-950/30' : 'bg-slate-900/30',
      )}>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-[9px] font-black tracking-widest',
            isLive ? 'text-red-400' : 'text-slate-400',
          )}>
            OA
          </span>
          <span className={cn(
            'text-sm font-black tracking-wider',
            isLive ? 'text-red-300' : 'text-slate-300',
          )}>
            {liveStep?.label ?? '—'}
          </span>
          <span className="text-xs text-slate-400">{liveStep?.desc}</span>
        </div>
        {liveCategory && (
          <div className="flex items-center gap-1.5 mt-1">
            <Tv className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-400 font-semibold truncate">{liveCategory.name}</span>
            {liveCategory.description && (
              <span className="text-xs text-slate-300 truncate">/ {liveCategory.description}</span>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2 bg-amber-950/20 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-black tracking-widest text-amber-500">NEXT</span>
          <span className="text-sm font-black tracking-wider text-amber-300">
            {nextStep?.label ?? '—'}
          </span>
          <span className="text-xs text-slate-400">{nextStep?.desc}</span>
        </div>
        {nextCategory && (
          <div className="flex items-center gap-1.5 mt-1">
            <Tv className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-xs text-amber-400 font-semibold truncate">{nextCategory.name}</span>
            {nextCategory.description && (
              <span className="text-xs text-slate-300 truncate">/ {nextCategory.description}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── CategoryPanel ─────────────────────────────────────────
function CategoryPanel({ awardGroups, liveCategoryId, nextCategoryId, onSelect }: {
  awardGroups: AwardGroup[];
  liveCategoryId: number | null;
  nextCategoryId: number | null;
  onSelect: (catId: number) => void;
}) {
  if (!awardGroups.length) return (
    <div className="text-xs text-slate-400 text-center py-6">カテゴリなし</div>
  );
  return (
    <div className="space-y-3">
      {awardGroups.map((g) => (
        <div key={g.name}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Tv className="h-3 w-3 text-amber-500 shrink-0" />
            <span className="text-[11px] font-bold text-amber-500 tracking-wide">{g.name}</span>
          </div>
          <div className="flex flex-col gap-1 pl-4">
            {g.divisions.map((cat) => {
              const isNext = nextCategoryId === cat.id;
              const isLiveCat = liveCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelect(cat.id)}
                  className={cn(
                    'w-full text-left rounded-md px-3 py-2 text-xs font-semibold transition-all border flex items-center gap-2',
                    isNext
                      ? 'bg-amber-500 border-amber-400 text-slate-950'
                      : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:bg-slate-700 hover:border-slate-600',
                  )}
                >
                  <span className="flex-1 truncate">{cat.description || cat.name}</span>
                  {isLiveCat && (
                    <span className={cn(
                      'shrink-0 text-[9px] font-black tracking-widest uppercase rounded px-1 py-0.5',
                      isNext ? 'bg-red-700 text-white' : 'bg-red-950/60 text-red-300 border border-red-800/50',
                    )}>
                      LIVE
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* アンケート/クイズCG はイベントエディタの「アンケート/クイズ」ボタン経由でアクセス */}
    </div>
  );
}

// ── StepRow (bottom bar) ──────────────────────────────────
function StepRow({ steps, liveStep, nextStep, onSelect }: {
  steps: StepDef[];
  liveStep: CgStep;
  nextStep: CgStep;
  onSelect: (step: CgStep) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2">
      {steps.map(({ step, label, desc, color }) => {
        const isNext = nextStep === step;
        const isLiveStep = liveStep === step;
        return (
          <button
            key={step}
            onClick={() => onSelect(step)}
            className={cn(
              'relative flex flex-col items-start rounded-lg border px-2 sm:px-3 py-2 sm:py-2.5 text-left transition-all min-h-[52px] sm:min-h-[60px]',
              isNext && color === 'live'    && 'border-amber-500 bg-amber-950/40 ring-1 ring-amber-700/40',
              isNext && color === 'award'   && 'border-amber-500 bg-amber-950/50 ring-1 ring-amber-700/40',
              isNext && color === 'neutral' && 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-700/40',
              !isNext && 'border-slate-800 bg-slate-900/40 hover:bg-slate-800 hover:border-slate-700',
            )}
          >
            <span className={cn(
              'text-[11px] sm:text-xs font-black tracking-wider leading-none',
              isNext ? 'text-amber-300' : 'text-slate-200',
            )}>
              {label}
            </span>
            <span className="text-[10px] sm:text-[11px] font-medium text-slate-300 mt-1 sm:mt-1.5 leading-tight">{desc}</span>
            {isLiveStep && (
              <span className={cn(
                'absolute top-1 left-1.5 sm:top-1.5 sm:left-2 text-[8px] sm:text-[9px] font-black tracking-widest rounded px-1 py-0.5',
                isNext ? 'bg-red-700 text-white' : 'bg-red-950/70 text-red-300 border border-red-800/50',
              )}>
                LIVE
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── StyleRow (bottom bar) ─────────────────────────────────
function StyleRow({ styles, liveStyle, nextStyle, onSelect }: {
  styles: typeof ONESHOT_STYLES;
  liveStyle: OneshotStyle;
  nextStyle: OneshotStyle;
  onSelect: (style: OneshotStyle) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-slate-400 font-bold tracking-widest uppercase shrink-0">Style</span>
      <div className="flex gap-2 flex-wrap">
        {styles.map(({ style, label }) => {
          const isNext = nextStyle === style;
          const isLiveStyle = liveStyle === style;
          return (
            <button
              key={style}
              onClick={() => onSelect(style)}
              className={cn(
                'rounded-md border px-3.5 py-2 text-xs font-bold transition-all relative min-h-[36px]',
                isNext
                  ? 'border-amber-500 bg-amber-900/30 text-amber-300'
                  : 'border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100',
              )}
            >
              {label}
              {isLiveStyle && (
                <span className={cn(
                  'absolute -top-1.5 -right-1.5 text-[9px] font-black tracking-widest rounded px-1 py-0.5',
                  isNext ? 'bg-red-700 text-white' : 'bg-red-950/80 text-red-300 border border-red-800/50',
                )}>
                  LIVE
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── SendActionRow (TAKE / CLEAR) ──────────────────────────
function SendActionRow({ isLive, onTake, onClear }: {
  isLive: boolean;
  onTake: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onTake}
        className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 py-3.5 text-base font-black tracking-widest uppercase transition-colors shadow-lg shadow-red-900/40"
      >
        <Send className="h-5 w-5" />
        TAKE
      </button>
      <button
        onClick={onClear}
        disabled={!isLive}
        className={cn(
          'flex items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-base font-black tracking-widest uppercase transition-colors',
          isLive
            ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
            : 'bg-slate-900/40 text-slate-500 cursor-not-allowed',
        )}
        title="ON AIR を停止して IDLE に戻す"
      >
        <X className="h-4 w-4" />
        CLEAR
      </button>
    </div>
  );
}

// ── LangPicker (header) ───────────────────────────────────
function LangPicker({ value, onChange }: {
  value: PreviewLang;
  onChange: (v: PreviewLang) => void;
}) {
  const opts: { v: PreviewLang; label: string }[] = [
    { v: 'ja',   label: 'JA'    },
    { v: 'en',   label: 'EN'    },
    { v: 'both', label: 'JA/EN' },
  ];
  return (
    <div className="flex items-center rounded-lg border border-slate-700/60 bg-slate-900/50 p-0.5 text-[10px] font-black tracking-widest" role="group" aria-label="プレビュー言語">
      {opts.map(({ v, label }) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            'px-2 py-1 rounded-md transition-colors',
            value === v
              ? 'bg-amber-500 text-slate-950'
              : 'text-slate-300 hover:bg-slate-800 hover:text-slate-300',
          )}
          aria-pressed={value === v}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
