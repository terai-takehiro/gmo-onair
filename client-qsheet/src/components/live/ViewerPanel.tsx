// 計時・視聴者（liveops）ダッシュボードの「視聴者数」パネル（計測の開始/停止・
// プラットフォーム別トグル・カード・推移グラフ）。`LiveDashboardPage.tsx` から
// 切り出した（400行制限。役割としては1つのパネルなのでそのまま1ファイルにした）。
//
// 視聴者数の取得はサーバー側の「計測」が行う（実装設計 09 §4）。ここは「計測」を
// 開始・停止するだけで、数字そのものは `liveops_snapshots` の最新の記録を読んで
// 表示する（表示画面と同じやり方）。⚠️ ここでブラウザから直接 YouTube 等を取得しない
// （サーバーと二重に取りに行くと割り当てを倍消費する）。
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import ViewerCard from '@/components/live/ViewerCard';
import ViewerChart from '@/components/live/ViewerChart';

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
interface ProgramPlatforms {
  youtube_urls?: { label: string; url: string }[];
  jstream_lpid?: string | null;
  zoom_meeting_id?: string | null;
  zoom_webinar_id?: string | null;
  teams_meeting_url?: string | null;
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

interface Props {
  programId: string;
  program: ProgramPlatforms | undefined;
  canManage: boolean;
}

export default function ViewerPanel({ programId, program, canManage }: Props) {
  const qc = useQueryClient();
  const [platformToggles, setPlatformToggles] = useState(() => loadToggles(programId));
  const setToggle = (key: PlatformKey, val: boolean) => {
    const next = { ...platformToggles, [key]: val };
    setPlatformToggles(next);
    localStorage.setItem(`lv_dash_platforms_${programId}`, JSON.stringify(next));
  };

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
    <>
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
    </>
  );
}
