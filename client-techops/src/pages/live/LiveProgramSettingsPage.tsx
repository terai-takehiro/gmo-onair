// 計時・視聴者（liveops）— 番組設定（v4.1 段2・ミニアプリ化フェーズ2・このステージ）。
//
// `client-live/src/pages/ProgramsPage.tsx` の移植。落としていない機能:
//   ・番組名・YouTube URL（複数・ラベル付き）・Jstream LPID・
//     Zoom ミーティング/ウェビナー ID・Teams 会議 URL の編集
//   ・保存（PUT /liveops/programs/:id — Teams URL を設定するとサーバー側で
//     Teams サブスクリプションを試みる副作用も含め、エンドポイント自体は
//     このステージで変更していないためそのまま効く）
//   ・紐づき案件（GLS番号・案件名）の読み取り専用表示
//
// マウント時の owner 解決・「取得または作成」は `useLiveProgram`
// （ダッシュボード・タイマー管理と共通）。
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, AlertCircle, Timer, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';
import { useLiveProgram } from './useLiveProgram';
import BackToOwner, { type BackToOwnerTarget } from './BackToOwner';

interface YoutubeUrl { label: string; url: string }
interface LiveProgram {
  id: string;
  name: string;
  jstream_lpid: string | null;
  youtube_urls: YoutubeUrl[];
  zoom_meeting_id: string | null;
  zoom_webinar_id: string | null;
  teams_meeting_url: string | null;
  project_id: string | null;
  project_name?: string;
  gls_number?: string | null;
  qsheet_program_id: string | null;
  qsheet_program_name?: string;
}

export default function LiveProgramSettingsPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const live = useLiveProgram(ownerKey);

  if (live.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (live.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<Timer />} title="見つかりませんでした" description="GLS番号または案件IDを確認してください。" />
      </div>
    );
  }

  if (live.status === 'unsupported-scope') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <BackToOwner owner={live.owner} />
        <EmptyState
          icon={<Timer />}
          title="案件からのみ開けます"
          description="計時・視聴者は案件からだけ開けます。案件のハブ画面から開いてください。"
        />
      </div>
    );
  }

  if (live.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        {live.owner && <BackToOwner owner={live.owner} />}
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={live.message} />
      </div>
    );
  }

  return <ProgramSettingsContent owner={live.owner} programId={live.programId} />;
}

function ProgramSettingsContent({ owner, programId }: {
  owner: BackToOwnerTarget & { glsNumber: string | null };
  programId: string;
}) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');

  const [name, setName] = useState('');
  const [jstreamLpid, setJstreamLpid] = useState('');
  const [youtubeUrls, setYoutubeUrls] = useState<YoutubeUrl[]>([{ label: '', url: '' }]);
  const [zoomMeetingId, setZoomMeetingId] = useState('');
  const [zoomWebinarId, setZoomWebinarId] = useState('');
  const [teamsMeetingUrl, setTeamsMeetingUrl] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: program, isLoading } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 30_000,
  });

  // Populate form when data loads
  useEffect(() => {
    if (!program) return;
    setName(program.name);
    setJstreamLpid(program.jstream_lpid ?? '');
    setYoutubeUrls(program.youtube_urls.length > 0 ? program.youtube_urls : [{ label: '', url: '' }]);
    setZoomMeetingId(program.zoom_meeting_id ?? '');
    setZoomWebinarId(program.zoom_webinar_id ?? '');
    setTeamsMeetingUrl(program.teams_meeting_url ?? '');
  }, [program]);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/liveops/programs/${programId}`, {
      name,
      jstreamLpid: jstreamLpid || null,
      youtubeUrls: youtubeUrls.filter(u => u.url.trim()),
      zoomMeetingId: zoomMeetingId || null,
      zoomWebinarId: zoomWebinarId || null,
      teamsMeetingUrl: teamsMeetingUrl || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['program', programId] });
      qc.invalidateQueries({ queryKey: ['programs-all'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const addYtUrl = () => setYoutubeUrls(prev => [...prev, { label: '', url: '' }]);
  const removeYtUrl = (i: number) => setYoutubeUrls(prev => prev.filter((_, idx) => idx !== i));
  const updateYtUrl = (i: number, key: 'label' | 'url', v: string) =>
    setYoutubeUrls(prev => prev.map((u, idx) => idx === i ? { ...u, [key]: v } : u));

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mb-4 flex items-center gap-3">
        <BackToOwner owner={owner} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">番組設定</h1>
          <p className="truncate text-xs text-muted-foreground">{owner.glsNumber ?? owner.name}</p>
        </div>
        <MiniAppSwitcher owner={owner} current="liveops" />
        {canManage && (
          <Button
            size="sm"
            className="h-9 text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
          >
            {saved ? '保存済み ✓' : <><Save className="h-3.5 w-3.5 mr-1" />保存</>}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* GLS link info (read-only) */}
          {program?.project_name && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <span className="text-muted-foreground text-xs">紐づき案件: </span>
              {program.gls_number && (
                <span className=" text-primary text-xs mr-2">{program.gls_number}</span>
              )}
              <span className="font-medium">{program.project_name}</span>
            </div>
          )}
          {/* 独自作成の番組（マニュアル）に紐づく場合の表示（migration 237） */}
          {program?.qsheet_program_name && (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
              <span className="text-muted-foreground text-xs">紐づき番組: </span>
              <span className="font-medium">{program.qsheet_program_name}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>番組名</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="番組名"
              disabled={!canManage}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>YouTube URL</Label>
              {canManage && (
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-6 text-xs" // ui-tokens-ok: client-live 原実装のまま移植（このステージは移植のみ）
                  onClick={addYtUrl}
                >
                  <Plus className="h-3 w-3 mr-1" />追加
                </Button>
              )}
            </div>
            {youtubeUrls.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="ラベル"
                  value={u.label}
                  onChange={e => updateYtUrl(i, 'label', e.target.value)}
                  className="w-24 shrink-0"
                  disabled={!canManage}
                />
                <Input
                  placeholder="https://youtube.com/watch?v=... または https://youtube.com/live/..."
                  value={u.url}
                  onChange={e => updateYtUrl(i, 'url', e.target.value)}
                  className="flex-1"
                  disabled={!canManage}
                />
                {canManage && youtubeUrls.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => removeYtUrl(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Jstream LPID</Label>
            <Input
              value={jstreamLpid}
              onChange={e => setJstreamLpid(e.target.value)}
              placeholder="例: 123456"
              disabled={!canManage}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Zoom ミーティング ID</Label>
            <Input
              value={zoomMeetingId}
              onChange={e => setZoomMeetingId(e.target.value)}
              placeholder="例: 123 456 7890"
              disabled={!canManage}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Zoom ウェビナー ID</Label>
            <Input
              value={zoomWebinarId}
              onChange={e => setZoomWebinarId(e.target.value)}
              placeholder="例: 987 654 3210"
              disabled={!canManage}
            />
            {(zoomMeetingId || zoomWebinarId) && (
              <p className="text-xs text-muted-foreground">両方設定すると参加者数を合算します</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Teams 会議 URL</Label>
            <Input
              value={teamsMeetingUrl}
              onChange={e => setTeamsMeetingUrl(e.target.value)}
              placeholder="https://teams.microsoft.com/l/meetup-join/..."
              disabled={!canManage}
            />
            <p className="text-xs text-muted-foreground">「会議リンクをコピー」で取得したURLを貼り付け。ミーティング・ウェビナー共通。</p>
          </div>

          {canManage && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
              className="w-full sm:w-auto"
            >
              {saved ? '保存済み ✓' : '設定を保存'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
