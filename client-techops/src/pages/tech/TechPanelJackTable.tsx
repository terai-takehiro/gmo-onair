// ⑤ パッチ盤の「番号の表」（担当 C4）。8番（TRK盤は8番＝8行、それ以外は8番＝16行）ずつ
// ページ送りし、1行をその場で編集する（`BufferedInput`）。設計: docs/design/v4/tech-docs.md
// §6 ⑤・モック `mockups/native/tech-docs/Panel.dc.html`。
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@gmo-onair/shared/src/client/utils";
import { Row, RowHeader, RowMain, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import type { PatchJack, PatchPanel } from "@gmo-onair/shared/src/tech/types";
import { patchNo } from "@gmo-onair/shared/src/tech/patchNo";
import { panelJackLabel, type TechPanelBoardSelection } from "./TechPanelBoard";

const PER_PAGE = 8;

type Draft = { device_name: string; label: string; signal: string; area: string; note: string };

function draftOf(jack: PatchJack): Draft {
  return { device_name: jack.device_name, label: jack.label, signal: jack.signal, area: jack.area, note: jack.note };
}

export function TechPanelJackTable({
  panel,
  jacks,
  page,
  onPageChange,
  selected,
  onSelectRow,
  canEdit,
  onSave,
}: {
  panel: PatchPanel;
  jacks: PatchJack[];
  page: number;
  onPageChange: (page: number) => void;
  selected: TechPanelBoardSelection | null;
  onSelectRow: (selection: TechPanelBoardSelection) => void;
  canEdit: boolean;
  /** 送れたら `true`。`false` のときはその場編集を閉じない（入力が消えるため） */
  onSave: (jackId: string, patch: Partial<Draft>) => Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  /** いま編集している番号の位置。**選び直しで閉じるかどうかの判断にだけ使う** */
  const editingPosRef = useRef<TechPanelBoardSelection | null>(null);

  // 別の番号を選んだ（盤の絵をクリックした等）ら、その場編集は閉じる。
  // ⚠️ **いま開いた番号そのものが選ばれた場合は閉じない。** 表の機材を押すと
  // 「その行を選ぶ」→「編集を開く」の順で起きるので、無条件に閉じると開いた
  // 直後に閉じてしまい、1回目のクリックでは編集欄が出なかった（実ブラウザで踏んだ）。
  useEffect(() => {
    const pos = editingPosRef.current;
    if (pos && selected && pos.jackNo === selected.jackNo && pos.jackRow === selected.jackRow) return;
    editingPosRef.current = null;
    setEditingId(null);
    setDraft(null);
  }, [selected?.jackNo, selected?.jackRow]);

  const jackOf = (n: number, row: "A" | "B") => jacks.find((j) => j.jack_no === n && j.jack_row === row) ?? null;

  const from = page * PER_PAGE + 1;
  const to = Math.min(from + PER_PAGE - 1, panel.jack_count);
  const rest = panel.jack_count - to;
  const rowKeys: ("A" | "B")[] = panel.kind === "trunk" ? ["A"] : ["A", "B"];
  const lastPage = Math.ceil(panel.jack_count / PER_PAGE) - 1;

  const startEdit = (jack: PatchJack) => {
    if (!canEdit) return;
    editingPosRef.current = { jackNo: jack.jack_no, jackRow: jack.jack_row };
    setEditingId(jack.id);
    setDraft(draftOf(jack));
  };
  const cancelEdit = () => {
    editingPosRef.current = null;
    setEditingId(null);
    setDraft(null);
  };
  const save = async () => {
    if (!editingId || !draft) return;
    setSaving(true);
    try {
      if (await onSave(editingId, draft)) {
        editingPosRef.current = null;
        setEditingId(null);
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    // 列が7つあり、盤の絵に合わせた幅（596px）では「名称」だけが数pxまで潰れていた
    // （実ブラウザで踏んだ）。潰さずに横へ送るため、表そのものを横スクロールにする。
    <div className="overflow-x-auto rounded-card border border-border bg-card">
      <RowHeader className="gap-2 text-th">
        <RowSlot w={56}>番号</RowSlot>
        <RowSlot w={56}>段</RowSlot>
        <RowSlot w={128}>機材</RowSlot>
        <RowMain className="min-w-[96px]">名称</RowMain>
        <RowSlot w={72}>信号</RowSlot>
        <RowSlot w={72}>エリア</RowSlot>
        <RowSlot w={72}>備考</RowSlot>
      </RowHeader>

      <div>
        {Array.from({ length: to - from + 1 }).flatMap((_, i) => {
          const n = from + i;
          return rowKeys.map((rowKey) => {
            const jack = jackOf(n, rowKey);
            if (!jack) return null;
            const no = patchNo(panel.name, n, rowKey, panel.kind);
            const isSel = selected != null && selected.jackNo === n && selected.jackRow === rowKey;
            const isEditing = editingId === jack.id;
            const hasDevice = jack.device_name !== "";
            return (
              <Row
                key={jack.id}
                density="table"
                divider
                className={cn("gap-2", isEditing ? "bg-primary/5" : isSel ? "bg-primary/5" : undefined)}
              >
                <RowSlot w={56}>
                  <span
                    className={cn(
                      "font-number inline-flex h-5 items-center justify-center rounded-badge-xs text-badge font-bold",
                      isSel ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                    )}
                    style={{ width: 52 }}
                  >
                    {no}
                  </span>
                </RowSlot>
                <RowSlot w={56}>
                  <span className={cn("font-number text-badge font-bold", rowKey === "A" ? "text-primary" : "text-success")}>
                    {panel.kind === "trunk" ? "TRK" : `${rowKey}段`}
                  </span>
                </RowSlot>

                {isEditing && draft ? (
                  <>
                    <RowSlot w={128}>
                      <BufferedInput
                        value={draft.device_name}
                        onCommit={(v) => setDraft((d) => (d ? { ...d, device_name: v } : d))}
                        aria-label="機材"
                        className="h-8 w-full min-w-0 rounded-control border border-border bg-background px-2 text-sub"
                      />
                    </RowSlot>
                    <RowMain className="min-w-[96px]">
                      <BufferedInput
                        value={draft.label}
                        onCommit={(v) => setDraft((d) => (d ? { ...d, label: v } : d))}
                        aria-label="名称"
                        className="h-8 w-full min-w-0 rounded-control border border-primary bg-background px-2 text-sub"
                      />
                    </RowMain>
                    <RowSlot w={72}>
                      <BufferedInput
                        value={draft.signal}
                        onCommit={(v) => setDraft((d) => (d ? { ...d, signal: v } : d))}
                        aria-label="信号"
                        className="h-8 w-full min-w-0 rounded-control border border-border bg-background px-2 text-sub"
                      />
                    </RowSlot>
                    <RowSlot w={72}>
                      <BufferedInput
                        value={draft.area}
                        onCommit={(v) => setDraft((d) => (d ? { ...d, area: v } : d))}
                        aria-label="エリア"
                        className="h-8 w-full min-w-0 rounded-control border border-border bg-background px-2 text-sub"
                      />
                    </RowSlot>
                    <RowSlot w={72}>
                      <BufferedInput
                        value={draft.note}
                        onCommit={(v) => setDraft((d) => (d ? { ...d, note: v } : d))}
                        aria-label="備考"
                        className="h-8 w-full min-w-0 rounded-control border border-border bg-background px-2 text-sub"
                      />
                    </RowSlot>
                  </>
                ) : (
                  <>
                    <RowSlot w={128}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectRow({ jackNo: n, jackRow: rowKey });
                          startEdit(jack);
                        }}
                        disabled={!canEdit}
                        className={cn(
                          "truncate text-left text-sub font-bold",
                          hasDevice ? "text-foreground" : "text-muted-foreground",
                          canEdit && "hover:text-primary",
                        )}
                      >
                        {hasDevice ? jack.device_name : "（空き）"}
                      </button>
                    </RowSlot>
                    <RowMain className="min-w-[96px]">
                      <span className="font-number truncate text-sub text-foreground">{jack.label}</span>
                    </RowMain>
                    <RowSlot w={72}>
                      {jack.signal ? (
                        <span className="rounded-badge-xs bg-muted px-1.5 text-badge font-bold text-muted-foreground">
                          {jack.signal}
                        </span>
                      ) : null}
                    </RowSlot>
                    <RowSlot w={72}>
                      <span className="truncate text-sub-sm text-muted-foreground">{jack.area}</span>
                    </RowSlot>
                    <RowSlot w={72}>
                      <span className="truncate text-sub-sm text-muted-foreground">{jack.note}</span>
                    </RowSlot>
                  </>
                )}
              </Row>
            );
          });
        })}

        {editingId && draft && (
          <div className="flex items-center justify-end gap-2 border-b border-border-faint bg-primary/5 px-4 py-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
              キャンセル
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-2.5 py-2">
        <span className="font-number text-sub text-muted-foreground">
          {panelJackLabel(panel, from)}〜{panelJackLabel(panel, to)} 番を表示 ・ 残り {rest} 番
        </span>
        <span className="flex-1" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />前の 8 番
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(lastPage, page + 1))}
          disabled={page >= lastPage}
        >
          次の 8 番<ChevronRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
