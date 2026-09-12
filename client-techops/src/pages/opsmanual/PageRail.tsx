// 冊子1件の画面 — ページの一覧・追加・削除・並べ替え・章名/題の編集（段A）＋
// どのページを紙面（ManualCanvas）に表示するかの選択（段B）。
// ドラッグ&ドロップは実装しない（段Bの紙面キャンバスで本格的なDnDを作るため、
// 段Aは上下ボタンで十分）。章名・題は BufferedInput（client-techops/CLAUDE.md
// 「入力欄は素の <input value onChange> で書かない」）。IME 変換中の保護に加え、
// 値が変わっていないときは onBlur でも PUT を送らない（useBufferedValue の commit）。
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import type { ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import { pagesSorted } from "@/components/opsmanual/pageOrder";

// shared/src/client/ui/input.tsx の Input が既定で当てているクラス。BufferedInput は
// 素の <input> をそのまま返す（cn によるクラス合成をしない）ため、見た目を保つには
// Input と同じ基底クラスをここで合成してから渡す。
const INPUT_BASE =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm " +
  "placeholder:text-muted-foreground " +
  "file:border-0 file:bg-transparent file:text-sm file:font-medium " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted " +
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive";

interface RowProps {
  page: ManualPage;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (patch: { title?: string; chapter?: string | null }) => void;
  onDelete: () => void;
  deleting: boolean;
}

function PageRow({ page, index, total, selected, onSelect, onMove, onUpdate, onDelete, deleting }: RowProps) {
  return (
    <div
      className={cn(
        "cursor-pointer rounded-card border p-3 transition-colors",
        selected ? "border-primary bg-primary-surface/40" : "border-border bg-card hover:bg-accent/40"
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-1">
        <span className="font-number text-sub-sm text-muted-foreground">{index + 1}枚目</span>
        <div className="ml-auto flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label="1つ上へ動かす">
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="1つ下へ動かす">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={total <= 1 || deleting}
            onClick={onDelete}
            aria-label="このページを削除"
            title={total <= 1 ? "最後の1ページは削除できません" : undefined}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <BufferedInput
        value={page.chapter ?? ""}
        onCommit={(v) => onUpdate({ chapter: v.trim() || null })}
        placeholder="章名（任意。このページから新しい章が始まるとき）"
        className={cn(INPUT_BASE, "mt-1.5 h-8 text-sub-sm")}
        aria-label="章名"
      />
      <BufferedInput
        value={page.title}
        onCommit={(v) => onUpdate({ title: v })}
        placeholder="ページの題"
        className={cn(INPUT_BASE, "mt-1.5 h-9")}
        aria-label="ページの題"
      />
    </div>
  );
}

interface Props {
  pages: ManualPage[];
  selectedId: string | null;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  onMove: (page: ManualPage, direction: -1 | 1) => void;
  onUpdate: (pageId: string, patch: { title?: string; chapter?: string | null }) => void;
  onDelete: (pageId: string) => void;
  adding: boolean;
  deletingId: string | null;
  className?: string;
}

export default function PageRail({ pages, selectedId, onSelect, onAdd, onMove, onUpdate, onDelete, adding, deletingId, className }: Props) {
  const sorted = pagesSorted(pages);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-cardtitle text-foreground">ページ ・ {sorted.length} 枚</h2>
      </div>
      <div className="space-y-2">
        {sorted.map((page, i) => (
          <PageRow
            key={page.id}
            page={page}
            index={i}
            total={sorted.length}
            selected={page.id === selectedId}
            onSelect={() => onSelect(page.id)}
            onMove={(direction) => onMove(page, direction)}
            onUpdate={(patch) => onUpdate(page.id, patch)}
            onDelete={() => onDelete(page.id)}
            deleting={deletingId === page.id}
          />
        ))}
      </div>
      <Button variant="outline" className="min-h-tap" onClick={onAdd} disabled={adding}>
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />ページを追加
      </Button>
    </div>
  );
}
