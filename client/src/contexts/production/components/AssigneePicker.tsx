/**
 * 「担当者」チップ選択（複数・任意）。
 *
 * パートナースケジュール（`schedule/PartnerScheduleDialog.tsx`）とスタジオ予約
 * （`studio/StudioBookingDialog.tsx`）の両方が同じ仕組みを必要としたため、
 * ここに1本化した（欄を写すと片方だけ直った画面が必ずできる — client/CLAUDE.md）。
 *
 * 選択肢は `/users/by-module/sales`（権限モデル単純化・migration 210 で統合済みの
 * `sales` モジュール保持者一覧）。⚠️ 旧モジュール名 `partner_schedule` のままだと
 * system_admin 以外が誰も返らない事故を過去に起こしている（PR #564 Codexレビュー）ので
 * 必ず `sales` を使うこと。react-query の鍵も他画面と同じ `users-by-module-sales` に
 * 揃える（別の鍵のままだと同じ内容を別クエリとして持ち、`FilterDialogs.tsx` 等と
 * 鍵が衝突する）。
 *
 * `existingAssignees` は編集対象がいま実際に持っている担当者一覧。担当者が後から
 * sales 権限を失うと選択肢（`/users/by-module/sales`）には出てこなくなるが、
 * `assigneeIds` には残ったままになる。ここで出さないと外すボタンが無くなり、
 * 保存するたびサーバーが再送された無効なIDを拒否して**二度と保存できなくなる**
 * （同じくPR #564で踏んだ）。選択肢に無い選択中の人は「対象外・外すのみ可」として
 * 出し、外すことだけできるようにする（選び直しの候補には出さない）。
 */
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

export interface AssigneeRef {
  id: string;
  name: string;
}

export function useAssigneeCandidates(enabled: boolean) {
  return useQuery<AssigneeRef[]>({
    queryKey: ["users-by-module-sales"],
    queryFn: async () => (await api.get("/users/by-module/sales")).data.data,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function AssigneePicker({
  open, assigneeIds, onChange, existingAssignees,
}: {
  open: boolean;
  assigneeIds: string[];
  onChange: (ids: string[]) => void;
  /** 編集対象がいま実際に持っている担当者一覧（stale判定用）。新規作成時は省略可 */
  existingAssignees?: AssigneeRef[];
}) {
  const { data: candidates = [] } = useAssigneeCandidates(open);

  const toggle = (id: string) =>
    onChange(assigneeIds.includes(id) ? assigneeIds.filter((x) => x !== id) : [...assigneeIds, id]);

  const staleAssignees = (existingAssignees ?? []).filter(
    (a) => assigneeIds.includes(a.id) && !candidates.some((u) => u.id === a.id)
  );
  const chips = [
    ...candidates.map((u) => ({ ...u, stale: false })),
    ...staleAssignees.map((a) => ({ ...a, stale: true })),
  ];

  if (chips.length === 0) {
    return <p className="text-sub-sm text-muted-foreground">選べる人がいません。</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((u) => {
        const on = assigneeIds.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(u.id)}
            title={u.stale ? "sales 権限が無くなっているため選び直せません。外すことだけできます" : undefined}
            className={cn(
              "text-badge rounded-full border px-3 py-1.5 transition-colors",
              u.stale
                ? "border-dashed border-destructive/40 text-destructive"
                : on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {u.name}{u.stale && "（対象外・外すのみ可）"}
          </button>
        );
      })}
    </div>
  );
}
