import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Tv, Plus, Trash2, ExternalLink, Calendar, ChevronRight, Archive, RotateCcw, Clock } from 'lucide-react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { notifyError, notifySuccess } from '@/lib/notify';

interface AwardsEvent {
  id: number;
  name: string;
  subtitle: string | null;
  scheduled_at: string | null;
  status: 'draft' | 'live' | 'closed';
  created_at: string;
}

/** 演出のテンプレート (20e)。**実装しているのはアワードだけ** */
interface Template {
  key: string;
  label: string;
  implemented: boolean;
  what: string;
  uses: string[];
}

interface BoxBackup {
  eventId: number;
  name: string;
  folderId: string;
  folderName: string;
  imageCount: number;
  deleted: boolean;
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
  const [showBackups, setShowBackups] = useState(false);
  // テンプレート (20e)。既定はアワード = いま作れる唯一のもの
  const [template, setTemplate] = useState('awards');
  const [notReady, setNotReady] = useState<string | null>(null);
  const [restoreNameDraft, setRestoreNameDraft] = useState<{ folderId: string; name: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['awards-events'],
    queryFn: async () => {
      const res = await api.get('/awards/events');
      return res.data.data as AwardsEvent[];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ['awards-templates'],
    queryFn: async () => {
      const res = await api.get('/awards/templates');
      return res.data.data.templates as Template[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/awards/events', { name, template });
      return res.data.data as AwardsEvent;
    },
    onSuccess: (event) => {
      qc.invalidateQueries({ queryKey: ['awards-events'] });
      setCreating(false);
      setNewName('');
      if (event?.id) {
        navigate(`/event/${event.id}`);
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'イベント作成に失敗しました';
      notifyError(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/awards/events/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['awards-events'] });
      qc.invalidateQueries({ queryKey: ['awards-box-backups'] });
    },
  });

  const { data: backups, isLoading: backupsLoading } = useQuery({
    queryKey: ['awards-box-backups'],
    queryFn: async () => {
      const res = await api.get('/awards/box-backups');
      return res.data.data as BoxBackup[];
    },
    enabled: showBackups,
  });

  const restoreMutation = useMutation({
    mutationFn: async (input: { folderId: string; name: string }) => {
      const res = await api.post(`/awards/box-backups/${input.folderId}/restore`, {
        name: input.name,
      });
      return res.data.data as { eventId: number; filesRestored: number; entriesCreated: number };
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['awards-events'] });
      qc.invalidateQueries({ queryKey: ['awards-box-backups'] });
      setRestoreNameDraft(null);
      notifySuccess(`復元しました: ${d.filesRestored} 件の画像 / ${d.entriesCreated} 件のエントリ`);
      navigate(`/event/${d.eventId}`);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? '復元に失敗しました';
      notifyError(msg);
    },
  });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* v2.9.37: モバイル時のヘッダーをコンパクトに (ラベル/ボタン折り返し回避) */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
            <Tv className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold whitespace-nowrap">リアルタイムCG</h1>
            <p className="text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap">イベント一覧</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* BOXから復元: モバイルではアイコンのみ (36×36px)、sm+ でテキスト付き */}
          <button
            onClick={() => setShowBackups((s) => !s)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300/60 bg-amber-50 hover:bg-amber-100 transition-colors text-amber-800 font-medium h-9 w-9 sm:w-auto sm:px-3 sm:py-2 sm:text-xs whitespace-nowrap"
            title="BOX バックアップから復元"
          >
            <Archive className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span className="hidden sm:inline">BOXから復元</span>
          </button>
          {/* 新規イベント: モバイルでもテキスト残すが whitespace-nowrap で 1 行固定 */}
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 sm:gap-2 rounded-lg bg-primary hover:bg-primary/90 transition-colors text-white font-medium h-9 sm:h-auto px-3 sm:px-4 sm:py-2 text-xs sm:text-sm whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            <span className="sm:hidden">新規</span>
            <span className="hidden sm:inline">新規イベント</span>
          </button>
        </div>
      </div>

      {/* ── BOX バックアップ一覧 ──────────────────────────── */}
      {showBackups && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-amber-700" />
              <span className="text-sm font-medium text-amber-900">BOX バックアップ</span>
            </div>
            <button onClick={() => setShowBackups(false)} className="text-xs text-muted-foreground hover:text-foreground">閉じる</button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            社外共有可 / 11_awards_photo / event_*_* に残っているフォルダ。<br />
            「削除済み」マークのあるイベントは新規イベントとして復元できます。
          </p>
          {backupsLoading ? (
            <div className="text-center py-4 text-xs text-muted-foreground">読み込み中…</div>
          ) : !backups?.length ? (
            <div className="text-center py-4 text-xs text-muted-foreground">バックアップフォルダなし</div>
          ) : (
            <div className="space-y-1.5">
              {backups.map((b) => (
                <div
                  key={b.folderId}
                  className="flex items-center gap-2 rounded-lg bg-white border px-3 py-2 text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">#{b.eventId}</span>
                      <span className="font-medium truncate">{b.name}</span>
                      {b.deleted ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-700 ring-1 ring-red-200">削除済み</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">現存</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {b.imageCount} 枚 / {b.folderName}
                    </div>
                  </div>
                  {b.deleted && (
                    <button
                      onClick={() => setRestoreNameDraft({ folderId: b.folderId, name: b.name })}
                      className="flex items-center gap-1 rounded-md bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      <RotateCcw className="h-3 w-3" />
                      復元
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 復元用名前入力ダイアログ ──────────────────────── */}
      {restoreNameDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold mb-2">バックアップから復元</h3>
            <p className="text-xs text-muted-foreground mb-4">
              新しいイベントを作成し、BOX 上の画像をローカルに再ダウンロードします。
              ノミネートは「復元 #1」「復元 #2」… のプレースホルダで作成されるので、復元後に名前を編集してください。
            </p>
            <label className="block text-xs font-medium mb-1">新規イベント名</label>
            <input
              autoFocus
              value={restoreNameDraft.name}
              onChange={(e) => setRestoreNameDraft({ ...restoreNameDraft, name: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRestoreNameDraft(null)}
                className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
                disabled={restoreMutation.isPending}
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (!restoreNameDraft.name.trim()) return;
                  restoreMutation.mutate(restoreNameDraft);
                }}
                disabled={!restoreNameDraft.name.trim() || restoreMutation.isPending}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {restoreMutation.isPending ? '復元中…' : '復元する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium mb-3">新規イベント作成</p>

          {/* ── テンプレート (20e) ────────────────────────────
              一覧から隠さない。隠すと「うちの演出は作れないのか」が分からず
              毎回聞かれる。**出すが作れない**ことをその場で言う。 */}
          <p className="text-xs font-medium mb-1.5">どの演出をつくりますか</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {(templates ?? []).map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  if (!t.implemented) { setNotReady(t.label); setTemplate('awards'); return; }
                  setTemplate(t.key); setNotReady(null);
                }}
                className={cn(
                  'rounded-lg border p-2.5 text-left min-h-[44px]',
                  template === t.key
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : t.implemented ? 'hover:bg-muted' : 'opacity-60 hover:bg-muted',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {t.label}
                  {!t.implemented && (
                    <span className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      準備中
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t.what}</span>
                {t.uses.length > 0 && (
                  <span className="mt-1 block text-[11px] text-muted-foreground/80">
                    使うもの: {t.uses.join(' / ')}
                  </span>
                )}
              </button>
            ))}
          </div>
          {notReady && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              「{notReady}」は準備中です。いま作れるのは<strong>「アワード」</strong>だけなので、
              アワードに戻しました。
            </p>
          )}

          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) createMutation.mutate(newName.trim());
                if (e.key === 'Escape') { setCreating(false); setNewName(''); }
              }}
              placeholder="例: イベント名 2026"
              className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={() => { if (newName.trim()) createMutation.mutate(newName.trim()); }}
              disabled={!newName.trim() || createMutation.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 min-w-[60px]"
            >
              {createMutation.isPending ? '作成中…' : '作成'}
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
          <Tv className="h-12 w-12 text-muted-foreground/30 mb-3" />
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
                  <Tv className="h-5 w-5 text-amber-600" />
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
                    className="flex sm:hidden sm:group-hover:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted text-muted-foreground"
                    title="出力画面を開く"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if ((await confirmAction({ title: `「${event.name}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' }))) {
                        deleteMutation.mutate(event.id);
                      }
                    }}
                    className="flex sm:hidden sm:group-hover:flex items-center justify-center h-8 w-8 rounded-lg hover:bg-destructive/10 text-destructive/70 hover:text-destructive"
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
