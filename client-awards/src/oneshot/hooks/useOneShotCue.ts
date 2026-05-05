import { useCallback, useEffect, useRef, useState } from 'react';
import { getAwardsSocket, disconnectAwardsSocket } from '@/lib/socket';
import type { OneShotCueState } from '../types';

const DEFAULT_CUE: OneShotCueState = {
  entryId: null,
  moduleKey: 'none',
  tickerOn: false,
  tickerCatIdx: 0,
  transparent: false,
  lang: 'ja',
  isLive: false,
  showPortrait: true,
  bilingual: false,
};

interface SyncPayload extends OneShotCueState {
  timestamp?: number;
}

// Mirror of useAwardsCue, but for the 1S CG channel (oneshot:set / oneshot:sync).
// The same /awards namespace + room is reused — events are namespaced by name.
export function useOneShotCue(eventId: number | null) {
  const [cue, setCueState] = useState<OneShotCueState>(DEFAULT_CUE);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    connectedRef.current = true;

    const onSync = (data: SyncPayload) => {
      setCueState({
        entryId: data.entryId ?? null,
        moduleKey: data.moduleKey ?? 'none',
        tickerOn: !!data.tickerOn,
        tickerCatIdx: data.tickerCatIdx ?? 0,
        transparent: !!data.transparent,
        lang: data.lang === 'en' ? 'en' : 'ja',
        isLive: !!data.isLive,
        showPortrait: data.showPortrait ?? true,
        bilingual: !!data.bilingual,
      });
    };
    socket.on('oneshot:sync', onSync);

    return () => {
      socket.off('oneshot:sync', onSync);
      if (connectedRef.current) {
        // Note: do NOT call disconnectAwardsSocket here unconditionally —
        // ranking CG (useAwardsCue) may still be using the same socket.
        // Each hook is responsible for its own listeners only.
        connectedRef.current = false;
      }
    };
  }, [eventId]);

  const sendCue = useCallback(
    (patch: Partial<OneShotCueState>) => {
      if (!eventId) return;
      const socket = getAwardsSocket(eventId);
      const next: OneShotCueState = { ...cue, ...patch };
      socket.emit('oneshot:set', next);
      setCueState(next);
    },
    [eventId, cue]
  );

  return { cue, sendCue };
}

export { DEFAULT_CUE };
// Avoid linter unused warning; callers may want to disconnect on unmount of
// the entire app surface (operator/output) — kept here for explicit access.
export { disconnectAwardsSocket };
