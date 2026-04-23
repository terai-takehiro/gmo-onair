import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTimer } from '@/hooks/useTimer';
import { usePermissions } from '@/hooks/usePermissions';
import TimerDisplay from '@/components/timer/TimerDisplay';
import TimerControls from '@/components/timer/TimerControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, QrCode, ExternalLink, Trash2, ChevronRight } from 'lucide-react';

interface TimerData { id: string; name: string; phase: string }

export default function TimerAdminPage() {
  const { programId } = useParams<{ programId: string }>();
  const qc = useQueryClient();
  const { canManage } = usePermissions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  const { data: timers = [] } = useQuery({
    queryKey: ['timers', programId],
    queryFn: () => api.get(`/liveops/timers?program_id=${programId}`).then(r => r.data.data as TimerData[]),
    enabled: !!programId,
  });

  useEffect(() => {
    if (timers.length && !selectedId) setSelectedId(timers[0].id);
  }, [timers]);

  const timer = useTimer(selectedId);

  const createMutation = useMutation({
    mutationFn: () => api.post('/liveops/timers', { name: newName, programId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['timers', programId] });
      setSelectedId(res.data.data.id);
      setCreateOpen(false);
      setNewName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/liveops/timers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timers', programId] });
      setSelectedId(null);
    },
  });

  const openQr = () => {
    if (!selectedId) return;
    setQrUrl(`${window.location.origin}/live/display/${selectedId}`);
    setQrOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <h1 className="text-sm font-bold">タイマー管理</h1>
        {canManage && (
          <Button size="sm" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />新規
          </Button>
        )}
      </div>

      <div className="flex-1 flex min-h-0 flex-col sm:flex-row overflow-hidden">
        {/* Timer list */}
        <div className="sm:w-52 border-b sm:border-b-0 sm:border-r border-border overflow-y-auto">
          {timers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground text-sm text-center">
              <p>タイマーがありません</p>
              {canManage && (
                <Button className="mt-3" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />作成
                </Button>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {timers.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedId === t.id
                      ? 'bg-primary/15 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timer detail */}
        <div className="flex-1 overflow-y-auto">
          {selectedId ? (
            <>
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
                  readOnly={!canManage}
                />
              </div>
              <div className="flex items-center gap-2 px-3 sm:px-4 pb-4">
                <Button variant="outline" size="sm" onClick={openQr}>
                  <QrCode className="h-4 w-4 mr-1.5" />QR
                </Button>
                <a href={`/live/display/${selectedId}`} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">
                    <ExternalLink className="h-4 w-4 mr-1.5" />表示
                  </Button>
                </a>
                {canManage && (
                  <Button
                    variant="ghost" size="sm"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(selectedId); }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />削除
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              タイマーを選択
            </div>
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>タイマー作成</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>名前</Label>
              <Input
                placeholder="本番尺、休憩など"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newName) createMutation.mutate(); }}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>キャンセル</Button>
              <Button onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
                作成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>表示画面URL</DialogTitle></DialogHeader>
          <div className="space-y-3 text-center">
            <p className="text-xs text-muted-foreground break-all">{qrUrl}</p>
            <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(qrUrl)}>
              URLをコピー
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
