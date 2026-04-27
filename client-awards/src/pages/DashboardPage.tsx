import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Trophy, Plus, Trash2, ExternalLink, Calendar, ChevronRight } from 'lucide-react';

interface AwardsEvent {
  id: number;
  name: string;
  subtitle: string | null;
  scheduled_at: string | null;
  status: 'draft' | 'live' | 'closed';
  created_at: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft:  { label: '準備中', color: 'bg-muted text-muted-foreground' },
  live:   { label: 'LIVE',   color: 'bg-red-500/10 text-red-600 ring-1 ring-red-500/20' },
  closed: { label: '終了',   color: 'bg-green-500/10 text-green-700 ring-1 ring-green-500/20' },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['awards-events'],
    queryFn: async () => {
      const res = await api.get('/api/v1/internal/awards/events');
      return res.data.data as AwardsEvent[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/api/v1/internal/awards/events', { name });
      return res.data.data as AwardsEvent;
    },
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: ['awards-events'] });
      setCreating(false);
      setNewName('');
      navigate(`/event/${event.id}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/v1/internal/awards/events/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['awards-events'] }),
  });

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <Trophy className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">表彰CG</h1>
            <p className="text-xs text-muted-foreground">イベント一覧</p>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新規イベント
        </button>
      </div>

      {creating && (
        <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium mb-3">新規イベント作成</p>
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim());
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              placeholder="例: 第10回 年間表彰式 2025"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={() => { if (newName.trim()) createMutation.mutate(newName.trim()); }}
              disabled={!newName.trim() || createMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              作成
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); }}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">イベントがありません</p>
          <p className="text-xs text-muted-foreground/70 mt-1">「新規イベント」から作成してください</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((event) => {
            const st = STATUS_LABEL[event.status] ?? STATUS_LABEL.draft;
            return (
              <div
                key={event.id}
                className="group flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => navigate(`/event/${event.id}`)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                  <Trophy className="h-5 w-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{event.name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>
                      {st.label}
                    </span>
                  </div>
                  {event.subtitle && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{event.subtitle}</p>
                  )}
                  {event.scheduled_at && (
                    <div className="flex items-center gap-1 mt-1">
                      <Calendar className="h-3 w-3 text-muted-foreground/60" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(event.scheduled_at).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(`/awards/output/${event.id}`, '_blank');
                    }}
                    className="hidden group-hover:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground"
                    title="出力画面を開く"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`「${event.name}」を削除しますか？`)) {
                        deleteMutation.mutate(event.id);
                      }
                    }}
                    className="hidden group-hover:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive/70 hover:text-destructive"
                    title="削除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
