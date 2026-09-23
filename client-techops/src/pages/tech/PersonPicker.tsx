// 技術スタッフの名前を選ぶ候補（③の表の「名前」を押すと開く）。
// 検索・会社の絞り込み・候補（名前／主な役職／参加回数／会社）・末尾に「手入力で追加」。
// 台帳に無い人は手入力で1行に入れるだけで、⑥の技術人員には足さない（設計 §6③）。
// モック: mockups/native/tech-docs/Staff.dc.html
import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import type { TechPerson } from "@gmo-onair/shared/src/tech/types";
import { useTechMasters } from "@/hooks/useTechMasters";
import { filterPersons } from "./staffMasters";

const MAX_CANDIDATES = 8;

export function PersonPicker({
  onSelect,
  onManual,
  onClose,
}: {
  onSelect: (person: TechPerson) => void;
  onManual: (name: string) => void;
  onClose: () => void;
}) {
  const masters = useTechMasters();
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // 会社は取引先（companies）そのもので仕入先がすべて入る（§13-5）。絞り込みには人がいる会社だけ出す
  const companies = masters.companies.filter((c) => c.person_count > 0);
  const matched = filterPersons(masters.persons({ company: companyId || undefined }), { q });
  const candidates = matched.slice(0, MAX_CANDIDATES);

  return (
    <div
      ref={boxRef}
      className="absolute left-0 top-9 z-30 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-border bg-card shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <BufferedInput
          value={q}
          onCommit={setQ}
          placeholder="名前で検索"
          aria-label="名前で検索"
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-list font-normal text-foreground outline-none placeholder:text-fg-disabled"
        />
        <span className="shrink-0 font-number text-sub-sm text-muted-foreground">{matched.length}人</span>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2.5 py-1.5">
        <CompanyChip label="すべて" active={companyId === ""} onClick={() => setCompanyId("")} />
        {companies.map((c) => (
          <CompanyChip
            key={c.id}
            label={c.short_name || c.name}
            active={companyId === c.id}
            onClick={() => setCompanyId(c.id)}
          />
        ))}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="px-3 py-4 text-sub text-muted-foreground">
            該当する人がいません。下の「手入力で追加」で名前を直接入力できます
          </p>
        )}
        {candidates.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="flex min-h-tap w-full items-center gap-2 border-b border-border-faint px-3 py-1.5 text-left hover:bg-accent"
          >
            <span className="min-w-0 flex-1 truncate text-list text-foreground">{p.name}</span>
            <span className="flex w-24 shrink-0 justify-end gap-1">
              {p.main_roles.slice(0, 2).map((r) => (
                <span
                  key={r}
                  className="rounded-badge-xs bg-muted px-1.5 py-0.5 font-number text-badge text-muted-foreground"
                >
                  {r}
                </span>
              ))}
            </span>
            <span className="w-10 shrink-0 text-right font-number text-sub text-muted-foreground">
              {p.participation_count}回
            </span>
            <span className="w-24 shrink-0 truncate text-sub-sm text-muted-foreground">
              {p.company_short_name || p.company_name}
            </span>
          </button>
        ))}
      </div>

      {/* ⚠️ 検索欄が空のまま押すと、名前を空で入れ直して候補が閉じるだけだった
          （押せたのに何も起きないように見える）。名前を入れるまで押せなくする */}
      <button
        type="button"
        disabled={q.trim() === ""}
        onClick={() => onManual(q.trim())}
        className="flex min-h-tap w-full items-center gap-2 bg-surface-subtle px-3 py-2 text-left hover:bg-accent disabled:cursor-default disabled:hover:bg-surface-subtle"
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span className="shrink-0 text-sub text-primary">
          {q.trim() === "" ? "手入力で追加" : `手入力で追加: ${q.trim()}`}
        </span>
        {q.trim() === "" && (
          <span className="min-w-0 truncate text-sub-sm text-muted-foreground">
            入力した名前をそのまま追加します
          </span>
        )}
      </button>
    </div>
  );
}

function CompanyChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-8 shrink-0 rounded-control px-2 text-badge",
        active ? "bg-primary-surface text-primary" : "bg-surface-subtle text-muted-foreground hover:bg-accent",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

export default PersonPicker;
