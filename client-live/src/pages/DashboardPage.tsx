import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTimer } from '@/hooks/useTimer';
import { usePermissions } from '@/hooks/usePermissions';
import TimerDisplay from '@/components/timer/TimerDisplay';
import TimerControls from '@/components/timer/TimerControls';
import TimerSettingsPanel from '@/components/timer/TimerSettingsPanel';
import ViewerCard from '@/components/viewer/ViewerCard';
import ViewerChart from '@/components/viewer/ViewerChart';
import { Button } from '@/components/ui/button';
import { Play, Square, ExternalLink, AlertCircle, Timer } from 'lucide-react';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';

interface TimerData { id: string; name: string; phase: string }
interface ProgramData { main_timer_id: string | null; youtube_urls?: { label: string; url: string }[]; jstream_lpid?: string | null; zoom_meeting_id?: string | null; zoom_webinar_id?: string | null; teams_meeting_url?: string | null }
interface Snapshot {
  captured_at: string;
  youtube_count: number;
  jstream_count: number;
  zoom_count: number;
  teams_count: number;
  total_count: number;
}
type PlatformKey = 'youtube' | 'jstream' | 'zoom' | 'teams';
interface MeasureState {
  measuring: boolean;
  measure_started_at: string | null;
  measure_started_by: string | null;
  measure_until: string | null;
  measure_until_kind: 'default' | 'manual';
  measure_platforms: PlatformKey[];
  measure_fail_count: number;
}

const PLATFORM_META: { key: PlatformKey; label: string; color: string }[] = [
  { key: 'youtube', label: 'YouTube', color: '#ff0000' },
  { key: 'jstream', label: 'Jstream', color: '#00b4d8' },
  { key: 'zoom',    label: 'Zoom',    color: '#2D8CFF' },
  { key: 'teams',   label: 'Teams',   color: '#6264A7' },
];

function loadToggles(programId: string | undefined): Record<PlatformKey, boolean> {
  try {
    const s = JSON.parse(localStorage.getItem(`lv_dash_platforms_${programId}`) ?? '{}');
    return { youtube: s.youtube ?? true, jstream: s.jstream ?? true, zoom: s.zoom ?? true, teams: s.teams ?? true };
  } catch {
    return { youtube: true, jstream: true, zoom: true, teams: true };
  }
}

/**
 * 視聴者数の取得はサーバー側の「計測」が行う（実装設計 09 §4）。
 * このページは「計測」を開始・停止するだけで、数字そのものは
 * `liveops_snapshots` の最新の記録を読んで表示する（表示画面と同じやり方）。
 * ⚠️ ここでブラウザから直接 YouTube 等を取得しない
 *   （サーバーと二重に取りに行くと割り当てを倍消費する）。
 */
