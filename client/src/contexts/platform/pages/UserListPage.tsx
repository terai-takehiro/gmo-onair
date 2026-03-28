import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { useAuth } from "@/contexts/platform/AuthContext";
import { formatDate } from "@/lib/format";
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
import { Plus, Pencil, Trash2, Loader2, ShieldAlert } from "lucide-react";

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

export default function UserListPage() {
  const { currentUser } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ユーザー管理</h1>
        <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" />新規追加</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名前</TableHead>
              <TableHead>メール</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead>作成日</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(!users || users.length === 0) ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">データがありません</TableCell></TableRow>
            ) : (
              users.map((u) => (
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
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate(u.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
    </div>
  );
}
