import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Send, X, Radio, HelpCircle, Tv, Subtitles, ChevronRight as IconRight } from 'lucide-react';
import { useQuizzes, useQuiz } from '@/quiz/api';
import { useQuizStackSocket } from '@/quiz/useQuizStackSocket';
import QuizCG from '@/quiz/QuizCG';
import { CG_W, CG_H } from '@/cg/types';
import { cn } from '@/lib/utils';
import { getServerNow } from '@/lib/serverClock';
import type { QuizStep, QuizMode, QuizOneshotStyle, SurveyPattern } from '@/quiz/types';

// v2.9.36: 演出パターンを (mode, surveyPattern, hasAnswerCheck) で明示分岐。
//   - mode='quiz'                     → 「正解発表」(常に correct-reveal で終了)
//   - mode='survey' + 'answer-check' → 「アンサーチェック」(answer-check で終了、No.1 発表なし)
//   - mode='survey' + 'top-reveal'   → 「No.1 発表」(reveal → winner のフルスクリーン演出)
// has_answer_check は「アンサーチェック演出を前段に挿入するか」の独立フラグ。
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
  // アンケート: 演出パターンで分岐
  const pattern: SurveyPattern = surveyPattern ?? 'top-reveal'; // 旧データ互換のデフォルト
  if (pattern === 'answer-check') {
    // アンサーチェックのみ: 出題 → アンサーチェック → idle (No.1 発表なし)
    if (current === 'idle') return 'poll';
    if (current === 'poll') return 'answer-check';
    return 'idle';
  }
  // top-reveal (No.1 発表): 出題 → [アンサーチェック] → 結果発表 (reveal) → No.1 発表 (winner)
  if (hasAnswerCheck) {
    if (current === 'idle') return 'poll';
    if (current === 'poll') return 'answer-check';
    if (current === 'answer-check') return 'reveal';
    if (current === 'reveal') return 'winner';
    return 'idle';
  }
  if (current === 'idle') return 'poll';
  if (current === 'poll') return 'reveal';
  if (current === 'reveal') return 'winner';
  return 'idle';
}

const STEP_LABELS: Record<QuizStep, string> = {
  idle: 'IDLE', poll: 'POLL', 'answer-check': 'ANS', reveal: 'RESULT',
  winner: 'NO.1', 'correct-reveal': 'CORRECT',
};

