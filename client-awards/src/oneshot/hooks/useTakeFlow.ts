import { useCallback, useEffect, useRef, useState } from 'react';
import { LT_EXIT_MS } from '../animation/timings';

interface LiveSnapshot<T> {
  payload: T;
  takeSeq: number;
}

// Operator-side TAKE/CLEAR state machine: holds whatever is currently on-air,
// drives mount/exit lifecycle to play the .lt-enter / .lt-exit CSS animations,
// and exposes `take(payload)` / `clear()` callbacks to the operator UI.
export function useTakeFlow<T>(initial: T) {
  const [live, setLive] = useState<LiveSnapshot<T>>({ payload: initial, takeSeq: 0 });
  const [mounted, setMounted] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  const take = useCallback((payload: T) => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    setExiting(false);
    setLive((prev) => ({ payload, takeSeq: prev.takeSeq + 1 }));
    setMounted(true);
  }, []);

  const clear = useCallback(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setExiting(true);
    exitTimer.current = setTimeout(() => {
      setMounted(false);
      setExiting(false);
      exitTimer.current = null;
    }, LT_EXIT_MS);
  }, []);

  // For external sync (socket): instantly mount/unmount without playing exit
  const setExternal = useCallback((payload: T, isLive: boolean) => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    setLive((prev) => ({ payload, takeSeq: prev.takeSeq + 1 }));
    setMounted(isLive);
    setExiting(false);
  }, []);

  return {
    live: live.payload,
    takeSeq: live.takeSeq,
    mounted,
    exiting,
    take,
    clear,
    setExternal,
  };
}
