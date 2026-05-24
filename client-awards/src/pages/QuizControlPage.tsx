import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ExternalLink, Send, X, Edit3, Radio, HelpCircle } from 'lucide-react';
import { useQuiz } from '@/quiz/api';
import { useQuizSocket } from '@/quiz/useQuizSocket';
import QuizCG from '@/quiz/QuizCG';
import { CG_W, CG_H } from '@/cg/types';
import { cn } from '@/lib/utils';
import type { QuizStep } from '@/quiz/types';

const STEP_LABELS: { step: QuizStep; label: string; desc: string }[] = [
  { step: 'idle',           label: 'IDLE',    desc: '透過' },
  { step: 'poll',           label: 'POLL',    desc: 'アンケート (秒指定)' },
  { step: 'reveal',         label: 'RESULT',  desc: '投票結果表示' },
  { step: 'winner',         label: 'NO.1',    desc: '大賞フルスクリーン' },
  { step: 'answer-check',   label: 'ANS',     desc: '回答数表示 (任意)' },
  { step: 'correct-reveal', label: 'CORRECT', desc: '正解発表 (点滅 + 他は dim)' },
];

function nextStepFor(mode: 'survey' | 'quiz', hasAnswerCheck: boolean, current: QuizStep): QuizStep {
  if (mode === 'quiz') {
    if (hasAnswerCheck) {
      if (current === 'idle') return 'poll';
      if (current === 'poll') return 'answer-check';
      if (current === 'answer-check') return 'correct-reveal';
      return 'idle';
    } else {
      if (current === 'idle') return 'poll';
      if (current === 'poll') return 'correct-reveal';
      return 'idle';
    }
  }
  // survey
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

export default function QuizControlPage() {
  const { id, quizId: quizIdRaw } = useParams<{ id: string; quizId: string }>();
  const eventId = parseInt(id!);
  const quizId = parseInt(quizIdRaw!);
  const navigate = useNavigate();

  const { data: quiz } = useQuiz(quizId);
  const { cue, setStep } = useQuizSocket(quizId);

  const [voteEdits, setVoteEdits] = useState<Record<number, number>>({});
  useEffect(() => {
    if (!quiz) return;
    const m: Record<number, number> = {};
    for (const c of quiz.choices) m[c.position] = cue.votes?.[c.position] ?? c.vote_count;
    setVoteEdits(m);
  }, [quiz, cue.votes]);

  const total = useMemo(() => Object.values(voteEdits).reduce((s, v) => s + (v || 0), 0), [voteEdits]);

  const take = useCallback(() => {
    if (!quiz) return;
    const next = nextStepFor(quiz.mode, quiz.has_answer_check, cue.step);
    if (cue.step === 'idle' && next === 'poll') {
      setStep('poll', { pollStartedAt: Date.now() });
    } else if (cue.step === 'poll') {
      setStep(next, { pollStartedAt: null, votes: voteEdits });
    } else if (next === 'idle') {
      setStep('idle', { pollStartedAt: null, revealPhase: 0 });
    } else {
      setStep(next);
    }
  }, [quiz, cue.step, voteEdits, setStep]);

  const clear = useCallback(() => {
    setStep('idle', { pollStartedAt: null, revealPhase: 0 });
  }, [setStep]);

  const saveVotes = useCallback(() => {
    if (!quiz) return;
    setStep(cue.step, { votes: voteEdits });
  }, [quiz, cue.step, voteEdits, setStep]);

  // PROGRAM プレビュースケール
  const programRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = programRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth, h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!quiz) return <div className="p-6 text-sm">読み込み中…</div>;

  const nextStep = nextStepFor(quiz.mode, quiz.has_answer_check, cue.step);
  const nextLabel = nextStep === 'poll' ? '開始 (POLL)'
    : nextStep === 'answer-check' ? 'アンサーチェック (ANS)'
    : nextStep === 'reveal' ? '結果 (RESULT)'
    : nextStep === 'winner' ? '大賞 (NO.1)'
    : nextStep === 'correct-reveal' ? '正解発表 (CORRECT)'
    : 'リセット (IDLE)';

  return (
    <div className="h-full flex flex-col bg-black text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-800">
        <button onClick={() => navigate(`/event/${eventId}/quiz`)}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700">
          <ChevronLeft className="h-4 w-4 text-slate-300" />
        </button>
        <HelpCircle className="h-4 w-4 text-purple-400" />
        <span className="text-[11px] font-black text-slate-300 tracking-widest">アンケート/クイズ</span>
        <span className="text-xs text-slate-400 truncate hidden sm:block">{quiz.title}</span>
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/event/${eventId}/quiz/${quizId}/edit`)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-[10px] font-black tracking-widest uppercase text-slate-400 hover:bg-slate-700"
        >
          <Edit3 className="h-3 w-3" />編集
        </button>
        <a href={`/awards/output/quiz/${quizId}`} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-700">
          <ExternalLink className="h-3 w-3" />出力
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

      {/* Middle: PROGRAM + Settings */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        <div ref={programRef}
          className="w-full aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0 relative bg-black border-b lg:border-b-0 lg:border-r border-slate-800">
          <div style={{
            position: 'absolute',
            left: off.x, top: off.y,
            width: CG_W * scale, height: CG_H * scale,
            overflow: 'hidden',
          }}>
            <div style={{
              width: CG_W, height: CG_H,
              transform: `scale(${scale})`, transformOrigin: 'top left',
              position: 'absolute',
            }}>
              <QuizCG quiz={quiz} cue={cue} />
            </div>
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black tracking-widest uppercase bg-slate-900/80 border border-slate-700/60 text-slate-300">
            OA · {cue.step.toUpperCase()}
          </div>
        </div>

        {/* 右ペイン: 投票数編集 */}
        <div className="w-full lg:w-96 flex-1 min-h-0 lg:flex-none lg:shrink-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-[10px] font-black tracking-widest text-slate-400">投票数 (手入力)</div>
            <div className="text-[10px] text-slate-500">合計 {total.toLocaleString()} 票 / 表示: {quiz.display === 'percent' ? '%' : '票'}</div>
            {quiz.choices.slice(0, quiz.choice_count).map((c) => {
              const v = voteEdits[c.position] ?? 0;
              const pct = total > 0 ? Math.round((v / total) * 100) : 0;
              return (
                <div key={c.id} className="rounded border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center text-xs font-black text-white">
                      {c.position}
                    </div>
                    <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{c.name || `選択肢${c.position}`}</div>
                    <span className="text-[10px] text-slate-400">{pct}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="text" inputMode="numeric" value={String(v)}
                      onChange={(e) => {
                        const cleaned = e.target.value.replace(/[^\d]/g, '');
                        const n = cleaned === '' ? 0 : parseInt(cleaned, 10);
                        setVoteEdits({ ...voteEdits, [c.position]: isNaN(n) ? 0 : Math.max(0, n) });
                      }}
                      onFocus={(e) => e.target.select()}
                      className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-right text-sm font-bold text-slate-100"
                    />
                  </div>
                </div>
              );
            })}
            <button onClick={saveVotes}
              className="w-full rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-2 text-xs font-black text-slate-950">
              投票数を保存 (送出側にも反映)
            </button>
          </div>

          {/* 下部: STEPS + TAKE/CLEAR */}
          <div className="shrink-0 border-t border-slate-800 bg-slate-900/50 p-3 space-y-2">
            <div className="text-[10px] text-slate-400">
              モード: <span className="text-amber-300 font-bold">{quiz.mode === 'quiz' ? 'クイズ' : 'アンケート'}</span>
              {' · '}アンサーチェック: <span className="text-amber-300 font-bold">{quiz.has_answer_check ? 'あり' : 'なし'}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {STEP_LABELS.map(({ step, label }) => (
                <div key={step}
                  className={cn(
                    'rounded border px-2 py-1.5 text-center text-[10px] font-black tracking-widest',
                    cue.step === step
                      ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                      : 'border-slate-800 bg-slate-900/40 text-slate-400 opacity-60',
                  )}>
                  {label}
                </div>
              ))}
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
