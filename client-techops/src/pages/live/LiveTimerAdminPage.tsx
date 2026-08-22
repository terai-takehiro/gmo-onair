// 計時・視聴者（liveops）— タイマー管理（v4.1 段2・ミニアプリ化フェーズ2）。
//
// `client-live/src/pages/TimerAdminPage.tsx` の移植。落としていない機能:
//   ・タイマー一覧・作成・削除
//   ・タイマー表示（TimerDisplay）・操作（TimerControls。管理者以外は読み取り専用）
//   ・QRコード発行（表示画面URL）— ⚠️ 元の実装自体、実際には URL のテキスト表示＋
//     コピーだけで、QR画像は生成していない（`qrcode` ライブラリを呼んでいない）。
//     その挙動をそのまま踏襲する（見出しは「QR」のまま — 元の表記も変えていない）。
//
// マウント時の owner 解決・「取得または作成」は `useLiveProgram` が行う
// （ダッシュボードと共通）。
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, QrCode, ExternalLink, Trash2, ChevronRight, AlertCircle, Timer, Loader2, LayoutTemplate } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';
import { useLiveProgram } from './useLiveProgram';
import BackToOwner, { type BackToOwnerTarget } from './BackToOwner';
import { useTimer } from '@gmo-onair/shared/src/client/live/useTimer';
import TimerDisplay from '@/components/live/TimerDisplay';
import TimerControls from '@/components/live/TimerControls';

interface TimerData { id: string; name: string; phase: string }

export default function LiveTimerAdminPage() {
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
          description="計時・視聴者は案件（プロジェクト管理外の番組ではありません）に紐づく機能です。案件のハブ画面から開いてください。"
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

  return <TimerAdminContent owner={live.owner} programId={live.programId} />;
}

function TimerAdminContent({ owner, programId }: {
  owner: BackToOwnerTarget & { glsNumber: string | null };
  programId: string;
}) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');

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
  }, [timers, selectedId]);

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
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mb-4 flex items-center gap-3">
        <BackToOwner owner={owner} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">タイマー管理</h1>
          <p className="truncate text-xs text-muted-foreground">{owner.glsNumber ?? owner.name}</p>
        </div>
        <MiniAppSwitcher owner={owner} current="liveops" />
        {canManage && (
          <Button size="sm" className="h-9 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />新規
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border sm:flex-row">
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
                  className={`w-full flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors min-h-tap ${
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
                <Link to={`/techops/live/${owner.id}/timers/${selectedId}/layout`}>
                  <Button variant="outline" size="sm">
                    <LayoutTemplate className="h-4 w-4 mr-1.5" />レイアウト編集
                  </Button>
                </Link>
                {canManage && (
                  <Button
                    variant="ghost" size="sm"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => { if (confirm('削除しますか？')) deleteMutation.mutate(selectedId); }} // ui-tokens-ok: client-live 原実装のまま移植（このステージは移植のみ）
                  >
                    <Trash2 className="h-4 w-4 mr-1" />削除
                  </Button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm py-16">
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
