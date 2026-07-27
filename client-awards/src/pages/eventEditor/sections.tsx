// 部門・賞のカードと、送出パターンの設定 — v2.9.295 で切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { useState, useEffect } from 'react';
import {
  Plus, Trash2, GripVertical, RefreshCw,
  ChevronDown, ChevronRight, Tv,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Category, CategoryPatch, Entry, AwardGroup } from './types';
import { InlineText, EntryRow } from './rows';

// イベントごとの ModuleDef[] (送出モジュール構成) を編集 + JSON I/O。
// 段階4 (v2.8.75+) で「編集ページへ」ボタンを追加。

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── SortableDivisionSection ─────────────────────────────────
export function SortableDivisionSection({ cat, onDeleteCat, onUpdateCat, onAddEntry, onUpdateEntry, onDeleteEntry, onPhotoUpload, onGenerateDummyPoints }: {
  cat: Category;
  onDeleteCat: () => void;
  onUpdateCat: (patch: CategoryPatch) => void;
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
      <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/80 border-b">
        <button {...listeners} {...attributes} className="cursor-grab touch-none text-muted-foreground hover:text-muted-foreground transition-colors" title="ドラッグして並び替え">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="text-muted-foreground hover:text-muted-foreground">
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex-1 min-w-0 space-y-0.5">
          <InlineText value={cat.description ?? ''} onSave={(v) => onUpdateCat({ description: v.trim() || null })} placeholder="部門名" className="text-sm font-medium" />
          <InlineText value={cat.description_en ?? ''} onSave={(v) => onUpdateCat({ description_en: v.trim() || null })} placeholder="部門名（英語）" className="text-xs italic text-muted-foreground" />
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{cat.entries.length}名</span>
        <button onClick={onGenerateDummyPoints} title="ポイント自動生成" className="h-ctl-1 flex items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
          <RefreshCw className="h-3 w-3" />pt生成
        </button>
        <button onClick={() => setAddingEntry(true)} className="h-ctl-1 flex items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
          <Plus className="h-3 w-3" />追加
        </button>
        <button onClick={onDeleteCat} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {!collapsed && (
        <div className="p-2.5 space-y-1.5">
          <PatternBlock cat={cat} onUpdate={onUpdateCat} />
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
            <p className="py-3 text-center text-xs text-muted-foreground">
                この部門の受賞者はまだ入っていません。「Excel取込」か「貼り付け」で入れられます。
              </p>
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
export function SortableAwardGroupCard({ group, onUpdateAwardName, onUpdateAwardNameEn, onAddDivision, onDeleteCat, onUpdateCat, onAddEntry, onUpdateEntry, onDeleteEntry, onPhotoUpload, onGenerateDummyPoints }: {
  group: AwardGroup;
  onUpdateAwardName: (name: string) => void;
  onUpdateAwardNameEn: (nameEn: string) => void;
  onAddDivision: (awardName: string) => void;
  onDeleteCat: (catId: number) => void;
  onUpdateCat: (catId: number, patch: CategoryPatch) => void;
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
    <div ref={setNodeRef} style={style} className="rounded-xl border-2 border-warning/70 bg-card overflow-hidden shadow-sm">
      {/* Award (賞) header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-warning-surface to-warning-surface/40 border-b border-warning/60">
        <button {...listeners} {...attributes} className="cursor-grab touch-none text-warning-strong hover:text-warning-strong transition-colors shrink-0" title="ドラッグして並び替え">
          <GripVertical className="h-4 w-4" />
        </button>
        <Tv className="h-4 w-4 text-warning-strong shrink-0" />
        <div className="flex-1 min-w-0 space-y-0.5">
          <InlineText value={group.name} onSave={onUpdateAwardName} placeholder="賞名" className="font-bold text-sm text-warning-strong" />
          <InlineText value={group.nameEn ?? ''} onSave={onUpdateAwardNameEn} placeholder="賞名（英語）" className="text-xs italic text-warning-strong" />
        </div>
        <span className="text-xs text-warning-strong shrink-0 hidden sm:block">{group.divisions.length}部門・{totalEntries}名</span>
        <button onClick={() => onAddDivision(group.name)} className="h-ctl-1 flex items-center gap-1 rounded-lg border border-warning/50 px-2 text-xs text-warning-strong hover:bg-warning/90-surface transition-colors shrink-0">
          <Plus className="h-3 w-3" />部門追加
        </button>
        <button onClick={() => setCollapsed(!collapsed)} className="shrink-0 text-warning-strong hover:text-warning-strong transition-colors">
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

// ── PatternBlock: 部門ごとの演出パターン + 投票文言 ───────────
export function PatternBlock({ cat, onUpdate }: { cat: Category; onUpdate: (patch: CategoryPatch) => void }) {
  const pattern: 'direct' | 'vote' = cat.award_pattern === 'vote' ? 'vote' : 'direct';
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border bg-muted/40 px-2.5 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">演出パターン</span>
        <div className="inline-flex rounded-md border bg-white p-0.5 text-[11px]">
          <button
            onClick={() => onUpdate({ award_pattern: 'direct' })}
            className={`px-2.5 py-1 rounded ${pattern === 'direct' ? 'bg-warning text-warning-foreground font-bold' : 'text-muted-foreground hover:bg-muted'}`}
          >
            No.1発表
          </button>
          <button
            onClick={() => onUpdate({ award_pattern: 'vote' })}
            className={`px-2.5 py-1 rounded ${pattern === 'vote' ? 'bg-warning text-warning-foreground font-bold' : 'text-muted-foreground hover:bg-muted'}`}
          >
            投票No.1決定
          </button>
        </div>
        {pattern === 'vote' && (
          <button
            onClick={() => setOpen(!open)}
            className="ml-auto text-[11px] text-warning-strong hover:underline"
          >
            投票文言を{open ? '閉じる' : '編集'}
          </button>
        )}
      </div>
      {pattern === 'vote' && open && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <PatternField label="タイトル (JA)" value={cat.poll_title ?? ''} onSave={(v) => onUpdate({ poll_title: v || null })} placeholder="最優秀新人賞" />
          <PatternField label="タイトル (EN)" value={cat.poll_title_en ?? ''} onSave={(v) => onUpdate({ poll_title_en: v || null })} placeholder="Best Rookie" />
          <PatternField label="質問文 (JA)" value={cat.poll_question ?? ''} onSave={(v) => onUpdate({ poll_question: v || null })} placeholder="Q.最優秀新人賞にふさわしいのは？" />
          <PatternField label="質問文 (EN)" value={cat.poll_question_en ?? ''} onSave={(v) => onUpdate({ poll_question_en: v || null })} placeholder="Q. Who deserves the award?" />
        </div>
      )}
    </div>
  );
}

export function PatternField({ label, value, onSave, placeholder }: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold text-muted-foreground">{label}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== value) onSave(v.trim()); }}
        placeholder={placeholder}
        className="rounded border bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </label>
  );
}
