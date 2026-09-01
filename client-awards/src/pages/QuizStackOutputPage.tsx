import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useQuizStackSocket } from '@/quiz/useQuizStackSocket';
import { useCgAudio } from '@/hooks/useCgAudio';
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

  // ?bg=1 で背景あり版を出力 (既定は透過)
  const bgParam = (params.get('bg') ?? '').toLowerCase();
  const withBg = bgParam === '1' || bgParam === 'on' || bgParam === 'true';

  // ?audio=1 を付けた URL でのみ演出SEを鳴らす
  const audioParam = (params.get('audio') ?? '').toLowerCase();
  const audioOn = audioParam === '1' || audioParam === 'on' || audioParam === 'true';

  const { data } = useQuery({
    queryKey: ['quiz-stack-public', eventId],
    queryFn: async () => {
      const res = await api.get(`/quiz/events/${eventId}/quiz-stack/public`);
      return res.data.data as StackData;
    },
    enabled: !!eventId,
    // 投票数は socket (quizStack:votes) でリアルタイム反映するのが主経路だが、
    // OBS ブラウザソースや別マシン出力では WebSocket が不安定/プロキシでバッファされる
    // ことがあり、その場合この再取得が唯一の更新経路になる。15s だと「ものすごくラグ」に
    // 感じるため 2.5s に短縮 (対象は quiz_choices の軽量 read なので負荷は軽微)。
    refetchInterval: 2_500,
  });

  const { cue, liveVotes } = useQuizStackSocket(eventId || null);

  // 正解 (is_correct) はサーバーが correct-reveal まで false にマスクして返すため、
  // correct-reveal に TAKE された瞬間に再取得する (2.5s の定期再取得を待つと
  // 正解ハイライトがその分遅れる)
  const queryClient = useQueryClient();
  useEffect(() => {
    if (cue.step !== 'correct-reveal') return;
    queryClient.invalidateQueries({ queryKey: ['quiz-stack-public', eventId] });
  }, [cue.step, eventId, queryClient]);

  // 演出SE: クイズCG のステップ遷移 (= TAKE) ごとに割り当てSEを再生 (前の音はカットアウト)
  const { play } = useCgAudio(eventId || null, audioOn);
  const prevQuizStepRef = useRef<string | null>(null);
  useEffect(() => {
    if (!audioOn) return;
    const step = cue.step;
    if (prevQuizStepRef.current === null) { prevQuizStepRef.current = step; return; }
    if (prevQuizStepRef.current === step) return;
    prevQuizStepRef.current = step;
    // poll (出題カウントダウン) は出題クイズの countdown_seconds 別SE。
    // 一致する秒数の音源が無ければ rankStart=null のSEにフォールバック。
    let variant: number | null = null;
    if (step === 'poll') {
      const q = data?.quizzes.find((x) => x.id === cue.currentQuizId);
      if (q) variant = q.countdown_seconds;
    }
    play('quiz', step, variant);
  }, [cue.step, cue.currentQuizId, audioOn, data, play]);

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
    if (withBg) {
      // 背景あり: body を不透明 (黒) に
      document.body.style.background = '#000';
      return () => { document.body.style.background = ''; };
    }
    document.body.setAttribute('data-output-transparent', '');
    document.body.style.background = 'transparent';
    return () => {
      document.body.removeAttribute('data-output-transparent');
      document.body.style.background = '';
    };
  }, [withBg]);

  if (!data) return null;
  const currentQuiz = data.quizzes.find((q) => q.id === cue.currentQuizId) ?? null;
  if (!currentQuiz) return null;

  // 投票数の正本:
  //   - Interactive 連携クイズ: poller の liveVotes (リアルタイム) を DB 値に重ねる。
  //   - 手入力 (非連携) クイズ: DB の vote_count (quiz_choices) のみ。
  // ※ liveVotes は poll 開始時のリセット (全0) でも飛んでくるため、非連携クイズでこれを
  //   無条件にマージすると「手入力した DB 値を 0 で上書き」してしまう (出力に反映されない不具合)。
  //   連携クイズのときだけ liveVotes を適用する。
  const isLinked = !!(currentQuiz as { interactive_question_id?: string | null }).interactive_question_id;
  const baseVotes = Object.fromEntries(currentQuiz.choices.map((c) => [c.position, c.vote_count]));
  const votes = isLinked && liveVotes && liveVotes.quizId === currentQuiz.id
    ? { ...baseVotes, ...liveVotes.votes }
    : baseVotes;

  return (
    <div ref={wrapRef} style={{ position: 'fixed', inset: 0, background: withBg ? '#000' : 'transparent' }}>
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
            transparent={!withBg}
            lang={lang}
          />
        </div>
      </div>
    </div>
  );
}
