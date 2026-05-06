import { useEffect, useRef, useCallback, useState } from 'react';
import { useAwardsStore } from '@/cg/useStore';
import { getAwardsSocket, disconnectAwardsSocket } from '@/lib/socket';
import type { CgStep, OneshotStyle, CgCueState } from '@/cg/types';

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

  // v2.8.98+: NEXT (送出予約) cue を broadcast。LIVE には反映せず operator+NEXT 出力 URL のみ同期。
  const sendNextCue = useCallback((next: CgCueState) => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    socket.emit('cue:nextSet', {
      step: next.step,
      categoryId: next.categoryId,
      oneshotStyle: next.oneshotStyle,
    });
  }, [eventId]);

  return { cue, sendCue, sendNextCue };
}

// v2.8.98+: NEXT 出力 URL 用 — broadcast された preview 状態を購読する。
export function useAwardsNextCue(eventId: number | null) {
  const [nextCue, setNextCue] = useState<CgCueState>({
    step: 'idle',
    categoryId: null,
    oneshotStyle: 'classic',
  });
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    connectedRef.current = true;

    const onSync = (data: {
      step: CgStep;
      categoryId: number | null;
      oneshotStyle: OneshotStyle;
    }) => {
      setNextCue({
        step: data.step,
        categoryId: data.categoryId,
        oneshotStyle: data.oneshotStyle,
      });
    };
    socket.on('cue:nextSync', onSync);

    return () => {
      socket.off('cue:nextSync', onSync);
      if (connectedRef.current) {
        // 他の useAwardsCue 利用者と socket を共有しているので disconnect しない
        connectedRef.current = false;
      }
    };
  }, [eventId]);

  return { nextCue };
}
