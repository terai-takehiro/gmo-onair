import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  Trophy, ChevronLeft, Plus, Trash2, Check, X,
  Upload, RefreshCw, Tv2, Shuffle, FileSpreadsheet,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────
interface Entry {
  id: number;
  rank: number | null;
  name: string;
  org: string | null;
  points: number | null;
  photo_url: string | null;
  is_winner: boolean;
}

interface Category {
  id: number;
  name: string;
  description: string | null;
  display_order: number;
  entries: Entry[];
}

interface AwardsEventDetail {
  id: number;
  name: string;
  subtitle: string | null;
  description: string | null;
  scheduled_at: string | null;
  status: 'draft' | 'live' | 'closed';
  categories: Category[];
}

const STATUS_OPTIONS = [
  { value: 'draft',  label: '準備中' },
  { value: 'live',   label: 'LIVE中' },
  { value: 'closed', label: '終了' },
] as const;

// ── Inline edit helpers ──────────────────────────────────────
function InlineText({
  value, onSave, placeholder, className,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className={cn('text-left hover:opacity-70 transition-opacity', className)}
      >
        {value || <span className="text-muted-foreground/60">{placeholder}</span>}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(draft); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className={cn('flex-1 rounded border bg-background px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50', className)}
      />
      <button onClick={() => { onSave(draft); setEditing(false); }} className="text-primary"><Check className="h-4 w-4" /></button>
      <button onClick={() => setEditing(false)} className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ── EntryRow ────────────────────────────────────────────────
function EntryRow({
  entry, onUpdate, onDelete, onPhotoUpload,
}: {
  entry: Entry;
  onUpdate: (patch: Partial<Entry>) => void;
  onDelete: () => void;
  onPhotoUpload: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
      <div className="w-8 text-center text-xs font-bold text-muted-foreground">
        {entry.rank ?? '–'}
      </div>
      {/* Photo */}
      <button
        onClick={() => fileRef.current?.click()}
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border hover:ring-primary/50 transition-all"
        title="写真をアップロード"
      >
        {entry.photo_url
          ? <img src={entry.photo_url} alt="" className="h-full w-full object-cover" />
          : <Upload className="h-3.5 w-3.5 text-muted-foreground/50 absolute inset-0 m-auto" />
        }
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = ''; }}
      />
      {/* Name */}
      <div className="flex-1 min-w-0">
        <InlineText
          value={entry.name}
          onSave={(v) => onUpdate({ name: v })}
          placeholder="氏名"
          className="font-medium truncate"
        />
        <InlineText
          value={entry.org ?? ''}
          onSave={(v) => onUpdate({ org: v || null })}
          placeholder="所属"
          className="text-xs text-muted-foreground"
        />
      </div>
      {/* Points */}
      <div className="w-20 text-right">
        <InlineText
          value={entry.points != null ? String(entry.points) : ''}
          onSave={(v) => onUpdate({ points: v ? parseInt(v) || null : null })}
          placeholder="pt"
          className="text-xs font-mono"
        />
      </div>
      {/* Winner */}
      <button
        onClick={() => onUpdate({ is_winner: !entry.is_winner })}
        title={entry.is_winner ? '大賞' : '大賞にする'}
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all',
          entry.is_winner
            ? 'bg-amber-400/20 text-amber-600'
            : 'text-muted-foreground/30 hover:text-amber-500'
        )}
      >
        <Trophy className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="text-muted-foreground/40 hover:text-destructive transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
