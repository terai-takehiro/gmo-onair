import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTimer } from '@/hooks/useTimer';
import { useViewer, type PlatformKey, type PlatformToggles, ALL_PLATFORMS_ON } from '@/hooks/useViewer';
import TimerDisplay from '@/components/timer/TimerDisplay';
import TimerControls from '@/components/timer/TimerControls';
import ViewerCard from '@/components/viewer/ViewerCard';
import ViewerChart from '@/components/viewer/ViewerChart';
import { Button } from '@/components/ui/button';
import { Play, Square, ExternalLink, AlertCircle, Timer } from 'lucide-react';

import { EmptyState } from '@gmo-onair/shared/src/client/states';

interface TimerData { id: string; name: string; phase: string }
interface Snapshot {
  captured_at: string;
  youtube_count: number;
  jstream_count: number;
  zoom_count: number;
  teams_count: number;
  total_count: number;
}

const PLATFORM_META: { key: PlatformKey; label: string; color: string }[] = [
  { key: 'youtube', label: 'YouTube', color: '#ff0000' },
  { key: 'jstream', label: 'Jstream', color: '#00b4d8' },
  { key: 'zoom',    label: 'Zoom',    color: '#2D8CFF' },
  { key: 'teams',   label: 'Teams',   color: '#6264A7' },
];

function loadToggles(programId: string | undefined): PlatformToggles {
  try {
    const s = JSON.parse(localStorage.getItem(`lv_dash_platforms_${programId}`) ?? '{}');
    return {
      youtube: s.youtube ?? true,
      jstream: s.jstream ?? true,
      zoom:    s.zoom    ?? true,
      teams:   s.teams   ?? true,
    };
  } catch {
    return { ...ALL_PLATFORMS_ON };
  }
}

