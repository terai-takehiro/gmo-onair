/**
 * 出す列 (§4.12 / デザイン 16a)
 *
 * サイドバーの「列」タブは列の**追加・削除・並び替え**をするところで、
 * 「いま自分が見たい列」を選ぶ場所ではなかった。台本を書いている人は映像・音声を見たくないし、
 * 映像さんは台本本文の幅が邪魔になる。頻度が高いのは後者なので、上部のチップに出した。
 *
 * - 押すとその列が表の外に出る (**データは消えない** — 中身は行に残ったまま)
 * - 中身が1つも無い列は最初から隠す。空欄の列が並ぶと本当に使う列が探しづらい
 * - 選択は端末ごと (localStorage)。台本の中身ではないので保存対象にしない
 */
import { useMemo } from "react";
import { Columns3, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipBlock {
  id: string;
  label: string;
  type: string;
}

export default function ColumnChips({
  blocks, hidden, emptyIds, onToggle, onReset,
}: {
  blocks: ChipBlock[];
  hidden: Set<string>;
  /** 中身が1つも無い列 (「空」と表示する) */
  emptyIds: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
}) {
  const shownCount = useMemo(
    () => blocks.filter((b) => !hidden.has(b.id)).length,
    [blocks, hidden]
  );

  if (blocks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
        <Columns3 className="h-3.5 w-3.5" aria-hidden />
        出す列
        <span className="tabular-nums">{shownCount}/{blocks.length}</span>
      </span>

      {blocks.map((b) => {
        const on = !hidden.has(b.id);
        const empty = emptyIds.has(b.id);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onToggle(b.id)}
            aria-pressed={on}
            title={
              on
                ? `${b.label} を表の外に出す（中身は消えません）`
                : `${b.label} を表に出す${empty ? "（この列はまだ空です）" : ""}`
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              on
                ? "border-primary/40 bg-primary/10 font-bold text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {b.label}
            {empty && <span className="text-[9px] opacity-70">空</span>}
          </button>
        );
      })}

      {hidden.size > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title="すべての列を出す"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          全部出す
        </button>
      )}
    </div>
  );
}