export default function EventEditorPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<'info' | 'categories'>('categories');
  const [newCatName, setNewCatName] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [importingCatName, setImportingCatName] = useState('');
  const [importGenDummy, setImportGenDummy] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/internal/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['awards-event', eventId] });

  const updateEvent = useMutation({
    mutationFn: async (patch: Partial<AwardsEventDetail>) => {
      await api.put(`/api/v1/internal/awards/events/${eventId}`, {
        name: event?.name, ...patch,
      });
    },
    onSuccess: invalidate,
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) => {
      await api.post(`/api/v1/internal/awards/events/${eventId}/status`, { status });
    },
    onSuccess: invalidate,
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      await api.post(`/api/v1/internal/awards/events/${eventId}/categories`, { name });
    },
    onSuccess: () => { invalidate(); setAddingCat(false); setNewCatName(''); },
  });

  const deleteCategory = useMutation({
    mutationFn: async (catId: number) => {
      await api.delete(`/api/v1/internal/awards/categories/${catId}`);
    },
    onSuccess: invalidate,
  });

  const addEntry = useMutation({
    mutationFn: async ({ catId, name }: { catId: number; name: string }) => {
      await api.post(`/api/v1/internal/awards/categories/${catId}/entries`, { name });
    },
    onSuccess: invalidate,
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id: eid, patch }: { id: number; patch: Partial<Entry> }) => {
      const old = event?.categories.flatMap((c) => c.entries).find((e) => e.id === eid);
      if (!old) return;
      await api.put(`/api/v1/internal/awards/entries/${eid}`, { ...old, ...patch });
    },
    onSuccess: invalidate,
  });

  const deleteEntry = useMutation({
    mutationFn: async (eid: number) => { await api.delete(`/api/v1/internal/awards/entries/${eid}`); },
    onSuccess: invalidate,
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ eid, file }: { eid: number; file: File }) => {
      const fd = new FormData();
      fd.append('photo', file);
      await api.post(`/api/v1/internal/awards/entries/${eid}/photo`, fd);
    },
    onSuccess: invalidate,
  });

  const generateDummyPoints = useMutation({
    mutationFn: async (catId: number) => {
      await api.post(`/api/v1/internal/awards/categories/${catId}/generate-dummy-points`);
    },
    onSuccess: invalidate,
  });

  const seedDummy = useMutation({
    mutationFn: async () => {
      await api.post(`/api/v1/internal/awards/events/${eventId}/seed-dummy`, {
        categoryName: 'ベストパフォーマンス賞',
        entryCount: 5,
      });
    },
    onSuccess: invalidate,
  });

  const importExcel = async (file: File, catName: string) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('categoryName', catName);
    if (importGenDummy) fd.append('generateDummyPoints', 'true');
    try {
      await api.post(`/api/v1/internal/awards/events/${eventId}/import-excel`, fd);
      invalidate();
    } catch (err: any) {
      alert(`インポートエラー: ${err?.response?.data?.error?.message ?? err.message}`);
    }
  };

  if (isLoading || !event) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const tabs = [
    { key: 'categories', label: 'カテゴリ / エントリ' },
    { key: 'info',       label: 'イベント情報' },
  ] as const;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/')} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{event.name}</h1>
          {event.subtitle && <p className="text-xs text-muted-foreground">{event.subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={event.status}
            onChange={(e) => changeStatus.mutate(e.target.value)}
            className="rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => navigate(`/event/${eventId}/control`)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
          >
            <Tv2 className="h-3.5 w-3.5" />
            送出コントロール
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── カテゴリ / エントリ タブ ── */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAddingCat(true)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" /> カテゴリ追加
            </button>
            <button
              onClick={() => seedDummy.mutate()}
              disabled={seedDummy.isPending}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors text-muted-foreground"
              title="ダミーカテゴリとエントリを挿入（テスト用）"
            >
              <Shuffle className="h-4 w-4" />
              ダミーデータ挿入
            </button>
            <label className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              Excelインポート
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    const catName = prompt('カテゴリ名を入力してください', importingCatName || 'インポート') ?? '';
                    if (catName.trim()) {
                      setImportingCatName(catName.trim());
                      importExcel(f, catName.trim());
                    }
                  }
                  e.target.value = '';
                }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={importGenDummy}
                onChange={(e) => setImportGenDummy(e.target.checked)}
                className="rounded"
              />
              ポイント自動生成
            </label>
          </div>

          {addingCat && (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newCatName.trim()) addCategory.mutate(newCatName.trim());
                  if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); }
                }}
                placeholder="カテゴリ名（例: ベストパフォーマンス賞）"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                onClick={() => { if (newCatName.trim()) addCategory.mutate(newCatName.trim()); }}
                className="rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90"
              >
                追加
              </button>
              <button
                onClick={() => { setAddingCat(false); setNewCatName(''); }}
                className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              >
                取消
              </button>
            </div>
          )}

          {event.categories.length === 0 && !addingCat && (
            <div className="py-12 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">カテゴリがありません</p>
              <p className="text-xs mt-1 opacity-70">「カテゴリ追加」またはExcelインポートから作成してください</p>
            </div>
          )}

          {event.categories.map((cat) => (
            <CategorySection
              key={cat.id}
              cat={cat}
              onDeleteCat={() => {
                if (confirm(`「${cat.name}」を削除しますか？`)) deleteCategory.mutate(cat.id);
              }}
              onAddEntry={(name) => addEntry.mutate({ catId: cat.id, name })}
              onUpdateEntry={(eid, patch) => updateEntry.mutate({ id: eid, patch })}
              onDeleteEntry={(eid) => deleteEntry.mutate(eid)}
              onPhotoUpload={(eid, file) => uploadPhoto.mutate({ eid, file })}
              onGenerateDummyPoints={() => generateDummyPoints.mutate(cat.id)}
            />
          ))}
        </div>
      )}

      {/* ── イベント情報 タブ ── */}
      {activeTab === 'info' && (
        <div className="space-y-4 max-w-lg">
          <FormField label="イベント名">
            <input
              defaultValue={event.name}
              onBlur={(e) => e.target.value !== event.name && updateEvent.mutate({ name: e.target.value })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </FormField>
          <FormField label="サブタイトル">
            <input
              defaultValue={event.subtitle ?? ''}
              onBlur={(e) => updateEvent.mutate({ subtitle: e.target.value || null })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </FormField>
          <FormField label="開催日">
            <input
              type="datetime-local"
              defaultValue={event.scheduled_at ? event.scheduled_at.slice(0, 16) : ''}
              onBlur={(e) => updateEvent.mutate({ scheduled_at: e.target.value || null })}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </FormField>
          <FormField label="説明">
            <textarea
              defaultValue={event.description ?? ''}
              onBlur={(e) => updateEvent.mutate({ description: e.target.value || null })}
              rows={3}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </FormField>
          <div className="pt-2 border-t">
            <p className="text-sm font-medium mb-2">出力URL（OBS / vMix ブラウザソース）</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs font-mono break-all">
                {window.location.origin}/awards/output/{event.id}?transparent=1
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(
                  `${window.location.origin}/awards/output/${event.id}?transparent=1`
                )}
                className="shrink-0 rounded-lg border px-3 py-2 text-xs hover:bg-muted"
              >
                コピー
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function CategorySection({
  cat, onDeleteCat, onAddEntry, onUpdateEntry, onDeleteEntry, onPhotoUpload, onGenerateDummyPoints,
}: {
  cat: Category;
  onDeleteCat: () => void;
  onAddEntry: (name: string) => void;
  onUpdateEntry: (eid: number, patch: Partial<Entry>) => void;
  onDeleteEntry: (eid: number) => void;
  onPhotoUpload: (eid: number, file: File) => void;
  onGenerateDummyPoints: () => void;
}) {
  const [addingEntry, setAddingEntry] = useState(false);
  const [newEntryName, setNewEntryName] = useState('');

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/40 border-b">
        <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
        <span className="font-semibold text-sm flex-1 truncate">{cat.name}</span>
        <span className="text-xs text-muted-foreground">{cat.entries.length}名</span>
        <button
          onClick={onGenerateDummyPoints}
          title="ダミーポイントを自動生成"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          pt生成
        </button>
        <button
          onClick={() => setAddingEntry(true)}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <Plus className="h-3 w-3" />
          追加
        </button>
        <button
          onClick={onDeleteCat}
          className="text-muted-foreground/40 hover:text-destructive transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-1.5">
        {addingEntry && (
          <div className="flex gap-2 mb-2">
            <input
              autoFocus
              value={newEntryName}
              onChange={(e) => setNewEntryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newEntryName.trim()) {
                  onAddEntry(newEntryName.trim());
                  setAddingEntry(false);
                  setNewEntryName('');
                }
                if (e.key === 'Escape') { setAddingEntry(false); setNewEntryName(''); }
              }}
              placeholder="氏名 / 名称"
              className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={() => {
                if (newEntryName.trim()) {
                  onAddEntry(newEntryName.trim());
                  setAddingEntry(false);
                  setNewEntryName('');
                }
              }}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white hover:bg-primary/90"
            >
              追加
            </button>
            <button
              onClick={() => { setAddingEntry(false); setNewEntryName(''); }}
              className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted"
            >
              取消
            </button>
          </div>
        )}

        {cat.entries.length === 0 && !addingEntry && (
          <p className="py-4 text-center text-xs text-muted-foreground/60">
            エントリがありません
          </p>
        )}

        {cat.entries.map((entry) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            onUpdate={(patch) => onUpdateEntry(entry.id, patch)}
            onDelete={() => onDeleteEntry(entry.id)}
            onPhotoUpload={(file) => onPhotoUpload(entry.id, file)}
          />
        ))}
      </div>
    </div>
  );
}
