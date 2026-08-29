import { Plus } from "lucide-react";

// 段5 PR7 で CueTable.tsx から切り出した (純粋な移動・挙動は変えていない)。
// セクション間に挿入する UI (固定高 + opacity 切替で layout shift なし)。
// - 通常: 細い破線 + 中央に小さな "+" のみ表示 (枠の高さは中のボタンと同じ 32px)
// - hover/focus 時: 3 種ボタン (ロール / CM / VTR) がフェードイン
export interface InsertGapProps {
  idx: number;
  insertSectionAt: (idx: number) => void;
  addBreak: (afterIndex?: number) => void;
  addVtr: (afterIndex?: number) => void;
}

export default function InsertGap({ idx, insertSectionAt, addBreak, addVtr }: InsertGapProps) {
  return (
    <div className="group relative h-8 flex items-center justify-center">
      <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 border-t border-dashed border-border/40 group-hover:border-primary/40 transition-colors pointer-events-none" />
      {/* デフォルト表示: 小さな + アイコンのみ */}
      <span
        className="relative inline-flex items-center justify-center size-5 rounded-full bg-background text-muted-foreground group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity pointer-events-none"
        aria-hidden
      >
        <Plus size={12} />
      </span>
      {/* hover/focus 時: 3 種挿入ボタン */}
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
        <button
          type="button"
          onClick={() => insertSectionAt(idx)}
          className="inline-flex h-8 items-center px-2 text-[11px] font-medium rounded-control-md bg-card border border-primary/30 text-primary hover:bg-primary/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`位置 ${idx} にロールを挿入`}
        >
          ＋ ロール
        </button>
        <button
          type="button"
          onClick={() => addBreak(idx - 1)}
          className="inline-flex h-8 items-center px-2 text-[11px] font-medium rounded-control-md bg-card border border-warning/30 text-warning hover:bg-warning/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`位置 ${idx} に CM を挿入`}
        >
          ＋ CM
        </button>
        <button
          type="button"
          onClick={() => addVtr(idx - 1)}
          className="inline-flex h-8 items-center px-2 text-[11px] font-medium rounded-control-md bg-card border border-info/30 text-info hover:bg-info/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`位置 ${idx} に VTR を挿入`}
        >
          ＋ VTR
        </button>
      </div>
    </div>
  );
}
