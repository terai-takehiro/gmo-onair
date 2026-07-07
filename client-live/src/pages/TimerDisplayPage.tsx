import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { formatTimer, formatCount } from '@/lib/utils';
import { type TimerPhase } from '@/hooks/useTimer';
import { Settings, X } from 'lucide-react';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';

const phaseLabels: Record<TimerPhase, string> = {
  idle: 'STANDBY',
  countdown: 'COUNTDOWN',
  yellow: 'WARNING',
  red: "TIME'S UP",
};

const phaseBarColors: Record<TimerPhase, string> = {
  idle: 'rgba(255,255,255,0.25)',
  countdown: '#16a34a',
  yellow: '#d97706',
  red: '#dc2626',
};

interface Counts { youtube: number; jstream: number; zoom: number; teams: number; total: number }
interface Toggles {
  youtube: boolean;
  jstream: boolean;
  zoom: boolean;
  teams: boolean;
  total: boolean;
  showTimer: boolean;
}

const VIEWER_ITEMS: { key: 'youtube' | 'jstream' | 'zoom' | 'teams' | 'total'; label: string; color: string }[] = [
  { key: 'youtube', label: 'YouTube', color: '#ef4444' },
  { key: 'jstream', label: 'Jstream', color: '#06b6d4' },
  { key: 'zoom',    label: 'Zoom',    color: '#2D8CFF' },
  { key: 'teams',   label: 'Teams',   color: '#6264A7' },
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
        zoom:      s.zoom      ?? false,
        teams:     s.teams     ?? false,
        total:     s.total     ?? false,
        showTimer: s.showTimer ?? true,
      };
    } catch {
      return { youtube: false, jstream: false, zoom: false, teams: false, total: false, showTimer: true };
    }
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [programId, setProgramId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Counts>({ youtube: 0, jstream: 0, zoom: 0, teams: 0, total: 0 });

  const { state } = useTimer(timerId ?? null);
  const phase = state?.phase ?? 'idle';
  const remainingMs = state?.remainingMs ?? 0;
  const totalSeconds = state?.totalSeconds ?? 0;
  const display = state ? formatTimer(remainingMs) : '--:--';
  const progress = state && phase !== 'idle' && totalSeconds > 0
    ? Math.min(1, Math.max(0, remainingMs / (totalSeconds * 1000)))
    : null;
  const overtime = phase === 'red' && remainingMs < 0;

  useEffect(() => {
    const urlProgram = searchParams.get('programId');
    if (urlProgram) { setProgramId(urlProgram); return; }
    if (!timerId) return;
    fetch(`/api/v1/internal/liveops/timers/${timerId}/display`)
      .then(r => r.json())
      .then(json => {
        const t = json.data;
        if (t) setProgramId(t.viewer_overlay_program_id ?? t.program_id ?? null);
      })
      .catch(() => {});
    // searchParams object 参照は毎回変わるため、文字列値だけを deps にして無限ループを防ぐ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerId, searchParams.get('programId')]);

  useEffect(() => {
    if (!programId) return;
    const poll = async () => {
      try {
        const r = await fetch(`/api/v1/internal/liveops/snapshots/${programId}/display`);
        const json = await r.json();
        const s = json.data?.[0];
        if (s) setCounts({
          youtube: s.youtube_count ?? 0,
          jstream: s.jstream_count ?? 0,
          zoom:    s.zoom_count    ?? 0,
          teams:   s.teams_count   ?? 0,
          total:   s.total_count   ?? 0,
        });
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
      {/* フェーズ別バックドロップ (WARNING/TIME'S UP で背景がうっすら色づく) */}
      {!viewerOnly && phase === 'yellow' && <div className="timer-backdrop timer-backdrop-yellow" />}
      {!viewerOnly && phase === 'red' && <div className="timer-backdrop timer-backdrop-red" />}

      {/* Timer (hidden in viewer-only mode) */}
      {!viewerOnly && (
        <>
          {/* 視聴者バー表示中はタイマーを少し上に寄せて干渉を防ぐ */}
          <div className={`relative flex flex-col items-center ${showOverlay ? 'mb-[12vh]' : ''}`}>
            <div className={`timer-display-font ${timerColor(phase)} ${phase === 'red' ? 'timer-glow-red' : ''}`}>
              {display}
            </div>
            <div className="mt-[1.5vh] flex items-center gap-[1.5vw]">
              <span className={`timer-status-font ${statusColor(phase)}`}>
                {overtime ? 'OVERTIME' : phaseLabels[phase]}
              </span>
              {totalSeconds > 0 && phase !== 'idle' && (
                <span className="timer-set-font text-white/30">
                  / {formatTimer(totalSeconds * 1000)}
                </span>
              )}
            </div>
          </div>

          {/* 画面下端の残り時間プログレスバー */}
          {progress != null && (
            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/5" aria-hidden="true">
              <div
                className="h-full timer-progress-fill"
                style={{ width: `${progress * 100}%`, backgroundColor: phaseBarColors[phase] }}
              />
            </div>
          )}
        </>
      )}

      {/* Viewer count display */}
      {showOverlay && (
        viewerOnly ? (
          /* Viewer-only: large centered counts */
          <div className="flex flex-wrap items-center justify-center gap-x-[6vw] gap-y-[6vh] px-[4vw]">
            {visibleItems.map(({ key, label, color }) => (
              <div key={key} className="text-center text-white">
                <div className="viewer-hero-label" style={{ color }}>{label}</div>
                <div className="viewer-hero-count">
                  {formatCount(counts[key])}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Timer + viewer: bar at bottom */
          <div className="absolute bottom-[4vh] left-1/2 -translate-x-1/2 flex w-max max-w-[94vw] flex-wrap items-center justify-center gap-x-[3.5vw] gap-y-3 rounded-3xl bg-black/55 backdrop-blur-md px-[3vw] py-[1.8vh] border border-white/10">
            {visibleItems.map(({ key, label, color }) => (
              <div key={key} className="text-center text-white">
                <div className="viewer-bar-label" style={{ color }}>{label}</div>
                <div className="viewer-bar-count">
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
          <div className="flex items-center justify-between w-full py-1.5 px-1 mb-4">
            <span className={`text-sm ${toggles.showTimer ? 'text-white' : 'text-white/40'}`}>
              タイマーを表示
            </span>
            <Switch
              checked={toggles.showTimer}
              onCheckedChange={(v) => setToggle('showTimer', !!v)}
              className="data-[state=unchecked]:bg-white/20"
            />
          </div>

          {/* Viewer count toggles */}
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3">
            視聴者カウント
          </p>
          <div className="space-y-2">
            {VIEWER_ITEMS.map(({ key, label, color }) => (
              <div
                key={key}
                className="flex items-center justify-between w-full py-1.5 px-1"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className={`text-sm ${toggles[key] ? 'text-white' : 'text-white/40'}`}>
                    {label}
                  </span>
                </div>
                <Switch
                  checked={toggles[key]}
                  onCheckedChange={(v) => setToggle(key, !!v)}
                  className="data-[state=unchecked]:bg-white/20"
                />
              </div>
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
