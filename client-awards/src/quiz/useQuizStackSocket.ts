import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import type { QuizStackCue, QuizStep } from './types';
import { updateServerOffsetFromTimestamp } from '@/lib/serverClock';

let socket: Socket | null = null;
let currentEventId: number | null = null;

function getStackSocket(eventId: number): Socket {
  if (socket && currentEventId === eventId && socket.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }
  currentEventId = eventId;
  socket = io('/quiz', {
    query: { stackEventId: String(eventId) },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return socket;
}

const DEFAULT = (id: number): QuizStackCue => ({
  eventId: id, currentQuizId: null, step: 'idle', pollStartedAt: null, revealPhase: 0,
  oneshotStyle: 'classic',
});

function normStyle(v: unknown): 'classic' | 'shards' | 'spotlight' | 'slit' {
  return v === 'shards' || v === 'spotlight' || v === 'slit' ? v : 'classic';
}

export function useQuizStackSocket(eventId: number | null) {
  const [cue, setCue] = useState<QuizStackCue>(() => DEFAULT(eventId ?? 0));
  // v2.9.24: Interactive (別 VPS) poller からのリアルタイム投票数。
  // { quizId, votes: {position: count} }。cue とは独立に保持し、出力側でマージする。
  const [liveVotes, setLiveVotes] = useState<{ quizId: number; votes: Record<number, number> } | null>(null);
  const cueRef = useRef(cue);
  cueRef.current = cue;

  useEffect(() => {
    if (!eventId) return;
    setCue(DEFAULT(eventId));
    setLiveVotes(null);
    const sock = getStackSocket(eventId);
    const onSync = (data: QuizStackCue & { timestamp?: number }) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      setCue({
      eventId: data.eventId,
      currentQuizId: data.currentQuizId ?? null,
      step: data.step,
      pollStartedAt: data.pollStartedAt ?? null,
      revealPhase: (data.revealPhase ?? 0) as 0 | 1 | 2,
      oneshotStyle: normStyle((data as { oneshotStyle?: unknown }).oneshotStyle),
    });
    };
    const onVotes = (data: { quizId: number; votes: Record<number, number>; timestamp?: number }) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      if (data && typeof data.quizId === 'number') setLiveVotes({ quizId: data.quizId, votes: data.votes ?? {} });
    };
    sock.on('quizStack:sync', onSync);
    sock.on('quizStack:votes', onVotes);
    return () => {
      sock.off('quizStack:sync', onSync);
      sock.off('quizStack:votes', onVotes);
      sock.disconnect();
      socket = null; currentEventId = null;
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
        oneshotStyle: partial.oneshotStyle ?? cueRef.current.oneshotStyle,
      },
    };
    setCue(next);
    const sock = getStackSocket(eventId);
    sock.emit('quizStack:set', {
      currentQuizId: next.currentQuizId,
      step: next.step,
      pollStartedAt: next.pollStartedAt,
      revealPhase: next.revealPhase,
      oneshotStyle: next.oneshotStyle,
      votes: partial.votes,
    });
  }, [eventId]);

  const setStep = useCallback((step: QuizStep, extra?: Partial<QuizStackCue> & { votes?: Record<number, number> }) => {
    sendCue({ step, ...extra });
  }, [sendCue]);

  return { cue, sendCue, setStep, liveVotes };
}
