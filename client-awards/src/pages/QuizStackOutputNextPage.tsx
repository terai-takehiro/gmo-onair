import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useQuizStackSocket } from '@/quiz/useQuizStackSocket';
import QuizCG from '@/quiz/QuizCG';
import type { QuizWithChoices } from '@/quiz/types';
import { CG_W, CG_H } from '@/cg/types';

interface StackData {
  quizzes: QuizWithChoices[];
  stack: { currentQuizId: number | null; step: string; pollStartedAt: number | null; revealPhase: number };
}

// v2.9.64: クイズ/アンケートCG の NEXT (送出予約) 出力 URL。
// operator が QuizStackControlPage で選択中の「次の問題」を別モニターで確認する用途
// (ランキングCG / 字幕スーパー の NEXT 出力 URL と対になる)。
// 表示は poll レイアウト (4択 + 質問) を静止表示する (カウントダウンは走らせない)。
export default function QuizStackOutputNextPage() {
  const { eventId: eventIdRaw } = useParams<{ eventId: string }>();
  const [params] = useSearchParams();
  const lang: 'ja' | 'en' = params.get('lang') === 'en' ? 'en' : 'ja';
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

  const { cue, nextQuizId } = useQuizStackSocket(eventId || null);

  // 正解 (is_correct) はサーバーが correct-reveal まで false にマスクして返すため、
  // correct-reveal に TAKE されたらキャッシュを再取得しておく (定期再取得は 15s)
  const queryClient = useQueryClient();
  useEffect(() => {
    if (cue.step !== 'correct-reveal') return;
    queryClient.invalidateQueries({ queryKey: ['quiz-stack-public', eventId] });
  }, [cue.step, eventId, queryClient]);

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
  const nextQuiz = data.quizzes.find((q) => q.id === nextQuizId) ?? null;
  if (!nextQuiz) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
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
            quiz={nextQuiz}
            cue={{
              quizId: nextQuiz.id,
              step: 'poll',
              pollStartedAt: null,
              revealPhase: 0,
              votes: {},
            }}
            transparent
            lang={lang}
          />
        </div>
      </div>
    </div>
  );
}
