import { useEffect, useRef, useState, useCallback } from 'react';
import { getPollSocket, disconnectPollSocket } from '@/lib/standalonePollSocket';
import type { StandalonePollState } from './types';
import { DEFAULT_POLL } from './types';

/** Operator + Output 兼用フック。 socket 経由で state を同期する。 */
export function useStandalonePoll(room: string | null) {
  const [state, setState] = useState<StandalonePollState>(DEFAULT_POLL);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!room) return;
    const sock = getPollSocket(room);
    const onSync = (data: StandalonePollState | null) => {
      if (!data) { setState(DEFAULT_POLL); return; }
      setState({
        ...DEFAULT_POLL,
        ...data,
        choices: Array.isArray(data.choices) && data.choices.length > 0
          ? data.choices.slice(0, 3)
          : DEFAULT_POLL.choices,
      });
    };
    sock.on('standalonePoll:sync', onSync);
    return () => {
      sock.off('standalonePoll:sync', onSync);
      disconnectPollSocket();
    };
  }, [room]);

  const update = useCallback((partial: Partial<StandalonePollState>) => {
    if (!room) return;
    const next: StandalonePollState = { ...stateRef.current, ...partial };
    setState(next);
    const sock = getPollSocket(room);
    sock.emit('standalonePoll:set', next);
  }, [room]);

  const clear = useCallback(() => {
    if (!room) return;
    setState(DEFAULT_POLL);
    const sock = getPollSocket(room);
    sock.emit('standalonePoll:clear');
  }, [room]);

  return { state, update, clear };
}
