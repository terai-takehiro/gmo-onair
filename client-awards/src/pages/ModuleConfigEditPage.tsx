import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Plus, Trash2, GripVertical, Save, RotateCcw, Subtitles,
  AlertCircle, CheckCircle2, Tv2, Hash, Eye, EyeOff,
  ChevronDown, ChevronUp, Maximize2, Minimize2,
} from 'lucide-react';
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
  useEventModuleConfig, useSaveEventModuleConfig,
} from '../oneshot/lib/moduleConfig';
import { createDefaultEventModuleConfig } from '../oneshot/data/presetModules';
import { SEED_NOMINEES } from '../oneshot/data/seedNominees';
import LowerThirdCG from '../oneshot/LowerThirdCG';
import { moduleIdToCueKey } from '../oneshot/lib/moduleKeyMap';
import type {
  EventModuleConfig, Lang, ModuleDef, ModuleVisibility,
  SlotDef, SlotKind, SlotBinding,
} from '../oneshot/types';
import '../oneshot/styles/index.css';

const CG_W = 1920;
const CG_H = 1080;

// v2.8.75+ 段階4 (first cut): モジュール構成の編集 UI。
// このバージョンでは:
//  ・モジュールの DnD 並び替え (order 自動更新)
//  ・モジュールの追加 (custom-{uuid}) / 削除
//  ・基本フィールド編集: label (ja/en) / shortcutKey / visibility / width
// 次バージョンで slot 編集 (binding source / field / style) と DnD ライブプレビューを追加予定。

