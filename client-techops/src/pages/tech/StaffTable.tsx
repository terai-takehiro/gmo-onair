// ③ 技術スタッフ — 技術資料の「技術スタッフ」タブの中身（`TechDocPage.tsx` が描く）。
// 1行＝1人の1作業日分の割当。作業日のチップで日を切り替え、その日の表だけを出す（設計 §4-5・§6③）。
// 並び・集計は `staffRows.ts`、名前の候補は `PersonPicker.tsx`。
// モック: mockups/native/tech-docs/Staff.dc.html
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Trash2, User } from "lucide-react";
import { Row, RowHeader, RowMain, RowSlot } from "@gmo-onair/shared/src/client/ui/row";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { TECH_ROLES, roleName } from "@gmo-onair/shared/src/tech/roles";
import type { TechDoc, TechPerson, TechStaffRow } from "@gmo-onair/shared/src/tech/types";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { formatDateJp, todayStr } from "@/lib/dateFmt";
import { PersonPicker } from "./PersonPicker";
import { RowMenu, RowMenuItem } from "./staffMenu";
import {
  companyCountsOf,
  dayListOf,
  filledCountOf,
  movedOrder,
  nextSortOrder,
  rowsOfDay,
} from "./staffRows";

type NewStaffRow = Omit<TechStaffRow, "id" | "tech_doc_id" | "created_at" | "updated_at">;

export interface StaffTableProps {
  doc: TechDoc;
  rows: TechStaffRow[];
  canEdit: boolean;
  /**
   * 書き込みは**送れたら `true`**（`useTechDoc` の契約）。失敗の知らせは
   * `useTechDoc` が1回だけ出すので、この表からは出さない（二重に出さない）。
   */
  onCreate(row: NewStaffRow): Promise<boolean>;
  onUpdate(id: string, patch: Partial<TechStaffRow>): Promise<boolean>;
  onDelete(id: string): Promise<boolean>;
  /** 作業日の中での並び */
  onReorder(ids: string[]): Promise<boolean>;
}

