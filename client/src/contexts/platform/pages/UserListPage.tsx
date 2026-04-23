import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { useAuth, MODULE_LABELS, ACCESS_LEVEL_LABELS, ACCESS_LEVEL_DESCRIPTIONS } from "@/contexts/platform/AuthContext";
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
import { Plus, Pencil, Trash2, Loader2, ShieldAlert, KeyRound, Copy, CheckCircle2, Info, Wrench } from "lucide-react";

const roleLabelMap: Record<string, string> = {
  system_admin: "システム管理者",
  staff: "スタッフ",
};

const roleColorMap: Record<string, string> = {
  system_admin: "#dc2626",
  staff: "#005bac",
};

// アクセスレベルの色（3段階）
const LEVEL_COLORS: Record<string, string> = {
  reader:  "bg-sky-100 text-sky-800",
  editor:  "bg-violet-100 text-violet-800",
  manager: "bg-amber-100 text-amber-800",
  none:    "bg-muted text-muted-foreground",
};

// DB に残る旧レベルを新レベルに正規化（表示・保存用）
const normalizeLevel = (level: string | undefined): string | undefined => {
  if (!level) return level;
  if (level === "exporter") return "reader";
  if (level === "owner") return "manager";
  return level;
};

// 権限ダイアログで表示するモジュール（順序付き）
const PERM_MODULES = [
  "sales", "budget", "studio", "equipment", "qsheet", "techsheet", "liveops", "interactive",
];

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  phone?: string;
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
  const [showHelp, setShowHelp] = useState(false);

  const isTargetAdmin = user?.role === "system_admin";

  const { data: permsData, isLoading } = useQuery<{ module: string; access_level: string }[]>({
    queryKey: ["user-permissions", user?.id],
    queryFn: async () => (await api.get(`/users/${user!.id}/permissions`)).data.data,
    enabled: open && !!user && !isTargetAdmin,
  });

  // open または permsData が変わるたびに localPerms を再初期化
  // ※ 依存配列に両方入れることでキャッシュ済みデータ(同一参照)でも正しく動作する
  useEffect(() => {
    if (!open) {
      setLocalPerms({});
      setShowHelp(false);
      return;
    }
    if (permsData) {
      const map: Record<string, string> = {};
      for (const p of permsData) {
        const normalized = normalizeLevel(p.access_level);
        if (normalized) map[p.module] = normalized;
      }
      setLocalPerms(map);
    }
  }, [open, permsData]);

  const qc = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: async () => {
      const permissions: Record<string, string | null> = {};
      for (const mod of PERM_MODULES) {
        permissions[mod] = localPerms[mod] || null;
      }
      await api.put(`/users/${user!.id}/permissions`, { permissions });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-permissions", user?.id] });
      onOpenChange(false);
    },
  });

  const setModuleLevel = (mod: string, level: string) => {
    setLocalPerms((prev) => {
      const next = { ...prev };
      if (level === "none") delete next[mod];
      else next[mod] = level;
      return next;
    });
  };

  const accessCount = PERM_MODULES.filter(m => localPerms[m]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            権限設定
            <span className="text-muted-foreground font-normal">— {user?.name}</span>
          </DialogTitle>
          <DialogDescription>
            各アプリへのアクセス権限を設定します
          </DialogDescription>
        </DialogHeader>

        {isTargetAdmin ? (
          <div className="space-y-3">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm text-primary">
              システム管理者はすべてのアプリにフルアクセスできます
            </div>
            <div className="space-y-1.5">
              {PERM_MODULES.map((mod) => (
                <div key={mod} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/40">
                  <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
                  <Badge className="bg-primary/10 text-primary text-xs">フルアクセス</Badge>
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
            {/* サマリー */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {accessCount} / {PERM_MODULES.length} アプリにアクセス可
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowHelp((v) => !v)}
              >
                <Info className="h-3.5 w-3.5" />
                レベル説明
              </button>
            </div>

            {/* レベル説明（展開可） */}
            {showHelp && (
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-xs">
                <p className="font-semibold text-xs text-muted-foreground mb-2">アクセスレベルの説明</p>
                {Object.entries(ACCESS_LEVEL_LABELS).map(([level, label]) => (
                  <div key={level} className="flex items-baseline gap-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${LEVEL_COLORS[level]}`}>
                      {label}
                    </span>
                    <span className="text-muted-foreground">{ACCESS_LEVEL_DESCRIPTIONS[level]}</span>
                  </div>
                ))}
                <div className="flex items-baseline gap-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${LEVEL_COLORS.none}`}>
                    アクセスなし
                  </span>
                  <span className="text-muted-foreground">このアプリを使用できません</span>
                </div>
              </div>
            )}

            {/* モジュール別設定 */}
            <div className="space-y-1">
              {PERM_MODULES.map((mod) => {
                const level = localPerms[mod] || "none";
                return (
                  <div key={mod} className="flex items-center gap-3 py-1.5 px-1 rounded-md hover:bg-muted/40">
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">
                      {MODULE_LABELS[mod]}
                    </span>
                    <span className={`hidden sm:inline-block text-xs px-2 py-0.5 rounded shrink-0 ${LEVEL_COLORS[level]}`}>
                      {level === "none" ? "なし" : ACCESS_LEVEL_LABELS[level]}
                    </span>
                    <Select value={level} onValueChange={(v) => setModuleLevel(mod, v)}>
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          <span className="text-muted-foreground">アクセスなし</span>
                        </SelectItem>
                        {Object.entries(ACCESS_LEVEL_LABELS).map(([lv, lbl]) => (
                          <SelectItem key={lv} value={lv}>
                            <div className="flex flex-col">
                              <span>{lbl}</span>
                              <span className="text-[10px] text-muted-foreground">{ACCESS_LEVEL_DESCRIPTIONS[lv]}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
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
  const [repairResult, setRepairResult] = useState<null | { staffCount: number; permissionsInserted: number; rolesFixed: {role:string;c:number}[] }>(null);
  const [repairDialogOpen, setRepairDialogOpen] = useState(false);

  const repairMutation = useMutation({
    mutationFn: async () => (await api.post("/users/admin/repair-permissions")).data.data,
    onSuccess: (data) => {
      setRepairResult(data);
      setRepairDialogOpen(true);
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const form = useForm<UserForm>({
    defaultValues: { name: "", email: "", role: "staff" },
  });

  const isAdmin = currentUser?.role === "system_admin";

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data.data,
    enabled: isAdmin,
  });

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (values: UserForm) => {
      if (editingId) return (await api.put(`/users/${editingId}`, values)).data;
      return (await api.post("/users", values)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      if (!editingId && data?.inviteUrl) {
        setInviteUrl(data.inviteUrl);
      } else {
        closeDialog();
      }
    },
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
    form.reset({ name: u.name, email: u.email, role: u.role === "system_admin" ? "system_admin" : "staff" });
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
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">ユーザー管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ロールは「管理者」または「スタッフ」の2種類。アプリ別の権限は🔑ボタンで設定します。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => repairMutation.mutate()} disabled={repairMutation.isPending} title="全スタッフに不足している権限を一括付与します">
            {repairMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
            権限修復
          </Button>
          <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />新規追加</Button>
        </div>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{u.name}</span>
                          <Badge color={roleColorMap[u.role]}>
                            {roleLabelMap[u.role] || u.role}
                          </Badge>
                          {u.status === "invited" && (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">招待中</Badge>
                          )}
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
                    <TableHead>ステータス</TableHead>
                    <TableHead>作成日</TableHead>
                    <TableHead className="w-36"></TableHead>
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
                      <TableCell>
                        {u.status === "invited" ? (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">招待中</Badge>
                        ) : u.status === "active" ? (
                          <Badge variant="outline" className="text-xs text-green-600 border-green-400">有効</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">{u.status}</span>
                        )}
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

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) { setInviteUrl(null); closeDialog(); } setDialogOpen(v); }}>
        <DialogContent>
          {inviteUrl ? (
            <>
              <DialogHeader>
                <DialogTitle>招待リンク</DialogTitle>
                <DialogDescription>このURLをユーザーに共有してください（Slack、LINE等）</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />ユーザーを作成しました
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">招待URL（7日間有効）</p>
                  <p className="text-xs font-mono break-all select-all">{inviteUrl}</p>
                </div>
                <Button className="w-full" onClick={() => { navigator.clipboard.writeText(inviteUrl); }}>
                  <Copy className="h-4 w-4 mr-1" />URLをコピー
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  ユーザーがこのリンクを開くとパスワード設定画面が表示されます
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setInviteUrl(null); closeDialog(); }}>閉じる</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{editingId ? "ユーザー編集" : "ユーザー招待"}</DialogTitle>
                <DialogDescription>{editingId ? "ユーザー情報を編集します" : "招待メール（またはURL）でユーザーを追加します"}</DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
                <div><Label>名前 *</Label><Input {...form.register("name", { required: true })} /></div>
                <div><Label>メール *</Label><Input type="email" {...form.register("email", { required: true })} /></div>
                <div>
                  <Label>ロール *</Label>
                  <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system_admin">
                        <div className="flex flex-col">
                          <span>システム管理者</span>
                          <span className="text-xs text-muted-foreground">全権限・ユーザー管理</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="staff">
                        <div className="flex flex-col">
                          <span>スタッフ</span>
                          <span className="text-xs text-muted-foreground">アプリ別に権限を設定</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    スタッフは<strong>アプリ権限ゼロの状態で招待</strong>され、
                    招待承諾後に管理者が🔑権限設定から必要なアプリを付与します
                  </p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>キャンセル</Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingId ? "保存" : "招待する"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PermissionDialog user={permUser} open={permDialogOpen} onOpenChange={setPermDialogOpen} />

      {/* 権限修復 結果ダイアログ */}
      <Dialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />権限修復完了
            </DialogTitle>
          </DialogHeader>
          {repairResult && (
            <div className="space-y-3 text-sm">
              {repairResult.rolesFixed.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="font-medium text-amber-800 mb-1">旧ロールを修正しました</p>
                  {repairResult.rolesFixed.map((r) => (
                    <p key={r.role} className="text-amber-700">・{r.role}: {r.c}件 → staff に変換</p>
                  ))}
                </div>
              )}
              <div className="bg-muted rounded-lg p-3 space-y-1">
                <p>対象スタッフ数: <strong>{repairResult.staffCount}名</strong></p>
                <p>付与した権限数: <strong>{repairResult.permissionsInserted}件</strong></p>
                {repairResult.permissionsInserted === 0 && (
                  <p className="text-muted-foreground text-xs mt-1">全員の権限は既に設定済みでした</p>
                )}
              </div>
              <p className="text-muted-foreground text-xs">スタッフはログインし直すと権限が反映されます</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRepairDialogOpen(false)}>閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