export default function DashboardPage() {
  const { programId } = useParams<{ programId: string }>();

  // 取得・表示するプラットフォームのトグル (番組ごとに localStorage 保存)
  const [platformToggles, setPlatformToggles] = useState<PlatformToggles>(() => loadToggles(programId));
  const setToggle = (key: PlatformKey, val: boolean) => {
    const next = { ...platformToggles, [key]: val };
    setPlatformToggles(next);
    localStorage.setItem(`lv_dash_platforms_${programId}`, JSON.stringify(next));
  };

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data),
    enabled: !!programId,
    staleTime: 60_000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/liveops/settings').then(r => r.data.data),
  });

  const { data: timers = [] } = useQuery({
    queryKey: ['timers', programId],
    queryFn: () => api.get(`/liveops/timers?program_id=${programId}`).then(r => r.data.data as TimerData[]),
    enabled: !!programId,
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ['snapshots', programId],
    queryFn: () => api.get(`/liveops/snapshots/${programId}`).then(r => r.data.data as Snapshot[]),
    enabled: !!programId,
    refetchInterval: 15_000,
  });

  // Use first timer as the active timer for the dashboard
  const activeTimerId = timers[0]?.id ?? null;
  const timer = useTimer(activeTimerId);
  const viewer = useViewer(programId ?? null, settingsData?.pollingIntervalSec ?? 10, platformToggles);

  // どのプラットフォームが番組に設定済みか (未設定はトグル対象外)
  const configured: PlatformToggles = {
    youtube: (program?.youtube_urls?.length ?? 0) > 0,
    jstream: !!program?.jstream_lpid,
    zoom:    !!(program?.zoom_meeting_id || program?.zoom_webinar_id),
    teams:   !!program?.teams_meeting_url,
  };
  const isActive = (key: PlatformKey) => configured[key] && platformToggles[key];
  // 合計はトグル ON のプラットフォームのみ合算 (OFF 直後も即時に反映)
  const displayTotal = PLATFORM_META.reduce(
    (sum, { key }) => sum + (isActive(key) ? viewer.counts[key] : 0), 0
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h1 className="text-sm font-bold">ダッシュボード</h1>
        {activeTimerId && (
          <a
            href={`/live/display/${activeTimerId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />表示画面
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">

        {/* Timer panel */}
        {timers.length === 0 ? (
          <EmptyState
            icon={<Timer />}
            title="タイマーがありません"
            description="本番進行用のタイマーを登録しましょう。"
            action={
              <Link to={`/program/${programId}/timers`}>
                <Button size="sm" variant="outline">
                  <Timer className="h-4 w-4 mr-1.5" aria-hidden="true" />タイマーを追加
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timer</span>
                {timers.length > 1 && (
                  <span className="text-xs text-muted-foreground">— {timers[0].name}</span>
                )}
              </div>
              <Link to={`/program/${programId}/timers`}>
                <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground">管理</Button>
              </Link>
            </div>
            <div className="h-44 sm:h-52">
              <TimerDisplay state={timer.state} compact={false} />
            </div>
            <div className="p-3 sm:p-4 border-t border-border">
              <TimerControls
                state={timer.state}
                onSet={timer.setTime}
                onStart={timer.start}
                onStop={timer.stop}
                onReset={timer.reset}
                onAdjust={timer.adjust}
              />
            </div>
          </div>
        )}

        {/* Viewer panel */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Viewers</span>
              {viewer.counts.lastUpdated && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {viewer.counts.lastUpdated.toLocaleTimeString('ja-JP')}
                </span>
              )}
            </div>
            <Button
              variant={viewer.running ? 'destructive' : 'default'}
              size="sm"
              className="h-7 text-xs"
              onClick={viewer.running ? viewer.stopPolling : viewer.startPolling}
            >
              {viewer.running
                ? <><Square className="h-3 w-3 mr-1" />停止</>
                : <><Play className="h-3 w-3 mr-1" />開始</>}
            </Button>
          </div>

          {!settingsData?.hasYoutubeKey && !settingsData?.hasJstreamToken &&
           !settingsData?.hasZoomCredentials && !settingsData?.hasTeamsCredentials && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-warning/10 border border-warning/30 p-2.5 text-xs text-warning" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <Link to="/settings" className="underline">設定</Link>でAPIキーを登録してください
            </div>
          )}

          {/* プラットフォーム別 取得/表示トグル */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 sm:px-4 pt-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">取得対象</span>
            {PLATFORM_META.map(({ key, label, color }) => {
              const conf = configured[key];
              const on = platformToggles[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!conf}
                  onClick={() => setToggle(key, !on)}
                  aria-pressed={conf && on}
                  title={!conf ? `${label} は番組設定で未登録です` : on ? `${label} の取得を停止` : `${label} を取得対象にする`}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[28px] ${
                    !conf
                      ? 'opacity-35 cursor-not-allowed border-border text-muted-foreground'
                      : on
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-border text-muted-foreground hover:bg-accent line-through decoration-1'
                  }`}
                  style={conf && on ? { backgroundColor: color } : undefined}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: conf && on ? 'rgba(255,255,255,0.9)' : color }}
                  />
                  {label}
                  {!conf && <span className="text-[10px] font-normal">未設定</span>}
                </button>
              );
            })}
          </div>

          <div className="p-3 sm:p-4 space-y-2">
            {isActive('youtube') && (
              <ViewerCard
                label="YouTube"
                count={viewer.counts.youtube}
                color="#ff0000"
                sublabel={viewer.counts.ytDetails.map((d: any) => `${d.label}: ${d.count ?? '-'}`).join(' / ')}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              {isActive('jstream') && (
                <ViewerCard label="Jstream" count={viewer.counts.jstream} color="#00b4d8" />
              )}
              {isActive('zoom') && (
                <ViewerCard label="Zoom" count={viewer.counts.zoom} color="#2D8CFF" />
              )}
              {isActive('teams') && (
                <ViewerCard label="Teams" count={viewer.counts.teams} color="#6264A7" />
              )}
              <ViewerCard label="合計" count={displayTotal} color="#a855f7" />
            </div>
            {PLATFORM_META.every(({ key }) => !isActive(key)) && (
              <p className="text-xs text-muted-foreground">
                取得対象のプラットフォームがありません。上のトグルを ON にするか、番組設定で URL / ID を登録してください。
              </p>
            )}
          </div>
        </div>

        {/* Chart */}
        {snapshots.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">視聴者数推移</h2>
            <ViewerChart snapshots={snapshots} visible={platformToggles} />
          </div>
        )}

        {/* Log */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">ログ</h2>
          <div className="h-28 overflow-y-auto space-y-0.5 text-xs">
            {viewer.logs.length === 0 ? (
              <p className="text-muted-foreground">ログなし</p>
            ) : viewer.logs.map((log: any, i: number) => (
              <div key={i} className={log.type === 'error' ? 'text-destructive' : log.type === 'success' ? 'text-success' : 'text-muted-foreground'}>
                <span className="text-muted-foreground/60">{log.time.toLocaleTimeString('ja-JP')} </span>
                {log.message}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
