// 項目の編集シート。PC は中央ダイアログ、375px はボトムシート風（下端固定・safe-area対応）。
// 実装設計: 04-schedule-impl.md §5-4・§4-2
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import BufferedInput from "@/components/editor/BufferedInput";
import BufferedTextarea from "./BufferedTextarea";
import { ITEM_KIND_DEFS } from "@gmo-onair/shared/src/schedule/kinds";
import { fmtHmPad, parseHm } from "@gmo-onair/shared/src/schedule/time";
import type { ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";

// ボトムシート風: 375px では下端に固定し、角丸は上だけ。PC は中央ダイアログのまま。
const SHEET_CLASS =
  "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:top-auto max-sm:left-0 max-sm:translate-x-0 " +
  "max-sm:translate-y-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-b-none max-sm:rounded-t-2xl " +
  "max-sm:pb-[calc(1rem+env(safe-area-inset-bottom))]";

export interface ItemDraft {
  columnId: string;
  title: string;
  kind: string;
  startMin: number;
  endMin: number;
  assignee: string;
  note: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: ScheduleColumn[];
  /** 既存項目を編集するときに渡す。無ければ新規作成モード */
  item?: ScheduleItem | null;
  /** 新規作成の初期値（列・時刻はグリッドで押した位置から） */
  initial?: Partial<ItemDraft>;
  conflicted?: boolean;
  onReloadLatest?: () => void;
  onSave: (draft: ItemDraft) => void;
  onDelete?: () => void;
  onCreateScript?: () => void;
  onOpenScript?: () => void;
  savingDisabled?: boolean;
}

const LINKABLE_KINDS = ["onair", "rehearsal", "recording"];

export default function ScheduleItemDialog({
  open, onOpenChange, columns, item, initial, conflicted, onReloadLatest, onSave, onDelete,
  onCreateScript, onOpenScript, savingDisabled,
}: Props) {
  const [draft, setDraft] = useState<ItemDraft>(() => ({
    columnId: item?.column_id ?? initial?.columnId ?? columns[0]?.id ?? "",
    title: item?.title ?? initial?.title ?? "",
    kind: item?.kind ?? initial?.kind ?? "other",
    startMin: item?.start_min ?? initial?.startMin ?? 540,
    endMin: item?.end_min ?? initial?.endMin ?? 600,
    assignee: item?.assignee ?? "",
    note: item?.note ?? "",
  }));

  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const isEdit = !!item;
  const canLink = isEdit && LINKABLE_KINDS.includes(draft.kind);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* PC の幅は段で持つ（入力7個・区分/列・開始/終了の2列組を含むので `lg`=840px）。
          SHEET_CLASS は `max-sm:` だけなので、375px のボトムシートは今までどおり */}
      <DialogContent size="lg" className={SHEET_CLASS}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "項目を編集" : "項目を追加"}</DialogTitle>
          {conflicted && (
            <DialogDescription className="text-destructive">
              他の人がこの項目を更新しました。編集する前に最新の内容を読み込み直してください。
            </DialogDescription>
          )}
        </DialogHeader>

        {conflicted ? (
          <Button variant="outline" className="min-h-[44px]" onClick={onReloadLatest}>最新を読み込む</Button>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="item-title">項目名</Label>
              <BufferedInput
                id="item-title"
                value={draft.title}
                onCommit={(v) => set("title", v)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="例: リハーサル"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>区分</Label>
                <Select value={draft.kind} onValueChange={(v) => set("kind", v)}>
                  <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_KIND_DEFS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>列</Label>
                <Select value={draft.columnId} onValueChange={(v) => set("columnId", v)}>
                  <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="item-start">開始（25:30 のように日跨ぎも可）</Label>
                <BufferedInput
                  id="item-start"
                  value={fmtHmPad(draft.startMin)}
                  onCommit={(v) => { const m = parseHm(v); if (m != null) set("startMin", m); }}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  inputMode="numeric"
                  placeholder="9:30"
                />
              </div>
              <div>
                <Label htmlFor="item-end">終了</Label>
                <BufferedInput
                  id="item-end"
                  value={fmtHmPad(draft.endMin)}
                  onCommit={(v) => { const m = parseHm(v); if (m != null) set("endMin", m); }}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  inputMode="numeric"
                  placeholder="10:00"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="item-assignee">担当（自由入力。社外の人も可）</Label>
              <BufferedInput
                id="item-assignee"
                value={draft.assignee}
                onCommit={(v) => set("assignee", v)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="例: MC / 社長 / 出演者受賞者"
              />
            </div>

            <div>
              <Label htmlFor="item-note">備考</Label>
              <BufferedTextarea
                id="item-note"
                value={draft.note}
                onCommit={(v) => set("note", v)}
                rows={2}
                className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {canLink && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                {item?.qsheet_document_id ? (
                  item.link_broken ? (
                    <p className="text-sm text-destructive">結んでいた進行台本が見つかりません（削除されています）。</p>
                  ) : (
                    <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={onOpenScript}>
                      進行台本を開く
                    </Button>
                  )
                ) : (
                  <Button type="button" variant="outline" className="min-h-[44px] w-full" onClick={onCreateScript}>
                    この枠から進行台本を作る
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {!conflicted && (
          <DialogFooter className="gap-2">
            {isEdit && onDelete && (
              <Button type="button" variant="destructive" className="min-h-[44px]" onClick={onDelete}>削除</Button>
            )}
            <Button type="button" className="min-h-[44px]" disabled={savingDisabled} onClick={() => onSave(draft)}>
              保存
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
