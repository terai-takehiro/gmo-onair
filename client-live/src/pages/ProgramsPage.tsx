import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Save } from 'lucide-react';
import { Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';

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
}

export default function ProgramsPage() {
  const { programId } = useParams<{ programId: string }>();
  const qc = useQueryClient();
  const { canManage } = usePermissions();

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

  if (isLoading) {
    return (
      <Delayed><SkeletonRows rows={5} /></Delayed>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h1 className="text-sm font-bold">番組設定</h1>
        {canManage && (
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
          >
            {saved ? '保存済み ✓' : <><Save className="h-3 w-3 mr-1" />保存</>}
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl space-y-5">
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
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={addYtUrl}>
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
      </div>
    </div>
  );
}
