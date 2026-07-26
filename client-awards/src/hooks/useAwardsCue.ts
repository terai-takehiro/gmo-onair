import { useEffect, useRef, useCallback, useState } from 'react';
import { useAwardsStore, DEFAULT_CUE } from '@/cg/useStore';
import { getAwardsSocket, acquireAwardsSocket, disconnectAwardsSocket } from '@/lib/socket';
import { updateServerOffsetFromTimestamp } from '@/lib/serverClock';
import type { CgStep, OneshotStyle, CgCueState, VoteDisplay } from '@/cg/types';

interface CuePayload {
  step?: CgStep;
  categoryId?: number | null;
  oneshotStyle?: OneshotStyle;
  voteDisplay?: VoteDisplay;
  pollStartedAt?: number | null;
  revealPhase?: 0 | 1 | 2;
  winnerEntryId?: number | null;
  scrimOpacity?: number;
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
    winnerEntryId: data.winnerEntryId ?? null,
    scrimOpacity: data.scrimOpacity ?? 0.72,
  };
}

export function useAwardsCue(eventId: number | null) {
  // 欲しいものだけを見る。以前は `useAwardsStore()` を引数なしで呼んでいたため
  // **ストア全体**を見ていて、部門一覧やアンケート票数が変わるたびに
  // (票数は 3 秒ごとに来る) このフックを使う画面が全部描き直されていた。
  const cue = useAwardsStore((s) => s.cue);
  const setCue = useAwardsStore((s) => s.setCue);
  const cueRef = useRef(cue);
  cueRef.current = cue;

  useEffect(() => {
    if (!eventId) return;
    const socket = acquireAwardsSocket(eventId);

    const onSync = (data: CuePayload) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      setCue(normalizeCue(data));
    };
    socket.on('cue:sync', onSync);

    return () => {
      // 自分が張った受け口だけを外す。以前は `off('cue:sync')` と書いていたため
      // **他の画面が張った受け口まで消していた** (同じ接続を共有している)。
      socket.off('cue:sync', onSync);
      disconnectAwardsSocket(eventId);
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