export default function DashboardPage() {
  const { programId } = useParams<{ programId: string }>();
  const qc = useQueryClient();
  const { canManage } = usePermissions();

  const [platformToggles, setPlatformToggles] = useState(() => loadToggles(programId));
  const setToggle = (key: PlatformKey, val: boolean) => {
    const next = { ...platformToggles, [key]: val };
    setPlatformToggles(next);
    localStorage.setItem(`lv_dash_platforms_${programId}`, JSON.stringify(next));
  };

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as ProgramData),
    enabled: !!programId,
    staleTime: 60_000,
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

  // 「計測中」は全員に同じものを見せる。表示画面と同じ15秒周期でサーバーへ読みに行く
  const { data: measure } = useQuery({
    queryKey: ['measure', programId],
    queryFn: () => api.get(`/liveops/measure/${programId}`).then(r => r.data.data as MeasureState),
    enabled: !!programId,
    refetchInterval: 15_000,
  });

  const [startError, setStartError] = useState<string | null>(null);
  const startMutation = useMutation({
    mutationFn: () => api.post(`/liveops/measure/${programId}/start`, {
      platforms: (Object.keys(platformToggles) as PlatformKey[]).filter(k => platformToggles[k]),
    }),
    onSuccess: () => { setStartError(null); qc.invalidateQueries({ queryKey: ['measure', programId] }); },
    onError: (e: any) => setStartError(e?.response?.data?.message || '計測を開始できませんでした'),
  });
  const stopMutation = useMutation({
    mutationFn: () => api.post(`/liveops/measure/${programId}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['measure', programId] }),
  });

  // 運用画面が出すタイマーは liveops_programs.main_timer_id（実装設計 09 §1-6 #2）。
  // 未設定・選ばれたタイマーが消えている場合は先頭のタイマーにフォールバックする。
  const mainTimerId = program?.main_timer_id ?? null;
  const activeTimerId = (mainTimerId && timers.some(t => t.id === mainTimerId))
    ? mainTimerId
    : (timers[0]?.id ?? null);
  const timer = useTimer(activeTimerId);
  const running = measure?.measuring ?? false;

  const latest = snapshots[snapshots.length - 1];
  const counts: Record<PlatformKey, number> = {
    youtube: latest?.youtube_count ?? 0,
    jstream: latest?.jstream_count ?? 0,
    zoom: latest?.zoom_count ?? 0,
    teams: latest?.teams_count ?? 0,
  };

  const configured: Record<PlatformKey, boolean> = {
    youtube: (program?.youtube_urls?.length ?? 0) > 0,
    jstream: !!program?.jstream_lpid,
    zoom:    !!(program?.zoom_meeting_id || program?.zoom_webinar_id),
    teams:   !!program?.teams_meeting_url,
  };
  // 計測中は「開始した時点の platforms」がサーバー側の正。未計測時のみ手元のトグルで見せる
  const activePlatforms: PlatformKey[] = running ? (measure?.measure_platforms ?? []) : (Object.keys(platformToggles) as PlatformKey[]).filter(k => platformToggles[k]);
  const isActive = (key: PlatformKey) => configured[key] && activePlatforms.includes(key);
  const displayTotal = PLATFORM_META.reduce((sum, { key }) => sum + (isActive(key) ? counts[key] : 0), 0);

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
                  <span className="text-xs text-muted-foreground">
                    — {timers.find(t => t.id === activeTimerId)?.name ?? timers[0].name}
                  </span>
                )}
              </div>
              <div className="flex items-center">
                {canManage && programId && (
                  <TimerSettingsPanel programId={programId} timers={timers} mainTimerId={mainTimerId} />
                )}
                <Link to={`/program/${programId}/timers`}>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground hover:text-foreground">管理</Button>
                </Link>
              </div>
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
              {latest && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {new Date(latest.captured_at).toLocaleTimeString('ja-JP')}
                </span>
              )}
              {running && (
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">計測中（サーバー）</span>
              )}
            </div>
            {canManage && (
              <Button
                variant={running ? 'destructive' : 'default'}
                size="sm"
                className="h-7 text-xs"
                disabled={startMutation.isPending || stopMutation.isPending}
                onClick={() => (running ? stopMutation.mutate() : startMutation.mutate())}
              >
                {running
                  ? <><Square className="h-3 w-3 mr-1" />停止</>
                  : <><Play className="h-3 w-3 mr-1" />計測を開始</>}
              </Button>
            )}
          </div>

          {startError && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {startError}
            </div>
          )}

          {(measure?.measure_fail_count ?? 0) >= 3 && running && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive" role="alert">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              取得が続けて失敗しています（{measure?.measure_fail_count}回）。鍵の設定を確認してください
            </div>
          )}

          {/* プラットフォーム別 表示トグル（計測開始前だけ、取得対象も変えられる） */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 sm:px-4 pt-3">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
              {running ? '取得中' : '取得対象'}
            </span>
            {PLATFORM_META.map(({ key, label, color }) => {
              const conf = configured[key];
              const on = activePlatforms.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!conf || running}
                  onClick={() => setToggle(key, !platformToggles[key])}
                  aria-pressed={conf && on}
                  title={!conf ? `${label} は番組設定で未登録です` : running ? '計測中は変更できません' : on ? `${label} を取得対象から外す` : `${label} を取得対象にする`}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[28px] ${
                    !conf || running
                      ? 'opacity-60 cursor-not-allowed border-border text-muted-foreground'
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
            <div className="grid grid-cols-2 gap-2">
              {isActive('youtube') && <ViewerCard label="YouTube" count={counts.youtube} color="#ff0000" />}
              {isActive('jstream') && <ViewerCard label="Jstream" count={counts.jstream} color="#00b4d8" />}
              {isActive('zoom') && <ViewerCard label="Zoom" count={counts.zoom} color="#2D8CFF" />}
              {isActive('teams') && <ViewerCard label="Teams" count={counts.teams} color="#6264A7" />}
              <ViewerCard label="合計" count={displayTotal} color="#a855f7" />
            </div>
            {PLATFORM_META.every(({ key }) => !isActive(key)) && (
              <p className="text-xs text-muted-foreground">
                取得対象のプラットフォームがありません。上のトグルを ON にするか、番組設定で URL / ID を登録してください。
              </p>
            )}
            {!running && (
              <p className="text-xs text-muted-foreground">
                「計測を開始」を押すとサーバーが取得を続けます。運用画面を閉じても数字は止まりません。
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
      </div>
    </div>
  );
}
