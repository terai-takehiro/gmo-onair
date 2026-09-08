// 表の設定シートの「共有」節。14-schedule-v2-plan.md §3-2・§4-2 (f)
//
// 案件メンバーは自動で見える（サーバーが動的に判定・一覧には写らない）ので、
// ここで足す・外すのは**それ以外に見せる人**（社外の技術・受付など）だけ。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as scheduleApi from "@/lib/scheduleApi";
import type { ScheduleShare } from "@gmo-onair/shared/src/schedule/types";

interface Props {
  /** 案件メンバー＋主担当の人数。番組・案件なしの表は null（自動共有の対象外） */
  projectMemberCount: number | null | undefined;
  glsAndProjectName: string | null;
  creatorName: string | null;
  shares: ScheduleShare[];
  onChange: (next: ScheduleShare[]) => void;
  /** 作成者・管理者以外は閲覧のみ（サーバーも 403 で止めるが、先に画面で伝える） */
  readOnly: boolean;
}

export default function ScheduleShareSection({ projectMemberCount, glsAndProjectName, creatorName, shares, onChange, readOnly }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const candidatesQuery = useQuery({
    queryKey: ["schedule-share-users"],
    queryFn: scheduleApi.listShareUsers,
    enabled: pickerOpen,
    staleTime: 5 * 60 * 1000,
  });

  const sharedIds = useMemo(() => new Set(shares.map((s) => s.user_id)), [shares]);
  const filtered = (candidatesQuery.data ?? []).filter((u) => {
    if (sharedIds.has(u.id)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  const add = (u: { id: string; name: string; email: string }) => {
    onChange([...shares, { user_id: u.id, name: u.name, email: u.email }]);
    setSearch("");
    setPickerOpen(false);
  };
  const remove = (userId: string) => onChange(shares.filter((s) => s.user_id !== userId));

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Label>共有</Label>
      {projectMemberCount != null && (
        <p className="text-note text-muted-foreground">
          {glsAndProjectName ? `案件${glsAndProjectName}の` : "この案件の"}メンバー {projectMemberCount} 人には自動で見えます。
        </p>
      )}
      <p className="text-note text-muted-foreground">ほかに見せる人{creatorName ? `（作成者: ${creatorName}）` : ""}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {shares.map((s) => (
          <span key={s.user_id} className="inline-flex min-h-[32px] items-center gap-1 rounded-chip border border-border bg-muted/50 pl-2.5 pr-1 text-sub-sm text-foreground">
            {s.name || s.email || s.user_id}
            {!readOnly && (
              <button
                type="button"
                onClick={() => remove(s.user_id)}
                aria-label={`${s.name || "この人"}を共有から外す`}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </span>
        ))}
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" className="min-h-tap" onClick={() => setPickerOpen((v) => !v)}>
            ＋ 人を追加
          </Button>
        )}
      </div>

      {pickerOpen && (
        <div className="rounded-card border border-border bg-card p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前・メールで検索"
              className="pl-8"
              aria-label="共有相手を検索"
            />
          </div>
          <div className="mt-2 max-h-48 overflow-y-auto">
            {candidatesQuery.isLoading && <p className="px-2 py-3 text-sub-sm text-muted-foreground">読み込み中…</p>}
            {!candidatesQuery.isLoading && filtered.length === 0 && (
              <p className="px-2 py-3 text-sub-sm text-muted-foreground">見つかりません</p>
            )}
            {filtered.slice(0, 30).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => add(u)}
                className="flex min-h-tap w-full flex-col items-start justify-center rounded-control-lg px-2 text-left hover:bg-accent"
              >
                <span className="text-sub text-foreground">{u.name}</span>
                <span className="text-sub-sm text-muted-foreground">{u.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
