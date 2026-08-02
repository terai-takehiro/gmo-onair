import { useCallback, useEffect, useRef, useState } from 'react';
import { getAwardsSocket, disconnectAwardsSocket } from '@/lib/socket';
import { updateServerOffsetFromTimestamp } from '@/lib/serverClock';
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
  countdownOn: false,
  countdownTarget: null,
  countdownPrefixJa: 'アワードまであと',
  countdownPrefixEn: 'Awards starts in',
  countdownX: 50,
  countdownY: 40,
  countdownScale: 1,
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
      updateServerOffsetFromTimestamp(data.timestamp);
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
        countdownOn: !!data.countdownOn,
        countdownTarget: data.countdownTarget ?? null,
        countdownPrefixJa: data.countdownPrefixJa ?? 'アワードまであと',
        countdownPrefixEn: data.countdownPrefixEn ?? 'Awards starts in',
        countdownX: typeof data.countdownX === 'number' ? data.countdownX : 50,
        countdownY: typeof data.countdownY === 'number' ? data.countdownY : 40,
        countdownScale: typeof data.countdownScale === 'number' ? data.countdownScale : 1,
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
      // v2.9.43: countdownTarget が変化したときは「operator の Date.now()」を
      // 同梱してサーバー側でサーバー時刻基準に正規化させる (時計ずれ対策)。
      const targetChanged =
        Object.prototype.hasOwnProperty.call(patch, 'countdownTarget') &&
        patch.countdownTarget !== cue.countdownTarget;
      const payload: OneShotCueState & { countdownTargetSetAt?: number } = targetChanged
        ? { ...next, countdownTargetSetAt: Date.now() }
        : next;
      socket.emit('oneshot:set', payload);
      setCueState(next);
    },
    [eventId, cue]
  );

  // v2.8.98+: NEXT (送出予約) state を broadcast。LIVE には反映せず operator+NEXT 出力 URL のみ同期。
  const sendNextCue = useCallback(
    (next: OneShotCueState) => {
      if (!eventId) return;
      const socket = getAwardsSocket(eventId);
      socket.emit('oneshot:nextSet', next);
    },
    [eventId]
  );

  return { cue, sendCue, sendNextCue };
}

// v2.8.98+: NEXT 出力 URL 用 — broadcast された preview 状態を購読する。
export function useOneShotNextCue(eventId: number | null) {
  const [nextCue, setNextCue] = useState<OneShotCueState>(DEFAULT_CUE);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!eventId) return;
    const socket = getAwardsSocket(eventId);
    connectedRef.current = true;

    const onSync = (data: SyncPayload) => {
      updateServerOffsetFromTimestamp(data.timestamp);
      setNextCue({
        entryId: data.entryId ?? null,
        moduleKey: data.moduleKey ?? 'none',
        tickerOn: !!data.tickerOn,
        tickerCatIdx: data.tickerCatIdx ?? 0,
        transparent: !!data.transparent,
        lang: data.lang === 'en' ? 'en' : 'ja',
        isLive: !!data.isLive,
        showPortrait: data.showPortrait ?? true,
        bilingual: !!data.bilingual,
        countdownOn: !!data.countdownOn,
        countdownTarget: data.countdownTarget ?? null,
        countdownPrefixJa: data.countdownPrefixJa ?? 'アワードまであと',
        countdownPrefixEn: data.countdownPrefixEn ?? 'Awards starts in',
        countdownX: typeof data.countdownX === 'number' ? data.countdownX : 50,
        countdownY: typeof data.countdownY === 'number' ? data.countdownY : 40,
        countdownScale: typeof data.countdownScale === 'number' ? data.countdownScale : 1,
      });
    };
    socket.on('oneshot:nextSync', onSync);

    return () => {
      socket.off('oneshot:nextSync', onSync);
      if (connectedRef.current) {
        connectedRef.current = false;
      }
    };
  }, [eventId]);

  return { nextCue };
}

export { DEFAULT_CUE };
// Avoid linter unused warning; callers may want to disconnect on unmount of
// the entire app surface (operator/output) — kept here for explicit access.
export { disconnectAwardsSocket };
