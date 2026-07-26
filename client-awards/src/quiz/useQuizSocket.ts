import { useEffect, useRef, useState, useCallback } from 'react';
import { getQuizSocket, acquireQuizSocket, disconnectQuizSocket } from './socket';
import type { QuizCueState, QuizStep } from './types';

const DEFAULT_CUE = (id: number): QuizCueState => ({
  quizId: id, step: 'idle', pollStartedAt: null, revealPhase: 0, votes: {},
});

export function useQuizSocket(quizId: number | null) {
  const [cue, setCue] = useState<QuizCueState>(() => DEFAULT_CUE(quizId ?? 0));
  const cueRef = useRef(cue);
  cueRef.current = cue;

  useEffect(() => {
    if (!quizId) return;
    setCue(DEFAULT_CUE(quizId));
    const sock = acquireQuizSocket(quizId);
    const onSync = (data: QuizCueState) => {
      setCue({
        quizId: data.quizId,
        step: data.step,
        pollStartedAt: data.pollStartedAt ?? null,
        revealPhase: (data.revealPhase ?? 0) as 0 | 1 | 2,
        votes: data.votes ?? {},
      });
    };
    sock.on('quiz:sync', onSync);
    return () => {
      sock.off('quiz:sync', onSync);
      // 借りたものを返すだけ (最後の利用者が離れたときだけ実際に切れる)
      disconnectQuizSocket(quizId);
    };
  }, [quizId]);

  const sendCue = useCallback((partial: Partial<QuizCueState>) => {
    if (!quizId) return;
    const merged: QuizCueState = { ...cueRef.current, ...partial };
    setCue(merged);
    const sock = getQuizSocket(quizId);
    sock.emit('quiz:set', {
      step: merged.step,
      pollStartedAt: merged.pollStartedAt,
      revealPhase: merged.revealPhase,
      votes: partial.votes ?? undefined,
    });
  }, [quizId]);

  const setStep = useCallback((step: QuizStep, extra?: Partial<QuizCueState>) => {
    sendCue({ step, ...extra });
  }, [sendCue]);

  return { cue, sendCue, setStep };
}
