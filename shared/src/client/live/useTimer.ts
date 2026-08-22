/**
 * 計時・視聴者（liveops）— タイマー1本を Socket.IO で操作する React フック。
 *
 * ⚠️ **`client-live/src/hooks/useTimer.ts`（表示画面 `TimerDisplayPage.tsx` 専用）の
 * 複製です。** ロジックは複製元と同一（イベント名 `timer:join`/`timer:set`/
 * `timer:start`/`timer:stop`/`timer:reset`/`timer:adjust`・受信イベント `state`）。
 * `docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` §4-2 参照。
 * 変えているのはこの説明コメントと、`socket.ts` の import 元だけです。
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { getLiveopsSocket } from './socket';

export type TimerPhase = 'idle' | 'countdown' | 'yellow' | 'red';

export interface TimerState {
  id: string;
  totalSeconds: number;
  remainingMs: number;
  running: boolean;
  phase: TimerPhase;
}

export function useTimer(timerId: string | null) {
  const [state, setState] = useState<TimerState | null>(null);
  const socketRef = useRef(getLiveopsSocket());

  useEffect(() => {
    if (!timerId) return;
    const socket = socketRef.current;
    socket.emit('timer:join', { timerId });
    socket.on('state', (s: TimerState) => {
      if (s.id === timerId) setState(s);
    });
    return () => { socket.off('state'); };
  }, [timerId]);

  const setTime = useCallback((seconds: number) => {
    if (!timerId) return;
    socketRef.current.emit('timer:set', { timerId, seconds });
  }, [timerId]);

  const start = useCallback(() => {
    if (!timerId) return;
    socketRef.current.emit('timer:start', { timerId });
  }, [timerId]);

  const stop = useCallback(() => {
    if (!timerId) return;
    socketRef.current.emit('timer:stop', { timerId });
  }, [timerId]);

  const reset = useCallback(() => {
    if (!timerId) return;
    socketRef.current.emit('timer:reset', { timerId });
  }, [timerId]);

  const adjust = useCallback((deltaSeconds: number) => {
    if (!timerId) return;
    socketRef.current.emit('timer:adjust', { timerId, deltaSeconds });
  }, [timerId]);

  return { state, setTime, start, stop, reset, adjust };
}
