import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useQuizSocket } from '@/quiz/useQuizSocket';
import QuizCG from '@/quiz/QuizCG';
import type { QuizWithChoices } from '@/quiz/types';
import { CG_W, CG_H } from '@/cg/types';

export default function QuizOutputPage() {
  const { quizId: quizIdRaw } = useParams<{ quizId: string }>();
  const [params] = useSearchParams();
  const langParam = params.get('lang');
  const lang: 'ja' | 'en' = langParam === 'en' ? 'en' : 'ja';

  const quizId = parseInt(quizIdRaw ?? '0');

  // 公開エンドポイント (認証なし) + react-query で定期再取得
  const { data: quiz } = useQuery({
    queryKey: ['quiz-public', quizId],
    queryFn: async () => {
      const res = await api.get(`/quiz/quizzes/${quizId}/public`);
      return res.data.data as QuizWithChoices;
    },
    enabled: !!quizId,
    refetchInterval: 30_000,
  });

  const { cue } = useQuizSocket(quizId || null);

  // viewport → 1920×1080 letterbox scale
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
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

  if (!quiz) return null;

  return (
    <div ref={wrapRef} style={{ position: 'fixed', inset: 0, background: 'transparent' }}>
      <div style={{
        position: 'absolute',
        left: off.x, top: off.y,
        width: CG_W * scale, height: CG_H * scale,
        overflow: 'hidden',
      }}>
        <div style={{
          width: CG_W, height: CG_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'absolute',
        }}>
          <QuizCG quiz={quiz} cue={cue} transparent lang={lang} />
        </div>
      </div>
    </div>
  );
}
