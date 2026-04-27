import { useEffect, useRef, useCallback } from 'react';
import { useAwardsStore } from '@/cg/useStore';
import { getAwardsSocket, disconnectAwardsSocket } from '@/lib/socket';
import type { CgStep, OneshotStyle } from '@/cg/types';

export function useAwardsCue(eventId: number | null) {
  const { cue, setCue } = useAwardsStore();
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    connectedRef.current = true;

    socket.on('cue:sync', (data: {
      step: CgStep;
      categoryId: number | null;
      oneshotStyle: OneshotStyle;
    }) => {
      setCue({
        step: data.step,
        categoryId: data.categoryId,
        oneshotStyle: data.oneshotStyle,
      });
    });

    return () => {
      socket.off('cue:sync');
      if (connectedRef.current) {
        disconnectAwardsSocket();
        connectedRef.current = false;
      }
    };
  }, [eventId, setCue]);

  const sendCue = useCallback((
    step: CgStep,
    categoryId?: number | null,
    oneshotStyle?: OneshotStyle,
  ) => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    const payload = {
      step,
      categoryId: categoryId ?? cue.categoryId,
      oneshotStyle: oneshotStyle ?? cue.oneshotStyle,
    };
    socket.emit('cue:set', payload);
    // Optimistic update
    setCue(payload);
  }, [eventId, cue, setCue]);

  return { cue, sendCue };
}
