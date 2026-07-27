// 1 行ぶんの編集部品 (その場で書き換えるテキスト / 受賞者の行) — v2.9.295 で切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  Trash2, Check, X, Upload,
  Tv,
} from 'lucide-react';
import type { Entry } from './types';

// ── Inline edit helpers ──────────────────────────────────────
export function InlineText({
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
        {value || <span className="text-muted-foreground">{placeholder}</span>}
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
export function EntryRow({
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
          : <Upload className="h-3.5 w-3.5 text-muted-foreground absolute inset-0 m-auto" />
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
            className="text-xs text-muted-foreground"
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
            className="text-xs text-muted-foreground"
          />
        </div>
        {/* Nomination title (vote パターンで使用) */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <InlineText
            value={entry.nomination_title ?? ''}
            onSave={(v) => onUpdate({ nomination_title: v || null })}
            placeholder="ノミネートタイトル (例: 社内システムから AI 活用まで。)"
            className="text-xs text-warning-strong"
          />
          <InlineText
            value={entry.nomination_title_en ?? ''}
            onSave={(v) => onUpdate({ nomination_title_en: v || null })}
            placeholder="Nomination Title EN"
            className="text-xs text-warning-strong"
          />
        </div>
        {/* Image ID badge */}
        {entry.image_id && (
          <span className="inline-flex items-center rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
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
          <span className="text-[10px] font-semibold text-warning-strong">自社</span>
          <InlineText
            value={entry.own_points != null ? String(entry.own_points) : ''}
            onSave={(v) => onUpdate({ own_points: v ? parseInt(v) || null : null })}
            placeholder="—"
            className=" text-xs tabular-nums text-warning-strong"
          />
          {ownPct != null && (
            <span className="text-[10px] tabular-nums text-warning-strong">({ownPct}%)</span>
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
            ? 'bg-warning/20 text-warning-strong'
            : 'text-muted-foreground hover:text-warning-strong'
        )}
      >
        <Tv className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onDelete}
        className="mt-1 text-muted-foreground hover:text-destructive transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────