export function StaffTable({ doc, rows, canEdit, onCreate, onUpdate, onDelete, onReorder }: StaffTableProps) {
  const [addedDays, setAddedDays] = useState<string[]>([]);
  const [day, setDay] = useState("");
  const [addingDay, setAddingDay] = useState(false);
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  useEffect(() => {
    setAddedDays([]);
    setDay("");
  }, [doc.id]);

  const days = useMemo(() => dayListOf(rows, addedDays), [rows, addedDays]);
  const current = day !== "" && days.includes(day) ? day : days[0] ?? "";
  const dayRows = useMemo(() => (current === "" ? [] : rowsOfDay(rows, current)), [rows, current]);
  const counts = useMemo(() => companyCountsOf(dayRows), [dayRows]);

  const addDay = (value: string) => {
    setAddingDay(false);
    if (!value) return;
    setAddedDays((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setDay(value);
  };

  const addRow = () =>
    onCreate({
      work_date: current,
      role: "",
      person_id: null,
      person_name: "",
      company_id: null,
      company_name: "",
      note: "",
      sort_order: nextSortOrder(rows, current),
    });

  const move = (id: string, delta: -1 | 1) => {
    const order = movedOrder(dayRows, id, delta);
    if (!order) return;
    void onReorder(order);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 rounded-card border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-2.5 py-2">
          {days.map((d) => (
            <DayChip
              key={d}
              date={d}
              count={filledCountOf(rowsOfDay(rows, d))}
              active={d === current}
              onClick={() => setDay(d)}
            />
          ))}
          {days.length === 0 && !addingDay && (
            <span className="px-1 text-sub text-muted-foreground">作業日がまだありません</span>
          )}
          <span className="flex-1" />
          {canEdit &&
            (addingDay ? (
              <input
                type="date"
                autoFocus
                defaultValue={todayStr()}
                aria-label="追加する作業日"
                className="h-9 rounded-control border border-border bg-card px-2 font-number text-sub text-foreground"
                onChange={(e) => addDay(e.target.value)}
                onBlur={(e) => addDay(e.target.value)}
              />
            ) : (
              <Button type="button" variant="ghost" size="sm" className="min-h-tap" onClick={() => setAddingDay(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                日を追加
              </Button>
            ))}
        </div>

        <RowHeader>
          <RowSlot w={96}>役職</RowSlot>
          <RowMain>名前</RowMain>
          <RowSlot w={160} hideOnMobile>会社</RowSlot>
          <RowSlot w={240} hideOnMobile>備考</RowSlot>
          {canEdit && <RowSlot w={72} align="right">操作</RowSlot>}
        </RowHeader>

        {dayRows.map((r) => (
          <StaffRowView
            key={r.id}
            row={r}
            canEdit={canEdit}
            open={openRowId === r.id}
            onOpenChange={(open) => setOpenRowId(open ? r.id : null)}
            onUpdate={(patch) => { void onUpdate(r.id, patch); }}
            onDuplicate={() => {
              void onCreate({
                work_date: r.work_date,
                role: r.role,
                person_id: r.person_id,
                person_name: r.person_name,
                company_id: r.company_id,
                company_name: r.company_name,
                note: r.note,
                sort_order: nextSortOrder(rows, r.work_date),
              });
            }}
            onDelete={async () => {
              const ok = await confirmAction({
                title: `「${r.person_name || "（名前なし）"}」の行を削除しますか？`,
                confirmLabel: "削除する",
                tone: "danger",
              });
              if (ok) await onDelete(r.id);
            }}
            onMove={(delta) => move(r.id, delta)}
          />
        ))}

        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          {canEdit && current !== "" && (
            <Button type="button" variant="ghost" size="sm" className="min-h-tap" onClick={() => void addRow()}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              行を追加
            </Button>
          )}
          <span className="flex-1" />
          <span className="text-sub text-muted-foreground">並び順は役職の順です</span>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <div className="rounded-card border border-border bg-card p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-cardtitle text-foreground">この日の人数</span>
            <span className="flex-1" />
            <span className="font-number text-h2 text-primary">{filledCountOf(dayRows)}</span>
            <span className="text-sub text-muted-foreground">人</span>
          </div>
          <p className="mt-0.5 mb-2 font-number text-sub-sm text-muted-foreground">
            {current === "" ? "作業日を追加してください" : formatDateJp(current)}
          </p>
          {counts.map((c) => (
            <div key={c.name} className="flex items-center gap-2 border-t border-border-faint py-1.5">
              <span className="min-w-0 flex-1 truncate text-sub text-foreground">{c.name}</span>
              <span className="shrink-0 font-number text-list text-foreground">{c.count}</span>
            </div>
          ))}
          {counts.length === 0 && (
            <p className="border-t border-border-faint pt-2 text-sub text-muted-foreground">
              名前と会社を入力すると、会社ごとの人数を表示します
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DayChip({
  date,
  count,
  active,
  onClick,
}: {
  date: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "flex min-h-tap items-center gap-2 rounded-control-md border px-2.5 lg:min-h-[36px]",
        active ? "border-primary-border bg-primary-surface text-primary" : "border-transparent text-foreground hover:bg-accent",
      ].join(" ")}
    >
      <span className="font-number text-sub">{formatDateJp(date)}</span>
      <span
        className={[
          "rounded-badge-xs px-1.5 py-0.5 font-number text-badge",
          active ? "bg-card text-primary" : "bg-muted text-muted-foreground",
        ].join(" ")}
      >
        {count}人
      </span>
    </button>
  );
}

function StaffRowView({
  row,
  canEdit,
  open,
  onOpenChange,
  onUpdate,
  onDuplicate,
  onDelete,
  onMove,
}: {
  row: TechStaffRow;
  canEdit: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: (patch: Partial<TechStaffRow>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const manual = row.person_id === null && row.person_name.trim() !== "";

  const pick = (person: TechPerson) => {
    onOpenChange(false);
    onUpdate({
      person_id: person.id,
      person_name: person.name,
      company_id: person.company_id,
      company_name: person.company_name,
    });
  };

  const pickManual = (name: string) => {
    onOpenChange(false);
    onUpdate({ person_id: null, person_name: name, company_id: null });
  };

  return (
    <Row divider>
      <RowSlot w={96}>
        {canEdit ? (
          <select
            value={row.role}
            aria-label="役職"
            title={roleName(row.role) || undefined}
            onChange={(e) => onUpdate({ role: e.target.value })}
            className="h-8 w-full rounded-control border border-border bg-card px-1.5 font-number text-badge text-foreground"
          >
            <option value="">未定</option>
            {/* 列が狭いので選んだ後の表示は略号のまま。正式名称は title に出す（§13-3） */}
            {TECH_ROLES.map((r) => (
              <option key={r} value={r} title={roleName(r) || undefined}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-number text-badge text-foreground" title={roleName(row.role) || undefined}>
            {row.role || "未定"}
          </span>
        )}
      </RowSlot>

      <RowMain className="relative">
        {row.person_name.trim() !== "" ? (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onOpenChange(!open)}
            className="flex min-h-tap w-full items-center gap-1.5 text-left lg:min-h-[28px]"
          >
            <span className="min-w-0 truncate text-list text-foreground">{row.person_name}</span>
            {manual ? (
              <span className="shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-badge text-muted-foreground">
                手入力
              </span>
            ) : (
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="技術人員から選んだ人" />
            )}
          </button>
        ) : canEdit ? (
          <Button type="button" variant="outline" size="sm" className="min-h-tap" onClick={() => onOpenChange(!open)}>
            名前を選ぶ
          </Button>
        ) : (
          <span className="text-sub text-muted-foreground">—</span>
        )}
        {open && canEdit && (
          <PersonPicker onSelect={pick} onManual={pickManual} onClose={() => onOpenChange(false)} />
        )}
      </RowMain>

      <RowSlot w={160} hideOnMobile>
        {canEdit && manual ? (
          <BufferedInput
            value={row.company_name}
            onCommit={(v) => onUpdate({ company_name: v })}
            aria-label="会社"
            placeholder="会社"
            className="h-8 w-full rounded-control border border-border bg-card px-2 text-sub text-foreground outline-none placeholder:text-fg-disabled"
          />
        ) : (
          <span className="min-w-0 truncate text-sub text-foreground">{row.company_name}</span>
        )}
      </RowSlot>

      <RowSlot w={240} hideOnMobile>
        {canEdit ? (
          <BufferedInput
            value={row.note}
            onCommit={(v) => onUpdate({ note: v })}
            aria-label="備考"
            placeholder="備考"
            className="h-8 w-full rounded-control border border-border bg-card px-2 text-sub text-foreground outline-none placeholder:text-fg-disabled"
          />
        ) : (
          <span className="min-w-0 truncate text-sub text-muted-foreground">{row.note}</span>
        )}
      </RowSlot>

      {canEdit && (
        <RowSlot w={72} align="right" className="relative" placeholder={null}>
          <RowMenu label="この行の操作">
            {(close) => (
              <>
                <RowMenuItem icon={<Copy className="h-3.5 w-3.5" />} label="複製" onClick={() => { close(); onDuplicate(); }} />
                <RowMenuItem icon={<ChevronUp className="h-3.5 w-3.5" />} label="上へ" onClick={() => { close(); onMove(-1); }} />
                <RowMenuItem icon={<ChevronDown className="h-3.5 w-3.5" />} label="下へ" onClick={() => { close(); onMove(1); }} />
                <RowMenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="削除" danger onClick={() => { close(); onDelete(); }} />
              </>
            )}
          </RowMenu>
        </RowSlot>
      )}
    </Row>
  );
}

export default StaffTable;
