import { useEffect, useRef, useState, useCallback } from 'react';
import { createSocketPool } from '@gmo-onair/shared/src/client/socketPool';
import type { QuizStackCue, QuizStep } from './types';
import { updateServerOffsetFromTimestamp } from '@/lib/serverClock';

// イベント 1 件につき接続 1 本。**なぜ「つながっていなければ作り直す」形を
// やめたかは shared/src/client/socketPool.ts の冒頭に書いてある。**
// ここでは `sendCue` が毎回接続を取り出すので、**操作そのものが受け口を壊し**、
// 本番中に票数と進行の表示だけが止まる形になっていた。
const pool = createSocketPool<number>({
  namespace: '/quiz',
  exclusive: true,
  options: (eventId) => ({
    query: { stackEventId: String(eventId) },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  }),
});
const getStackSocket = (eventId: number) => pool.get(eventId);

const DEFAULT = (id: number): QuizStackCue => ({
  eventId: id, currentQuizId: null, step: 'idle', pollStartedAt: null, revealPhase: 0,
});

export function useQuizStackSocket(eventId: number | null) {
  const [cue, setCue] = useState<QuizStackCue>(() => DEFAULT(eventId ?? 0));
  // v2.9.24: Interactive (別 VPS) poller からのリアルタイム投票数。
  // { quizId, votes: {position: count} }。cue とは独立に保持し、出力側でマージする。
  const [liveVotes, setLiveVotes] = useState<{ quizId: number; votes: Record<number, number> } | null>(null);
  // v2.9.64: NEXT (送出予約) の quiz。operator が選択 → NEXT 出力 URL に反映。
  const [nextQuizId, setNextQuizIdState] = useState<number | null>(null);
  const cueRef = useRef(cue);
  cueRef.current = cue;

  useEffect(() => {
    if (!eventId) return;
    setCue(DEFAULT(eventId));
    setLiveVotes(null);
    const sock = pool.acquire(eventId);
    const onSync = (data: QuizStackCue & { timestamp?: number }) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      setCue({
      eventId: data.eventId,
      currentQuizId: data.currentQuizId ?? null,
      step: data.step,
      pollStartedAt: data.pollStartedAt ?? null,
      revealPhase: (data.revealPhase ?? 0) as 0 | 1 | 2,
    });
    };
    const onVotes = (data: { quizId: number; votes: Record<number, number>; timestamp?: number }) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      if (data && typeof data.quizId === 'number') setLiveVotes({ quizId: data.quizId, votes: data.votes ?? {} });
    };
    const onNextSync = (data: { nextQuizId: number | null }) => {
      setNextQuizIdState(data?.nextQuizId ?? null);
    };
    sock.on('quizStack:sync', onSync);
    sock.on('quizStack:votes', onVotes);
    sock.on('quizStack:nextSync', onNextSync);
    return () => {
      sock.off('quizStack:sync', onSync);
      sock.off('quizStack:votes', onVotes);
      sock.off('quizStack:nextSync', onNextSync);
      // 借りたものを返すだけ。以前は無条件に切っていたので、
      // 同じ接続を使う別の画面 (クイズ本体) の同期も一緒に止まっていた。
      pool.release(eventId);
    };
  }, [eventId]);

  const sendCue = useCallback((partial: Partial<QuizStackCue> & { votes?: Record<number, number> }) => {
    if (!eventId) return;
    const next: QuizStackCue = {
      ...cueRef.current,
      ...{
        currentQuizId: partial.currentQuizId !== undefined ? partial.currentQuizId : cueRef.current.currentQuizId,
        step: partial.step ?? cueRef.current.step,
        pollStartedAt: partial.pollStartedAt !== undefined ? partial.pollStartedAt : cueRef.current.pollStartedAt,
        revealPhase: partial.revealPhase ?? cueRef.current.revealPhase,
      },
    };
    setCue(next);
    const sock = getStackSocket(eventId);
    sock.emit('quizStack:set', {
      currentQuizId: next.currentQuizId,
      step: next.step,
      pollStartedAt: next.pollStartedAt,
      revealPhase: next.revealPhase,
      votes: partial.votes,
    });
  }, [eventId]);

  const setStep = useCallback((step: QuizStep, extra?: Partial<QuizStackCue> & { votes?: Record<number, number> }) => {
    sendCue({ step, ...extra });
  }, [sendCue]);

  // NEXT (送出予約) の quiz を broadcast (NEXT 出力 URL 用)
  const sendNext = useCallback((id: number | null) => {
    if (!eventId) return;
    setNextQuizIdState(id);
    getStackSocket(eventId).emit('quizStack:nextSet', { nextQuizId: id });
  }, [eventId]);

  return { cue, sendCue, setStep, liveVotes, nextQuizId, sendNext };
}
