import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";

// CueCardList.tsx から抽出 (400行ルール・scripts/check-file-size.mjs)。
// ロール内の行一覧 (<ul>) だけを持つ。CueRowMobilePanels.tsx と同じ理由の分割。

interface Block {
  id: string;
  type: string;
  label: string;
  width?: string | number;
}

interface Row {
  id?: string;
  label?: string;
  duration?: string | number;
  cells?: Record<string, any>;
  [k: string]: any;
}

// ─── Helpers ────────────────────────────────────────────
function getEntries(cell: any): any[] {
  if (!cell) return [];
  if (typeof cell === "string") return cell ? [{ label: cell }] : [];
  return Array.isArray(cell.entries) ? cell.entries : [];
}

function summarizeRow(row: Row, blocks: Block[]): string {
  const parts: string[] = [];
  for (const blk of blocks) {
    const entries = getEntries(row.cells?.[blk.id]);
    if (entries.length === 0) continue;
    if (blk.type === "scenario") {
      const e = entries[0];
      if (e.name) parts.push(`${e.name}:`);
      if (e.html) parts.push(String(e.html).replace(/<[^>]+>/g, "").slice(0, 30));
    } else {
      const e = entries[0];
      if (e.label) parts.push(`[${blk.label}] ${String(e.label).slice(0, 20)}`);
    }
    if (parts.length >= 2) break;
  }
  return parts.join(" ").trim() || "(空)";
}

interface Props {
  rows: Row[];
  si: number;
  blocks: Block[];
  /**
   * ハイライトを読む scenario 型ブロックの id。呼び出し側 (CueCardList) が
   * `blocks.find(b => b.type === "scenario")?.id` で動的に解決して渡す
   * (blockId === "scenario" の決め打ちにしない。05-editor-impl.md §3-5)。
   * scenario 列が無い台本では undefined になり、ハイライト表示は出ない。
   */
  scenarioBlockId?: string;
  onEdit: (si: number, ri: number) => void;
  onMoveRow: (si: number, ri: number, dir: -1 | 1) => void;
  onInsertRow: (si: number, ri: number) => void;
  onRemoveRow: (si: number, ri: number) => void;
}

/** ロール内の行一覧。タップで編集シートを開き、右の操作列で上下移動・挿入・削除する。 */
export default function CueCardRowList({
  rows,
  si,
  blocks,
  scenarioBlockId,
  onEdit,
  onMoveRow,
  onInsertRow,
  onRemoveRow,
}: Props) {
  return (
    <ul className="divide-y divide-border">
      {rows.length === 0 && (
        <li className="px-3 py-4 text-xs text-muted-foreground italic text-center">
          行がありません
        </li>
      )}
      {rows.map((row, ri) => {
        const summary = summarizeRow(row, blocks);
        const highlight = (() => {
          if (!scenarioBlockId) return undefined;
          const scen = getEntries(row.cells?.[scenarioBlockId])[0];
          return scen?.highlight as string | undefined;
        })();
        return (
          <li
            key={row.id ?? `${si}-${ri}`}
            className="flex items-stretch"
            style={highlight ? { backgroundColor: highlight } : undefined}
          >
            <button
              type="button"
              onClick={() => onEdit(si, ri)}
              className="flex-1 min-w-0 text-left px-3 py-2.5 hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/40 transition-colors"
              aria-label={`行 ${ri + 1} を編集`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold text-muted-foreground tabular-nums">
                  #{ri + 1}
                </span>
                {row.label && (
                  <span className="text-xs font-medium text-foreground truncate">{row.label}</span>
                )}
                {row.duration && (
                  <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {row.duration}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
            </button>
            <div className="flex flex-col border-l border-border w-11 shrink-0">
              <button
                type="button"
                onClick={() => onMoveRow(si, ri, -1)}
                disabled={ri === 0}
                className="flex-1 inline-flex items-center justify-center min-h-tap hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:bg-accent"
                aria-label="上へ"
              >
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onMoveRow(si, ri, 1)}
                disabled={ri === rows.length - 1}
                className="flex-1 inline-flex items-center justify-center min-h-tap border-t border-border hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:bg-accent"
                aria-label="下へ"
              >
                <ChevronDown className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onInsertRow(si, ri)}
                className="flex-1 inline-flex items-center justify-center min-h-tap border-t border-border hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:bg-primary/10"
                aria-label="この行の下に空行を挿入"
              >
                <Plus className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => onRemoveRow(si, ri)}
                className="flex-1 inline-flex items-center justify-center min-h-tap border-t border-border hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:bg-destructive/10"
                aria-label="行を削除"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
