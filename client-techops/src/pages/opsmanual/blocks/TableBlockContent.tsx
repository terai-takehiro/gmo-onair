// 自由ブロック「表」の中身（段B）。行×列の素の文字列（`content.rows`）を
// 素の <table> で描く。選択中は各セルが BufferedInput になり、右・下に
// 行/列の追加、各行・各列に削除ボタンを出す。1行1列は割れない（＋の目安と同じ
// 「最後の1つは消せない」規律を表にも適用）。
import { Minus, Plus } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import type { ManualTableContent } from "@gmo-onair/shared/src/opsmanual/types";

interface Props {
  content: ManualTableContent;
  selected: boolean;
  onCommit: (content: ManualTableContent) => void;
}

export default function TableBlockContent({ content, selected, onCommit }: Props) {
  const rows = content.rows.length > 0 ? content.rows : [[""]];
  const cols = rows[0]?.length ?? 1;

  const setCell = (r: number, c: number, value: string) => {
    const next = rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row));
    onCommit({ ...content, rows: next });
  };
  const addRow = () => onCommit({ ...content, rows: [...rows, Array.from({ length: cols }, () => "")] });
  const addCol = () => onCommit({ ...content, rows: rows.map((row) => [...row, ""]) });
  const removeRow = (r: number) => {
    if (rows.length <= 1) return;
    onCommit({ ...content, rows: rows.filter((_, ri) => ri !== r) });
  };
  const removeCol = (c: number) => {
    if (cols <= 1) return;
    onCommit({ ...content, rows: rows.map((row) => row.filter((_, ci) => ci !== c)) });
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-auto bg-background"
      // 選択中は表の中で編集操作が完結する（ドラッグでブロックが動かないよう
      // pointerdown をここで止める。ManualBlockView の「つかんで動かす」は
      // pointerdown 起点なので mousedown ではなく pointerdown で止める必要がある。
      // 動かすときは選択を外して枠から掴む）
      onPointerDown={(e) => { if (selected) e.stopPropagation(); }}
    >
      <table className="w-full flex-1 border-collapse text-[10px] leading-tight">
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-border p-0 align-top">
                  {selected ? (
                    <BufferedInput
                      value={cell}
                      onCommit={(v) => setCell(r, c, v)}
                      className="w-full min-w-[2ch] bg-transparent px-1 py-0.5 text-[10px] outline-none focus-visible:bg-accent/40"
                    />
                  ) : (
                    <span className="block px-1 py-0.5">{cell}</span>
                  )}
                </td>
              ))}
              {selected && (
                <td className="w-4 border-0 p-0 text-center align-middle">
                  <button type="button" onClick={() => removeRow(r)} disabled={rows.length <= 1} title="この行を削除" className="text-muted-foreground hover:text-destructive disabled:opacity-30">
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {selected && (
            <tr>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="border-0 p-0 text-center">
                  <button type="button" onClick={() => removeCol(c)} disabled={cols <= 1} title="この列を削除" className="text-muted-foreground hover:text-destructive disabled:opacity-30">
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {selected && (
        <div className="flex items-center gap-2 border-t border-border bg-card/90 px-1 py-0.5">
          <button type="button" onClick={addRow} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" aria-hidden="true" />行を追加
          </button>
          <button type="button" onClick={addCol} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground">
            <Plus className="h-3 w-3" aria-hidden="true" />列を追加
          </button>
        </div>
      )}
    </div>
  );
}
