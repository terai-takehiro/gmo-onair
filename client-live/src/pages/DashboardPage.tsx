import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTimer } from '@/hooks/useTimer';
import { useViewer } from '@/hooks/useViewer';
import TimerDisplay from '@/components/timer/TimerDisplay';
import TimerControls from '@/components/timer/TimerControls';
import ViewerCard from '@/components/viewer/ViewerCard';
import ViewerChart from '@/components/viewer/ViewerChart';
import { Button } from '@/components/ui/button';
import { Play, Square, ExternalLink, AlertCircle, Timer } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';

interface TimerData { id: string; name: string; phase: string }
interface Snapshot { captured_at: string; youtube_count: number; jstream_count: number; total_count: number }

export default function DashboardPage() {
  const { programId } = useParams<{ programId: string }>();

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
  const viewer = useViewer(programId ?? null, settingsData?.pollingIntervalSec ?? 10);

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

          {!settingsData?.hasYoutubeKey && !settingsData?.hasJstreamToken && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-warning/10 border border-warning/30 p-2.5 text-xs text-warning" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <Link to="/settings" className="underline">設定</Link>でAPIキーを登録してください
            </div>
          )}

          <div className="p-3 sm:p-4 space-y-2">
            <ViewerCard
              label="YouTube"
              count={viewer.counts.youtube}
              color="#ff0000"
              sublabel={viewer.counts.ytDetails.map((d: any) => `${d.label}: ${d.count ?? '-'}`).join(' / ')}
            />
            <div className="grid grid-cols-2 gap-2">
              <ViewerCard
                label="Jstream"
                count={viewer.counts.jstream}
                color="#00b4d8"
              />
              <ViewerCard
                label="合計"
                count={viewer.counts.total}
                color="#a855f7"
              />
            </div>
          </div>
        </div>

        {/* Chart */}
        {snapshots.length > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">視聴者数推移</h2>
            <ViewerChart snapshots={snapshots} />
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
