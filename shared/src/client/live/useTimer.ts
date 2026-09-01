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
import type { Socket } from 'socket.io-client';
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
  // useRef の初期化式は描画のたびに評価される (React が保持するのは初回の値だけ) ため、
  // 接続が確立する前の描画ごとに新しいソケットが作られて漏れる。初回の描画でだけ生成する
  const socketRef = useRef<Socket | null>(null);
  if (socketRef.current === null) socketRef.current = getLiveopsSocket();

  useEffect(() => {
    if (!timerId) return;
    const socket = socketRef.current;
    if (!socket) return;
    // 再接続するとサーバー側の room 加入は消えるため、接続のたびに join し直す
    // (未接続時の emit はバッファされるので、初回接続前の join もこれで届く)
    const join = () => socket.emit('timer:join', { timerId });
    join();
    socket.on('connect', join);
    const onState = (s: TimerState) => {
      if (s.id === timerId) setState(s);
    };
    socket.on('state', onState);
    // ハンドラを名指しで外す — 引数なしの off('state') は共有シングルトン上の
    // 他のリスナーまで全部外してしまう
    return () => {
      socket.off('connect', join);
      socket.off('state', onState);
    };
  }, [timerId]);

  const setTime = useCallback((seconds: number) => {
    if (!timerId) return;
    socketRef.current?.emit('timer:set', { timerId, seconds });
  }, [timerId]);

  const start = useCallback(() => {
    if (!timerId) return;
    socketRef.current?.emit('timer:start', { timerId });
  }, [timerId]);

  const stop = useCallback(() => {
    if (!timerId) return;
    socketRef.current?.emit('timer:stop', { timerId });
  }, [timerId]);

  const reset = useCallback(() => {
    if (!timerId) return;
    socketRef.current?.emit('timer:reset', { timerId });
  }, [timerId]);

  const adjust = useCallback((deltaSeconds: number) => {
    if (!timerId) return;
    socketRef.current?.emit('timer:adjust', { timerId, deltaSeconds });
  }, [timerId]);

  return { state, setTime, start, stop, reset, adjust };
}
