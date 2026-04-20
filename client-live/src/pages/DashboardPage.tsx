import { useState, useEffect } from 'react';
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
import { Play, Square, ExternalLink, AlertCircle, Timer, Tv2 } from 'lucide-react';

interface TimerData { id: string; name: string; phase: string }
interface Program { id: string; name: string }
interface Snapshot { captured_at: string; youtube_count: number; jstream_count: number; total_count: number }

export default function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [singularSending, setSingularSending] = useState<string | null>(null);

  const { data: timersData = [] } = useQuery({
    queryKey: ['timers', projectId],
    queryFn: () => api.get(`/liveops/timers?project_id=${projectId}`).then(r => r.data.data as TimerData[]),
    enabled: !!projectId,
  });

  const { data: programsData = [] } = useQuery({
    queryKey: ['programs', projectId],
    queryFn: () => api.get(`/liveops/programs?project_id=${projectId}`).then(r => r.data.data as Program[]),
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/liveops/settings').then(r => r.data.data),
  });

  const selectedTimerId = timersData[0]?.id ?? null;
  const selectedProgramId = programsData[0]?.id ?? null;

  const { data: snapshotsData } = useQuery({
    queryKey: ['snapshots', selectedProgramId],
    queryFn: () => api.get(`/liveops/snapshots/${selectedProgramId}`).then(r => r.data.data as Snapshot[]),
    enabled: !!selectedProgramId,
    refetchInterval: 15_000,
  });

  const timer = useTimer(selectedTimerId);
  const viewer = useViewer(selectedProgramId, settingsData?.pollingIntervalSec ?? 10);

  const handleTake = async (target: 'youtube' | 'jstream' | 'total') => {
    if (!selectedProgramId) return;
    setSingularSending(target);
    try {
      const v = target === 'youtube' ? viewer.counts.youtube
        : target === 'jstream' ? viewer.counts.jstream
        : viewer.counts.total;
      await api.post(`/liveops/proxy/singular/control/${selectedProgramId}`, {
        payload: [{ target, value: String(v) }],
      });
    } catch { /* ignore */ } finally {
      setSingularSending(null);
    }
  };

  const noTimers = timersData.length === 0;
  const noPrograms = programsData.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h1 className="text-sm font-bold">ダッシュボード</h1>
        {selectedTimerId && (
          <a
            href={`/live/display/${selectedTimerId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            表示画面
          </a>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">

        {/* Empty state */}
        {noTimers && noPrograms && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-4">
            <p className="text-sm">この案件にタイマーと番組がありません</p>
            <div className="flex gap-3">
              <Link to={`/p/${projectId}/timer`}>
                <Button size="sm" variant="outline">
                  <Timer className="h-4 w-4 mr-1.5" />タイマーを追加
                </Button>
              </Link>
              <Link to={`/p/${projectId}/programs`}>
                <Button size="sm" variant="outline">
                  <Tv2 className="h-4 w-4 mr-1.5" />番組を追加
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* Timer panel */}
        {!noTimers && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timer</span>
                {timersData.length > 1 && (
                  <span className="text-xs text-muted-foreground">— {timersData[0].name}</span>
                )}
              </div>
              <Link to={`/p/${projectId}/timer`}>
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
        {!noPrograms && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Viewers</span>
                {programsData.length > 1 && (
                  <span className="text-xs text-muted-foreground">— {programsData[0].name}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {viewer.counts.lastUpdated && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {viewer.counts.lastUpdated.toLocaleTimeString('ja-JP')}
                  </span>
                )}
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
            </div>

            {!settingsData?.hasYoutubeKey && !settingsData?.hasJstreamToken && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <Link to="/settings" className="underline">設定</Link>でAPIキーを登録してください
              </div>
            )}

            <div className="p-3 sm:p-4 space-y-2">
              <ViewerCard
                label="YouTube"
                count={viewer.counts.youtube}
                color="#ff0000"
                sublabel={viewer.counts.ytDetails.map(d => `${d.label}: ${d.count ?? '-'}`).join(' / ')}
                onTake={() => handleTake('youtube')}
                taking={singularSending === 'youtube'}
              />
              <div className="grid grid-cols-2 gap-2">
                <ViewerCard
                  label="Jstream"
                  count={viewer.counts.jstream}
                  color="#00b4d8"
                  onTake={() => handleTake('jstream')}
                  taking={singularSending === 'jstream'}
                />
                <ViewerCard
                  label="合計"
                  count={viewer.counts.total}
                  color="#a855f7"
                  onTake={() => handleTake('total')}
                  taking={singularSending === 'total'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        {selectedProgramId && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">視聴者数推移</h2>
            <ViewerChart snapshots={snapshotsData || []} />
          </div>
        )}

        {/* Log */}
        {!noPrograms && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">ログ</h2>
            <div className="h-28 overflow-y-auto space-y-0.5 font-mono text-xs">
              {viewer.logs.length === 0 ? (
                <p className="text-muted-foreground">ログなし</p>
              ) : viewer.logs.map((log, i) => (
                <div key={i} className={log.type === 'error' ? 'text-destructive' : log.type === 'success' ? 'text-green-400' : 'text-muted-foreground'}>
                  <span className="text-muted-foreground/60">{log.time.toLocaleTimeString('ja-JP')} </span>
                  {log.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
