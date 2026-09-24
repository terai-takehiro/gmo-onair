// 技術資料 ②映像パッチ — 表と系統の見出し（設計: docs/design/v4/tech-docs.md §6②）。
// 行は系統ごとにまとめて出す。系統の名前はその場で書き換えられ、書き換えると
// その系統の行がまとめて付け替わる。1行の中身は PatchRow.tsx、右の欄は PatchRowExtras.tsx。
import { Plus } from "lucide-react";
import { EmptyState } from "@gmo-onair/shared/src/client/states";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { Row, RowHeader, RowMain, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import BufferedInput from "@/components/editor/BufferedInput";
import type { PatchDeviceOption, PatchPanelListItem, TechPatchRow } from "@gmo-onair/shared/src/tech/types";
import { groupRowsByLabel, movedOrder, nextGroupLabel, panelKindsOf } from "./patchDerive";
import { PatchRow } from "./PatchRow";

/** 系統の色。意味を持たない見分けの色（`cat-1`〜`cat-8`）から順に当てる */
const GROUP_COLORS = ["bg-cat-1", "bg-cat-2", "bg-cat-3", "bg-cat-4", "bg-cat-5", "bg-cat-6", "bg-cat-7", "bg-cat-8"];

interface Props {
  rows: TechPatchRow[];
  devices: PatchDeviceOption[];
  panels: PatchPanelListItem[];
  canEdit: boolean;
  onCreate: (patch: Partial<TechPatchRow>) => void;
  onUpdate: (id: string, patch: Partial<TechPatchRow>) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
}

export function PatchTable({ rows, devices, panels, canEdit, onCreate, onUpdate, onDelete, onReorder }: Props) {
  const kinds = panelKindsOf(panels);
  const groups = groupRowsByLabel(rows);
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const noOf = (id: string) => ordered.findIndex((r) => r.id === id) + 1;

  const renameGroup = (from: string, to: string) => {
    const next = to.trim();
    if (!next || next === from) return;
    for (const r of rows.filter((x) => x.group_label === from)) onUpdate(r.id, { group_label: next });
  };

  const removeRow = async (row: TechPatchRow) => {
    const ok = await confirmAction({
      title: "この行を削除しますか？",
      description: `${row.from_device_text || "機材なし"} → ${row.to_device_text || "機材なし"} の行を削除します。`,
      confirmLabel: "削除",
      tone: "danger",
    });
    if (ok) onDelete(row.id);
  };

  const duplicate = (row: TechPatchRow) => {
    onCreate({
      group_label: row.group_label,
      from_device_text: row.from_device_text, from_jack_id: row.from_jack_id, from_jack_text: row.from_jack_text, from_is_extra: row.from_is_extra,
      to_device_text: row.to_device_text, to_jack_id: row.to_jack_id, to_jack_text: row.to_jack_text, to_is_extra: row.to_is_extra,
      label: row.label, signal: row.signal, note: row.note,
    });
  };

  return (
    // 列は固定幅なので、窓が狭いと「名称」だけが数pxまで潰れる（実ブラウザで踏んだ）。
    // 潰さずに横へ送るため、表そのものを横スクロールにする（`_rules.md` 3. スマホ）。
    <div className="min-w-0 flex-1 overflow-x-auto rounded-card border border-border bg-card">
      {/* 見出しは2段。上が「送り／受け」の区切り、下が列の名前 */}
      <Row density="table" className="h-5 gap-2 bg-surface-subtle py-0 text-th">
        <div className="w-8 shrink-0" />
        <RowSlot w={160} placeholder=""><span className="text-primary">送り（出力側）</span></RowSlot>
        <RowSlot w={72} placeholder="" />
        <div className="w-6 shrink-0" />
        <RowSlot w={160} placeholder=""><span className="text-success">受け（入力側）</span></RowSlot>
        <RowSlot w={72} placeholder="" />
        <RowMain className="min-w-[128px]" />
        <RowSlot w={96} placeholder="" />
        <div className="w-8 shrink-0" />
      </Row>
      <RowHeader className="gap-2">
        <div className="num w-8 shrink-0">#</div>
        <RowSlot w={160} placeholder="">機材・端子盤</RowSlot>
        <RowSlot w={72} placeholder="">パッチ番号</RowSlot>
        <div className="w-6 shrink-0" />
        <RowSlot w={160} placeholder="">機材・端子盤</RowSlot>
        <RowSlot w={72} placeholder="">パッチ番号</RowSlot>
        <RowMain className="min-w-[128px]">名称</RowMain>
        <RowSlot w={96} placeholder="">備考</RowSlot>
        <div className="w-8 shrink-0" />
      </RowHeader>

      {groups.length === 0 && (
        <EmptyState
          title="まだ映像パッチの行がありません"
          description="下の「行を追加」を押して、送りと受けの機材・端子盤を選んでください。"
        />
      )}

      {groups.map((g, gi) => (
        <div key={g.label}>
          <div className="flex items-center gap-2 border-b border-border bg-surface-subtle px-4 py-1.5">
            <span className={`h-3.5 w-1 shrink-0 rounded-badge-xs ${GROUP_COLORS[gi % GROUP_COLORS.length]}`} />
            <BufferedInput
              value={g.label} onCommit={(v) => renameGroup(g.label, v)} disabled={!canEdit}
              aria-label="系統の名前" placeholder="系統の名前"
              className="h-8 w-48 min-w-0 rounded-control border border-transparent bg-transparent px-1.5 text-list text-foreground outline-none hover:border-border-faint focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
            />
            <span className="num rounded-badge border border-border bg-card px-1.5 py-0.5 text-badge text-muted-foreground">
              {g.rows.length} 行
            </span>
            <span className="flex-1" />
            {canEdit && (
              <button
                type="button"
                onClick={() => onCreate({ group_label: g.label })}
                className="flex h-8 items-center gap-1 rounded-control border border-border bg-card px-2 text-sub font-bold text-foreground hover:bg-muted/30"
              >
                <Plus className="h-3 w-3" aria-hidden="true" />行を追加
              </button>
            )}
          </div>
          {g.rows.map((r) => (
            <PatchRow
              key={r.id} row={r} no={noOf(r.id)} rows={rows} devices={devices} kinds={kinds} canEdit={canEdit}
              onPatch={(patch) => onUpdate(r.id, patch)}
              onDuplicate={() => duplicate(r)}
              onDelete={() => { void removeRow(r); }}
              onMove={(dir) => {
                const order = movedOrder(rows, r.id, dir);
                if (order) onReorder(order);
              }}
            />
          ))}
        </div>
      ))}

      <div className="flex items-center gap-2 bg-surface-subtle px-4 py-2.5">
        <span className="flex-1 text-sub text-muted-foreground">名称は行ごとに編集できます</span>
        <button
          type="button" disabled={!canEdit}
          onClick={() => onCreate({ group_label: groups[groups.length - 1]?.label ?? nextGroupLabel(rows) })}
          className="flex h-9 items-center gap-1.5 rounded-control border border-border bg-card px-3 text-sub font-bold text-foreground hover:bg-muted/30 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />行を追加
        </button>
        <button
          type="button" disabled={!canEdit}
          onClick={() => onCreate({ group_label: nextGroupLabel(rows) })}
          className="flex h-9 items-center gap-1.5 rounded-control border border-border bg-card px-3 text-sub font-bold text-foreground hover:bg-muted/30 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />系統を追加
        </button>
      </div>
    </div>
  );
}
