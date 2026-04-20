import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTimer } from '@/hooks/useTimer';
import TimerDisplay from '@/components/timer/TimerDisplay';
import TimerControls from '@/components/timer/TimerControls';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, QrCode, ExternalLink, Trash2 } from 'lucide-react';

interface Timer { id: string; name: string; phase: string; project_name?: string }

export default function TimerAdminPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  const { data: timers = [] } = useQuery({
    queryKey: ['timers'],
    queryFn: () => api.get('/liveops/timers').then(r => r.data.data as Timer[]),
  });

  useEffect(() => {
    if (timers.length && !selectedId) setSelectedId(timers[0].id);
  }, [timers]);

  const timer = useTimer(selectedId);

  const createMutation = useMutation({
    mutationFn: (name: string) => api.post('/liveops/timers', { name }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['timers'] });
      setSelectedId(res.data.data.id);
      setCreateOpen(false);
      setNewName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/liveops/timers/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timers'] });
      setSelectedId(null);
    },
  });

  const openQr = () => {
    if (!selectedId) return;
    const base = window.location.origin;
    const url = `${base}/live/display/${selectedId}`;
    setQrUrl(url);
    setQrOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-4 py-2">
        <h1 className="text-sm font-bold">タイマー管理</h1>
        <Button size="sm" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3 mr-1" /> 新規
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Timer selector */}
        <div className="flex items-center gap-2">
          <Select value={selectedId ?? ''} onValueChange={setSelectedId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="タイマーを選択" />
            </SelectTrigger>
            <SelectContent>
              {timers.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}{t.project_name ? ` (${t.project_name})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={openQr} disabled={!selectedId}>
            <QrCode className="h-4 w-4" />
          </Button>
          {selectedId && (
            <a href={`/live/display/${selectedId}`} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          )}
          {selectedId && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(selectedId); }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>

        {selectedId ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Display */}
            <div className="h-56 rounded-xl overflow-hidden">
              <TimerDisplay state={timer.state} compact={false} />
            </div>
            {/* Controls */}
            <div className="rounded-xl border bg-card p-4">
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
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">タイマーがありません</p>
            <Button className="mt-3" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> 作成
            </Button>
          </div>
        )}
      </div>

      {/* Create dialog */}
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
                onKeyDown={e => { if (e.key === 'Enter' && newName) createMutation.mutate(newName); }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>キャンセル</Button>
              <Button onClick={() => createMutation.mutate(newName)} disabled={!newName || createMutation.isPending}>
                作成
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>表示画面URL</DialogTitle></DialogHeader>
          <div className="space-y-3 text-center">
            <p className="text-xs text-muted-foreground break-all">{qrUrl}</p>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(qrUrl); }}>
              URLをコピー
            </Button>
            <p className="text-xs text-muted-foreground">
              このURLをブラウザで開くと全画面タイマーが表示されます<br/>
              <code className="text-xs">?overlay=viewer&amp;programId=xxx</code> を追加すると視聴者数も表示
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
