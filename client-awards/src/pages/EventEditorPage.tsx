import { useState, useMemo, useEffect } from 'react';
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
  arrayMove,
} from '@dnd-kit/sortable';
import {
  Tv, ChevronLeft, Plus, HelpCircle,
  Upload, Shuffle, FileSpreadsheet, ExternalLink, Copy,
  Subtitles, Layers, Radio, Link2,
} from 'lucide-react';
import ExcelImportDialog from '../oneshot/operator/ExcelImportDialog';
import SoundConfigSection from '../components/SoundConfigSection';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { notifyError, notifyInfo } from '@/lib/notify';
import { Delayed, SkeletonCard } from '@gmo-onair/shared/src/client/states';

import {
  STATUS_OPTIONS, computeReorderPayload, groupByAward,
  type AwardsEventDetail, type CategoryPatch, type Entry,
} from './eventEditor/types';
import {
  FormField, SortableAwardGroupCard,
} from './eventEditor/sections';

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
      patch: CategoryPatch;
    }) => {
      const cat = event?.categories.find((c) => c.id === catId);
      if (!cat) return;
      await api.put(`/awards/categories/${catId}`, {
        name: cat.name,
        name_en: cat.name_en,
        description: cat.description,
        description_en: cat.description_en,
        award_pattern: cat.award_pattern ?? 'direct',
        poll_title: cat.poll_title ?? null,
        poll_title_en: cat.poll_title_en ?? null,
        poll_question: cat.poll_question ?? null,
        poll_question_en: cat.poll_question_en ?? null,
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
      notifyInfo(lines.join('\n'));
      invalidate();
    } catch (err: any) {
      notifyError(`画像インポートエラー: ${err?.response?.data?.error?.message ?? err.message}`);
    }
  };

  if (isLoading || !event) {
    return (
      <Delayed><SkeletonCard lines={6} /></Delayed>
    );
  }

  const tabs = [
    { key: 'categories', label: 'カテゴリ / エントリ' },
    { key: 'info',       label: 'イベント情報' },
  ] as const;

  return (
    <div className="p-4 sm:p-6 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate('/')} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{event.name}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
          <select
            value={event.status}
            onChange={(e) => changeStatus.mutate(e.target.value)}
            className="rounded-lg border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {/* ── 送出は1つ (20章 24a) ──────────────────────────
              本番中に見る画面は1つ。以前は「統合送出 / 字幕スーパー /
              アンケート・クイズ / ランキングCG」の4つが同じ並びにあり、
              **どれを開いて本番に臨むのか**が人によって違っていた。 */}
          <button
            onClick={() => navigate(`/event/${eventId}/onair`)}
            className="flex min-h-[44px] items-center gap-1.5 rounded-lg bg-red-600 px-3 sm:px-4 py-1.5 text-sm font-bold text-white hover:bg-red-700 transition-colors"
            title="本番中に見る画面。次に出るものを見てTAKEします"
          >
            <Radio className="h-4 w-4" />
            送出
          </button>
        </div>
      </div>

      {/* ── 準備（本番中は触りません。24a）────────────────────
          設定は本番の操作と同じ並びに置かない。混ざると本番中に
          設定を触ってしまう。 */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-xl border bg-muted/30 px-3 py-2">
        <span className="mr-1 text-xs font-bold text-muted-foreground">準備</span>
        <button
          onClick={() => navigate(`/event/${eventId}/intake`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-background px-3 text-xs hover:bg-muted"
          title="ノミネートの一覧を入れる (貼る / 落とす / AIに整えさせる)"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          データを入れる
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/outputs`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-background px-3 text-xs hover:bg-muted"
          title="OBS に貼る URL を作る"
        >
          <Link2 className="h-3.5 w-3.5" />
          出力URLの配り方
        </button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <button
          onClick={() => navigate(`/event/${eventId}/control`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-background px-3 text-xs hover:bg-muted"
        >
          <Tv className="h-3.5 w-3.5" />
          ランキングCGの設定
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-background px-3 text-xs hover:bg-muted"
        >
          <Subtitles className="h-3.5 w-3.5" />
          字幕スーパーの設定
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/quiz`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-background px-3 text-xs hover:bg-muted"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          クイズ・アンケートの設定
        </button>
        <button
          onClick={() => navigate(`/event/${eventId}/cg/control`)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-background px-3 text-xs text-muted-foreground hover:bg-muted"
          title="以前の統合コックピット (送出は上の「送出」を使います)"
        >
          <Layers className="h-3.5 w-3.5" />
          以前のコックピット
        </button>
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
              <Tv className="h-10 w-10 mx-auto mb-2 opacity-20" />
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
                    onDeleteCat={async (catId) => {
                      const cat = event.categories.find((c) => c.id === catId);
                      if ((await confirmAction({ title: `「${cat?.description || cat?.name}」を削除しますか？`, confirmLabel: '削除する', tone: 'danger' })))
                        deleteCategory.mutate(catId);
                    }}
                    onUpdateCat={(catId, patch) => updateCategory.mutate({ catId, patch })}
                    onAddEntry={(catId, name) => addEntry.mutate({ catId, name })}
                    onUpdateEntry={(eid, patch) => updateEntry.mutate({ id: eid, patch })}
                    onDeleteEntry={async (eid) => { if ((await confirmAction({ title: 'このエントリを削除しますか？', description: '（写真・ポイント・CG表示内容も削除されます）', confirmLabel: '削除する', tone: 'danger' }))) deleteEntry.mutate(eid); }}
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
          {/* ════════════════════════════════════════════════
              送出 URL — OBS / vMix の Browser Source に貼り付けて使用。
              機能別 (リアルタイムCG / 字幕スーパー / クイズ・アンケートCG)、各 OA + NEXT。
              いずれも 1920×1080 アルファチャンネル付き透過出力 — Browser Source の「透明度を許可」を ON にすること。
              ════════════════════════════════════════════════ */}
          {/* 演出SE (効果音) 設定 */}
          <SoundConfigSection eventId={event.id} />

          <div className="pt-2 border-t space-y-2">
            <p className="text-sm font-medium">送出 URL</p>
            <p className="text-xs text-muted-foreground">
              OBS / vMix の Browser Source 用。<strong>1920×1080</strong> で配置し、透過合成は「<strong>透明度を許可 (Allow Transparency) ON</strong>」を必須としてください。
              <span className="text-red-700 font-medium ml-1">OA</span> = 本番出力 / <span className="text-amber-700 font-medium ml-0.5">NEXT</span> = 次に送出する内容のプレビュー。
              <br />演出SE（効果音）を鳴らすには出力URLに <code className="px-1 rounded bg-muted text-[10px]">?audio=1</code> を付けてください（鳴らすのは1枚だけ・下の「演出SE」で音源を登録）。各 OA に「音声あり」URLも用意しています。
            </p>
          </div>

          {/* ── リアルタイムCG (ランキング演出) ─────────── */}
          <div className="pt-2 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Tv className="h-3.5 w-3.5 text-amber-600" />
              リアルタイムCG <span className="text-xs text-muted-foreground font-normal">(ランキング / BEST3 / ファイナルピッチ / 大賞演出)</span>
            </p>
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-red-700 uppercase tracking-widest">OA (本番)</div>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/${event.id}?lang=${lang}`;
                return (
                  <div key={`rank-oa-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">OA (背景あり)</div>
              <p className="text-[10px] text-muted-foreground -mt-0.5">透過せず背景込みで表示。単独全画面表示や、映像と重ねない用途に。</p>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/${event.id}?lang=${lang}&bg=1`;
                return (
                  <div key={`rank-oabg-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-cyan-700 uppercase tracking-widest">OA (音声あり)</div>
              <p className="text-[10px] text-muted-foreground -mt-0.5">演出SEを鳴らす本番URL。鳴らすのは <strong>このURL 1枚だけ</strong>（多重再生防止）。透過のまま。</p>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/${event.id}?lang=${lang}&audio=1`;
                return (
                  <div key={`rank-oaaudio-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">NEXT</div>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/${event.id}/next?lang=${lang}`;
                return (
                  <div key={`rank-next-${lang}`} className="flex items-center gap-2">
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

          {/* ── 字幕スーパー (下部テロップ) ─────────── */}
          <div className="pt-2 border-t space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Subtitles className="h-3.5 w-3.5 text-amber-600" />
              字幕スーパー <span className="text-xs text-muted-foreground font-normal">(下部テロップ)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              リアルタイムCG (ランキング演出) とは独立レイヤー。同時並走可能。
            </p>
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-red-700 uppercase tracking-widest">OA (本番)</div>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/${event.id}/oneshot?lang=${lang}`;
                return (
                  <div key={`1s-oa-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">NEXT</div>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/${event.id}/oneshot/next?lang=${lang}`;
                return (
                  <div key={`1s-next-${lang}`} className="flex items-center gap-2">
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

          {/* ── クイズ / アンケートCG ─────────── */}
          <div className="pt-2 border-t space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-purple-600" />
              クイズ / アンケートCG <span className="text-xs text-muted-foreground font-normal">(質問 + 選択肢 + 投票/集計)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              operator (<code className="px-1 rounded bg-muted text-[10px]">/event/{event.id}/quiz-stack/control</code>) で順次送出。
              NEXT は operator が選択中の「次の問題」のプレビュー。
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              この出力は<strong>投票 (POLL) + 集計 (アンサーチェック)</strong> まで。
              アンケートの <strong>No.1 発表</strong>は、上の<strong>リアルタイムCG（ランキング）出力URL</strong>側で、
              連動カテゴリ（賞）の最後に「SURVEY No.1」ステップとして表示されます。
            </p>
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-red-700 uppercase tracking-widest">OA (本番)</div>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/quiz-stack/${event.id}?lang=${lang}`;
                return (
                  <div key={`quiz-oa-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">OA (背景あり)</div>
              <p className="text-[10px] text-muted-foreground -mt-0.5">透過せず背景込みで表示。単独全画面表示や、映像と重ねない用途に。</p>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/quiz-stack/${event.id}?lang=${lang}&bg=1`;
                return (
                  <div key={`quiz-oabg-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-cyan-700 uppercase tracking-widest">OA (音声あり)</div>
              <p className="text-[10px] text-muted-foreground -mt-0.5">演出SEを鳴らす本番URL。鳴らすのは <strong>このURL 1枚だけ</strong>。透過のまま。</p>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/quiz-stack/${event.id}?lang=${lang}&audio=1`;
                return (
                  <div key={`quiz-oaaudio-${lang}`} className="flex items-center gap-2">
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
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">NEXT</div>
              {[
                { label: '🇯🇵 日本語', lang: 'ja' },
                { label: '🇺🇸 English', lang: 'en' },
              ].map(({ label, lang }) => {
                const url = `${window.location.origin}/awards/output/quiz-stack/${event.id}/next?lang=${lang}`;
                return (
                  <div key={`quiz-next-${lang}`} className="flex items-center gap-2">
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
        </div>
      )}

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

// ── 字幕スーパー モジュール構成 セクション (v2.8.74+) ────────────