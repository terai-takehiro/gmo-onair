import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTimer } from '@/hooks/useTimer';
import { formatTimer, formatCount } from '@/lib/utils';
import { type TimerPhase } from '@/hooks/useTimer';
import { Settings, X } from 'lucide-react';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';

// ⚠️ この画面は本番中に会場モニター・OBS が読む公開URL (/live/display/:timerId)。
// 見た目だけを v4 に作り直す — URL・API・Socket 契約は1文字も変えない。

const phaseBarColors: Record<TimerPhase, string> = {
  idle: 'rgba(128,128,128,0.35)',
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
  lightBase: boolean;
}

const VIEWER_ITEMS: { key: 'youtube' | 'jstream' | 'zoom' | 'teams' | 'total'; label: string; color: string }[] = [
  { key: 'youtube', label: 'YouTube', color: '#ef4444' },
  { key: 'jstream', label: 'Jstream', color: '#06b6d4' },
  { key: 'zoom',    label: 'Zoom',    color: '#2D8CFF' },
  { key: 'teams',   label: 'Teams',   color: '#6264A7' },
  { key: 'total',   label: '合計',    color: '#a855f7' },
];

const PLATFORM_ITEMS = VIEWER_ITEMS.filter(i => i.key !== 'total') as
  { key: 'youtube' | 'jstream' | 'zoom' | 'teams'; label: string; color: string }[];

/** 「● 視聴者数」見出し (赤ドットは点滅) */
function ViewerHeader() {
  return (
    <div className="flex items-center justify-center gap-[0.7vw]">
      <span
        className="live-dot shrink-0"
        style={{ width: 'max(9px, 0.8vw)', height: 'max(9px, 0.8vw)' }}
        aria-hidden="true"
      />
      <span className="viewer-header-ja">視聴者数</span>
    </div>
  );
}

