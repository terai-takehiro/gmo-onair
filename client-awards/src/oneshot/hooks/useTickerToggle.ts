import { useCallback, useEffect, useRef, useState } from 'react';
import { TICKER_EXIT_MS } from '../animation/timings';

// Ticker on/off with In/Out CSS animation lifecycle (.t-enter / .t-exit).
export function useTickerToggle(initialOn = false) {
  const [on, setOn] = useState(initialOn);
  const [mounted, setMounted] = useState(initialOn);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, []);

  const turnOn = useCallback(() => {
    if (exitTimer.current) {
      clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    setExiting(false);
    setMounted(true);
    setOn(true);
  }, []);

  const turnOff = useCallback(() => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
    setOn(false);
    setExiting(true);
    exitTimer.current = setTimeout(() => {
      setMounted(false);
      setExiting(false);
      exitTimer.current = null;
    }, TICKER_EXIT_MS);
  }, []);

  const toggle = useCallback(() => {
    if (on) turnOff();
    else turnOn();
  }, [on, turnOn, turnOff]);

  return { on, mounted, exiting, turnOn, turnOff, toggle };
}
