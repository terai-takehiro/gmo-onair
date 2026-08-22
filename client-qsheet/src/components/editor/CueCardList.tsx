import { useState, Fragment } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, X } from "lucide-react";
import { Button } from "@gmo-onair/shared/src/client/ui";
import CueRowSheet from "./CueRowSheet";
import CueCardRowList from "./CueCardRowList";
import { genId } from "@/lib/stableIds";
import { makeTrashItem, pushToTrash } from "@/lib/trash";
import { parseDur, normalizeDur } from "@/lib/time";

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
  stageTemplates?: any[];
  ledScenes?: any[];
  updateState: (updater: (s: any) => any) => void;
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
  stageTemplates,
  ledScenes,
  updateState,
}: Props) {
  const [editing, setEditing] = useState<{ si: number; ri: number } | null>(null);
  const [expandedGap, setExpandedGap] = useState<number | null>(null);

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
                { id: genId("row"), label: "", duration: "", cells: {} },
              ],
            }
      );
      return next;
    });
  };

  const insertRow = (si: number, ri: number) => {
    updateState((s: any) => {
      const next = { ...s };
      next.sections = next.sections.map((sec: any, i: number) => {
        if (i !== si) return sec;
        const rows = [...sec.rows];
        rows.splice(ri + 1, 0, { id: genId("row"), label: "", duration: "", cells: {} });
        return { ...sec, rows };
      });
      return next;
    });
  };

  // ゴミ箱経由の削除 (PC の CueTable.tsx deleteRow と同じ形。行削除は
  // 確認ダイアログを出さない — ゴミ箱から戻せるため PC と同じ挙動にする)。
  const removeRow = (si: number, ri: number) => {
    updateState((s: any) => {
      const section = s.sections[si];
      const row = section?.rows?.[ri];
      if (!row) return s;
      const trashItem = makeTrashItem('row', row, {
        sectionIdx: si,
        rowIdx: ri,
        sectionLabel: section.label,
        rowLabel: row.label,
      });
      const nextState = pushToTrash(s, trashItem);
      const next = { ...nextState };
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

  // ロール尺 (通常ロール / CM / VTR 共通)。PC の CueTable.tsx updateSection と同じ形。
  const updateSectionDuration = (si: number, duration: string) => {
    updateState((s: any) => ({
      ...s,
      sections: s.sections.map((sec: any, i: number) => (i === si ? { ...sec, duration } : sec)),
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

  // ゴミ箱経由の削除 (PC の CueTable.tsx deleteSection と同じ形。中の行ごとゴミ箱へ)。
  const removeSection = (si: number) => {
    if (!confirm("このロールを削除しますか？（ゴミ箱から復元可能です）")) return;
    updateState((s: any) => {
      const section = s.sections[si];
      if (!section) return s;
      const trashItem = makeTrashItem('section', section, {
        sectionIdx: si,
        sectionLabel: section.label,
      });
      const nextState = pushToTrash(s, trashItem);
      return { ...nextState, sections: nextState.sections.filter((_: any, i: number) => i !== si) };
    });
  };

  const insertAt = (idx: number, type: "role" | "cm" | "vtr") => {
    updateState((s: any) => {
      const secs = [...s.sections];
      // 不変条件: 全ての section は id を持つ (client-qsheet/CLAUDE.md)。
      // id 無しのまま collab に入ると差分器が毎回「新規」と判定し倍々に増える。
      if (type === "role") {
        secs.splice(idx, 0, { id: genId("sec"), label: "【新しいロール】", rows: [] });
      } else if (type === "cm") {
        secs.splice(idx, 0, { id: genId("sec"), _break: true, label: "CM", duration: "1:00", rows: [] });
      } else {
        secs.splice(idx, 0, { id: genId("sec"), _vtr: true, label: "VTR", duration: "0:30", rows: [] });
      }
      return { ...s, sections: secs };
    });
  };

  // 挿入ギャップ (タップ展開式: デフォルトは小さな "+" 1 個のみ、
  // tap で 3 種ボタン inline 展開、再 tap or 右の × で閉じる)
  const InsertGap = ({ idx }: { idx: number }) => {
    const expanded = expandedGap === idx;
    return (
      <div className="relative flex items-center justify-center h-7">
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 border-t border-dashed border-border/40 pointer-events-none" />
        {expanded ? (
          <div className="relative z-10 flex items-center gap-1 bg-background px-1.5 py-0.5 rounded-full shadow-sm border border-border">
            <button
              type="button"
              onClick={() => { insertAt(idx, "role"); setExpandedGap(null); }}
              className="px-2 py-0.5 text-[11px] font-medium rounded-md text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ＋ ロール
            </button>
            <span className="text-border" aria-hidden>·</span>
            <button
              type="button"
              onClick={() => { insertAt(idx, "cm"); setExpandedGap(null); }}
              className="px-2 py-0.5 text-[11px] font-medium rounded-md text-warning hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ＋ CM
            </button>
            <span className="text-border" aria-hidden>·</span>
            <button
              type="button"
              onClick={() => { insertAt(idx, "vtr"); setExpandedGap(null); }}
              className="px-2 py-0.5 text-[11px] font-medium rounded-md text-info hover:bg-info/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ＋ VTR
            </button>
            <button
              type="button"
              onClick={() => setExpandedGap(null)}
              className="size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-accent ml-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="閉じる"
            >
              <X size={11} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpandedGap(idx)}
            className="relative z-10 size-6 inline-flex items-center justify-center rounded-full bg-background border border-border text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`位置 ${idx} に挿入`}
          >
            <Plus size={12} aria-hidden />
          </button>
        )}
      </div>
    );
  };

  // ロール尺の入力欄 (通常ロール / CM / VTR で共通)。PC (CueTable.tsx) と同じく
  // blur で normalizeDur、未入力 (0秒) は琥珀色で警告する。
  const renderDurationInput = (sec: Section, si: number) => {
    const dur = parseDur(sec.duration || "");
    return (
      <input
        value={sec.duration ? String(sec.duration) : ""}
        onChange={(e) => updateSectionDuration(si, e.target.value)}
        onBlur={(e) => {
          const n = normalizeDur(e.target.value);
          if (n !== e.target.value) updateSectionDuration(si, n);
        }}
        placeholder="0:00"
        inputMode="numeric"
        className={`min-h-tap w-16 px-1.5 py-1 text-xs text-center tabular-nums rounded border outline-none focus:border-primary ${
          dur === 0
            ? "bg-warning text-warning-foreground border-warning-border-strong placeholder:text-warning-foreground/70"
            : "bg-card border-border"
        }`}
        aria-label="ロール尺"
        title={dur === 0 ? "尺が未入力です" : undefined}
      />
    );
  };

  const editingRow =
    editing && sections[editing.si]?.rows[editing.ri] ? sections[editing.si].rows[editing.ri] : null;
  const editingLabel = editing ? sections[editing.si]?.label : undefined;

  // ハイライトは scenario 型のブロックを動的に探す (blockId 決め打ちにしない)。
  // サイドバーで足した台本列は id が "scenario" ではなく blk_... になるため、
  // 固定文字列 "scenario" では見つからない (05-editor-impl.md §3-5)。
  const scenarioBlockId = blocks.find((b) => b.type === "scenario")?.id;

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
          <header className={`flex items-center gap-1 px-2.5 py-2 border-b border-border ${
            sec._break ? "bg-warning/15" : sec._vtr ? "bg-info/15" : "bg-primary/10"
          }`}>
            <input
              value={sec.label || ""}
              onChange={(e) => updateSectionLabel(si, e.target.value)}
              className="min-w-0 flex-1 bg-transparent border-none outline-none text-sm font-bold text-foreground placeholder:text-muted-foreground/60"
              placeholder={sec._break ? "CM" : sec._vtr ? "VTR" : "セクション名"}
              aria-label={`セクション ${si + 1} の名前`}
            />
            {sec._break && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/20 text-warning">CM</span>
            )}
            {sec._vtr && (
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-info/20 text-info">VTR</span>
            )}
            <div className="flex items-center shrink-0">
              <button
                type="button"
                onClick={() => moveSection(si, -1)}
                disabled={si === 0}
                className="min-h-tap min-w-tap inline-flex items-center justify-center rounded hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ロールを上へ"
              >
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => moveSection(si, 1)}
                disabled={si === sections.length - 1}
                className="min-h-tap min-w-tap inline-flex items-center justify-center rounded hover:bg-accent disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ロールを下へ"
              >
                <ChevronDown className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => removeSection(si)}
                className="min-h-tap min-w-tap inline-flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="ロールを削除"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </header>

          {!sec._break && !sec._vtr && (
            <CueCardRowList
              rows={sec.rows}
              si={si}
              blocks={blocks}
              scenarioBlockId={scenarioBlockId}
              onEdit={(si2, ri2) => setEditing({ si: si2, ri: ri2 })}
              onMoveRow={moveRow}
              onInsertRow={insertRow}
              onRemoveRow={removeRow}
            />
          )}

          {!sec._break && !sec._vtr && (
            <footer className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-t border-border">
              <span className="shrink-0 text-[11px] text-muted-foreground">尺:</span>
              {renderDurationInput(sec, si)}
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
              {renderDurationInput(sec, si)}
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
        stageTemplates={stageTemplates}
        ledScenes={ledScenes}
        updateState={updateState}
      />
    </div>
  );
}
