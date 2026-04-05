import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { useAuth, MODULE_LABELS, ACCESS_LEVEL_LABELS } from "@/contexts/platform/AuthContext";
import { formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Loader2, ShieldAlert, KeyRound } from "lucide-react";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
  external_client: "外部クライアント",
};

const roleColorMap: Record<string, string> = {
  system_admin: "#dc2626",
  staff: "#005bac",
  viewer: "#059669",
  external_client: "#7c3aed",
};

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at?: string;
}

interface UserForm {
  name: string;
  email: string;
  role: string;
}

/* ---------- Permission Dialog ---------- */
function PermissionDialog({
  user,
  open,
  onOpenChange,
}: {
  user: User | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [localPerms, setLocalPerms] = useState<Record<string, string>>({});

  const isTargetAdmin = user?.role === "system_admin";

  const { data: permsData, isLoading } = useQuery<{ module: string; access_level: string }[]>({
    queryKey: ["user-permissions", user?.id],
    queryFn: async () => (await api.get(`/users/${user!.id}/permissions`)).data.data,
    enabled: open && !!user && !isTargetAdmin,
  });

  useEffect(() => {
    if (permsData) {
      const map: Record<string, string> = {};
      for (const p of permsData) {
        map[p.module] = p.access_level;
      }
      setLocalPerms(map);
    }
  }, [permsData]);

  useEffect(() => {
    if (!open) {
      setLocalPerms({});
    }
  }, [open, user?.id]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions: Record<string, string | null> = {};
      for (const mod of Object.keys(MODULE_LABELS)) {
        permissions[mod] = localPerms[mod] || null;
      }
      await api.put(`/users/${user!.id}/permissions`, { permissions });
    },
    onSuccess: () => {
      onOpenChange(false);
    },
  });

  const setModuleLevel = (mod: string, level: string) => {
    setLocalPerms((prev) => {
      const next = { ...prev };
      if (level === "none") {
        delete next[mod];
      } else {
        next[mod] = level;
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>権限設定 — {user?.name}</DialogTitle>
          <DialogDescription>
            各モジュールのアクセスレベルを設定します
          </DialogDescription>
        </DialogHeader>

        {isTargetAdmin ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">
              管理者は全権限を持ちます
            </p>
            <div className="space-y-2">
              {Object.entries(MODULE_LABELS).map(([mod, label]) => (
                <div key={mod} className="flex items-center justify-between py-1.5 px-1">
                  <span className="text-sm font-medium">{label}</span>
                  <Badge className="bg-primary/10 text-primary">フルアクセス</Badge>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>閉じる</Button>
            </DialogFooter>
          </div>
        ) : isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              {Object.entries(MODULE_LABELS).map(([mod, label]) => (
                <div key={mod} className="flex items-center justify-between gap-4 py-1">
                  <span className="text-sm font-medium whitespace-nowrap">{label}</span>
                  <Select
                    value={localPerms[mod] || "none"}
                    onValueChange={(v) => setModuleLevel(mod, v)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">アクセスなし</SelectItem>
                      {Object.entries(ACCESS_LEVEL_LABELS).map(([level, levelLabel]) => (
                        <SelectItem key={level} value={level}>{levelLabel}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Main Page ---------- */
export default function UserListPage() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);
  const [permDialogOpen, setPermDialogOpen] = useState(false);

  const form = useForm<UserForm>({
    defaultValues: { name: "", email: "", role: "staff" },
  });

  const isAdmin = currentUser?.role === "system_admin";

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/auth/users")).data.data,
    enabled: isAdmin,
  });

  const saveMutation = useMutation({
    mutationFn: async (values: UserForm) => {
      if (editingId) return (await api.put(`/users/${editingId}`, values)).data;
      return (await api.post("/users", values)).data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); closeDialog(); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await api.delete(`/users/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["users"] }); },
  });

  const openAdd = () => {
    setEditingId(null);
    form.reset({ name: "", email: "", role: "staff" });
    setDialogOpen(true);
  };

  const openEdit = (u: User) => {
    setEditingId(u.id);
    form.reset({ name: u.name, email: u.email, role: u.role });
    setDialogOpen(true);
  };

  const closeDialog = () => { setDialogOpen(false); setEditingId(null); };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <ShieldAlert className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">権限がありません</h2>
        <p className="text-muted-foreground">このページはシステム管理者のみアクセスできます</p>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">ユーザー管理</h1>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />新規追加</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <>
          {(!users || users.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {users.map((u) => (
                  <div key={u.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{u.name}</span>
                          <Badge color={roleColorMap[u.role]}>
                            {roleLabelMap[u.role] || u.role}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 truncate">{u.email}</div>
                        {u.created_at && (
                          <div className="text-xs text-muted-foreground mt-0.5">{formatDate(u.created_at)}</div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPermUser(u); setPermDialogOpen(true); }} title="権限設定">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(u.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名前</TableHead>
                    <TableHead>メール</TableHead>
                    <TableHead>ロール</TableHead>
                    <TableHead>作成日</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge color={roleColorMap[u.role]}>
                          {roleLabelMap[u.role] || u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(u.created_at)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setPermUser(u); setPermDialogOpen(true); }} title="権限設定"><KeyRound className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(u.id)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "ユーザー編集" : "ユーザー追加"}</DialogTitle>
            <DialogDescription>{editingId ? "ユーザー情報を編集します" : "新しいユーザーを追加します"}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
            <div><Label>名前 *</Label><Input {...form.register("name", { required: true })} /></div>
            <div><Label>メール *</Label><Input type="email" {...form.register("email", { required: true })} /></div>
            <div>
              <Label>ロール *</Label>
              <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="system_admin">システム管理者</SelectItem>
                  <SelectItem value="staff">スタッフ</SelectItem>
                  <SelectItem value="viewer">閲覧者</SelectItem>
                  <SelectItem value="external_client">外部クライアント</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>キャンセル</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}保存
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PermissionDialog user={permUser} open={permDialogOpen} onOpenChange={setPermDialogOpen} />
    </div>
    </PageTransition>
  );
}