export default function ModuleConfigEditPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const { data: serverConfig, isLoading } = useEventModuleConfig(eventId);
  const saveMutation = useSaveEventModuleConfig(eventId);

  // ローカル編集 state
  const [draft, setDraft] = useState<EventModuleConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // v2.8.77+ ライブプレビュー state
  const [previewModuleId, setPreviewModuleId] = useState<string | null>(null);
  const [previewLang, setPreviewLang] = useState<Lang>('ja');
  const [previewExpanded, setPreviewExpanded] = useState(true);

  // 初期ロード or サーバー側更新時に draft を同期 (dirty 状態は維持)
  useEffect(() => {
    if (serverConfig && !dirty) setDraft(structuredClone(serverConfig));
  }, [serverConfig, dirty]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading || !draft) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const updateModule = (id: string, patch: Partial<ModuleDef>) => {
    setDraft({
      ...draft,
      modules: draft.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
    setDirty(true);
    setSavedBanner(null);
  };

  const addModule = () => {
    const uuid = crypto.randomUUID();
    const nextOrder = (draft.modules.reduce((mx, m) => Math.max(mx, m.order), 0) ?? 0) + 1;
    const newMod: ModuleDef = {
      id: `custom-${uuid}`,
      label: { ja: '新しいモジュール', en: 'New Module' },
      icon: 'Plus',
      shortcutKey: undefined,
      order: nextOrder,
      visibility: 'always',
      slots: [],
      width: 'default',
    };
    setDraft({ ...draft, modules: [...draft.modules, newMod] });
    setDirty(true);
    setSavedBanner(null);
  };

  const deleteModule = (id: string) => {
    if (!window.confirm('このモジュールを削除しますか？')) return;
    setDraft({ ...draft, modules: draft.modules.filter((m) => m.id !== id) });
    setDirty(true);
    setSavedBanner(null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = draft.modules.findIndex((m) => m.id === active.id);
    const newIdx = draft.modules.findIndex((m) => m.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(draft.modules, oldIdx, newIdx)
      .map((m, i) => ({ ...m, order: i }));
    setDraft({ ...draft, modules: reordered });
    setDirty(true);
    setSavedBanner(null);
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync(draft);
      setDirty(false);
      setSavedBanner('保存しました');
      window.setTimeout(() => setSavedBanner(null), 3000);
    } catch (e) {
      setSavedBanner('保存失敗: ' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleResetToDefault = () => {
    if (!window.confirm('デフォルトプリセット (タイトル / 尊敬ポイント など 7 種) に戻しますか？')) return;
    setDraft(createDefaultEventModuleConfig());
    setDirty(true);
    setSavedBanner(null);
  };

  const sortedModules = useMemo(
    () => [...draft.modules].sort((a, b) => a.order - b.order),
    [draft.modules]
  );

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* ── Header ────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-4 h-12 shrink-0 border-b border-slate-200 bg-card">
        <button
          onClick={() => navigate(`/event/${eventId}`)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors"
          title="イベント編集に戻る"
        >
          <ChevronLeft className="h-4 w-4 text-slate-600" />
        </button>
        <Subtitles className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-sm font-bold text-slate-900">表彰CG モジュール構成</span>
        <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
          段階4 / 編集UI
        </span>
        <div className="flex-1" />
        <button
          onClick={() => navigate(`/event/${eventId}/oneshot/control`)}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors"
          title="表彰CG オペレーター画面で動作確認"
        >
          <Tv2 className="h-3 w-3" />
          オペレーターへ
        </button>
        <button
          onClick={handleResetToDefault}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-red-300 text-red-700 px-2.5 py-1.5 text-xs font-bold hover:bg-red-50 transition-colors"
          title="プリセットに戻す (現在の編集内容を破棄)"
        >
          <RotateCcw className="h-3 w-3" />
          プリセットに戻す
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
            dirty && !saveMutation.isPending
              ? 'bg-emerald-600 text-white hover:bg-emerald-500'
              : 'bg-slate-200 text-slate-500 cursor-not-allowed'
          )}
        >
          <Save className="h-3 w-3" />
          {saveMutation.isPending ? '保存中…' : dirty ? '保存' : '保存済み'}
        </button>
      </header>

      {/* ── Banner ──────────────────────────────────────── */}
      {savedBanner && (
        <div className={cn(
          'shrink-0 flex items-center gap-2 px-4 py-2 text-sm border-b',
          savedBanner.startsWith('保存失敗')
            ? 'bg-red-50 border-red-200 text-red-700'
            : 'bg-emerald-50 border-emerald-200 text-emerald-700'
        )}>
          {savedBanner.startsWith('保存失敗') ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {savedBanner}
        </div>
      )}

      {/* ── Body (lg+: 2-pane layout, mobile: stacked) ──── */}
      <div className="flex-1 overflow-y-auto">
        {/* v2.8.77+: ライブプレビューペイン (sticky top, collapsible) */}
        <LivePreviewPane
          draft={draft}
          previewModuleId={previewModuleId}
          previewLang={previewLang}
          onChangeLang={setPreviewLang}
          expanded={previewExpanded}
          onToggleExpand={() => setPreviewExpanded((v) => !v)}
        />

        <div className="p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="rounded-lg border border-slate-200 bg-card p-3 text-xs text-slate-600">
            <p className="font-bold text-slate-800 mb-1">モジュールを追加・並び替え・編集できます</p>
            <p>送出 UI のボタン順は <strong>order 昇順</strong>。ドラッグで並び替え、右端のゴミ箱で削除、下のフォームで基本情報を編集。各モジュールカードの「プレビュー」ボタンで上のペインに表示確認できます。</p>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={sortedModules.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {sortedModules.map((mod) => (
                  <SortableModuleCard
                    key={mod.id}
                    mod={mod}
                    isPreviewing={previewModuleId === mod.id}
                    onUpdate={(patch) => updateModule(mod.id, patch)}
                    onDelete={() => deleteModule(mod.id)}
                    onPreview={() => setPreviewModuleId(mod.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            onClick={addModule}
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 hover:border-amber-400 hover:bg-amber-50/40 px-4 py-4 text-sm font-bold text-slate-600 hover:text-amber-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            モジュールを追加
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

// ── ライブプレビュー ペイン (sticky top, collapsible) ─────────────
function LivePreviewPane({
  draft, previewModuleId, previewLang, onChangeLang, expanded, onToggleExpand,
}: {
  draft: EventModuleConfig;
  previewModuleId: string | null;
  previewLang: Lang;
  onChangeLang: (l: Lang) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.18);
  const [off, setOff] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!w || !h) return;
      const s = Math.min(w / CG_W, h / CG_H);
      setScale(s);
      setOff({ x: Math.floor((w - CG_W * s) / 2), y: Math.floor((h - CG_H * s) / 2) });
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  // 選択中モジュールを解決 (なければ先頭の non-empty モジュール)
  const previewMod = useMemo(() => {
    if (previewModuleId) {
      return draft.modules.find((m) => m.id === previewModuleId) ?? null;
    }
    return draft.modules.find((m) => m.slots.length > 0) ?? draft.modules[0] ?? null;
  }, [draft, previewModuleId]);

  // モジュールの visibility に合わせてサンプルノミネートを選択
  const sampleNominee = useMemo(() => {
    const isTeamOnly = previewMod?.visibility === 'team-only';
    const team = SEED_NOMINEES.find((n) => n.type === 'team');
    const indiv = SEED_NOMINEES.find((n) => n.type === 'individual');
    return isTeamOnly ? (team ?? indiv ?? SEED_NOMINEES[0]) : (indiv ?? SEED_NOMINEES[0]);
  }, [previewMod]);

  const moduleKey = previewMod ? moduleIdToCueKey(previewMod.id) : 'none';

  return (
    <div className="sticky top-0 z-20 bg-slate-900 border-b border-slate-300">
      <div className="flex items-center gap-2 px-3 sm:px-6 py-2">
        <Eye className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-xs font-black tracking-widest uppercase text-amber-300 shrink-0">
          ライブプレビュー
        </span>
        {previewMod && (
          <>
            <span className="text-slate-600 shrink-0">·</span>
            <span className="text-xs text-slate-300 truncate">
              {previewLang === 'ja' ? previewMod.label.ja : previewMod.label.en}
              <span className="text-slate-500 ml-1 font-mono">({previewMod.id})</span>
            </span>
          </>
        )}
        <div className="flex-1" />
        {/* lang toggle */}
        <div className="flex items-center rounded-md border border-slate-700 bg-slate-800 p-0.5 text-[10px] font-black">
          {(['ja', 'en'] as const).map((l) => (
            <button
              key={l}
              onClick={() => onChangeLang(l)}
              className={cn(
                'px-2 py-0.5 rounded transition-colors uppercase',
                previewLang === l ? 'bg-amber-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={onToggleExpand}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate-800 text-slate-400"
          title={expanded ? 'プレビューを折りたたむ' : 'プレビューを展開'}
        >
          {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
      {expanded && (
        <div
          ref={wrapRef}
          className="relative w-full bg-black aspect-video max-h-[40vh]"
        >
          {previewMod && sampleNominee && (
            <div
              style={{
                position: 'absolute',
                left: off.x,
                top: off.y,
                width: CG_W * scale,
                height: CG_H * scale,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: CG_W,
                  height: CG_H,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                }}
              >
                <div className="oneshot-cg-root" style={{ position: 'relative', width: CG_W, height: CG_H }}>
                  <LowerThirdCG
                    nominee={sampleNominee}
                    lang={previewLang}
                    moduleKey={moduleKey}
                    showPortrait={true}
                    useDynamicRenderer={true}
                    moduleConfig={draft}
                  />
                </div>
              </div>
            </div>
          )}
          {!previewMod && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
              モジュールを選択してプレビュー
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ドラッグ可能 モジュールカード ────────────────────────────
function SortableModuleCard({
  mod, isPreviewing, onUpdate, onDelete, onPreview,
}: {
  mod: ModuleDef;
  isPreviewing: boolean;
  onUpdate: (patch: Partial<ModuleDef>) => void;
  onDelete: () => void;
  onPreview: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mod.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const isPreset = mod.id.startsWith('preset:');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-card p-3 sm:p-4 space-y-3',
        isPreviewing ? 'border-amber-500 ring-2 ring-amber-300' :
        isPreset ? 'border-amber-200' : 'border-slate-200'
      )}
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-muted cursor-grab active:cursor-grabbing"
          title="ドラッグで並び替え"
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </button>
        <span className="text-[10px] font-mono text-slate-400 shrink-0">{mod.id}</span>
        {isPreset && (
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
            PRESET
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={onPreview}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-xs font-bold transition-colors',
            isPreviewing
              ? 'bg-amber-500 text-slate-950'
              : 'border border-slate-300 text-slate-600 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
          )}
          title="このモジュールを上のプレビューに表示"
        >
          <Eye className="h-3 w-3" />
          プレビュー
        </button>
        <button
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded hover:bg-red-50 text-red-600 transition-colors"
          title="削除"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="ラベル (日本語)">
          <input
            type="text"
            value={mod.label.ja}
            onChange={(e) => onUpdate({ label: { ...mod.label, ja: e.target.value } })}
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </FormField>
        <FormField label="ラベル (English)">
          <input
            type="text"
            value={mod.label.en}
            onChange={(e) => onUpdate({ label: { ...mod.label, en: e.target.value } })}
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <FormField label="ショートカット (0-9)">
          <div className="relative">
            <Hash className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
            <input
              type="text"
              maxLength={1}
              pattern="[0-9]"
              value={mod.shortcutKey ?? ''}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 1);
                onUpdate({ shortcutKey: v || undefined });
              }}
              placeholder="—"
              className="w-full rounded border border-slate-300 pl-7 pr-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
          </div>
        </FormField>
        <FormField label="表示条件">
          <select
            value={mod.visibility ?? 'always'}
            onChange={(e) => onUpdate({ visibility: e.target.value as ModuleVisibility })}
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          >
            <option value="always">常に表示</option>
            <option value="team-only">チームのみ</option>
            <option value="individual-only">個人のみ</option>
          </select>
        </FormField>
        <FormField label="幅">
          <select
            value={mod.width ?? 'default'}
            onChange={(e) => onUpdate({ width: e.target.value as 'default' | 'wide' })}
            className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
          >
            <option value="default">デフォルト (1200px)</option>
            <option value="wide">ワイド (1500px)</option>
          </select>
        </FormField>
      </div>

      <SlotsEditor
        slots={mod.slots}
        onChange={(slots) => onUpdate({ slots })}
      />
    </div>
  );
}

// ── スロットエディタ (collapsible, DnD, add/delete/edit) ─────────
const SLOT_KIND_OPTIONS: { value: SlotKind; label: string; hint: string }[] = [
  { value: 'header-label',      label: 'ヘッダーラベル',      hint: '上部小ラベル "▸ ○○"' },
  { value: 'header-byline',     label: 'ヘッダー by 推薦者',  hint: '"| 推薦/by 名前 役職" (固定)' },
  { value: 'body-title',        label: 'タイトル本文',        hint: '左金色アクセント付き大文字' },
  { value: 'body-text',         label: '本文 (汎用)',         hint: '通常パラグラフ' },
  { value: 'body-ism-text',     label: 'イズム本文',          hint: '得意技と組み合わせる中サイズ' },
  { value: 'body-large-quote',  label: '大引用「」',          hint: '金色 + 自動 「 」' },
  { value: 'body-rec-quote',    label: '推薦コメント引用',    hint: '白系 + " " quote' },
  { value: 'body-tags',         label: 'タグ (チップ)',       hint: 'スキル一覧など 8 件まで' },
  { value: 'body-members-grid', label: 'メンバーグリッド',    hint: 'チームメンバー 3 列' },
];

function SlotsEditor({
  slots, onChange,
}: { slots: SlotDef[]; onChange: (slots: SlotDef[]) => void }) {
  const [expanded, setExpanded] = useState(slots.length > 0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = slots.findIndex((s) => s.id === active.id);
    const newIdx = slots.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    onChange(arrayMove(slots, oldIdx, newIdx));
  };

  const addSlot = () => {
    const newSlot: SlotDef = {
      id: `slot-${crypto.randomUUID().slice(0, 8)}`,
      kind: 'body-text',
      binding: { source: 'literal', ja: '', en: '' },
    };
    onChange([...slots, newSlot]);
    setExpanded(true);
  };

  const updateSlot = (id: string, patch: Partial<SlotDef>) => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const deleteSlot = (id: string) => {
    onChange(slots.filter((s) => s.id !== id));
  };

  return (
    <div className="pt-2 border-t border-slate-100 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-900"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          スロット ({slots.length})
        </button>
        {!expanded && slots.length > 0 && (
          <span className="text-xs text-slate-500">
            <Eye className="inline h-3 w-3 mr-1" />
            {slots.map((s) => s.kind).join(' / ')}
          </span>
        )}
        {!expanded && slots.length === 0 && (
          <span className="text-xs text-slate-400">
            <EyeOff className="inline h-3 w-3 mr-1" />
            スロットなし (CG には何も描画されません)
          </span>
        )}
        <div className="flex-1" />
        {expanded && (
          <button
            onClick={addSlot}
            className="flex items-center gap-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-800 px-2 py-1 text-xs font-bold transition-colors"
          >
            <Plus className="h-3 w-3" />
            スロット追加
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {slots.map((slot) => (
                <SortableSlotCard
                  key={slot.id}
                  slot={slot}
                  onUpdate={(patch) => updateSlot(slot.id, patch)}
                  onDelete={() => deleteSlot(slot.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {slots.length === 0 && (
            <div className="text-center text-xs text-slate-400 py-4 border border-dashed border-slate-200 rounded">
              スロットなし。「スロット追加」をクリックして開始。
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortableSlotCard({
  slot, onUpdate, onDelete,
}: {
  slot: SlotDef;
  onUpdate: (patch: Partial<SlotDef>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slot.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const updateBinding = (patch: Partial<SlotBinding>) => {
    onUpdate({ binding: { ...slot.binding, ...patch } as SlotBinding });
  };

  const setSource = (source: SlotBinding['source']) => {
    // source 切替時は既存フィールドを破棄して空のバインディングに
    if (source === 'literal') onUpdate({ binding: { source: 'literal', ja: '', en: '' } });
    else if (source === 'nominee') onUpdate({ binding: { source: 'nominee', field: 'title' } });
    else if (source === 'recommender') onUpdate({ binding: { source: 'recommender', field: 'name' } });
    else onUpdate({ binding: { source: 'oneshot_raw', key: '' } });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded border border-slate-200 bg-slate-50/50 p-2 sm:p-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-slate-200 cursor-grab active:cursor-grabbing mt-1"
          title="ドラッグで並び替え"
        >
          <GripVertical className="h-3.5 w-3.5 text-slate-400" />
        </button>
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              スロット種別
            </label>
            <select
              value={slot.kind}
              onChange={(e) => onUpdate({ kind: e.target.value as SlotKind })}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              {SLOT_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {SLOT_KIND_OPTIONS.find((o) => o.value === slot.kind)?.hint}
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              データ供給元
            </label>
            <select
              value={slot.binding.source}
              onChange={(e) => setSource(e.target.value as SlotBinding['source'])}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            >
              <option value="literal">リテラル (固定文字列)</option>
              <option value="nominee">ノミネート列 (Nominee.*)</option>
              <option value="recommender">推薦者 (recommender.*)</option>
              <option value="oneshot_raw">oneshot_data 任意キー</option>
            </select>
          </div>
        </div>
        <button
          onClick={onDelete}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-red-100 text-red-600 mt-1"
          title="削除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* binding 別 入力 UI */}
      <div className="ml-8">
        {slot.binding.source === 'literal' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">JA</label>
              <input
                type="text"
                value={slot.binding.ja}
                onChange={(e) => updateBinding({ ja: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">EN</label>
              <input
                type="text"
                value={slot.binding.en}
                onChange={(e) => updateBinding({ en: e.target.value })}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              />
            </div>
          </div>
        )}
        {slot.binding.source === 'nominee' && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              field (lang 自動切替: title→titleEn 等)
            </label>
            <input
              type="text"
              list="nominee-fields"
              value={slot.binding.field}
              onChange={(e) => updateBinding({ field: e.target.value })}
              placeholder="例: title / comment / ism / skills / members"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
            />
            <datalist id="nominee-fields">
              <option value="title" />
              <option value="comment" />
              <option value="ism" />
              <option value="skills" />
              <option value="members" />
              <option value="department" />
              <option value="position" />
              <option value="location" />
              <option value="entryNo" />
              <option value="projectName" />
            </datalist>
          </div>
        )}
        {slot.binding.source === 'recommender' && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              recommender.field (lang 自動切替)
            </label>
            <input
              type="text"
              list="recommender-fields"
              value={slot.binding.field}
              onChange={(e) => updateBinding({ field: e.target.value })}
              placeholder="例: name / position / respect / respectComment"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
            />
            <datalist id="recommender-fields">
              <option value="name" />
              <option value="position" />
              <option value="company" />
              <option value="department" />
              <option value="respect" />
              <option value="respectComment" />
            </datalist>
          </div>
        )}
        {slot.binding.source === 'oneshot_raw' && (
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              oneshot_data の任意キー (Excel "そのまま保存"列など)
            </label>
            <input
              type="text"
              value={slot.binding.key}
              onChange={(e) => updateBinding({ key: e.target.value })}
              placeholder="例: 私のイズム / customField"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
