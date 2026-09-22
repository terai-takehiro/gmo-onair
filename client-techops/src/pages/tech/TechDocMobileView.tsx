// 技術資料 — スマホの閲覧（設計: docs/design/v4/tech-docs.md §6「スマホ」・モック Mobile.dc.html）。
// ②③の**閲覧だけ**。同じ URL で幅によって中身を入れ替える（編集は PC で行う）。
// 1行1カード。映像パッチは「送り → 受け」＋名称、技術スタッフは役職・名前・会社。
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatDateJp } from "@/lib/dateFmt";
import { roleOrder } from "@gmo-onair/shared/src/tech/roles";
import type { TechPatchRow, TechStaffRow } from "@gmo-onair/shared/src/tech/types";
import { groupRowsByLabel } from "./patchDerive";

interface Props {
  docId: string;
  tab: "patch" | "staff";
  patchRows: TechPatchRow[];
  staffRows: TechStaffRow[];
}

export function TechDocMobileView({ docId, tab, patchRows, staffRows }: Props) {
  const days = [...new Set(staffRows.map((r) => r.work_date).filter(Boolean))].sort();
  const [day, setDay] = useState<string>("");
  const shownDay = day && days.includes(day) ? day : days[0] ?? "";
  const groups = groupRowsByLabel(patchRows);
  const shownStaff = staffRows
    .filter((r) => r.work_date === shownDay)
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.sort_order - b.sort_order);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-control-lg bg-muted p-1">
        <MobileTab to={`/techops/tech-docs/${docId}`} label="映像パッチ" n={patchRows.length} on={tab === "patch"} />
        <MobileTab to={`/techops/tech-docs/${docId}/staff`} label="技術スタッフ" n={staffRows.length} on={tab === "staff"} />
      </div>

      <p className="rounded-note border border-border bg-muted/30 px-3 py-2 text-note text-muted-foreground">
        スマホでは閲覧だけです。編集は PC でお願いします。
      </p>

      {tab === "patch" && (
        <div className="flex flex-col gap-3">
          {groups.length === 0 && <p className="text-sub text-muted-foreground">まだ映像パッチの行はありません。PC で追加できます。</p>}
          {groups.map((g) => (
            <section key={g.label}>
              <div className="flex items-center gap-2 py-1">
                <span className="text-th text-muted-foreground">{g.label || "（名前なし）"}</span>
                <span className="num text-sub-sm text-muted-foreground">{g.rows.length} 行</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="flex flex-col gap-2">
                {g.rows.map((r) => (
                  <article key={r.id} className="rounded-card border border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`num shrink-0 text-list ${r.from_is_extra ? "text-warning" : "text-primary"}`}>
                        {r.from_jack_text || "—"}
                      </span>
                      <span className="max-w-24 shrink-0 truncate text-sub text-foreground">{r.from_device_text || "機材なし"}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className={`num shrink-0 text-list ${r.to_is_extra ? "text-warning" : "text-primary"}`}>
                        {r.to_jack_text || "—"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sub text-foreground">{r.to_device_text || "機材なし"}</span>
                      {(r.from_is_extra || r.to_is_extra) && (
                        <span className="shrink-0 rounded-badge bg-warning-surface px-1.5 py-0.5 text-badge text-warning">増設</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-sub text-foreground">{r.label || "名称なし"}</p>
                    {r.note.trim() && <p className="truncate text-sub-sm text-muted-foreground">{r.note}</p>}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === "staff" && (
        <div className="flex flex-col gap-3">
          {days.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {days.map((d) => {
                const on = d === shownDay;
                return (
                  <button
                    key={d} type="button" onClick={() => setDay(d)}
                    className={`flex h-11 items-center gap-2 rounded-control-md border px-3 ${
                      on ? "border-primary bg-primary-surface-weak text-primary" : "border-border bg-card text-foreground"
                    }`}
                  >
                    <span className="num text-list">{formatDateJp(d)}</span>
                    <span className="num text-sub-sm">{staffRows.filter((r) => r.work_date === d).length} 人</span>
                  </button>
                );
              })}
            </div>
          )}
          {shownStaff.length === 0 && <p className="text-sub text-muted-foreground">この日の技術スタッフはまだいません。PC で追加できます。</p>}
          {shownStaff.map((s) => (
            <article key={s.id} className="flex min-h-tap items-center gap-3 rounded-card border border-border bg-card px-3 py-2">
              <span className="flex h-7 min-w-14 shrink-0 items-center justify-center rounded-control bg-muted px-2 text-badge text-foreground">
                {s.role || "役職なし"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-cardtitle text-foreground">{s.person_name || "名前なし"}</span>
                <span className="block truncate text-sub-sm text-muted-foreground">{s.company_name || "会社なし"}</span>
              </span>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileTab({ to, label, n, on }: { to: string; label: string; n: number; on: boolean }) {
  return (
    <Link
      to={to}
      className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-control ${
        on ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
      }`}
    >
      <span className="text-list">{label}</span>
      <span className={`num rounded-badge px-1.5 py-0.5 text-badge ${on ? "bg-primary-surface text-primary" : "bg-border text-muted-foreground"}`}>
        {n}
      </span>
    </Link>
  );
}
