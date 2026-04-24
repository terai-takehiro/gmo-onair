import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { formatTimer, formatCount } from '@/lib/utils';
import { type TimerPhase } from '@/hooks/useTimer';
import api from '@/lib/api';
import { Settings, X } from 'lucide-react';

const phaseLabels: Record<TimerPhase, string> = {
  idle: '---',
  countdown: 'COUNTDOWN',
  yellow: 'WARNING',
  red: "TIME'S UP",
};

interface Counts { youtube: number; jstream: number; total: number }
interface Toggles {
  youtube: boolean;
  jstream: boolean;
  total: boolean;
  showTimer: boolean;
}

const VIEWER_ITEMS: { key: 'youtube' | 'jstream' | 'total'; label: string; color: string }[] = [
  { key: 'youtube', label: 'YouTube', color: '#ef4444' },
  { key: 'jstream', label: 'Jstream', color: '#06b6d4' },
  { key: 'total',   label: '合計',    color: '#a855f7' },
];

export default function TimerDisplayPage() {
  const { timerId } = useParams<{ timerId: string }>();
  const [searchParams] = useSearchParams();

  const storageKey = `lv_display_${timerId}`;
  const [toggles, setToggles] = useState<Toggles>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      return {
        youtube:   s.youtube   ?? false,
        jstream:   s.jstream   ?? false,
        total:     s.total     ?? false,
        showTimer: s.showTimer ?? true,
      };
    } catch {
      return { youtube: false, jstream: false, total: false, showTimer: true };
    }
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [programId, setProgramId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({ youtube: 0, jstream: 0, total: 0 });

  const { state } = useTimer(timerId ?? null);
  const phase = state?.phase ?? 'idle';
  const remainingMs = state?.remainingMs ?? 0;
  const display = state ? formatTimer(remainingMs) : '--:--';

  useEffect(() => {
    const urlProgram = searchParams.get('programId');
    if (urlProgram) { setProgramId(urlProgram); return; }
    if (!timerId) return;
    api.get(`/liveops/timers/${timerId}`)
      .then(r => {
        const t = r.data.data;
        setProgramId(t.viewer_overlay_program_id ?? t.program_id ?? null);
      })
      .catch(() => {});
    // searchParams object 参照は毎回変わるため、文字列値だけを deps にして無限ループを防ぐ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerId, searchParams.get('programId')]);

  useEffect(() => {
    if (!programId) return;
    const poll = async () => {
      try {
        const r = await api.get(`/liveops/snapshots/${programId}?limit=1`);
        const s = r.data.data?.[0];
        if (s) setCounts({ youtube: s.youtube_count, jstream: s.jstream_count, total: s.total_count });
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => clearInterval(id);
  }, [programId]);

  const setToggle = (key: keyof Toggles, val: boolean) => {
    const next = { ...toggles, [key]: val };
    setToggles(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const visibleItems = VIEWER_ITEMS.filter(item => toggles[item.key]);
  const showOverlay = !!programId && visibleItems.length > 0;
  const viewerOnly = !toggles.showTimer;

  return (
    <div
      className="relative flex h-screen w-screen flex-col items-center justify-center select-none bg-black overflow-hidden"
      onClick={() => settingsOpen && setSettingsOpen(false)}
    >
      {/* Timer (hidden in viewer-only mode) */}
      {!viewerOnly && (
        <>
          <div className={`timer-display-font ${timerColor(phase)}`}>
            {display}
          </div>
          <div className={`timer-status-font mt-4 ${statusColor(phase)}`}>
            {phaseLabels[phase]}
          </div>
        </>
      )}

      {/* Viewer count display */}
      {showOverlay && (
        viewerOnly ? (
          /* Viewer-only: large centered counts */
          <div className="flex items-center gap-12">
            {visibleItems.map(({ key, label, color }) => (
              <div key={key} className="text-center text-white">
                <div className="text-sm font-semibold mb-2" style={{ color }}>{label}</div>
                <div className="text-7xl font-bold tabular-nums leading-none">
                  {formatCount(counts[key])}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Timer + viewer: bar at bottom */
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-8 rounded-2xl bg-black/50 backdrop-blur-md px-8 py-3 border border-white/10">
            {visibleItems.map(({ key, label, color }) => (
              <div key={key} className="text-center text-white">
                <div className="text-xs font-semibold mb-0.5" style={{ color }}>{label}</div>
                <div className="text-3xl font-bold tabular-nums leading-none">
                  {formatCount(counts[key])}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Settings toggle button */}
      <button
        onClick={e => { e.stopPropagation(); setSettingsOpen(v => !v); }}
        className="absolute bottom-4 right-4 p-2 rounded-full text-white/30 hover:text-white/70 hover:bg-white/10 transition-all"
        title="表示設定"
      >
        {settingsOpen ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
      </button>

      {/* Settings panel */}
      {settingsOpen && (
        <div
          className="absolute bottom-14 right-4 bg-neutral-900/95 backdrop-blur-sm border border-white/10 rounded-2xl p-4 text-white shadow-2xl min-w-[200px]"
          onClick={e => e.stopPropagation()}
        >
          {/* Timer visibility */}
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
            タイマー表示
          </p>
          <button
            onClick={() => setToggle('showTimer', !toggles.showTimer)}
            className="flex items-center justify-between w-full py-1.5 px-1 rounded-lg hover:bg-white/5 transition-colors mb-4"
          >
            <span className={`text-sm ${toggles.showTimer ? 'text-white' : 'text-white/40'}`}>
              タイマーを表示
            </span>
            <div className={`relative w-9 h-5 rounded-full transition-colors ${toggles.showTimer ? 'bg-primary' : 'bg-white/20'}`}>
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-transform ${toggles.showTimer ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
          </button>

          {/* Viewer count toggles */}
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
            視聴者カウント
          </p>
          <div className="space-y-2">
            {VIEWER_ITEMS.map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setToggle(key, !toggles[key])}
                className="flex items-center justify-between w-full py-1.5 px-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className={`text-sm ${toggles[key] ? 'text-white' : 'text-white/40'}`}>
                    {label}
                  </span>
                </div>
                <div className={`relative w-9 h-5 rounded-full transition-colors ${toggles[key] ? 'bg-primary' : 'bg-white/20'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow transition-transform ${toggles[key] ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
              </button>
            ))}
          </div>
          {!programId && (
            <p className="text-[10px] text-white/30 mt-3 pt-3 border-t border-white/10">
              ※ このタイマーに番組が紐づいていません
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function timerColor(phase: TimerPhase) {
  if (phase === 'yellow') return 'text-amber-400';
  if (phase === 'red') return 'text-red-500 phase-red';
  return 'text-white';
}

function statusColor(phase: TimerPhase) {
  if (phase === 'yellow') return 'text-amber-400/60';
  if (phase === 'red') return 'text-red-400/60';
  return 'text-white/40';
}
