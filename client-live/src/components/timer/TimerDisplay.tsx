import { formatTimer } from '@/lib/utils';
import { type TimerState, type TimerPhase } from '@/hooks/useTimer';

const phaseLabels: Record<TimerPhase, string> = {
  idle: '---',
  countdown: 'COUNTDOWN',
  yellow: 'WARNING',
  red: "TIME'S UP",
};

interface Props {
  state: TimerState | null;
  compact?: boolean;
}

export default function TimerDisplay({ state, compact = false }: Props) {
  const phase = state?.phase ?? 'idle';
  const remainingMs = state?.remainingMs ?? 0;
  const display = state ? formatTimer(remainingMs) : '--:--';

  return (
    <div className={`phase-${phase} flex flex-col items-center justify-center transition-colors duration-500 ${compact ? 'rounded-xl p-4' : 'w-full h-full'}`}>
      <div className={compact ? 'text-4xl font-bold tabular-nums' : 'timer-display-font'}>
        {display}
      </div>
      <div className={compact ? 'text-sm mt-1 opacity-80 font-medium tracking-widest' : 'timer-status-font mt-2 opacity-80'}>
        {phaseLabels[phase]}
      </div>
    </div>
  );
}
