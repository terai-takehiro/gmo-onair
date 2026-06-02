import { useEffect, useRef, useCallback, useState } from 'react';
import { useAwardsStore, DEFAULT_CUE } from '@/cg/useStore';
import { getAwardsSocket, disconnectAwardsSocket } from '@/lib/socket';
import { updateServerOffsetFromTimestamp } from '@/lib/serverClock';
import type { CgStep, OneshotStyle, CgCueState, VoteDisplay } from '@/cg/types';

interface CuePayload {
  step?: CgStep;
  categoryId?: number | null;
  oneshotStyle?: OneshotStyle;
  voteDisplay?: VoteDisplay;
  pollStartedAt?: number | null;
  revealPhase?: 0 | 1 | 2;
  timestamp?: number;
}

function normalizeCue(data: CuePayload): CgCueState {
  return {
    step: data.step ?? 'idle',
    categoryId: data.categoryId ?? null,
    oneshotStyle: data.oneshotStyle ?? 'classic',
    voteDisplay: data.voteDisplay ?? 'count',
    pollStartedAt: data.pollStartedAt ?? null,
    revealPhase: (data.revealPhase ?? 0) as 0 | 1 | 2,
  };
}

export function useAwardsCue(eventId: number | null) {
  const { cue, setCue } = useAwardsStore();
  const cueRef = useRef(cue);
  cueRef.current = cue;
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    connectedRef.current = true;

    socket.on('cue:sync', (data: CuePayload) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      setCue(normalizeCue(data));
    });

    return () => {
      socket.off('cue:sync');
      if (connectedRef.current) {
        disconnectAwardsSocket();
        connectedRef.current = false;
      }
    };
  }, [eventId, setCue]);

  const sendCue = useCallback((partial: Partial<CgCueState>) => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    const merged: CgCueState = { ...cueRef.current, ...partial };
    socket.emit('cue:set', merged);
    setCue(merged);
  }, [eventId, setCue]);

  const sendNextCue = useCallback((next: CgCueState) => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    socket.emit('cue:nextSet', next);
  }, [eventId]);

  return { cue, sendCue, sendNextCue };
}

// NEXT 出力 URL 用
export function useAwardsNextCue(eventId: number | null) {
  const [nextCue, setNextCue] = useState<CgCueState>({ ...DEFAULT_CUE });
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    connectedRef.current = true;

    const onSync = (data: CuePayload) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      setNextCue(normalizeCue(data));
    };
    socket.on('cue:nextSync', onSync);

    return () => {
      socket.off('cue:nextSync', onSync);
      if (connectedRef.current) {
        connectedRef.current = false;
      }
    };
  }, [eventId]);

  return { nextCue };
}
