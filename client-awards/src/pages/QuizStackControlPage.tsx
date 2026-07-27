import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Send, X, Radio, HelpCircle, Tv, Subtitles, ChevronRight as IconRight } from 'lucide-react';
import { useQuizzes, useQuiz } from '@/quiz/api';
import { useQuizStackSocket } from '@/quiz/useQuizStackSocket';
import QuizCG from '@/quiz/QuizCG';
import { CG_W, CG_H } from '@/cg/types';
import { cn } from '@/lib/utils';
import { getServerNow } from '@/lib/serverClock';
import type { QuizStep, QuizMode, SurveyPattern } from '@/quiz/types';
import { quizStackLabel } from '@/quiz/types';

// アンケートCG の TAKE フロー。
//   - mode='quiz'                    → 出題 → [アンサーチェック] → 正解発表 → idle
//   - mode='survey' + 'answer-check' → 出題 → 集計 (answer-check) → idle
//   - mode='survey' + 'top-reveal'   → 出題のみ → idle (集計も No.1 もランキングCG側で発表)
function nextStepFor(
  mode: QuizMode,
  surveyPattern: SurveyPattern | null,
  hasAnswerCheck: boolean,
  current: QuizStep
): QuizStep {
  if (mode === 'quiz') {
    // クイズ (正解発表): 出題 → [アンサーチェック] → 正解発表 → idle
    if (hasAnswerCheck) {
      if (current === 'idle') return 'poll';
      if (current === 'poll') return 'answer-check';
      if (current === 'answer-check') return 'correct-reveal';
      return 'idle';
    }
    if (current === 'idle') return 'poll';
    if (current === 'poll') return 'correct-reveal';
    return 'idle';
  }
  // アンケート
  const pattern: SurveyPattern = surveyPattern ?? 'top-reveal';
  if (pattern === 'top-reveal') {
    // No.1 発表: この画面は出題のみ。集計・No.1 はランキングCGで。
    return current === 'idle' ? 'poll' : 'idle';
  }
  // アンサーチェック: 出題 → 集計 → idle
  if (current === 'idle') return 'poll';
  if (current === 'poll') return 'answer-check';
  return 'idle';
}

const STEP_LABELS: Record<QuizStep, string> = {
  idle: 'IDLE', poll: 'POLL', 'answer-check': 'ANS', 'correct-reveal': 'CORRECT',
};

// 演出パターンの表示 (operator UI のバッジ用)
function patternBadge(mode: QuizMode, surveyPattern: SurveyPattern | null) {
  if (mode === 'quiz') return { label: '正解発表', color: 'bg-primary/40 text-primary-foreground border-primary/50' };
  const pattern = surveyPattern ?? 'top-reveal';
  if (pattern === 'answer-check') return { label: 'アンサーチェック', color: 'bg-success/40 text-success border-success/50' };
  return { label: 'No.1 → ランキングCG', color: 'bg-warning/40 text-warning-strong border-warning/50' };
}

