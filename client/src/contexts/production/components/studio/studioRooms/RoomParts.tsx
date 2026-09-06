/**
 * ロケーション・部屋管理ダイアログの**部屋の段**（`StudioRoomsManagerDialog` から分けたもの）
 *
 * ── なぜ分けたか ────────────────────────────────────────────
 *
 * 拠点に略称を足したときに 400 行を超えました（`scripts/check-file-size.mjs`）。
 * このダイアログは**拠点の段と部屋の段の2つの仕事**を持っていて、片方だけ直すときに
 * もう片方を読む必要がありません。**役割で分けるのが自然な切れ目**なので、
 * 部屋（1行の表示/編集 と 追加フォーム）をこちらへ移しました。
 *
 * ⚠️ **中身は1行も変えていません**（枠の入れ替えと中身の作り直しを同じ回でやらない）。
 * 状態と保存は親が持ったまま、描く部分だけを受け取ります。
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';

export interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  abbreviation?: string | null;
  color: string;
  room_type: string;
  sort_order: number;
}

/** 種別ラベル — 'greenroom' の表示は v2.7.5 で「ゲストルーム」に変更（DB 値は互換維持） */
export const ROOM_TYPE_LABEL: Record<string, string> = {
  studio: 'スタジオ',
  control: '調整室',
  greenroom: 'ゲストルーム',
  other: 'その他',
};

export const ROOM_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'studio', label: 'スタジオ' },
  { value: 'control', label: '調整室' },
  { value: 'greenroom', label: 'ゲストルーム' },
  { value: 'other', label: 'その他' },
];

export interface NewRoomDraft {
  name: string;
  abbreviation: string;
  room_type: string;
  color: string;
}
export const emptyDraft = (): NewRoomDraft => ({
  name: '', abbreviation: '', room_type: 'studio', color: '#3b82f6',
});

/** 部屋1行。編集中かどうかで中身が入れ替わる（行の位置は動かない） */
export function RoomRow({
  room: r, editing, draft, onDraft, onStartEdit, onSave, onCancel, onDelete,
}: {
  room: StudioRoom;
  editing: boolean;
  draft: Partial<StudioRoom>;
  onDraft: (fn: (prev: Partial<StudioRoom>) => Partial<StudioRoom>) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border bg-background p-2.5">
      {editing ? (
        /* ── 編集モード ── */
        /* 並びは**追加フォーム（下の `RoomAddForm`）と同じ 部屋名 → 略称 → 種別 → 色**にそろえる。
           以前は先頭が「並び順」で、名前より先に細目を訊いていた（Tab の1番目も並び順だった）。
           並び順は編集でしか触れない項目なので末尾へ回す
           （`docs/design/v4/_form-order.md` 段2「何か」を先に、段6「補足」を最後に） */
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-8 sm:col-span-5">
              <Label className="text-[10px] text-muted-foreground">部屋名</Label>
              <Input
                value={draft.name || ''}
                onChange={(e) => onDraft((p) => ({ ...p, name: e.target.value }))}
                className="h-9"
              />
            </div>
            <div className="col-span-4 sm:col-span-3">
              <Label className="text-[10px] text-muted-foreground">略称</Label>
              <Input
                value={draft.abbreviation ?? ''}
                onChange={(e) => onDraft((p) => ({ ...p, abbreviation: e.target.value }))}
                placeholder="例: WS"
                maxLength={20}
                className="h-9 "
              />
            </div>
            {/* 種別は「その部屋が何か」を決める分類（ゲストルームを選ぶと予約フォームに
                控室の欄が出る）。飾りである色より前に置く */}
            <div className="col-span-8 sm:col-span-2">
              <Label className="text-[10px] text-muted-foreground">種別</Label>
              <Select
                value={draft.room_type || 'studio'}
                onValueChange={(v) => onDraft((p) => ({ ...p, room_type: v }))}
              >
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROOM_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-4 sm:col-span-2">
              <Label className="text-[10px] text-muted-foreground">色</Label>
              <Input
                type="color"
                value={draft.color || '#3b82f6'}
                onChange={(e) => onDraft((p) => ({ ...p, color: e.target.value }))}
                className="h-9 p-1"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-24">
              <Label className="text-[10px] text-muted-foreground">並び順</Label>
              <Input
                type="number"
                value={draft.sort_order ?? 0}
                onChange={(e) => onDraft((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                className="h-9"
              />
            </div>
            <div className="flex-1" />
            <Button size="sm" onClick={onSave}><Check className="h-4 w-4 mr-1" />保存</Button>
            <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4" /></Button>
          </div>
        </div>
      ) : (
        /* ── 表示モード ── */
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="w-9 text-xs text-muted-foreground tabular-nums shrink-0">#{r.sort_order}</span>
          <span className="inline-block w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-border" style={{ background: r.color }} />
          <span className="font-medium flex-1 min-w-0 truncate">{r.name}</span>
          {r.abbreviation && (
            <span className=" text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
              {r.abbreviation}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground shrink-0">
            {ROOM_TYPE_LABEL[r.room_type] || r.room_type}
          </span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={onStartEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

/** 拠点1つに部屋を足すフォーム（下書きは親が拠点ごとに持つ） */
export function AddRoomForm({
  draft, onDraft, onAdd,
}: {
  draft: NewRoomDraft | undefined;
  onDraft: (fn: (prev: NewRoomDraft) => NewRoomDraft) => void;
  onAdd: () => void;
}) {
  return (
    <div className="border-t pt-3">
      <p className="text-xs font-semibold text-muted-foreground mb-2">この拠点に部屋を追加</p>
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-12 sm:col-span-5">
          <Label className="text-[10px] text-muted-foreground">部屋名 <span className="text-destructive">*</span></Label>
          <Input
            value={draft?.name || ''}
            onChange={(e) => onDraft((p) => ({ ...p, name: e.target.value }))}
            placeholder="例: 第3調整室"
            className="h-9"
          />
        </div>
        <div className="col-span-6 sm:col-span-3">
          <Label className="text-[10px] text-muted-foreground">略称</Label>
          <Input
            value={draft?.abbreviation || ''}
            onChange={(e) => onDraft((p) => ({ ...p, abbreviation: e.target.value }))}
            placeholder="例: 3調"
            maxLength={20}
            className="h-9 "
          />
        </div>
        {/* 種別（その部屋が何か）を、飾りである色より前に置く */}
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-[10px] text-muted-foreground">種別</Label>
          <Select
            value={draft?.room_type || 'studio'}
            onValueChange={(v) => onDraft((p) => ({ ...p, room_type: v }))}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ROOM_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-6 sm:col-span-2">
          <Label className="text-[10px] text-muted-foreground">色</Label>
          <Input
            type="color"
            value={draft?.color || '#3b82f6'}
            onChange={(e) => onDraft((p) => ({ ...p, color: e.target.value }))}
            className="h-9 p-1"
          />
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <Button size="sm" onClick={onAdd}><Plus className="h-4 w-4 mr-1" />追加</Button>
      </div>
    </div>
  );
}
