/**
 * 案件の「書類」タブ — そろっていないものが期日順に並ぶ (デザイン 15章)
 *
 * ── 画面の決めごと ──────────────────────────────────────
 *
 *  - **足りないものを上に**、期日を過ぎたものはさらに上に出す
 *  - **数だけ出さない**。「次にやること」を名前と期日で書く
 *  - そろっているかは**元データで判定**しているので、押すボタンを置かない
 *    （人が押す形にすると、押し忘れが「足りない」として残る）
 *  - まだ必要でないものは「あとで」に分けて出す
 *    （ヨミの段階で請求書が無いのは当たり前で、それを足りないと言うと印の意味が消える）
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText, AlertTriangle, Check, Clock, ChevronRight, CalendarDays,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorPanel, SkeletonCard } from "@gmo-onair/shared/src/client/states";

interface DocItem {
  key: string;
  label: string;
  group: "paper" | "work" | "card";
  who: string;
  why: string;
  ready: boolean;
  note: string;
  due: string | null;
  due_why: string | null;
  overdue: boolean;
  days_left: number | null;
  needed_now: boolean;
  path?: string;
  path_label?: string;
}

interface Docs {
  project: { id: string; name: string; gls_number: string | null; stage: string; event_start: string | null };
  today: string;
  items: DocItem[];
  groups: Array<{ key: string; label: string; total: number; missing: number }>;
  summary: {
    total: number; ready: number; missing: number; overdue: number; later: number;
    next: { key: string; label: string; due: string | null; days_left: number | null } | null;
  };
}

/** 期日の見え方。「あと3日」「2日過ぎています」のように日本語で書く */
function dueText(item: DocItem): string {
  if (!item.due) return "期日はありません";
  if (item.days_left == null) return item.due;
  if (item.days_left < 0) return `${item.due}（${-item.days_left}日 過ぎています）`;
  if (item.days_left === 0) return `${item.due}（今日まで）`;
  return `${item.due}（あと${item.days_left}日）`;
}

export default function ProjectDocsTab({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["project-docs", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/docs`)).data.data as Docs,
  });

  if (isLoading) return <SkeletonCard lines={4} />;
  if (error) return <ErrorPanel title="書類の状態を読めませんでした" error={error} />;
  if (!data) return null;

  const missing = data.items.filter((i) => !i.ready && i.needed_now);
  const later = data.items.filter((i) => !i.ready && !i.needed_now);
  const ready = data.items.filter((i) => i.ready);

  const go = (item: DocItem) => {
    if (!item.path) return;
    const path = item.path.replace("{id}", projectId);
    if (path.startsWith("/qsheet") || path.startsWith("/techsheet") || path.startsWith("/daily")) {
      window.open(path, "_blank", "noopener");
      return;
    }
    navigate(path);
  };

  const Row = ({ item }: { item: DocItem }) => (
    <li className={cn(
      "flex flex-col gap-1 rounded-xl border p-3 sm:flex-row sm:items-center sm:gap-3",
      item.overdue ? "border-destructive/40 bg-destructive/5" : "bg-card",
    )}>
      <span className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
        item.ready ? "bg-emerald-100 text-emerald-700"
          : item.overdue ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground",
      )}>
        {item.ready ? <Check className="h-4 w-4" aria-hidden="true" />
          : item.overdue ? <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          : <Clock className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold">{item.label}</span>
          <span className="text-xs text-muted-foreground">{item.who}</span>
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{item.note}</span>
        {!item.ready && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{item.why}</span>
        )}
      </span>
      <span className="shrink-0 text-xs sm:w-52 sm:text-right">
        {item.due ? (
          <>
            <span className={cn("flex items-center gap-1 sm:justify-end",
              item.overdue ? "font-bold text-destructive" : "text-muted-foreground")}>
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {dueText(item)}
            </span>
            {item.due_why && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{item.due_why}</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
      </span>
      {item.path && !item.ready && (
        <button type="button" onClick={() => go(item)}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg border px-3 text-xs hover:bg-muted">
          {item.path_label ?? "開く"}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      {/* いま何が足りないか。**数だけでなく次にやることを名前で書く** */}
      <section className={cn(
        "rounded-xl border p-4",
        data.summary.overdue > 0 ? "border-destructive/40 bg-destructive/5" : "bg-muted/30",
      )}>
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <FileText className="h-4 w-4" aria-hidden="true" />
          そろっていないもの
        </h3>
        <p className="mt-1 text-sm">
          {data.summary.missing === 0 ? (
            <>いま必要なものは<strong>すべてそろっています</strong>。</>
          ) : (
            <>
              <strong>{data.summary.missing}件</strong> そろっていません
              {data.summary.overdue > 0 && (
                <>（うち <strong className="text-destructive">{data.summary.overdue}件</strong>は期日を過ぎています）</>
              )}
              。
            </>
          )}
        </p>
        {data.summary.next && (
          <p className="mt-1 text-sm text-muted-foreground">
            次にやること: <strong className="text-foreground">{data.summary.next.label}</strong>
            {data.summary.next.due && (
              <>（{data.summary.next.due}
                {data.summary.next.days_left != null && data.summary.next.days_left < 0
                  ? ` ・ ${-data.summary.next.days_left}日 過ぎています`
                  : data.summary.next.days_left != null ? ` ・ あと${data.summary.next.days_left}日` : ""}
                ）</>
            )}
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          そろっているかは<strong className="text-foreground">元のデータを見て決めています</strong>
          （「できました」を押す欄はありません）。
          {data.project.event_start && <> 期日は本番日（{data.project.event_start}）から数えています。</>}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {data.groups.map((g) => (
            <span key={g.key} className="rounded-full border bg-card px-2 py-0.5">
              {g.label} {g.total - g.missing}/{g.total}
            </span>
          ))}
        </div>
      </section>

      {/* 足りないもの (期日順) */}
      {missing.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold text-muted-foreground">
            そろっていないもの（期日の近い順）
          </h4>
          <ul className="space-y-2">
            {missing.map((i) => <Row key={i.key} item={i} />)}
          </ul>
        </section>
      )}

      {/* まだ必要でないもの */}
      {later.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold text-muted-foreground">
            あとで（この段ではまだ要りません）
          </h4>
          <ul className="space-y-2 opacity-70">
            {later.map((i) => <Row key={i.key} item={i} />)}
          </ul>
        </section>
      )}

      {/* そろったもの */}
      {ready.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-bold text-muted-foreground">そろっているもの</h4>
          <ul className="space-y-2">
            {ready.map((i) => <Row key={i.key} item={i} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