export default function QuizStackControlPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: quizzes = [] } = useQuizzes(eventId);
  const { cue, sendCue, setStep, liveVotes, sendNext } = useQuizStackSocket(eventId);

  // PROGRAM = cue.currentQuizId, NEXT = ローカル選択
  const [nextQuizId, setNextQuizId] = useState<number | null>(null);
  useEffect(() => {
    // 初回ロード: cue が無ければ最初の quiz、あればその次の quiz を NEXT に
    if (quizzes.length === 0 || nextQuizId !== null) return;
    if (cue.currentQuizId) {
      const idx = quizzes.findIndex((q) => q.id === cue.currentQuizId);
      setNextQuizId(quizzes[(idx + 1) % quizzes.length]?.id ?? quizzes[0].id);
    } else {
      setNextQuizId(quizzes[0].id);
    }
  }, [quizzes, cue.currentQuizId, nextQuizId]);

  // NEXT 選択を broadcast (NEXT 出力 URL 用)
  useEffect(() => { sendNext(nextQuizId); }, [nextQuizId, sendNext]);

  // 現在 / 次の quiz 詳細
  // 連動クイズの送出中は operator プレビューも 2.5s ごとに DB の最新票数を取得
  // (出力URLと同じ更新経路。socket が届かない環境でも操作UIの数値/CGが反映される)。
  const currentInList = quizzes.find((q) => q.id === cue.currentQuizId) as { interactive_question_id?: string | null } | undefined;
  const linkedCurrentForPoll = !!currentInList?.interactive_question_id && cue.step !== 'idle';
  const { data: currentQuiz } = useQuiz(cue.currentQuizId, { refetchMs: linkedCurrentForPoll ? 2500 : false });
  const { data: nextQuiz } = useQuiz(nextQuizId);

  // Interactive 連携中の quiz か (interactive_question_id があれば連動対象)
  const isLinked = !!(currentQuiz as { interactive_question_id?: string | null } | undefined)?.interactive_question_id;
  // 連携中で、現在 quiz のリアルタイム投票が来ているか
  const liveActive = isLinked && !!liveVotes && liveVotes.quizId === cue.currentQuizId;

  const [voteEdits, setVoteEdits] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!currentQuiz) return;
    const m: Record<number, number> = {};
    for (const c of currentQuiz.choices) m[c.position] = c.vote_count;
    setVoteEdits(m);
  }, [currentQuiz]);

  // Interactive 連動時: poller のリアルタイム投票数を操作UIにも反映 (手入力を上書き)。
  // 出力CG と同じ liveVotes を使うことで「プレビューと実CGの集計が一致」する。
  // 非連携 (手入力) クイズでは liveVotes (poll 開始時の全0リセット等) で手入力を
  // 上書きしないよう、連携クイズのときだけ反映する。
  useEffect(() => {
    if (!isLinked) return;
    if (!liveVotes || liveVotes.quizId !== cue.currentQuizId) return;
    setVoteEdits((prev) => ({ ...prev, ...liveVotes.votes }));
  }, [isLinked, liveVotes, cue.currentQuizId]);

  // カウントダウンが 0 になっても自動遷移しない (poll のまま停止)。
  // operator が次に TAKE を押したとき次ステップ (answer-check / correct-reveal) へ進む。

  const take = useCallback(() => {
    if (!currentQuiz) {
      // NEXT を PROGRAM にプロモートして POLL 開始
      if (!nextQuiz) return;
      sendCue({ currentQuizId: nextQuiz.id, step: 'poll', pollStartedAt: getServerNow(), revealPhase: 0, votes: {} });
      return;
    }
    const next = nextStepFor(currentQuiz.mode, currentQuiz.survey_pattern, currentQuiz.has_answer_check, cue.step);
    if (cue.step === 'idle') {
      // v2.9.42: TAKE from idle のロジック整理
      //   - NEXT が currentQuiz と異なる → auto-advance (キュー進行): 新クイズの poll を開始
      //   - NEXT === currentQuiz → 同じクイズの poll を開始 (リスタート or 初回)
      if (nextQuiz && nextQuiz.id !== cue.currentQuizId) {
        sendCue({
          currentQuizId: nextQuiz.id,
          step: 'poll',
          pollStartedAt: getServerNow(),
          revealPhase: 0,
          votes: {},
        });
      } else {
        sendCue({ step: 'poll', pollStartedAt: getServerNow(), revealPhase: 0 });
      }
    } else if (cue.step === 'poll') {
      // poll の次が idle (= top-reveal アンケート: 出題のみ) のときは TAKE no-op。
      //   operator は CLEAR で投票を終了する (No.1 はランキングCGで発表)。
      if (next === 'idle') return;
      sendCue({ step: next, pollStartedAt: null, revealPhase: 0, votes: voteEdits });
    } else if (next === 'idle') {
      // v2.9.42: terminal state (winner / correct-reveal / answer-check terminal) で TAKE
      //   → 何もしない (operator は CLEAR を押してクイズを終了させる必要がある)
      //   旧 v2.9.41 の自動 1-TAKE 進行は撤回し、CLEAR を「クイズ終了」の明示的境界に
      return;
    } else {
      setStep(next);
    }
  }, [currentQuiz, nextQuiz, cue, voteEdits, sendCue, setStep]);

  // v2.9.42: 決定ボタン — 選択中の NEXT を currentQuiz として load する (idle のみ)
  //   何もしなければ TAKE で順番進行、操作者が明示的に staged を変えたいときに使う
  const stageSelected = useCallback(() => {
    if (!nextQuiz || cue.step !== 'idle') return;
    if (nextQuiz.id === cue.currentQuizId) return; // 既に load 済み
    sendCue({
      currentQuizId: nextQuiz.id,
      step: 'idle',
      pollStartedAt: null,
      revealPhase: 0,
      votes: {},
    });
    // nextQuizId はそのままにして、TAKE で同じクイズの poll を開始できるようにする。
  }, [nextQuiz, cue.step, cue.currentQuizId, sendCue]);

  // v2.9.42: terminal step に到達した瞬間に NEXT を次-in-order に自動進行。
  //   これにより quiz 終了 + CLEAR の後に TAKE すると次のクイズが自動再生される
  //   (operator は 決定 ボタンで manual override 可能、ただし操作者が pulldown を
  //    変えた場合はその選択を尊重する)。
  const prevStepRef = useRef<QuizStep>(cue.step);
  useEffect(() => {
    const prev = prevStepRef.current;
    prevStepRef.current = cue.step;
    if (!currentQuiz || quizzes.length === 0) return;
    const surveyPattern = currentQuiz.survey_pattern ?? 'top-reveal';
    const isTerminal = (s: QuizStep): boolean => {
      if (s === 'correct-reveal') return true;
      if (currentQuiz.mode === 'survey') {
        // top-reveal は出題 (poll) が終端、answer-check は集計が終端
        return surveyPattern === 'top-reveal' ? s === 'poll' : s === 'answer-check';
      }
      return false;
    };
    if (isTerminal(cue.step) && !isTerminal(prev)) {
      const idx = quizzes.findIndex((q) => q.id === currentQuiz.id);
      const candidate = quizzes[(idx + 1) % quizzes.length]?.id;
      if (candidate && candidate !== currentQuiz.id) {
        setNextQuizId(candidate);
      }
    }
  }, [cue.step, currentQuiz, quizzes]);

  const clear = useCallback(() => {
    sendCue({ step: 'idle', pollStartedAt: null, revealPhase: 0 });
  }, [sendCue]);

  // PROGRAM スケール
  const programRef = useRef<HTMLDivElement>(null);
  const [pScale, setPScale] = useState(0.3);
  const [pOff, setPOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = programRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setPScale(s);
      setPOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc); ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const nextStep = currentQuiz ? nextStepFor(currentQuiz.mode, currentQuiz.survey_pattern, currentQuiz.has_answer_check, cue.step) : 'poll';
  // top-reveal アンケートは poll (出題) が終端 → TAKE no-op、CLEAR で投票終了。
  const pollIsTerminal = !!currentQuiz && currentQuiz.mode === 'survey'
    && (currentQuiz.survey_pattern ?? 'top-reveal') === 'top-reveal' && cue.step === 'poll';
  // TAKE on terminal は no-op、CLEAR で終了 → idle で TAKE すると次のクイズへ
  const isTerminalNow = currentQuiz != null && nextStep === 'idle' && cue.step !== 'idle'
    && (cue.step !== 'poll' || pollIsTerminal);
  const nextLabel = !currentQuiz
    ? '次のクイズを開始'
    : pollIsTerminal
      ? 'CLEAR で投票終了'
      : isTerminalNow
      ? 'CLEAR でクイズ終了'
      : (cue.step === 'idle'
        ? (nextQuiz && nextQuiz.id !== cue.currentQuizId ? '次のクイズを開始' : 'リスタート (POLL)')
        : `次へ (${STEP_LABELS[nextStep]})`);

  const totalVotes = useMemo(() => Object.values(voteEdits).reduce((s, v) => s + (v || 0), 0), [voteEdits]);

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-y-auto lg:overflow-hidden">
      {/* モバイル: スクロール許可 (v2.9.35). lg+ では従来通り overflow-hidden で固定レイアウト。 */}
      {/* ── Header (v2.9.34 統一: h-14 / アイコン h-9 w-9 / text-sm + 3-way 回遊ナビ) ──── */}
      {/* v2.9.88: 統合コックピットに埋め込む場合 (embedded) はヘッダーを隠す */}
      {!embedded && (
      <header className="flex items-center gap-2 px-4 h-14 shrink-0 border-b border-border">
        <button
          onClick={() => navigate(`/event/${eventId}/quiz`)}
          title="クイズ / アンケート一覧へ戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <HelpCircle className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline text-sm font-black text-foreground tracking-wider">クイズ / アンケートCG</span>
        </div>
        <div className="flex-1" />
        {/* ── 3-way 回遊ナビ (v2.9.34): リアルタイムCG / 字幕スーパー へジャンプ ── */}
        <button
          onClick={() => navigate(`/event/${eventId}/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="リアルタイムCG (ランキング演出) コントロールへ"
        >
          <Tv className="h-3.5 w-3.5" />
          <span className="hidden md:inline">リアルタイムCG</span>
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="字幕スーパー (下部テロップ) コントロールへ"
        >
          <Subtitles className="h-3.5 w-3.5" />
          <span className="hidden md:inline">字幕スーパー</span>
        </button>
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-full text-xs font-black tracking-widest uppercase shrink-0',
          cue.step !== 'idle'
            ? 'bg-destructive/70 text-destructive border border-destructive/60'
            : 'bg-card/70 text-foreground border border-border/50',
        )}>
          <Radio className={cn('h-3 w-3', cue.step !== 'idle' && 'animate-pulse')} />
          <span className="hidden sm:inline">{cue.step !== 'idle' ? 'ON AIR' : 'STANDBY'}</span>
        </div>
        <a
          href={`/awards/output/quiz-stack/${eventId}?lang=ja`}
          target="_blank"
          rel="noreferrer"
          title="OA 出力 (JA)"
          className="flex items-center gap-1 rounded-lg bg-card px-2 py-2 sm:px-3 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" />JA
        </a>
        <a
          href={`/awards/output/quiz-stack/${eventId}?lang=en`}
          target="_blank"
          rel="noreferrer"
          title="OA 出力 (EN)"
          className="flex items-center gap-1 rounded-lg bg-card px-2 py-2 sm:px-3 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" />EN
        </a>
      </header>
      )}

      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden min-h-0">
        {/* PROGRAM プレビュー */}
        <div ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 max-h-[35vh] lg:max-h-none relative bg-black border-b lg:border-b-0 lg:border-r border-border shrink-0 lg:shrink">
          {currentQuiz && (
            <div style={{
              position: 'absolute',
              left: pOff.x, top: pOff.y,
              width: CG_W * pScale, height: CG_H * pScale,
              overflow: 'hidden',
            }}>
              <div style={{
                width: CG_W, height: CG_H,
                transform: `scale(${pScale})`, transformOrigin: 'top left',
                position: 'absolute',
              }}>
                <QuizCG
                  quiz={currentQuiz}
                  cue={{
                    quizId: currentQuiz.id, step: cue.step,
                    pollStartedAt: cue.pollStartedAt, revealPhase: cue.revealPhase,
                    votes: voteEdits,
                  }}
                />
              </div>
            </div>
          )}
          <div className={cn(
            'absolute top-2 left-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-black tracking-widest uppercase border',
            cue.step !== 'idle'
              // 黒い映像の上に載るので、面の色の上に載る文字 (-foreground) を使う
              ? 'bg-destructive border-destructive text-destructive-foreground'
              : 'bg-background/85 border-border text-foreground',
          )}>
            <span className={cn(cue.step !== 'idle' ? 'text-destructive' : 'text-muted-foreground')}>
              {cue.step !== 'idle' ? '● OA' : 'OA'}
            </span>
            <span className="text-foreground">{currentQuiz ? quizStackLabel(currentQuiz) : '(未選択)'}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-warning-strong">{STEP_LABELS[cue.step]}</span>
          </div>
        </div>

        {/* 右ペイン: NEXT pulldown + 投票数 + TAKE */}
        <div className="w-full lg:w-[420px] flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* PROGRAM (今送出中) — 大きく見やすく */}
            <div className={cn(
              'rounded-lg border-2 p-4 space-y-2',
              cue.step !== 'idle'
                ? 'border-destructive/60 bg-destructive/30'
                : 'border-border bg-background/40',
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'text-xs font-black tracking-widest px-2 py-0.5 rounded',
                  cue.step !== 'idle' ? 'bg-destructive text-white' : 'bg-muted text-foreground',
                )}>
                  {cue.step !== 'idle' ? '● ON AIR' : 'PROGRAM'}
                </div>
                <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  {STEP_LABELS[cue.step]}
                </div>
              </div>
              <div className="text-xl font-black text-foreground leading-tight break-words">
                {currentQuiz ? quizStackLabel(currentQuiz) : '(未選択)'}
              </div>
              {currentQuiz && (
                <>
                  <div className="text-sm text-muted-foreground">
                    {currentQuiz.mode === 'quiz' ? 'クイズ' : 'アンケート'}
                    {' · '}{currentQuiz.choice_count} 択 / {currentQuiz.countdown_seconds} 秒
                  </div>
                  {/* v2.9.36: 演出パターン バッジ + アンサーチェック前段の表示 */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const b = patternBadge(currentQuiz.mode, currentQuiz.survey_pattern);
                      return (
                        <span className={cn('inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold', b.color)}>
                          {b.label}
                        </span>
                      );
                    })()}
                    {currentQuiz.has_answer_check && (
                      <span className="inline-flex items-center gap-1 rounded border border-border bg-card/60 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                        + アンサーチェック前段
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* NEXT (次に送出) — 大きく見やすく */}
            <div className="rounded-lg border-2 border-warning/60 bg-warning/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-black tracking-widest px-2 py-0.5 rounded bg-warning text-foreground">
                  <IconRight className="inline h-3 w-3 -mt-0.5 mr-0.5" />NEXT
                </div>
                <div className="text-xs font-bold tracking-widest text-warning-strong uppercase">送出予約</div>
              </div>
              <select
                value={nextQuizId ?? ''}
                onChange={(e) => setNextQuizId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border border-warning/40 bg-background px-3 py-2 text-base font-bold text-foreground"
              >
                <option value="">(選択なし)</option>
                {quizzes.map((q, i) => (
                  <option key={q.id} value={q.id}>{i + 1}. {quizStackLabel(q)}</option>
                ))}
              </select>
              {nextQuiz && (
                <div className="text-sm text-warning-strong">
                  {nextQuiz.mode === 'quiz' ? 'クイズ' : 'アンケート'}
                  {' · '}{nextQuiz.choice_count} 択 / {nextQuiz.countdown_seconds} 秒
                </div>
              )}
              {/* v2.9.42: 決定ボタン — idle 中に手動で staged クイズを load する */}
              <button
                onClick={stageSelected}
                disabled={cue.step !== 'idle' || !nextQuiz || nextQuiz.id === cue.currentQuizId}
                className={cn(
                  'w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                  cue.step === 'idle' && nextQuiz && nextQuiz.id !== cue.currentQuizId
                    ? 'bg-warning hover:bg-warning/90 text-foreground shadow-md'
                    : 'bg-card/60 text-muted-foreground cursor-not-allowed'
                )}
                title={
                  cue.step !== 'idle'
                    ? '決定は CLEAR な状態のときのみ操作可能'
                    : !nextQuiz
                      ? 'NEXT を選択してください'
                      : nextQuiz.id === cue.currentQuizId
                        ? '既に load 済み'
                        : '選択中のクイズを PROGRAM に仕込む'
                }
              >
                決定 (NEXT を仕込む)
              </button>
              <p className="text-[11px] text-warning-strong leading-tight">
                何もしなければ表示順で自動進行。CLEAR な状態で 決定 を押すと、選択中のクイズを次の PROGRAM として仕込めます。
              </p>
            </div>

            {/* 投票数 (PROGRAM) */}
            {currentQuiz && (
              <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black tracking-widest text-foreground">投票/回答数</div>
                  <div className="text-sm text-muted-foreground">合計 <span className="font-bold text-foreground">{totalVotes.toLocaleString()}</span> {currentQuiz.display === 'percent' ? '' : '票'}</div>
                </div>
                {isLinked && (
                  <div className="flex items-center gap-1.5 rounded-md bg-info/40 border border-info/50 px-2 py-1.5 text-xs font-bold text-info">
                    <Radio className={cn('h-3 w-3', liveActive && 'animate-pulse')} />
                    インタラクティブ連動中{liveActive ? '（リアルタイム反映）' : '（出題待ち）'}・手入力は無効
                  </div>
                )}
                {currentQuiz.choices.slice(0, currentQuiz.choice_count).map((c) => {
                  const v = voteEdits[c.position] ?? 0;
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-primary flex items-center justify-center text-xs font-black text-white">{c.position}</div>
                      <div className="flex-1 min-w-0 truncate text-foreground font-semibold">{c.name || `選択肢${c.position}`}</div>
                      <input type="text" inputMode="numeric" value={String(v)}
                        readOnly={isLinked}
                        onChange={(e) => {
                          if (isLinked) return;
                          const cleaned = e.target.value.replace(/[^\d]/g, '');
                          const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                          setVoteEdits({ ...voteEdits, [c.position]: isNaN(n) ? 0 : Math.max(0, n) });
                        }}
                        onFocus={(e) => { if (!isLinked) e.target.select(); }}
                        className={cn(
                          'w-24 rounded border border-border px-2 py-1.5 text-right text-base font-bold text-foreground',
                          isLinked ? 'bg-card/60 cursor-not-allowed text-info' : 'bg-background'
                        )}/>
                    </div>
                  );
                })}
                {!isLinked && (
                  <button onClick={() => sendCue({ votes: voteEdits })}
                    className="w-full rounded-lg bg-warning hover:bg-warning/90 px-3 py-2 text-sm font-black text-foreground">
                    投票数を保存 (送出に反映)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 下部: 次の TAKE 内容 + TAKE / CLEAR */}
          <div className="shrink-0 border-t-2 border-border bg-background/70 p-4 space-y-3">
            <div className="rounded-lg bg-background/60 border border-border px-3 py-2">
              <div className="text-[10px] font-black tracking-widest text-muted-foreground mb-0.5">次の TAKE で →</div>
              <div className="text-base font-black text-warning-strong leading-tight break-words">{nextLabel}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={take}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-destructive hover:bg-destructive/90 text-white px-4 py-4 text-lg font-black tracking-widest shadow-lg">
                <Send className="h-5 w-5" />TAKE
              </button>
              <button onClick={clear}
                disabled={cue.step === 'idle'}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-4 py-4 text-base font-black tracking-widest',
                  cue.step !== 'idle'
                    ? 'bg-muted hover:bg-accent text-foreground'
                    : 'bg-background/40 text-muted-foreground cursor-not-allowed',
                )}>
                <X className="h-5 w-5" />CLEAR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
