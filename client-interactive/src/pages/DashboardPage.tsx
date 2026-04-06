import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Radio, Eye, Settings, Trash2, Search, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'success' | 'secondary' | 'warning' }> = {
  draft: { label: '下書き', variant: 'secondary' },
  live: { label: 'LIVE', variant: 'default' },
  ended: { label: '終了', variant: 'warning' },
  archived: { label: 'アーカイブ', variant: 'secondary' },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['interactive-events', search, statusFilter],
    queryFn: () => api.get('/interactive/events', { params: { search, status: statusFilter || undefined } }).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (title: string) => api.post('/interactive/events', { title }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['interactive-events'] });
      setCreateOpen(false);
      setNewTitle('');
      navigate(`/event/${res.data.data.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/interactive/events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-events'] }),
  });

  const events = data?.data || [];

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading-page text-2xl flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            イベント一覧
          </h1>
          <p className="text-sm text-muted-foreground mt-1">インタラクティブ演出イベントの管理</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />新規イベント</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>新規イベント作成</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-4">
              <Input placeholder="イベントタイトル" value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>キャンセル</Button>
                <Button onClick={() => createMutation.mutate(newTitle)} disabled={!newTitle.trim() || createMutation.isPending}>作成</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="イベントを検索..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {['', 'draft', 'live', 'ended'].map(s => (
            <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(s)}>
              {s === '' ? '全て' : STATUS_MAP[s]?.label || s}
            </Button>
          ))}
        </div>
      </div>

      {/* Event Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : events.length === 0 ? (
        <div className="text-center py-12">
          <Sparkles className="h-12 w-12 text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-muted-foreground">イベントがまだありません</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" />最初のイベントを作成</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event: any) => {
            const st = STATUS_MAP[event.status] || STATUS_MAP.draft;
            return (
              <Card key={event.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/event/${event.id}`)} title="編集">
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                      {event.status !== 'live' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(event.id); }} title="削除">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1 line-clamp-2">{event.title}</h3>
                  {event.project_name && (
                    <p className="text-xs text-muted-foreground mb-2">{event.gls_number} {event.project_name}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                    <span>スタンプ: {event.stamp_count || 0}</span>
                    {event.status === 'live' && (
                      <span className="text-primary font-medium flex items-center gap-1">
                        <Radio className="h-3 w-3 animate-pulse" />
                        {event.active_connections || 0}人接続中
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    {event.status === 'live' ? (
                      <Button size="sm" className="flex-1" onClick={() => navigate(`/live/${event.id}`)}>
                        <Radio className="h-3.5 w-3.5 mr-1" />ライブ管理
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(`/event/${event.id}`)}>
                        <Settings className="h-3.5 w-3.5 mr-1" />設定
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => window.open(`/interactive/overlay/${event.id}`, '_blank', 'noopener,noreferrer')} title="オーバーレイ">
                      <Eye className="h-3.5 w-3.5" />
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
