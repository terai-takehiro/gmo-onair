import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio, Eye, Settings, Trash2, Search, Sparkles, Link2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DashboardHeader, EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { INTERACTIVE_EVENT_STATUS, statusOf } from '@gmo-onair/shared/src/constants/statuses';

interface GlsProject {
  id: string;
  gls_number: string;
  name: string;
  customer_name: string | null;
}

interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
  broadcast_date: string | null;
}

// ステータス定義は shared/src/constants/statuses.ts (INTERACTIVE_EVENT_STATUS) を参照

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [linkToProject, setLinkToProject] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['interactive-events', search, statusFilter],
    queryFn: () => api.get('/interactive/events', { params: { search, status: statusFilter || undefined } }).then(r => r.data),
    retry: 2,
  });

  const { data: glsProjects } = useQuery({
    queryKey: ['gls-options'],
    queryFn: async () => {
      const res = await api.get('/lookup/gls-options');
      return res.data.data as GlsProject[];
    },
    enabled: linkToProject,
  });

  const { data: episodes } = useQuery({
    queryKey: ['episode-options', selectedProjectId],
    queryFn: async () => {
      const res = await api.get(`/lookup/${selectedProjectId}/episodes-options`);
      return res.data.data as EpisodeOption[];
    },
    enabled: !!selectedProjectId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post('/interactive/events', {
      title: newTitle,
      project_id: linkToProject && selectedProjectId ? selectedProjectId : null,
      episode_id: linkToProject && selectedEpisodeId ? selectedEpisodeId : null,
    }),
    onSuccess: (res: { data: { data: { id: string } } }) => {
      queryClient.invalidateQueries({ queryKey: ['interactive-events'] });
      setCreateOpen(false);
      resetCreateForm();
      navigate(`/event/${res.data.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/interactive/events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-events'] }),
  });

  const resetCreateForm = () => {
    setNewTitle('');
    setLinkToProject(false);
    setSelectedProjectId('');
    setSelectedEpisodeId('');
  };

  const handleProjectChange = (value: string) => {
    setSelectedProjectId(value);
    setSelectedEpisodeId('');
  };

  const events = data?.data || [];

  const createDialog = (
    <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" aria-hidden="true" />新規イベント</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新規イベント作成</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-4">
          <Input placeholder="イベントタイトル" value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus />
          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-medium">GLS案件に紐付ける</span>
              </div>
              <Switch
                checked={linkToProject}
                onCheckedChange={(v) => {
                  setLinkToProject(!!v);
                  if (!v) {
                    setSelectedProjectId('');
                    setSelectedEpisodeId('');
                  }
                }}
              />
            </div>
            {linkToProject && (
              <div className="mt-3 space-y-3 pl-6">
                <div>
                  <label className="text-xs text-muted-foreground">GLS案件</label>
                  <Select value={selectedProjectId} onValueChange={handleProjectChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="案件を選択..." />
                    </SelectTrigger>
                    <SelectContent>
                      {glsProjects?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.gls_number} — {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedProjectId && episodes && episodes.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground">エピソード（任意）</label>
                    <Select value={selectedEpisodeId} onValueChange={setSelectedEpisodeId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="エピソードを選択..." />
                      </SelectTrigger>
                      <SelectContent>
                        {episodes.map((ep) => (
                          <SelectItem key={ep.id} value={ep.id}>
                            {ep.episode_code}
                            {ep.broadcast_date && ` — ${ep.broadcast_date}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>キャンセル</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!newTitle.trim() || createMutation.isPending}>作成</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-4 sm:p-6 space-y-5 sm:space-y-6">
      <DashboardHeader
        title="イベント一覧"
        description="インタラクティブ演出イベントの作成・管理"
        lastUpdated={`最終更新 ${new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
        controls={createDialog}
      />

      {/* 絞り込み */}
      <div className="flex gap-3 items-center flex-wrap sm:flex-nowrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            className="pl-9"
            placeholder="イベントを検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="イベント検索"
          />
        </div>
        <div className="flex gap-1 overflow-x-auto shrink-0" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="ステータス絞り込み">
          {['', 'draft', 'live', 'ended'].map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              className="shrink-0"
              onClick={() => setStatusFilter(s)}
              role="tab"
              aria-selected={statusFilter === s}
            >
              {s === '' ? '全て' : statusOf(INTERACTIVE_EVENT_STATUS, s).label}
            </Button>
          ))}
        </div>
      </div>

      {/* 本体 */}
      {isError ? (
        <EmptyState
          title="読み込みに失敗しました"
          description={(error as any)?.response?.data?.message || (error as any)?.message || 'サーバーに接続できません'}
          action={<Button variant="outline" onClick={() => window.location.reload()}>再読み込み</Button>}
        />
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="イベントがまだありません"
          description="新しくイベントを作成して、インタラクティブ演出を始めましょう。"
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />最初のイベントを作成
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event: any) => {
            const st = statusOf(INTERACTIVE_EVENT_STATUS, event.status);
            return (
              <Card key={event.id} className="group transition-colors hover:border-primary">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => navigate(`/event/${event.id}`)} aria-label="編集">
                        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
                      </Button>
                      {event.status !== 'live' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(event.id); }}
                          aria-label="削除"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1 line-clamp-2 text-foreground">{event.title}</h3>
                  {event.project_name && (
                    <p className="text-xs text-muted-foreground mb-2">{event.gls_number} {event.project_name}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                    <span>スタンプ: <span className="font-number tabular-nums">{event.stamp_count || 0}</span></span>
                    {(event.status === 'live' || event.status === 'rehearsal') && (
                      <span className="text-primary font-medium flex items-center gap-1">
                        <Radio className="h-3 w-3 animate-pulse" aria-hidden="true" />
                        <span className="font-number tabular-nums">{event.active_connections || 0}</span>人接続中
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    {event.status === 'live' || event.status === 'rehearsal' ? (
                      <Button size="sm" className="flex-1" onClick={() => navigate(`/live/${event.id}`)}>
                        <Radio className="h-3.5 w-3.5 mr-1" aria-hidden="true" />ライブ管理
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/event/${event.id}`)}>
                        <Settings className="h-3.5 w-3.5 mr-1" aria-hidden="true" />設定
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(`/interactive/overlay/${event.id}`, '_blank', 'noopener,noreferrer')}
                      aria-label="オーバーレイを開く"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
