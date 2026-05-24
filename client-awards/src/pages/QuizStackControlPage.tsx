import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Send, X, Radio, HelpCircle, ChevronRight as IconRight } from 'lucide-react';
import { useQuizzes, useQuiz } from '@/quiz/api';
import { useQuizStackSocket } from '@/quiz/useQuizStackSocket';
import QuizCG from '@/quiz/QuizCG';
import { CG_W, CG_H } from '@/cg/types';
import { cn } from '@/lib/utils';
import type { QuizStep, QuizMode } from '@/quiz/types';

function nextStepFor(mode: QuizMode, hasAnswerCheck: boolean, current: QuizStep): QuizStep {
  if (mode === 'quiz') {
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
  if (mode === 'survey-only') {
    if (hasAnswerCheck) {
      if (current === 'idle') return 'poll';
      if (current === 'poll') return 'answer-check';
      return 'idle';
    }
    if (current === 'idle') return 'poll';
    return 'idle';
  }
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

export default function QuizStackControlPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: quizzes = [] } = useQuizzes(eventId);
  const { cue, sendCue, setStep } = useQuizStackSocket(eventId);

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

  const [voteEdits, setVoteEdits] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!currentQuiz) return;
    const m: Record<number, number> = {};
    for (const c of currentQuiz.choices) m[c.position] = c.vote_count;
    setVoteEdits(m);
  }, [currentQuiz]);

  const take = useCallback(() => {
    if (!currentQuiz) {
      // NEXT を PROGRAM にプロモートして POLL 開始
      if (!nextQuiz) return;
      sendCue({ currentQuizId: nextQuiz.id, step: 'poll', pollStartedAt: Date.now() });
      return;
    }
    const next = nextStepFor(currentQuiz.mode, currentQuiz.has_answer_check, cue.step);
    if (cue.step === 'idle' && next === 'poll') {
      sendCue({ step: 'poll', pollStartedAt: Date.now() });
    } else if (cue.step === 'poll') {
      sendCue({ step: next, pollStartedAt: null, votes: voteEdits });
    } else if (next === 'idle') {
      // 終了 → NEXT を新しい PROGRAM に
      if (nextQuiz && nextQuiz.id !== cue.currentQuizId) {
        sendCue({ currentQuizId: nextQuiz.id, step: 'idle', pollStartedAt: null, revealPhase: 0 });
        // ローカル NEXT を更に次に
        const idx = quizzes.findIndex((q) => q.id === nextQuiz.id);
        setNextQuizId(quizzes[(idx + 1) % quizzes.length]?.id ?? quizzes[0].id);
      } else {
        setStep('idle', { pollStartedAt: null, revealPhase: 0 });
      }
    } else {
      setStep(next);
    }
  }, [currentQuiz, nextQuiz, cue, voteEdits, sendCue, setStep, quizzes]);

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

  const nextStep = currentQuiz ? nextStepFor(currentQuiz.mode, currentQuiz.has_answer_check, cue.step) : 'poll';
  const nextLabel = !currentQuiz
    ? '次のクイズを開始'
    : (nextStep === 'idle'
      ? (nextQuiz && nextQuiz.id !== cue.currentQuizId ? '次のクイズへ' : 'リセット (IDLE)')
      : `次へ (${STEP_LABELS[nextStep]})`);

  const totalVotes = useMemo(() => Object.values(voteEdits).reduce((s, v) => s + (v || 0), 0), [voteEdits]);

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-800">
        <button onClick={() => navigate(`/event/${eventId}/quiz`)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700">
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <HelpCircle className="h-4 w-4 text-purple-400" />
        <span className="text-[11px] font-black text-slate-300 tracking-widest">アンケート/クイズ 送出</span>
        <div className="flex-1" />
        <a href={`/awards/output/quiz-stack/${eventId}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700">
          <ExternalLink className="h-3 w-3" />出力 (1 つ)
        </a>
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest uppercase',
          cue.step !== 'idle'
            ? 'bg-red-950/70 text-red-400 border border-red-800/50'
            : 'bg-slate-800/70 text-slate-300 border border-slate-700/50',
        )}>
          <Radio className={cn('h-3 w-3', cue.step !== 'idle' && 'animate-pulse')} />
          {cue.step !== 'idle' ? 'ON AIR' : 'STANDBY'}
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* PROGRAM プレビュー */}
        <div ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800">
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
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-slate-900/80 border border-slate-700/60 text-slate-300">
            OA · {currentQuiz?.title || '(未選択)'} · {STEP_LABELS[cue.step]}
          </div>
        </div>

        {/* 右ペイン: NEXT pulldown + 投票数 + TAKE */}
        <div className="w-full lg:w-96 flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* NEXT 選択 */}
            <div className="rounded border border-amber-700/40 bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[10px] font-black tracking-widest text-amber-400">
                <IconRight className="h-3 w-3" /> NEXT (送出予約)
              </div>
              <select
                value={nextQuizId ?? ''}
                onChange={(e) => setNextQuizId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              >
                <option value="">(選択なし)</option>
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>{q.title || `quiz #${q.id}`}</option>
                ))}
              </select>
              <div className="text-[10px] text-slate-400">
                モード: {nextQuiz?.mode === 'quiz' ? 'クイズ' : nextQuiz?.mode === 'survey-only' ? 'アンケート (質問のみ)' : 'アンケート (結果発表あり)'}
                {' · '}{nextQuiz?.choice_count ?? '-'} 択 / {nextQuiz?.countdown_seconds ?? '-'} 秒
              </div>
            </div>

            {/* 投票数 (PROGRAM) */}
            {currentQuiz && (
              <div className="rounded border border-slate-800 bg-slate-950/40 p-3 space-y-2">
                <div className="text-[10px] font-black tracking-widest text-slate-400">投票/回答数 (PROGRAM)</div>
                <div className="text-[10px] text-slate-500">合計 {totalVotes.toLocaleString()} {currentQuiz.display === 'percent' ? '' : '票'}</div>
                {currentQuiz.choices.slice(0, currentQuiz.choice_count).map((c) => {
                  const v = voteEdits[c.position] ?? 0;
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-black text-white">{c.position}</div>
                      <div className="flex-1 min-w-0 truncate text-slate-200">{c.name || `選択肢${c.position}`}</div>
                      <input type="text" inputMode="numeric" value={String(v)}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[^\d]/g, '');
                          const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                          setVoteEdits({ ...voteEdits, [c.position]: isNaN(n) ? 0 : Math.max(0, n) });
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right font-bold text-slate-100"/>
                    </div>
                  );
                })}
                <button onClick={() => sendCue({ votes: voteEdits })}
                  className="w-full rounded bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-black text-slate-950">
                  投票数を保存 (送出に反映)
                </button>
              </div>
            )}
          </div>

          {/* 下部: TAKE / CLEAR */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3 space-y-2">
            <div className="text-[10px] text-slate-400">
              現在: <span className="text-amber-300 font-bold">{currentQuiz?.title || '(未選択)'}</span>
              {' · '}step: <span className="text-amber-300 font-bold">{STEP_LABELS[cue.step]}</span>
            </div>
            <div className="text-[10px] text-slate-400">
              次の TAKE: <span className="text-amber-300 font-bold">{nextLabel}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={take}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 py-2.5 text-sm font-black tracking-widest">
                <Send className="h-4 w-4" />TAKE
              </button>
              <button onClick={clear}
                disabled={cue.step === 'idle'}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black tracking-widest',
                  cue.step !== 'idle'
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-100'
                    : 'bg-slate-900/40 text-slate-500 cursor-not-allowed',
                )}>
                <X className="h-4 w-4" />CLEAR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
