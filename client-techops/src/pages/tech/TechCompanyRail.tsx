// ⑥ 技術人員の左の会社の並び（人数つき）と「会社を追加」。
// モック: mockups/native/tech-docs/People.dc.html
import { Plus } from "lucide-react";
import type { TechCompany } from "@gmo-onair/shared/src/tech/types";
import { Button } from "@/components/ui/button";

export function TechCompanyRail({
  companies,
  value,
  onChange,
  canEdit,
  onAdd,
}: {
  companies: TechCompany[];
  value: string;
  onChange: (id: string) => void;
  canEdit: boolean;
  onAdd: () => void;
}) {
  return (
    <aside className="w-full shrink-0 rounded-card border border-border bg-card p-2 lg:w-64">
      <p className="px-2 py-1 text-th text-muted-foreground">会社</p>
      {companies.map((c) => {
        const active = c.id === value;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            aria-pressed={active}
            className={[
              "flex min-h-tap w-full items-center gap-2 rounded-control-lg px-2.5 text-left",
              active ? "bg-primary-surface text-primary" : "text-foreground hover:bg-accent",
            ].join(" ")}
          >
            <span className="min-w-0 flex-1 truncate text-list">{c.name}</span>
            <span className="shrink-0 font-number text-sub text-muted-foreground">{c.person_count}</span>
          </button>
        );
      })}
      {companies.length === 0 && (
        <p className="px-2.5 py-2 text-sub text-muted-foreground">会社がまだありません</p>
      )}
      {canEdit && (
        <Button type="button" variant="ghost" size="sm" className="mt-1 min-h-tap w-full justify-start" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          会社を追加
        </Button>
      )}
      <p className="px-2.5 pb-1 pt-3 text-sub-sm text-muted-foreground">
        GMOグローバルスタジオは社内、ほかは協力会社です。会社名の編集は、案件管理の取引先で行います
      </p>
    </aside>
  );
}

export default TechCompanyRail;
