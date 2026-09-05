import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";
import { Users, UserPlus, X, Loader2 } from "lucide-react";

interface ProjectMember {
  id: string;
  user_id: string | null;
  member_name: string;
  role: string | null;
  is_external: boolean;
  sort_order: number;
}

const ROLE_SUGGESTIONS = ["PM", "制作", "営業", "技術", "映像", "音声", "照明", "美術", "外部パートナー"];

/**
 * 担当メンバー編集 (複数担当・外部の方対応)。
 * - 登録ユーザー: ユーザー管理から選択 (users.id を保持)
 * - 外部の方: 名前を手入力 (外部フラグ)
 * 案件保存後 (projectId 確定後) に利用可能。
 */
export default function ProjectMembersEditor({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"user" | "external">("user");
  const [selectedUser, setSelectedUser] = useState("");
  const [externalName, setExternalName] = useState("");
  const [role, setRole] = useState("");

  const { data: membersData, isLoading } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/members`)).data.data as ProjectMember[],
  });
  const members = membersData ?? [];

  const { data: usersData } = useQuery({
    queryKey: ["users-by-module-sales"],
    queryFn: async () => (await api.get("/users/by-module/sales")).data.data as Array<{ id: string; name: string }>,
  });
  const users = usersData ?? [];

  const addMutation = useMutation({
    mutationFn: async (payload: { user_id?: string; member_name?: string; role?: string; is_external?: boolean }) =>
      (await api.post(`/projects/${projectId}/members`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-members", projectId] });
      setSelectedUser("");
      setExternalName("");
      setRole("");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) =>
      (await api.delete(`/projects/${projectId}/members/${memberId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-members", projectId] }),
  });

  const canAdd = mode === "user" ? !!selectedUser : externalName.trim().length > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    if (mode === "user") {
      addMutation.mutate({ user_id: selectedUser, role: role.trim() || undefined });
    } else {
      addMutation.mutate({ member_name: externalName.trim(), is_external: true, role: role.trim() || undefined });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">担当メンバー</span>
        <span className="text-xs text-muted-foreground">（ユーザー管理から選択 / 外部の方は手入力）</span>
      </div>

      {/* 現在のメンバー */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 読み込み中…
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだ担当メンバーがいません。下から追加してください。</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-2 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm"
            >
              <span className="font-medium">{m.member_name}</span>
              {m.role && <span className="text-xs text-muted-foreground">/ {m.role}</span>}
              {m.is_external && (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">
                  外部
                </Badge>
              )}
              <button
                type="button"
                onClick={() => removeMutation.mutate(m.id)}
                className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="担当から外す"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 追加フォーム */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="inline-flex rounded-lg border bg-background p-0.5">
          {([
            { value: "user", label: "登録ユーザー" },
            { value: "external", label: "外部の方（手入力）" },
          ] as const).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                mode === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto] sm:items-center">
          {mode === "user" ? (
            <SearchableSelect
              options={users.map((u) => ({ value: u.id, label: u.name }))}
              value={selectedUser}
              onChange={setSelectedUser}
              placeholder="ユーザーを検索…"
            />
          ) : (
            <Input
              value={externalName}
              onChange={(e) => setExternalName(e.target.value)}
              placeholder="外部の方の氏名"
            />
          )}
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="役割（任意）"
            list="member-role-suggestions"
          />
          <datalist id="member-role-suggestions">
            {ROLE_SUGGESTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
          <Button type="button" onClick={handleAdd} disabled={!canAdd || addMutation.isPending} className="shrink-0">
            {addMutation.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1 h-4 w-4" />
            )}
            追加
          </Button>
        </div>
        {addMutation.isError && (
          <p className="text-xs text-destructive">
            メンバーを追加できませんでした。{(addMutation.error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "入力内容を確かめて、もう一度お試しください。"}
          </p>
        )}
      </div>
    </div>
  );
}
