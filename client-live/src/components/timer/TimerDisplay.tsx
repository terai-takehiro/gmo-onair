import { formatTimer } from '@/lib/utils';
import { type TimerState, type TimerPhase } from '@/hooks/useTimer';

const phaseBarColors: Record<TimerPhase, string> = {
  idle: 'rgb(var(--muted-foreground) / 0.35)',
  countdown: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
};

/** 残り時間の割合 (0〜1)。idle/未設定は null */
export function timerProgress(state: TimerState | null): number | null {
  if (!state || state.phase === 'idle' || state.totalSeconds <= 0) return null;
  return Math.min(1, Math.max(0, state.remainingMs / (state.totalSeconds * 1000)));
}

interface Props {
  state: TimerState | null;
  compact?: boolean;
}

export default function TimerDisplay({ state, compact = false }: Props) {
  const phase = state?.phase ?? 'idle';
  const remainingMs = state?.remainingMs ?? 0;
  const totalSeconds = state?.totalSeconds ?? 0;
  const display = state ? formatTimer(remainingMs) : '--:--';
  const progress = timerProgress(state);

  return (
    <div className={`phase-${phase} relative flex flex-col items-center justify-center overflow-hidden transition-colors duration-500 ${compact ? 'rounded-xl p-4' : 'w-full h-full pb-3'}`}>
      <div className={`${compact ? 'text-4xl font-bold tabular-nums' : 'timer-panel-font'} ${phase === 'red' ? 'timer-glow-red' : ''}`}>
        {display}
      </div>
      {totalSeconds > 0 && phase !== 'idle' && (
        <div className="flex items-center gap-2 mt-1.5">
          {state?.running && <span className="live-dot" aria-hidden="true" style={{ background: phaseBarColors[phase] }} />}
          <span className={`${compact ? 'text-sm' : 'text-xs sm:text-sm'} font-semibold opacity-50 tabular-nums`}>
            設定 {formatTimer(totalSeconds * 1000)}
          </span>
        </div>
      )}

      {/* 残り時間プログレスバー */}
      {progress != null && (
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-foreground/10 overflow-hidden" aria-hidden="true">
          <div
            className="h-full timer-progress-fill"
            style={{ width: `${progress * 100}%`, backgroundColor: phaseBarColors[phase] }}
          />
        </div>
      )}
    </div>
  );
}
