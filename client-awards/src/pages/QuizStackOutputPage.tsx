import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useQuizStackSocket } from '@/quiz/useQuizStackSocket';
import QuizCG from '@/quiz/QuizCG';
import type { QuizWithChoices } from '@/quiz/types';
import { CG_W, CG_H } from '@/cg/types';

interface StackData {
  quizzes: QuizWithChoices[];
  stack: { currentQuizId: number | null; step: string; pollStartedAt: number | null; revealPhase: number };
}

export default function QuizStackOutputPage() {
  const { eventId: eventIdRaw } = useParams<{ eventId: string }>();
  const [params] = useSearchParams();
  const langParam = params.get('lang');
  const lang: 'ja' | 'en' = langParam === 'en' ? 'en' : 'ja';
  const eventId = parseInt(eventIdRaw ?? '0');

  const { data } = useQuery({
    queryKey: ['quiz-stack-public', eventId],
    queryFn: async () => {
      const res = await api.get(`/quiz/events/${eventId}/quiz-stack/public`);
      return res.data.data as StackData;
    },
    enabled: !!eventId,
    refetchInterval: 15_000,
  });

  const { cue, liveVotes } = useQuizStackSocket(eventId || null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const calc = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  useEffect(() => {
    document.body.setAttribute('data-output-transparent', '');
    document.body.style.background = 'transparent';
    return () => {
      document.body.removeAttribute('data-output-transparent');
      document.body.style.background = '';
    };
  }, []);

  if (!data) return null;
  const currentQuiz = data.quizzes.find((q) => q.id === cue.currentQuizId) ?? null;
  if (!currentQuiz) return null;

  // 投票数: 通常は 15s ごとの再取得値。Interactive 連携時は poller からの
  // リアルタイム votes (liveVotes) が現在 quiz のものなら優先してマージ。
  const baseVotes = Object.fromEntries(currentQuiz.choices.map((c) => [c.position, c.vote_count]));
  const votes = liveVotes && liveVotes.quizId === currentQuiz.id
    ? { ...baseVotes, ...liveVotes.votes }
    : baseVotes;

  return (
    <div ref={wrapRef} style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
      <div style={{
        position: 'absolute', left: off.x, top: off.y,
        width: CG_W * scale, height: CG_H * scale, overflow: 'hidden',
      }}>
        <div style={{
          width: CG_W, height: CG_H,
          transform: `scale(${scale})`, transformOrigin: 'top left',
          position: 'absolute',
        }}>
          <QuizCG
            quiz={currentQuiz}
            cue={{
              quizId: currentQuiz.id,
              step: cue.step,
              pollStartedAt: cue.pollStartedAt,
              revealPhase: cue.revealPhase,
              votes,
            }}
            transparent
            lang={lang}
          />
        </div>
      </div>
    </div>
  );
}
