// 体制図の「チーム」1枚（production-manual-orgchart.md §3-1・§4・§5-2）。
// 見出し（チーム名・所属）と人の並びを描き、選択中だけ入力欄と ＋/− を出す。
//
// ⚠️ **人が1人もいないチームも描ける。** 現場のマニュアルは「音声 ── 調整中」を
// 紙に出したい（プロジェクト管理は人単位の行しか持たないので表せない・§3-1）。
// 空のチームは出す前の検査の対象にもしない（意図して置けるもの・§7）。
//
// ⚠️ **枠線はどのチームも同じ細い実線で、塗らない**（§4・§10-2）。立場
// （自社／発注者／PM会社／業者）の区分は持たないので、線の色・太さで描き分けない。
// どこの会社かは見出しの所属の文字で読む。
import { Minus, Plus } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/stableIds";
import type { ManualOrgBox, ManualOrgPerson } from "@gmo-onair/shared/src/opsmanual/types";
import { ORG_INPUT, ORG_MINUS, ORG_PLUS, type OrgChartShow } from "./orgChartUi";

interface Props {
  box: ManualOrgBox;
  show: OrgChartShow;
  selected: boolean;
  /** 変えたチームを丸ごと返す（親が階層の中で差し替える。破壊的に書き換えない＝undo が壊れる） */
  onChange: (next: ManualOrgBox) => void;
  onRemove: () => void;
}

export default function OrgChartTeamBox({ box, show, selected, onChange, onRemove }: Props) {
  const people = box.people ?? [];
  const patchPerson = (id: string, patch: Partial<ManualOrgPerson>) =>
    onChange({ ...box, people: people.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  return (
    <div className="min-w-0 flex-1 rounded-badge-xs border border-border bg-card">
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-0.5">
        {selected ? (
          <BufferedInput
            value={box.label}
            onCommit={(v) => onChange({ ...box, label: v })}
            placeholder="チーム名"
            className={cn(ORG_INPUT, "flex-1 text-[10px] font-extrabold")}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[10px] font-extrabold">{box.label}</span>
        )}
        {/* 所属はチームの見出しだけに小さく出す（自由入力・任意） */}
        {selected ? (
          <BufferedInput
            value={box.org ?? ""}
            onCommit={(v) => onChange({ ...box, org: v })}
            placeholder="所属"
            className={cn(ORG_INPUT, "w-16 text-[8.5px] text-muted-foreground")}
          />
        ) : (
          box.org && <span className="min-w-0 max-w-[45%] shrink-0 truncate text-[8.5px] text-muted-foreground">{box.org}</span>
        )}
        {selected && (
          <button type="button" onClick={onRemove} title="このチームを削除" className={ORG_MINUS}>
            <Minus className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="px-1.5 pb-1 pt-0.5">
        {people.map((p) => (
          <PersonRow
            key={p.id}
            person={p}
            show={show}
            selected={selected}
            onPatch={(patch) => patchPerson(p.id, patch)}
            onRemove={() => onChange({ ...box, people: people.filter((x) => x.id !== p.id) })}
          />
        ))}
        {people.length === 0 && (
          <div className="rounded-badge-xs border border-dashed border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
            まだ決まっていません
          </div>
        )}
        {selected && (
          <button
            type="button"
            onClick={() => onChange({ ...box, people: [...people, { id: genId("psn"), name: "" }] })}
            className={cn(ORG_PLUS, "mt-0.5")}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />人
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 人1行。出す項目（役割・所属・電話・メール）は `show` で決まり、**出さない項目は
 * 入力欄も出さない** — 紙に出ていないものを打てると、打ったのに出ないことになる。
 *
 * バッジ（決裁・進行）は読むだけにする。§5-2 がその場で打つと決めたのは
 * 階層の名前・チーム名・所属・氏名・役割の5つで、バッジは取り込みで入ってくる印。
 */
function PersonRow({
  person, show, selected, onPatch, onRemove,
}: {
  person: ManualOrgPerson;
  show: OrgChartShow;
  selected: boolean;
  onPatch: (patch: Partial<ManualOrgPerson>) => void;
  onRemove: () => void;
}) {
  const badge = person.badge && (
    <span className="shrink-0 rounded-badge-xs border border-warning px-1 text-[8px] font-extrabold text-warning">
      {person.badge}
    </span>
  );

  if (!selected) {
    const sub = [show.role ? person.role : "", show.org ? person.org : ""].filter(Boolean).join(" ・ ");
    return (
      <div className="flex flex-wrap items-baseline gap-x-1 py-px">
        <span className="min-w-0 max-w-full truncate text-[10px] font-bold">{person.name}</span>
        {badge}
        {sub && <span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground">{sub}</span>}
        {show.phone && person.phone && <span className="shrink-0 text-[9px]">{person.phone}</span>}
        {show.email && person.email && <span className="min-w-0 truncate text-[9px] text-muted-foreground">{person.email}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-1 py-px">
      <BufferedInput
        value={person.name}
        onCommit={(v) => onPatch({ name: v })}
        placeholder="氏名"
        className={cn(ORG_INPUT, "flex-1 text-[10px] font-bold")}
      />
      {badge}
      {show.role && <PersonField value={person.role} placeholder="役割" onCommit={(v) => onPatch({ role: v })} />}
      {show.org && <PersonField value={person.org} placeholder="所属" onCommit={(v) => onPatch({ org: v })} />}
      {show.phone && <PersonField value={person.phone} placeholder="電話" onCommit={(v) => onPatch({ phone: v })} />}
      {show.email && <PersonField value={person.email} placeholder="メール" onCommit={(v) => onPatch({ email: v })} />}
      <button type="button" onClick={onRemove} title="この人を削除" className={ORG_MINUS}>
        <Minus className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

function PersonField({
  value, placeholder, onCommit,
}: {
  value?: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  return (
    <BufferedInput
      value={value ?? ""}
      onCommit={onCommit}
      placeholder={placeholder}
      className={cn(ORG_INPUT, "flex-1 text-[9px] text-muted-foreground")}
    />
  );
}
