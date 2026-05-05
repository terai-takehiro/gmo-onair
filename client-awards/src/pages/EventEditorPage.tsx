import { useState, useRef, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Trophy, ChevronLeft, Plus, Trash2, Check, X, GripVertical,
  Upload, RefreshCw, Tv2, Shuffle, FileSpreadsheet, ExternalLink, Copy,
  ChevronDown, ChevronRight, Subtitles, Download, RotateCcw,
} from 'lucide-react';
import ExcelImportDialog from '../oneshot/operator/ExcelImportDialog';
import {
  fetchEventModuleConfig, saveEventModuleConfig,
} from '../oneshot/lib/moduleConfig';
import { createDefaultEventModuleConfig } from '../oneshot/data/presetModules';

// ── Types ───────────────────────────────────────────────────
interface Entry {
  id: number;
  rank: number | null;
  name: string;
  name_en: string | null;
  org: string | null;
  org_en: string | null;
  image_id: string | null;
  points: number | null;
  own_points: number | null;
  photo_url: string | null;
  is_winner: boolean;
}

interface Category {
  id: number;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
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

interface AwardGroup {
  name: string;
  nameEn: string | null;
  divisions: Category[];
}

function groupByAward(categories: Category[]): AwardGroup[] {
  const map = new Map<string, Category[]>();
  const order: string[] = [];
  for (const cat of categories) {
    if (!map.has(cat.name)) { map.set(cat.name, []); order.push(cat.name); }
    map.get(cat.name)!.push(cat);
  }
  return order.map((name) => {
    const divisions = map.get(name)!;
    const nameEn = divisions.find((d) => d.name_en?.trim())?.name_en ?? null;
    return { name, nameEn, divisions };
  });
}

function computeReorderPayload(groups: AwardGroup[]) {
  let i = 1;
  return groups.flatMap((g) => g.divisions.map((d) => ({ id: d.id, displayOrder: i++ })));
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
  const ownPct = entry.own_points != null && entry.points
    ? Math.round(entry.own_points / entry.points * 100)
    : null;

  return (
    <div className="flex items-start gap-2 rounded-lg border bg-background px-3 py-2.5 text-sm">
      {/* Rank */}
      <div className="mt-1.5 w-6 shrink-0 text-center text-xs font-bold text-muted-foreground">
        {entry.rank ?? '–'}
      </div>

      {/* Photo */}
      <button
        onClick={() => fileRef.current?.click()}
        className="relative mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border hover:ring-primary/50 transition-all"
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

      {/* Identity */}
      <div className="flex-1 min-w-0 space-y-0.5">
        {/* JA name + EN name */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <InlineText
            value={entry.name}
            onSave={(v) => onUpdate({ name: v })}
            placeholder="氏名"
            className="font-semibold"
          />
          <InlineText
            value={entry.name_en ?? ''}
            onSave={(v) => onUpdate({ name_en: v || null })}
            placeholder="Name EN"
            className="text-xs text-muted-foreground/60"
          />
        </div>
        {/* JA org + EN org */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <InlineText
            value={entry.org ?? ''}
            onSave={(v) => onUpdate({ org: v || null })}
            placeholder="会社名"
            className="text-xs text-muted-foreground"
          />
          <InlineText
            value={entry.org_en ?? ''}
            onSave={(v) => onUpdate({ org_en: v || null })}
            placeholder="Company EN"
            className="text-xs text-muted-foreground/50"
          />
        </div>
        {/* Image ID badge */}
        {entry.image_id && (
          <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/50">
            {entry.image_id}
          </span>
        )}
      </div>

      {/* Points */}
      <div className="shrink-0 space-y-1 text-right">
        <div className="flex items-baseline justify-end gap-1">
          <InlineText
            value={entry.points != null ? String(entry.points) : ''}
            onSave={(v) => onUpdate({ points: v ? parseInt(v) || null : null })}
            placeholder="—"
            className=" font-bold text-sm tabular-nums"
          />
          <span className="text-[10px] font-medium text-muted-foreground">PT</span>
        </div>
        <div className="flex items-center justify-end gap-1">
          <span className="text-[10px] font-semibold text-amber-600/70">自社</span>
          <InlineText
            value={entry.own_points != null ? String(entry.own_points) : ''}
            onSave={(v) => onUpdate({ own_points: v ? parseInt(v) || null : null })}
            placeholder="—"
            className=" text-xs tabular-nums text-amber-600"
          />
          {ownPct != null && (
            <span className="text-[10px] tabular-nums text-amber-600/50">({ownPct}%)</span>
          )}
        </div>
      </div>

      {/* Winner */}
      <button
        onClick={() => onUpdate({ is_winner: !entry.is_winner })}
        title={entry.is_winner ? '大賞' : '大賞にする'}
        className={cn(
          'mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all',
          entry.is_winner
            ? 'bg-amber-400/20 text-amber-600'
            : 'text-muted-foreground/30 hover:text-amber-500'
        )}
      >
        <Trophy className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="mt-1 text-muted-foreground/40 hover:text-destructive transition-colors"
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
  const [importOpen, setImportOpen] = useState(false);

  const { data: event, isLoading } = useQuery({
    queryKey: ['awards-event', eventId],
    queryFn: async () => {
      const res = await api.get(`/awards/events/${eventId}`);
      return res.data.data as AwardsEventDetail;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['awards-event', eventId] });

  // ── DnD local order state ───────────────────────────────────
  const [localOrder, setLocalOrder] = useState<number[]>([]);
  useEffect(() => {
    if (event) setLocalOrder(event.categories.map((c) => c.id));
  }, [event]);
  const orderedCategories = useMemo(() => {
    if (!event) return [];
    const map = new Map(event.categories.map((c) => [c.id, c]));
    return localOrder.map((id) => map.get(id)!).filter(Boolean);
  }, [event, localOrder]);
  const awardGroups = useMemo(() => groupByAward(orderedCategories), [orderedCategories]);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateEvent = useMutation({
    mutationFn: async (patch: Partial<AwardsEventDetail>) => {
      await api.put(`/awards/events/${eventId}`, {
        name: event?.name, ...patch,
      });
    },
    onSuccess: invalidate,
  });

  const changeStatus = useMutation({
    mutationFn: async (status: string) => {
      await api.post(`/awards/events/${eventId}/status`, { status });
    },
    onSuccess: invalidate,
  });

  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      await api.post(`/awards/events/${eventId}/categories`, { name });
    },
    onSuccess: () => { invalidate(); setAddingCat(false); setNewCatName(''); },
  });

  const deleteCategory = useMutation({
    mutationFn: async (catId: number) => {
      await api.delete(`/awards/categories/${catId}`);
    },
    onSuccess: invalidate,
  });

  const updateCategory = useMutation({
    mutationFn: async ({
      catId,
      patch,
    }: {
      catId: number;
      patch: { name?: string; name_en?: string | null; description?: string | null; description_en?: string | null };
    }) => {
      const cat = event?.categories.find((c) => c.id === catId);
      if (!cat) return;
      await api.put(`/awards/categories/${catId}`, {
        name: cat.name,
        name_en: cat.name_en,
        description: cat.description,
        description_en: cat.description_en,
        ...patch,
      });
    },
    onSuccess: invalidate,
  });

  const addEntry = useMutation({
    mutationFn: async ({ catId, name }: { catId: number; name: string }) => {
      await api.post(`/awards/categories/${catId}/entries`, { name });
    },
    onSuccess: invalidate,
  });

  const updateEntry = useMutation({
    mutationFn: async ({ id: eid, patch }: { id: number; patch: Partial<Entry> }) => {
      const old = event?.categories.flatMap((c) => c.entries).find((e) => e.id === eid);
      if (!old) return;
      await api.put(`/awards/entries/${eid}`, { ...old, ...patch });
    },
    onSuccess: invalidate,
  });

  const deleteEntry = useMutation({
    mutationFn: async (eid: number) => { await api.delete(`/awards/entries/${eid}`); },
    onSuccess: invalidate,
  });

  const uploadPhoto = useMutation({
    mutationFn: async ({ eid, file }: { eid: number; file: File }) => {
      const fd = new FormData();
      fd.append('photo', file);
      await api.post(`/awards/entries/${eid}/photo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: invalidate,
  });

  const generateDummyPoints = useMutation({
    mutationFn: async (catId: number) => {
      await api.post(`/awards/categories/${catId}/generate-dummy-points`);
    },
    onSuccess: invalidate,
  });

  const reorderCategories = useMutation({
    mutationFn: async (order: { id: number; displayOrder: number }[]) => {
      await api.put(`/awards/events/${eventId}/categories/reorder`, { order });
    },
    onSuccess: invalidate,
  });

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const aid = String(active.id);
    const oid = String(over.id);
    let newGroups = [...awardGroups];
    if (aid.startsWith('group:') && oid.startsWith('group:')) {
      const fi = newGroups.findIndex((g) => `group:${g.name}` === aid);
      const ti = newGroups.findIndex((g) => `group:${g.name}` === oid);
      if (fi < 0 || ti < 0) return;
      newGroups = arrayMove(newGroups, fi, ti);
    } else if (aid.startsWith('div:') && oid.startsWith('div:')) {
      const fromId = parseInt(aid.slice(4));
      const toId = parseInt(oid.slice(4));
      const gi = newGroups.findIndex((g) => g.divisions.some((d) => d.id === fromId));
      if (gi < 0) return;
      const g = newGroups[gi];
      const fi = g.divisions.findIndex((d) => d.id === fromId);
      const ti = g.divisions.findIndex((d) => d.id === toId);
      if (fi < 0 || ti < 0) return;
      newGroups = [...newGroups];
      newGroups[gi] = { ...g, divisions: arrayMove(g.divisions, fi, ti) };
    } else return;
    const newOrder = newGroups.flatMap((g) => g.divisions.map((d) => d.id));
    setLocalOrder(newOrder);
    reorderCategories.mutate(computeReorderPayload(newGroups));
  };

  const seedDummy = useMutation({
    mutationFn: async () => {
      await api.post(`/awards/events/${eventId}/seed-dummy`, {
        categoryName: 'ベストパフォーマンス賞',
        entryCount: 5,
      });
    },
    onSuccess: invalidate,
  });

  // 旧 importExcel (alert ベース) は ExcelImportDialog に置き換え済み

  const importImages = async (files: FileList) => {
    const fd = new FormData();
    // フォルダ選択時は webkitRelativePath が入るので、サーバー側で basename 化される
    for (const f of Array.from(files)) {
      // 隠しファイルや OS メタデータはアップロード自体をスキップ（転送量削減）
      const baseName = f.name;
      if (baseName.startsWith('.') || baseName.toLowerCase() === 'thumbs.db') continue;
      fd.append('images', f);
    }
    try {
      const res = await api.post(`/awards/events/${eventId}/import-images`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const d = res.data.data as {
        matched: number;
        unmatched: string[];
        skipped?: string[];
        debug?: {
          totalEntries: number;
          entriesWithImageId: number;
          sampleImageIds: string[];
          unmatchedDetails: { name: string; tried: string }[];
        };
      };
      const lines = [`${d.matched}件の写真をマッチしました`];
      if (d.unmatched.length) {
        const sample = d.unmatched.slice(0, 5).join(', ');
        lines.push(`未マッチ(${d.unmatched.length}件): ${sample}${d.unmatched.length > 5 ? '...' : ''}`);
      }
      if (d.skipped?.length) {
        lines.push(`スキップ(${d.skipped.length}件): 隠しファイル等`);
      }
      // 0 件マッチの場合は診断情報を表示
      if (d.matched === 0 && d.debug) {
        lines.push('');
        lines.push(`▼ 診断情報`);
        lines.push(`DB エントリ数: ${d.debug.totalEntries} (画像ID あり: ${d.debug.entriesWithImageId})`);
        if (d.debug.sampleImageIds.length) {
          lines.push(`DB の画像IDサンプル: ${d.debug.sampleImageIds.join(', ')}`);
        } else {
          lines.push(`⚠ DB に保存されている image_id がありません。Excel の「画像ID」列が空 or インポート前の可能性があります。`);
        }
        if (d.debug.unmatchedDetails.length) {
          lines.push(`試行キー(先頭3件):`);
          for (const u of d.debug.unmatchedDetails.slice(0, 3)) {
            lines.push(`  ${u.name} → [${u.tried}]`);
          }
        }
      }
      alert(lines.join('\n'));
      invalidate();
    } catch (err: any) {
      alert(`画像インポートエラー: ${err?.response?.data?.error?.message ?? err.message}`);
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
            onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 transition-colors"
            title="下位置CG (下部テロップ) のオペレーター画面"
          >
            <Subtitles className="h-3.5 w-3.5" />
            下位置CG
          </button>
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
              <Plus className="h-4 w-4" /> 賞を追加
            </button>
            <button
              onClick={() => seedDummy.mutate()}
              disabled={seedDummy.isPending}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors text-muted-foreground"
              title="ダミーカテゴリとエントリを挿入（テスト用）"
            >
              <Shuffle className="h-4 w-4" />
              ダミーデータ
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors text-muted-foreground"
              title="Excel をアップロードして列マッピング画面で取り込み"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excelインポート
            </button>
            <label
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors cursor-pointer text-muted-foreground"
              title="フォルダを選択。ファイル名（拡張子除く）が「画像ID」または「ノミネート名／英語名」と一致する写真を一括登録します"
            >
              <Upload className="h-4 w-4" />
              画像フォルダ
              <input
                type="file"
                multiple
                className="hidden"
                // 非標準属性: フォルダ選択を有効化（Chrome / Edge / Safari / Firefox 対応）
                {...({ webkitdirectory: '', directory: '', mozdirectory: '' } as Record<string, string>)}
                onChange={(e) => { if (e.target.files?.length) importImages(e.target.files); e.target.value = ''; }}
              />
            </label>
          </div>

          {/* Add award form */}
          {addingCat && (
            <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-4 space-y-2">
              <p className="text-xs font-medium text-amber-800">新しい賞を追加</p>
              <div className="flex gap-2">
                <input autoFocus value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCatName.trim()) addCategory.mutate(newCatName.trim());
                    if (e.key === 'Escape') { setAddingCat(false); setNewCatName(''); }
                  }}
                  placeholder="賞名（例: キャリア新人賞）"
                  className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50"
                />
                <button onClick={() => { if (newCatName.trim()) addCategory.mutate(newCatName.trim()); }}
                  className="rounded-lg bg-amber-500 px-3 py-2 text-sm text-white hover:bg-amber-600">追加</button>
                <button onClick={() => { setAddingCat(false); setNewCatName(''); }}
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">取消</button>
              </div>
            </div>
          )}

          {event.categories.length === 0 && !addingCat && (
            <div className="py-12 text-center text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">カテゴリがありません</p>
              <p className="text-xs mt-1 opacity-70">「賞を追加」またはExcelインポートから作成してください</p>
            </div>
          )}

          {/* Hierarchical DnD list */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={awardGroups.map((g) => `group:${g.name}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {awardGroups.map((group) => (
                  <SortableAwardGroupCard
                    key={group.name}
                    group={group}
                    onUpdateAwardName={(newName) => {
                      if (!newName.trim()) return;
                      group.divisions.forEach((cat) =>
                        updateCategory.mutate({ catId: cat.id, patch: { name: newName.trim() } })
                      );
                    }}
                    onUpdateAwardNameEn={(newNameEn) => {
                      const v = newNameEn.trim() || null;
                      group.divisions.forEach((cat) =>
                        updateCategory.mutate({ catId: cat.id, patch: { name_en: v } })
                      );
                    }}
                    onAddDivision={(awardName) => {
                      addCategory.mutate(awardName);
                    }}
                    onDeleteCat={(catId) => {
                      const cat = event.categories.find((c) => c.id === catId);
                      if (confirm(`「${cat?.description || cat?.name}」を削除しますか？`))
                        deleteCategory.mutate(catId);
                    }}
                    onUpdateCat={(catId, patch) => updateCategory.mutate({ catId, patch })}
                    onAddEntry={(catId, name) => addEntry.mutate({ catId, name })}
                    onUpdateEntry={(eid, patch) => updateEntry.mutate({ id: eid, patch })}
                    onDeleteEntry={(eid) => deleteEntry.mutate(eid)}
                    onPhotoUpload={(eid, file) => uploadPhoto.mutate({ eid, file })}
                    onGenerateDummyPoints={(catId) => generateDummyPoints.mutate(catId)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
          <div className="pt-2 border-t space-y-2">
            <p className="text-sm font-medium">出力URL（OBS / vMix — Allow Transparency ON）</p>
            <p className="text-xs text-muted-foreground">アルファチャンネル付き透過出力。ブラウザソースの「透明度を許可」を有効にしてください。</p>
            {[
              { label: '🇯🇵 日本語', lang: 'ja' },
              { label: '🇺🇸 English', lang: 'en' },
            ].map(({ label, lang }) => {
              const url = `${window.location.origin}/awards/output/${event.id}?lang=${lang}`;
              return (
                <div key={lang} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground font-medium">{label}</span>
                  <code className="flex-1 min-w-0 rounded-lg bg-muted px-2 py-1.5 text-xs truncate">{url}</code>
                  <button onClick={() => navigator.clipboard.writeText(url)} title="URLをコピー"
                    className="shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted transition-colors">
                    <Copy className="h-3 w-3" />コピー
                  </button>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted transition-colors">
                    <ExternalLink className="h-3 w-3" />開く
                  </a>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Subtitles className="h-3.5 w-3.5 text-amber-600" />
              下位置CG 出力URL（下部テロップ）
            </p>
            <p className="text-xs text-muted-foreground">
              「下位置CG オペレーター」と同じイベントを送出するブラウザソース URL。
              ランキングCG とは別レイヤーとして並走可能。
            </p>
            {[
              { label: '🇯🇵 日本語', lang: 'ja' },
              { label: '🇺🇸 English', lang: 'en' },
            ].map(({ label, lang }) => {
              const url = `${window.location.origin}/awards/output/${event.id}/oneshot?lang=${lang}`;
              return (
                <div key={lang} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-xs text-muted-foreground font-medium">{label}</span>
                  <code className="flex-1 min-w-0 rounded-lg bg-muted px-2 py-1.5 text-xs truncate">{url}</code>
                  <button onClick={() => navigator.clipboard.writeText(url)} title="URLをコピー"
                    className="shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted transition-colors">
                    <Copy className="h-3 w-3" />コピー
                  </button>
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted transition-colors">
                    <ExternalLink className="h-3 w-3" />開く
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 下位置CG モジュール構成 (Stage 3: JSON エクスポート/インポート) ── */}
      {event && <ModuleConfigSection eventId={event.id} />}

      {/* ── Excel Import Dialog ─────────────────────────────── */}
      <ExcelImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        eventId={eventId}
        onImported={() => invalidate()}
      />
    </div>
  );
}

// ── 下位置CG モジュール構成 セクション (v2.8.74+) ────────────
// イベントごとの ModuleDef[] (送出モジュール構成) を編集 + JSON I/O。
// 段階4 (v2.8.75+) で「編集ページへ」ボタンを追加。
function ModuleConfigSection({ eventId }: { eventId: number }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      // サーバーが null を返した場合 (= まだ未編集) はデフォルトプリセットをエクスポート
      const remote = await fetchEventModuleConfig(eventId);
      const config = remote ?? createDefaultEventModuleConfig();
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oneshot-module-config_event-${eventId}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ kind: 'ok', msg: 'JSON をエクスポートしました' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      if (config.version !== 1 || !Array.isArray(config.modules)) {
        throw new Error('JSON 形式が不正です (version=1, modules:[] を含む必要があります)');
      }
      await saveEventModuleConfig(eventId, config);
      setStatus({ kind: 'ok', msg: `インポート完了 (${config.modules.length} モジュール)` });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('モジュール構成をデフォルトプリセットに戻しますか？')) return;
    setBusy(true);
    setStatus(null);
    try {
      await saveEventModuleConfig(eventId, null);
      setStatus({ kind: 'ok', msg: 'デフォルトプリセットに戻しました' });
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-2">
        <Subtitles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold flex items-center gap-2">
            下位置CG モジュール構成
            <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              段階3 (JSON I/O)
            </span>
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            送出モジュール (タイトル / 尊敬ポイント / 得意技 等) の構成を JSON でエクスポート/インポートできます。
            別イベント・別環境への移植や BOX への手動バックアップに利用してください。
            DB 自動バックアップ (3 時間ごと BOX) でもこの設定は保護されます。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => navigate(`/event/${eventId}/oneshot/modules`)}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-500 px-3 py-2 text-xs font-bold transition-colors"
        >
          <Subtitles className="h-3.5 w-3.5" />
          モジュール編集
        </button>
        <button
          onClick={handleExport}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          JSON エクスポート
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Upload className="h-3.5 w-3.5" />
          JSON インポート
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImport(f);
            e.target.value = '';
          }}
        />
        <button
          onClick={handleReset}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-red-300 text-red-700 px-3 py-2 text-xs font-bold hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="デフォルトプリセット (タイトル / 尊敬ポイント など 7 種) に戻す"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          プリセットに戻す
        </button>
        {status && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-1 rounded',
              status.kind === 'ok' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-red-700 bg-red-50 border border-red-200'
            )}
          >
            {status.msg}
          </span>
        )}
      </div>
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

// ── SortableDivisionSection ─────────────────────────────────
function SortableDivisionSection({ cat, onDeleteCat, onUpdateCat, onAddEntry, onUpdateEntry, onDeleteEntry, onPhotoUpload, onGenerateDummyPoints }: {
  cat: Category;
  onDeleteCat: () => void;
  onUpdateCat: (patch: { name?: string; name_en?: string | null; description?: string | null; description_en?: string | null }) => void;
  onAddEntry: (name: string) => void;
  onUpdateEntry: (eid: number, patch: Partial<Entry>) => void;
  onDeleteEntry: (eid: number) => void;
  onPhotoUpload: (eid: number, file: File) => void;
  onGenerateDummyPoints: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingEntry, setAddingEntry] = useState(false);
  const [newEntryName, setNewEntryName] = useState('');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `div:${cat.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50/80 border-b">
        <button {...listeners} {...attributes} className="cursor-grab touch-none text-slate-300 hover:text-slate-500 transition-colors" title="ドラッグして並び替え">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="text-slate-400 hover:text-slate-600">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex-1 min-w-0 space-y-0.5">
          <InlineText value={cat.description ?? ''} onSave={(v) => onUpdateCat({ description: v.trim() || null })} placeholder="部門名" className="text-sm font-medium" />
          <InlineText value={cat.description_en ?? ''} onSave={(v) => onUpdateCat({ description_en: v.trim() || null })} placeholder="部門名（英語）" className="text-xs italic text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{cat.entries.length}名</span>
        <button onClick={onGenerateDummyPoints} title="ポイント自動生成" className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors">
          <RefreshCw className="h-3 w-3" />pt生成
        </button>
        <button onClick={() => setAddingEntry(true)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors">
          <Plus className="h-3 w-3" />追加
        </button>
        <button onClick={onDeleteCat} className="p-1 text-muted-foreground/40 hover:text-destructive transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {!collapsed && (
        <div className="p-2.5 space-y-1.5">
          {addingEntry && (
            <div className="flex gap-2 mb-2">
              <input autoFocus value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newEntryName.trim()) { onAddEntry(newEntryName.trim()); setAddingEntry(false); setNewEntryName(''); }
                  if (e.key === 'Escape') { setAddingEntry(false); setNewEntryName(''); }
                }}
                placeholder="氏名 / 名称"
                className="flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button onClick={() => { if (newEntryName.trim()) { onAddEntry(newEntryName.trim()); setAddingEntry(false); setNewEntryName(''); } }} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white">追加</button>
              <button onClick={() => { setAddingEntry(false); setNewEntryName(''); }} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-muted">取消</button>
            </div>
          )}
          {cat.entries.length === 0 && !addingEntry && (
            <p className="py-3 text-center text-xs text-muted-foreground/50">エントリがありません</p>
          )}
          {cat.entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry}
              onUpdate={(patch) => onUpdateEntry(entry.id, patch)}
              onDelete={() => onDeleteEntry(entry.id)}
              onPhotoUpload={(file) => onPhotoUpload(entry.id, file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── SortableAwardGroupCard ───────────────────────────────────
function SortableAwardGroupCard({ group, onUpdateAwardName, onUpdateAwardNameEn, onAddDivision, onDeleteCat, onUpdateCat, onAddEntry, onUpdateEntry, onDeleteEntry, onPhotoUpload, onGenerateDummyPoints }: {
  group: AwardGroup;
  onUpdateAwardName: (name: string) => void;
  onUpdateAwardNameEn: (nameEn: string) => void;
  onAddDivision: (awardName: string) => void;
  onDeleteCat: (catId: number) => void;
  onUpdateCat: (catId: number, patch: { name?: string; name_en?: string | null; description?: string | null; description_en?: string | null }) => void;
  onAddEntry: (catId: number, name: string) => void;
  onUpdateEntry: (eid: number, patch: Partial<Entry>) => void;
  onDeleteEntry: (eid: number) => void;
  onPhotoUpload: (eid: number, file: File) => void;
  onGenerateDummyPoints: (catId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `group:${group.name}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const totalEntries = group.divisions.reduce((s, d) => s + d.entries.length, 0);

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border-2 border-amber-200/70 bg-card overflow-hidden shadow-sm">
      {/* Award (賞) header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-50 to-amber-50/20 border-b border-amber-200/60">
        <button {...listeners} {...attributes} className="cursor-grab touch-none text-amber-300 hover:text-amber-500 transition-colors shrink-0" title="ドラッグして並び替え">
          <GripVertical className="h-4 w-4" />
        </button>
        <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0 space-y-0.5">
          <InlineText value={group.name} onSave={onUpdateAwardName} placeholder="賞名" className="font-bold text-sm text-amber-900" />
          <InlineText value={group.nameEn ?? ''} onSave={onUpdateAwardNameEn} placeholder="賞名（英語）" className="text-xs italic text-amber-700/70" />
        </div>
        <span className="text-xs text-amber-700/60 shrink-0 hidden sm:block">{group.divisions.length}部門・{totalEntries}名</span>
        <button onClick={() => onAddDivision(group.name)} className="flex items-center gap-1 rounded-lg border border-amber-300/50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 transition-colors shrink-0">
          <Plus className="h-3 w-3" />部門追加
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="shrink-0 text-amber-600/50 hover:text-amber-700 transition-colors">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {/* Division list */}
      {!collapsed && (
        <div className="p-3 space-y-2">
          <SortableContext items={group.divisions.map((d) => `div:${d.id}`)} strategy={verticalListSortingStrategy}>
            {group.divisions.map((cat) => (
              <SortableDivisionSection
                key={cat.id}
                cat={cat}
                onDeleteCat={() => onDeleteCat(cat.id)}
                onUpdateCat={(patch) => onUpdateCat(cat.id, patch)}
                onAddEntry={(name) => onAddEntry(cat.id, name)}
                onUpdateEntry={onUpdateEntry}
                onDeleteEntry={onDeleteEntry}
                onPhotoUpload={onPhotoUpload}
                onGenerateDummyPoints={() => onGenerateDummyPoints(cat.id)}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}