// 演出パターンの表示 (operator UI のバッジ用)
function patternBadge(mode: QuizMode, surveyPattern: SurveyPattern | null) {
  if (mode === 'quiz') return { label: '正解発表', color: 'bg-blue-900/40 text-blue-300 border-blue-700/50' };
  const pattern = surveyPattern ?? 'top-reveal';
  if (pattern === 'answer-check') return { label: 'アンサーチェック', color: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50' };
  return { label: 'No.1 発表', color: 'bg-amber-900/40 text-amber-300 border-amber-700/50' };
}

export default function QuizStackControlPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: quizzes = [] } = useQuizzes(eventId);
  const { cue, sendCue, setStep, liveVotes } = useQuizStackSocket(eventId);

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

  // 現在 / 次の quiz 詳細
  const { data: currentQuiz } = useQuiz(cue.currentQuizId);
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
  useEffect(() => {
    if (!liveVotes || liveVotes.quizId !== cue.currentQuizId) return;
    setVoteEdits((prev) => ({ ...prev, ...liveVotes.votes }));
  }, [liveVotes, cue.currentQuizId]);

  // v2.9.28: カウントダウンが 0 になっても自動遷移しない (poll のまま停止)。
  // operator が次に TAKE を押したとき reveal/phase 0 (ランダム揺れ) へ進む。
  // → 旧 v2.9.18 の poll 制限時間到達による自動 reveal 遷移は廃止。

  const take = useCallback(() => {
    if (!currentQuiz) {
      // NEXT を PROGRAM にプロモートして POLL 開始
      if (!nextQuiz) return;
      sendCue({ currentQuizId: nextQuiz.id, step: 'poll', pollStartedAt: getServerNow(), revealPhase: 0, votes: {} });
      return;
    }
    // v2.9.18+: reveal step 内の phase 進行 (TAKE で 0→1 ドン!確定)
    if (cue.step === 'reveal' && cue.revealPhase === 0) {
      sendCue({ revealPhase: 1, votes: voteEdits });
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
      // v2.9.38: 次のステップは nextStepFor の結果に従う
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
    const isTerminal = (s: QuizStep): boolean => {
      if (s === 'winner' || s === 'correct-reveal') return true;
      if (s === 'answer-check'
          && currentQuiz.mode === 'survey'
          && (currentQuiz.survey_pattern ?? 'top-reveal') === 'answer-check') {
        return true;
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

  // 大賞演出スタイル
  const setOneshotStyle = useCallback((style: QuizOneshotStyle) => {
    sendCue({ oneshotStyle: style });
  }, [sendCue]);

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
  // v2.9.18+: reveal/phase 0 のときは TAKE で ドン!確定 (phase 1) に進む
  const inShakeReveal = cue.step === 'reveal' && cue.revealPhase === 0;
  // v2.9.42: TAKE on terminal は no-op、CLEAR で終了 → idle で TAKE すると次のクイズへ
  const isTerminalNow = currentQuiz != null && nextStep === 'idle' && cue.step !== 'idle' && cue.step !== 'poll';
  const nextLabel = !currentQuiz
    ? '次のクイズを開始'
    : inShakeReveal
      ? '次へ (ドン!確定)'
      : isTerminalNow
        ? 'CLEAR でクイズ終了'
        : (cue.step === 'idle'
          ? (nextQuiz && nextQuiz.id !== cue.currentQuizId ? '次のクイズを開始' : 'リスタート (POLL)')
          : `次へ (${STEP_LABELS[nextStep]})`);

  const totalVotes = useMemo(() => Object.values(voteEdits).reduce((s, v) => s + (v || 0), 0), [voteEdits]);

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-y-auto lg:overflow-hidden">
      {/* モバイル: スクロール許可 (v2.9.35). lg+ では従来通り overflow-hidden で固定レイアウト。 */}
      {/* ── Header (v2.9.34 統一: h-14 / アイコン h-9 w-9 / text-sm + 3-way 回遊ナビ) ──── */}
      <header className="flex items-center gap-2 px-4 h-14 shrink-0 border-b border-slate-800">
        <button
          onClick={() => navigate(`/event/${eventId}/quiz`)}
          title="クイズ / アンケート一覧へ戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <HelpCircle className="h-4 w-4 text-purple-400" />
          <span className="text-sm font-black text-slate-200 tracking-wider">クイズ / アンケートCG</span>
        </div>
        <div className="flex-1" />
        {/* ── 3-way 回遊ナビ (v2.9.34): リアルタイムCG / 字幕スーパー へジャンプ ── */}
        <button
          onClick={() => navigate(`/event/${eventId}/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="リアルタイムCG (ランキング演出) コントロールへ"
        >
          <Tv className="h-3.5 w-3.5" />
          <span className="hidden md:inline">リアルタイムCG</span>
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
          title="字幕スーパー (下部テロップ) コントロールへ"
        >
          <Subtitles className="h-3.5 w-3.5" />
          <span className="hidden md:inline">字幕スーパー</span>
        </button>
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black tracking-widest uppercase',
          cue.step !== 'idle'
            ? 'bg-red-950/70 text-red-300 border border-red-700/60'
            : 'bg-slate-800/70 text-slate-200 border border-slate-600/50',
        )}>
          <Radio className={cn('h-3 w-3', cue.step !== 'idle' && 'animate-pulse')} />
          {cue.step !== 'idle' ? 'ON AIR' : 'STANDBY'}
        </div>
        <a
          href={`/awards/output/quiz-stack/${eventId}?lang=ja`}
          target="_blank"
          rel="noreferrer"
          title="OA 出力 (JA)"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />JA
        </a>
        <a
          href={`/awards/output/quiz-stack/${eventId}?lang=en`}
          target="_blank"
          rel="noreferrer"
          title="OA 出力 (EN)"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />EN
        </a>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row lg:overflow-hidden min-h-0">
        {/* PROGRAM プレビュー */}
        <div ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 max-h-[35vh] lg:max-h-none relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800 shrink-0 lg:shrink">
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
                    oneshotStyle: cue.oneshotStyle,
                  }}
                />
              </div>
            </div>
          )}
          <div className={cn(
            'absolute top-2 left-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-black tracking-widest uppercase border',
            cue.step !== 'idle'
              ? 'bg-red-950/80 border-red-700/60 text-red-200'
              : 'bg-slate-900/80 border-slate-700/60 text-slate-200',
          )}>
            <span className={cn(cue.step !== 'idle' ? 'text-red-400' : 'text-slate-400')}>
              {cue.step !== 'idle' ? '● OA' : 'OA'}
            </span>
            <span className="text-slate-100">{currentQuiz?.title || '(未選択)'}</span>
            <span className="text-slate-400">·</span>
            <span className="text-amber-300">{STEP_LABELS[cue.step]}</span>
          </div>
        </div>

        {/* 右ペイン: NEXT pulldown + 投票数 + TAKE */}
        <div className="w-full lg:w-[420px] flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {/* PROGRAM (今送出中) — 大きく見やすく */}
            <div className={cn(
              'rounded-lg border-2 p-4 space-y-2',
              cue.step !== 'idle'
                ? 'border-red-600/60 bg-red-950/30'
                : 'border-slate-700 bg-slate-900/40',
            )}>
              <div className="flex items-center gap-2">
                <div className={cn(
                  'text-xs font-black tracking-widest px-2 py-0.5 rounded',
                  cue.step !== 'idle' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-200',
                )}>
                  {cue.step !== 'idle' ? '● ON AIR' : 'PROGRAM'}
                </div>
                <div className="text-xs font-bold tracking-widest text-slate-300 uppercase">
                  {STEP_LABELS[cue.step]}
                </div>
              </div>
              <div className="text-xl font-black text-slate-50 leading-tight break-words">
                {currentQuiz?.title || '(未選択)'}
              </div>
              {currentQuiz && (
                <>
                  <div className="text-sm text-slate-300">
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
                      <span className="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-[11px] font-bold text-slate-300">
                        + アンサーチェック前段
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* NEXT (次に送出) — 大きく見やすく */}
            <div className="rounded-lg border-2 border-amber-600/60 bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-xs font-black tracking-widest px-2 py-0.5 rounded bg-amber-600 text-slate-950">
                  <IconRight className="inline h-3 w-3 -mt-0.5 mr-0.5" />NEXT
                </div>
                <div className="text-xs font-bold tracking-widest text-amber-300 uppercase">送出予約</div>
              </div>
              <select
                value={nextQuizId ?? ''}
                onChange={(e) => setNextQuizId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border border-amber-700/40 bg-slate-900 px-3 py-2 text-base font-bold text-slate-50"
              >
                <option value="">(選択なし)</option>
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>{q.title || `quiz #${q.id}`}</option>
                ))}
              </select>
              {nextQuiz && (
                <div className="text-sm text-amber-200/80">
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
                    ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-md shadow-amber-900/30'
                    : 'bg-slate-800/60 text-slate-500 cursor-not-allowed'
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
              <p className="text-[11px] text-amber-200/60 leading-tight">
                何もしなければ表示順で自動進行。CLEAR な状態で 決定 を押すと、選択中のクイズを次の PROGRAM として仕込めます。
              </p>
            </div>

            {/* 大賞演出スタイル */}
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-2">
              <div className="text-sm font-black tracking-widest text-slate-200">大賞演出スタイル</div>
              <div className="grid grid-cols-4 gap-2">
                {(['classic','shards','spotlight','slit'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setOneshotStyle(s)}
                    className={cn(
                      'rounded-md px-2 py-2 text-xs font-black tracking-widest uppercase min-h-[36px]',
                      cue.oneshotStyle === s
                        ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="text-xs text-slate-400">No.1 発表時のフルスクリーン演出</div>
            </div>

            {/* 投票数 (PROGRAM) */}
            {currentQuiz && (
              <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black tracking-widest text-slate-200">投票/回答数</div>
                  <div className="text-sm text-slate-400">合計 <span className="font-bold text-slate-100">{totalVotes.toLocaleString()}</span> {currentQuiz.display === 'percent' ? '' : '票'}</div>
                </div>
                {isLinked && (
                  <div className="flex items-center gap-1.5 rounded-md bg-cyan-900/40 border border-cyan-700/50 px-2 py-1.5 text-xs font-bold text-cyan-300">
                    <Radio className={cn('h-3 w-3', liveActive && 'animate-pulse')} />
                    インタラクティブ連動中{liveActive ? '（リアルタイム反映）' : '（出題待ち）'}・手入力は無効
                  </div>
                )}
                {currentQuiz.choices.slice(0, currentQuiz.choice_count).map((c) => {
                  const v = voteEdits[c.position] ?? 0;
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-black text-white">{c.position}</div>
                      <div className="flex-1 min-w-0 truncate text-slate-100 font-semibold">{c.name || `選択肢${c.position}`}</div>
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
                          'w-24 rounded border border-slate-700 px-2 py-1.5 text-right text-base font-bold text-slate-50',
                          isLinked ? 'bg-slate-800/60 cursor-not-allowed text-cyan-200' : 'bg-slate-900'
                        )}/>
                    </div>
                  );
                })}
                {!isLinked && (
                  <button onClick={() => sendCue({ votes: voteEdits })}
                    className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-2 text-sm font-black text-slate-950">
                    投票数を保存 (送出に反映)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 下部: 次の TAKE 内容 + TAKE / CLEAR */}
          <div className="shrink-0 border-t-2 border-slate-700 bg-slate-900/70 p-4 space-y-3">
            <div className="rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2">
              <div className="text-[10px] font-black tracking-widest text-slate-400 mb-0.5">次の TAKE で →</div>
              <div className="text-base font-black text-amber-300 leading-tight break-words">{nextLabel}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={take}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 py-4 text-lg font-black tracking-widest shadow-lg shadow-red-900/40">
                <Send className="h-5 w-5" />TAKE
              </button>
              <button onClick={clear}
                disabled={cue.step === 'idle'}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-4 py-4 text-base font-black tracking-widest',
                  cue.step !== 'idle'
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                    : 'bg-slate-900/40 text-slate-500 cursor-not-allowed',
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
