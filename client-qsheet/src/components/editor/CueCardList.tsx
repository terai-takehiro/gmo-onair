import { useState, Fragment } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@gmo-onair/shared/src/client/ui";
import CueRowSheet from "./CueRowSheet";

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

interface Section {
  id?: string;
  label: string;
  rows: Row[];
  duration?: string | number;
  _break?: boolean;
  _pageBreak?: boolean;
  _vtr?: boolean;
}

interface Props {
  blocks: Block[];
  sections: Section[];
  masters: any;
  ledScenes?: any[];
  updateState: (updater: (s: any) => any) => void;
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

/**
 * sm/md 未満で CueTable の代替に表示するカード形式ビュー。
 * 1 セクション=1 カード、1 row=タップ可能 surface。
 * タップで CueRowSheet を開きフル編集可能。
 */
export default function CueCardList({
  blocks,
  sections,
  masters,
  ledScenes,
  updateState,
}: Props) {
  const [editing, setEditing] = useState<{ si: number; ri: number } | null>(null);

  const addRow = (si: number) => {
    updateState((s: any) => {
      const next = { ...s };
      next.sections = next.sections.map((sec: any, i: number) =>
        i !== si
          ? sec
          : {
              ...sec,
              rows: [
                ...sec.rows,
                { id: `row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label: "", duration: "", cells: {} },
              ],
            }
      );
      return next;
    });
  };

  const removeRow = (si: number, ri: number) => {
    if (!confirm("この行を削除しますか？")) return;
    updateState((s: any) => {
      const next = { ...s };
      next.sections = next.sections.map((sec: any, i: number) =>
        i !== si ? sec : { ...sec, rows: sec.rows.filter((_: any, j: number) => j !== ri) }
      );
      return next;
    });
  };

  const moveRow = (si: number, ri: number, dir: -1 | 1) => {
    updateState((s: any) => {
      const next = { ...s };
      next.sections = next.sections.map((sec: any, i: number) => {
        if (i !== si) return sec;
        const rows = [...sec.rows];
        const target = ri + dir;
        if (target < 0 || target >= rows.length) return sec;
        [rows[ri], rows[target]] = [rows[target], rows[ri]];
        return { ...sec, rows };
      });
      return next;
    });
  };

  const updateSectionLabel = (si: number, label: string) => {
    updateState((s: any) => ({
      ...s,
      sections: s.sections.map((sec: any, i: number) => (i === si ? { ...sec, label } : sec)),
    }));
  };

  const moveSection = (si: number, dir: -1 | 1) => {
    updateState((s: any) => {
      const secs = [...s.sections];
      const target = si + dir;
      if (target < 0 || target >= secs.length) return s;
      [secs[si], secs[target]] = [secs[target], secs[si]];
      return { ...s, sections: secs };
    });
  };

  const removeSection = (si: number) => {
    if (!confirm("このロールを削除しますか？")) return;
    updateState((s: any) => ({
      ...s,
      sections: s.sections.filter((_: any, i: number) => i !== si),
    }));
  };

  const insertAt = (idx: number, type: "role" | "cm" | "vtr") => {
    updateState((s: any) => {
      const secs = [...s.sections];
      if (type === "role") {
        secs.splice(idx, 0, { label: "【新しいロール】", rows: [] });
      } else if (type === "cm") {
        secs.splice(idx, 0, { _break: true, label: "CM", duration: "1:00", rows: [] });
      } else {
        secs.splice(idx, 0, { _vtr: true, label: "VTR", duration: "0:30", rows: [] });
      }
      return { ...s, sections: secs };
    });
  };

  // 挿入ギャップ (3 種ボタン)
  const InsertGap = ({ idx }: { idx: number }) => (
    <div className="flex items-center justify-center gap-1.5 py-1">
      <button
        type="button"
        onClick={() => insertAt(idx, "role")}
        className="px-2 py-1 text-[11px] font-medium rounded-md bg-card border border-primary/30 text-primary hover:bg-primary/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`位置 ${idx} にロール挿入`}
      >
        ＋ ロール
      </button>
      <button
        type="button"
        onClick={() => insertAt(idx, "cm")}
        className="px-2 py-1 text-[11px] font-medium rounded-md bg-card border border-warning/30 text-warning hover:bg-warning/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`位置 ${idx} に CM 挿入`}
      >
        ＋ CM
      </button>
      <button
        type="button"
        onClick={() => insertAt(idx, "vtr")}
        className="px-2 py-1 text-[11px] font-medium rounded-md bg-card border border-info/30 text-info hover:bg-info/10 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`位置 ${idx} に VTR 挿入`}
      >
        ＋ VTR
      </button>
    </div>
  );

  const editingRow =
    editing && sections[editing.si]?.rows[editing.ri] ? sections[editing.si].rows[editing.ri] : null;
  const editingLabel = editing ? sections[editing.si]?.label : undefined;

  return (
    <div className="lg:hidden space-y-3 p-3">
      {sections.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-12">
          セクションがありません。デスクトップでセクションを追加してください。
        </p>
      )}

      <InsertGap idx={0} />
      {sections.map((sec, si) => (
        <Fragment key={sec.id ?? `sec-${si}`}>
        <section
          className={`rounded-xl border border-border overflow-hidden ${
            sec._break
              ? "bg-warning/5 border-warning/30"
              : sec._vtr
              ? "bg-info/5 border-info/30"
              : "bg-card"
          }`}
        >
          <header className={`flex items-center gap-2 px-3 py-2 border-b border-border ${
            sec._break ? "bg-warning/15" : sec._vtr ? "bg-info/15" : "bg-primary/10"
          }`}>
            <input
              value={sec.label || ""}
              onChange={(e) => updateSectionLabel(si, e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm font-bold text-foreground placeholder:text-muted-foreground/60"
              placeholder={sec._break ? "CM" : sec._vtr ? "VTR" : "セクション名"}
              aria-label={`セクション ${si + 1} の名前`}
            />
            {sec._break && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/20 text-warning">CM</span>
            )}
            {sec._vtr && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/20 text-info">VTR</span>
            )}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => moveSection(si, -1)}
                disabled={si === 0}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ロールを上へ"
              >
                <ChevronUp className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => moveSection(si, 1)}
                disabled={si === sections.length - 1}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ロールを下へ"
              >
                <ChevronDown className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => removeSection(si)}
                className="p-1 rounded hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ロールを削除"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </div>
          </header>

          {!sec._break && !sec._vtr && (
          <ul className="divide-y divide-border">
            {sec.rows.length === 0 && (
              <li className="px-3 py-4 text-xs text-muted-foreground italic text-center">
                行がありません
              </li>
            )}
            {sec.rows.map((row, ri) => {
              const summary = summarizeRow(row, blocks);
              const highlight = (() => {
                const scen = getEntries(row.cells?.scenario)[0];
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
                    onClick={() => setEditing({ si, ri })}
                    className="flex-1 min-w-0 text-left px-3 py-2.5 hover:bg-accent/40 focus-visible:outline-none focus-visible:bg-accent/40 transition-colors"
                    aria-label={`行 ${ri + 1} を編集`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono font-bold text-muted-foreground tabular-nums">
                        #{ri + 1}
                      </span>
                      {row.label && (
                        <span className="text-xs font-medium text-foreground truncate">{row.label}</span>
                      )}
                      {row.duration && (
                        <span className="ml-auto text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
                          {row.duration}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{summary}</p>
                  </button>
                  <div className="flex flex-col border-l border-border">
                    <button
                      type="button"
                      onClick={() => moveRow(si, ri, -1)}
                      disabled={ri === 0}
                      className="flex-1 px-2 hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:bg-accent"
                      aria-label="上へ"
                    >
                      <ChevronUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(si, ri, 1)}
                      disabled={ri === sec.rows.length - 1}
                      className="flex-1 px-2 border-t border-border hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:bg-accent"
                      aria-label="下へ"
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRow(si, ri)}
                      className="flex-1 px-2 border-t border-border hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:bg-destructive/10"
                      aria-label="行を削除"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          )}

          {!sec._break && !sec._vtr && (
            <footer className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => addRow(si)}
                className="flex-1"
                aria-label="行を追加"
              >
                <Plus className="size-3.5" aria-hidden />
                <span className="ml-1 text-xs">行を追加</span>
              </Button>
            </footer>
          )}
          {(sec._break || sec._vtr) && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
              <span className="text-muted-foreground">尺:</span>
              <input
                value={sec.duration ? String(sec.duration) : ""}
                onChange={(e) => updateState((s: any) => ({
                  ...s,
                  sections: s.sections.map((x: any, i: number) => i === si ? { ...x, duration: e.target.value } : x),
                }))}
                placeholder="0:00"
                inputMode="numeric"
                className="w-16 px-1.5 py-0.5 text-xs font-mono bg-card border border-border rounded outline-none focus:border-primary"
                aria-label="尺"
              />
            </div>
          )}
        </section>
        <InsertGap idx={si + 1} />
        </Fragment>
      ))}

      <CueRowSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        row={editingRow}
        si={editing?.si ?? 0}
        ri={editing?.ri ?? 0}
        sectionLabel={editingLabel}
        blocks={blocks}
        masters={masters}
        ledScenes={ledScenes}
        updateState={updateState}
      />
    </div>
  );
}
