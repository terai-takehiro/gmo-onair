import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useTimer } from '@/hooks/useTimer';
import { useViewer } from '@/hooks/useViewer';
import TimerDisplay from '@/components/timer/TimerDisplay';
import TimerControls from '@/components/timer/TimerControls';
import ViewerCard from '@/components/viewer/ViewerCard';
import ViewerChart from '@/components/viewer/ViewerChart';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Square, RotateCcw, ExternalLink, AlertCircle } from 'lucide-react';

interface Timer { id: string; name: string; phase: string }
interface Program { id: string; name: string }
interface Snapshot { captured_at: string; youtube_count: number; jstream_count: number; total_count: number }

export default function DashboardPage() {
  const [selectedTimerId, setSelectedTimerId] = useState<string | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [singularSending, setSingularSending] = useState<string | null>(null);

  const { data: timersData } = useQuery({
    queryKey: ['timers'],
    queryFn: () => api.get('/liveops/timers').then(r => r.data.data as Timer[]),
  });

  const { data: programsData } = useQuery({
    queryKey: ['programs'],
    queryFn: () => api.get('/liveops/programs').then(r => r.data.data as Program[]),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/liveops/settings').then(r => r.data.data),
  });

  const { data: snapshotsData, refetch: refetchSnapshots } = useQuery({
    queryKey: ['snapshots', selectedProgramId],
    queryFn: () => selectedProgramId
      ? api.get(`/liveops/snapshots/${selectedProgramId}`).then(r => r.data.data as Snapshot[])
      : Promise.resolve([]),
    enabled: !!selectedProgramId,
    refetchInterval: 15000,
  });

  const timer = useTimer(selectedTimerId);
  const viewer = useViewer(selectedProgramId, settingsData?.pollingIntervalSec ?? 10);

  // Auto-select first timer & program
  useEffect(() => {
    if (timersData?.length && !selectedTimerId) setSelectedTimerId(timersData[0].id);
  }, [timersData]);
  useEffect(() => {
    if (programsData?.length && !selectedProgramId) setSelectedProgramId(programsData[0].id);
  }, [programsData]);

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

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold">ダッシュボード</h1>
        <div className="flex items-center gap-2">
          {selectedTimerId && (
            <a
              href={`/live/display/${selectedTimerId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
              表示画面
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Row 1: Timer + Viewer side-by-side on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Timer panel */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-semibold">タイマー</span>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedTimerId ?? ''}
                  onValueChange={v => setSelectedTimerId(v)}
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue placeholder="タイマー選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {(timersData || []).map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Link to="/timer">
                  <Button variant="outline" size="sm" className="h-7 text-xs">管理</Button>
                </Link>
              </div>
            </div>
            <div className="h-40">
              <TimerDisplay state={timer.state} compact={false} />
            </div>
            <div className="p-4 border-t">
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

          {/* Viewer panel */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b">
              <span className="text-sm font-semibold">視聴者カウンター</span>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedProgramId ?? ''}
                  onValueChange={v => setSelectedProgramId(v)}
                >
                  <SelectTrigger className="h-7 w-40 text-xs">
                    <SelectValue placeholder="番組選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {(programsData || []).map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant={viewer.running ? 'destructive' : 'default'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={viewer.running ? viewer.stopPolling : viewer.startPolling}
                  disabled={!selectedProgramId}
                >
                  {viewer.running ? <Square className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                  {viewer.running ? '停止' : '開始'}
                </Button>
              </div>
            </div>

            {!settingsData?.hasYoutubeKey && !settingsData?.hasJstreamToken && (
              <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">
                <AlertCircle className="h-3 w-3" />
                <Link to="/settings" className="underline">設定</Link>でAPIキーを登録してください
              </div>
            )}

            <div className="p-4 grid grid-cols-1 gap-3">
              <ViewerCard
                label="YouTube"
                count={viewer.counts.youtube}
                color="#ff0000"
                sublabel={viewer.counts.ytDetails.map(d => `${d.label}: ${d.count ?? '-'}`).join(' / ')}
                onTake={() => handleTake('youtube')}
                taking={singularSending === 'youtube'}
              />
              <div className="grid grid-cols-2 gap-3">
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
              {viewer.counts.lastUpdated && (
                <p className="text-xs text-muted-foreground text-right">
                  最終更新: {viewer.counts.lastUpdated.toLocaleTimeString('ja-JP')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: Chart */}
        {selectedProgramId && (
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">視聴者数推移</h2>
            <ViewerChart snapshots={snapshotsData || []} />
          </div>
        )}

        {/* Row 3: Log */}
        <div className="rounded-xl border bg-card p-4">
          <h2 className="text-sm font-semibold mb-2">ログ</h2>
          <div className="h-32 overflow-y-auto space-y-0.5 font-mono text-xs">
            {viewer.logs.length === 0 && (
              <p className="text-muted-foreground">ログなし</p>
            )}
            {viewer.logs.map((log, i) => (
              <div key={i} className={`${log.type === 'error' ? 'text-destructive' : log.type === 'success' ? 'text-green-600' : 'text-muted-foreground'}`}>
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