/** プラットフォーム別カウント: 見出し + 数字を横並びで1行 (v4 の Display モックと同じ並び) */
function ViewerRows({ items, counts, labelClass, valueClass, gapClass }: {
  items: typeof PLATFORM_ITEMS;
  counts: Counts;
  labelClass: string;
  valueClass: string;
  gapClass: string;
}) {
  return (
    <div className={`flex flex-col items-start ${gapClass}`}>
      {items.map(({ key, label, color }) => (
        <div key={key} className="flex items-baseline gap-[0.9vw]">
          <span className={labelClass} style={{ color }}>{label}</span>
          <span className={`${valueClass} tabular-nums`} style={{ color }}>{formatCount(counts[key])}</span>
        </div>
      ))}
    </div>
  );
}

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
        lightBase: s.lightBase ?? false,
      };
    } catch {
      return { youtube: false, jstream: false, zoom: false, teams: false, total: false, showTimer: true, lightBase: false };
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

  const light = toggles.lightBase;
  const platformItems = PLATFORM_ITEMS.filter(item => toggles[item.key]);
  const showTotal = toggles.total;
  const anyViewerOn = platformItems.length > 0 || showTotal;
  const showViewers = !!programId && anyViewerOn;
  const viewerOnly = !toggles.showTimer;
  // タイマー + 視聴者数 → 横並び 6:4 (縦長画面は上下積み)
  const splitMode = !viewerOnly && showViewers;

  const baseFg = light ? 'text-[#1a1d24]' : 'text-white';
  const dimText = light ? 'text-black/50' : 'text-white/50';
  const lineColor = light ? 'border-black/10' : 'border-white/10';

  const timerBlock = (fontClass: string) => (
    <>
      <div className={`${fontClass} ${timerColor(phase, light)} ${phase === 'red' ? 'timer-glow-red' : ''}`}>
        {display}
      </div>
      {totalSeconds > 0 && phase !== 'idle' && (
        <div className={`timer-set-font mt-[1.8vh] flex items-center gap-[0.7vw] ${dimText}`}>
          {state?.running && (
            <span
              className="live-dot shrink-0"
              style={{ width: 'max(8px, 0.6vw)', height: 'max(8px, 0.6vw)', background: phaseBarColors[phase] }}
              aria-hidden="true"
            />
          )}
          <span className="tabular-nums">設定 {formatTimer(totalSeconds * 1000)}</span>
        </div>
      )}
    </>
  );

  return (
    <div
      className={`relative flex h-screen w-screen flex-col items-center justify-center select-none overflow-hidden ${light ? 'bg-[#fafafa]' : 'bg-black'} ${baseFg}`}
      onClick={() => settingsOpen && setSettingsOpen(false)}
    >
      {/* フェーズ別バックドロップ (WARNING/TIME'S UP で背景がうっすら色づく) */}
      {!viewerOnly && phase === 'yellow' && <div className="timer-backdrop timer-backdrop-yellow" />}
      {!viewerOnly && phase === 'red' && <div className="timer-backdrop timer-backdrop-red" />}

      {viewerOnly ? (
        /* ── 視聴者数のみ: 見出し + 合計主役 + 内訳 (見出し+数字を横並びで1行ずつ) ── */
        showViewers && (
          <div className="relative flex flex-col items-center justify-center gap-[4vh] px-[4vw]">
            <ViewerHeader />
            {showTotal && (
              <div className="text-center">
                <div className="viewer-only-total-count">{formatCount(counts.total)}</div>
                <div className="viewer-total-label mt-[1vh]">合計</div>
              </div>
            )}
            {platformItems.length > 0 && (
              <ViewerRows
                items={platformItems}
                counts={counts}
                gapClass={showTotal ? 'gap-[1.6vh]' : 'gap-[2.4vh]'}
                labelClass={showTotal ? 'viewer-row-label' : 'viewer-hero-label'}
                valueClass={showTotal ? 'viewer-break-count' : 'viewer-hero-count'}
              />
            )}
          </div>
        )
      ) : splitMode ? (
        /* ── 横並び 6:4 (タイマー : 視聴者数)。縦長画面は上下積み ── */
        <div className="relative flex h-full w-full flex-col landscape:flex-row">
          <div className="flex flex-1 flex-col items-center justify-center pb-[2vh] landscape:w-[60%] landscape:flex-none landscape:flex-initial">
            {timerBlock('split-timer-font')}
          </div>
          <div className={`flex flex-col items-center justify-center border-t px-[3vw] pb-[3vh] pt-[2vh] text-center landscape:w-[40%] landscape:border-t-0 landscape:border-l landscape:px-[2.2vw] landscape:pt-0 ${lineColor}`}>
            <ViewerHeader />
            {showTotal && (
              <div className="mt-[2.6vh]">
                <div className="viewer-total-count tabular-nums">{formatCount(counts.total)}</div>
                <div className="viewer-total-label mt-[1vh]">合計</div>
              </div>
            )}
            {showTotal && platformItems.length > 0 && (
              <div className={`my-[2.6vh] w-full border-t ${lineColor}`} aria-hidden="true" />
            )}
            {platformItems.length > 0 && (
              <ViewerRows
                items={platformItems}
                counts={counts}
                gapClass={`${!showTotal ? 'mt-[3vh] ' : ''}gap-[1.4vh]`}
                labelClass="viewer-row-label"
                valueClass="viewer-cell-count"
              />
            )}
          </div>
        </div>
      ) : (
        /* ── タイマーのみ: 画面中央フル表示 ── */
        <div className="relative flex flex-col items-center">
          {timerBlock('timer-display-font')}
        </div>
      )}

      {/* 画面下端の残り時間プログレスバー */}
      {!viewerOnly && progress != null && (
        <div className={`absolute inset-x-0 bottom-0 h-2 ${light ? 'bg-black/10' : 'bg-white/10'}`} aria-hidden="true">
          <div
            className="h-full timer-progress-fill"
            style={{ width: `${progress * 100}%`, backgroundColor: phaseBarColors[phase] }}
          />
        </div>
      )}

      {/* Settings toggle button */}
      <button
        onClick={e => { e.stopPropagation(); setSettingsOpen(v => !v); }}
        className={`absolute bottom-4 right-4 p-2 rounded-full transition-all hover:bg-[rgba(127,127,127,0.18)] ${light ? 'text-black/30 hover:text-black/70' : 'text-white/30 hover:text-white/70'}`}
        title="表示設定"
      >
        {settingsOpen ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
      </button>

      {/* Settings panel */}
      {settingsOpen && (
        <div
          className="absolute bottom-16 right-4 z-10 w-[290px] rounded-[15px] border border-white/10 bg-[rgba(22,24,29,0.92)] p-3.5 text-white shadow-[0_20px_44px_-18px_rgba(0,0,0,0.7)] backdrop-blur-[18px]"
          onClick={e => e.stopPropagation()}
        >
          {/* 表示モード */}
          <p className="text-[10px] font-bold text-white/45 tracking-wide mb-2.5">
            表示
          </p>
          <div className="flex items-center justify-between w-full py-1.5 px-1">
            <span className={`text-sm ${toggles.showTimer ? 'text-white' : 'text-white/40'}`}>
              タイマーを表示
            </span>
            <Switch
              checked={toggles.showTimer}
              onCheckedChange={(v) => setToggle('showTimer', !!v)}
              className="data-[state=unchecked]:bg-white/20"
            />
          </div>
          <div className="flex items-center justify-between w-full py-1.5 px-1 mb-3.5">
            <span className={`text-sm ${toggles.lightBase ? 'text-white' : 'text-white/40'}`}>
              白ベースで表示
            </span>
            <Switch
              checked={toggles.lightBase}
              onCheckedChange={(v) => setToggle('lightBase', !!v)}
              className="data-[state=unchecked]:bg-white/20"
            />
          </div>

          {/* Viewer count toggles */}
          <div className="border-t border-white/10 pt-3">
            <p className="text-[10px] font-bold text-white/45 tracking-wide mb-2.5">
              視聴者カウント
            </p>
            <div className="space-y-1">
              {VIEWER_ITEMS.map(({ key, label, color }) => (
                <div
                  key={key}
                  className="flex items-center justify-between w-full py-1.5 px-1"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
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
          </div>

          <div className="mt-3.5 border-t border-white/10 pt-2.5">
            <p className="text-[10px] leading-relaxed text-white/45">
              この設定は<strong className="font-bold">この端末にだけ</strong>覚えます。／
              数字は運用の画面が取得したものを読みます。
            </p>
            {!programId && (
              <p className="mt-1.5 text-[10px] text-white/30">※ このタイマーに番組が紐づいていません</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function timerColor(phase: TimerPhase, light: boolean) {
  if (phase === 'yellow') return light ? 'text-amber-600' : 'text-amber-400';
  if (phase === 'red') return 'text-red-500 phase-red';
  return light ? 'text-[#1a1d24]' : 'text-white';
}
