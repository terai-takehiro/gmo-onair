import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { formatTimer, formatCount } from '@/lib/utils';
import { type TimerPhase } from '@/hooks/useTimer';
import api from '@/lib/api';

const phaseLabels: Record<TimerPhase, string> = {
  idle: '---',
  countdown: 'COUNTDOWN',
  yellow: 'WARNING',
  red: "TIME'S UP",
};

interface Counts { youtube: number; jstream: number; total: number }

export default function TimerDisplayPage() {
  const { timerId } = useParams<{ timerId: string }>();
  const [searchParams] = useSearchParams();
  const overlayProgramId = searchParams.get('programId');
  const showOverlay = searchParams.get('overlay') === 'viewer' && !!overlayProgramId;

  const { state } = useTimer(timerId ?? null);
  const phase = state?.phase ?? 'idle';
  const remainingMs = state?.remainingMs ?? 0;
  const display = state ? formatTimer(remainingMs) : '--:--';

  const [counts, setCounts] = useState<Counts>({ youtube: 0, jstream: 0, total: 0 });

  useEffect(() => {
    if (!showOverlay || !overlayProgramId) return;
    const poll = async () => {
      try {
        const snaps = await api.get(`/liveops/snapshots/${overlayProgramId}?limit=1`);
        const s = snaps.data.data?.[0];
        if (s) setCounts({ youtube: s.youtube_count, jstream: s.jstream_count, total: s.total_count });
      } catch { /* ignore */ }
    };
    poll();
    const t = setInterval(poll, 15000);
    return () => clearInterval(t);
  }, [showOverlay, overlayProgramId]);

  return (
    <div className={`phase-${phase} flex h-screen w-screen flex-col items-center justify-center select-none`}>
      {/* Big timer */}
      <div className="timer-display-font">{display}</div>
      <div className="timer-status-font mt-4 opacity-70">{phaseLabels[phase]}</div>

      {/* Viewer overlay */}
      {showOverlay && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 rounded-full bg-black/40 backdrop-blur-sm px-6 py-2">
          <OverlayStat color="#ff0000" label="YouTube" value={counts.youtube} />
          <OverlayStat color="#00b4d8" label="Jstream" value={counts.jstream} />
          <OverlayStat color="#a855f7" label="合計" value={counts.total} />
        </div>
      )}
    </div>
  );
}

function OverlayStat({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="text-center text-white">
      <div className="text-xs opacity-70" style={{ color }}>{label}</div>
      <div className="text-2xl font-bold tabular-nums">{formatCount(value)}</div>
    </div>
  );
}
