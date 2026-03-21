import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ProjectGroup } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

interface GroupForm {
  name: string;
  description: string;
  period_start: string;
  period_end: string;
}

export default function ProjectGroupListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ProjectGroup | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["project-groups"],
    queryFn: async () => (await api.get("/project-groups")).data,
  });

  const groups: ProjectGroup[] = data?.data ?? [];

  const form = useForm<GroupForm>({
    defaultValues: { name: "", description: "", period_start: "", period_end: "" },
  });

  const createMutation = useMutation({
    mutationFn: (values: GroupForm) => api.post("/project-groups", values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups"] });
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: GroupForm) =>
      api.put(`/project-groups/${editingGroup!.id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups"] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/project-groups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-groups"] });
    },
  });

  function openCreate() {
    setEditingGroup(null);
    form.reset({ name: "", description: "", period_start: "", period_end: "" });
    setDialogOpen(true);
  }

  function openEdit(g: ProjectGroup) {
    setEditingGroup(g);
    form.reset({
      name: g.name,
      description: g.description ?? "",
      period_start: g.period_start ?? "",
      period_end: g.period_end ?? "",
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingGroup(null);
    form.reset();
  }

  function onSubmit(values: GroupForm) {
    if (editingGroup) {
      updateMutation.mutate(values);
    } else {
      createMutation.mutate(values);
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">案件グループ</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          グループ作成
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>グループ名</TableHead>
              <TableHead>期間</TableHead>
              <TableHead className="text-right">子案件数</TableHead>
              <TableHead className="text-right">共通仕入合計</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  データがありません
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow
                  key={g.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/project-groups/${g.id}`)}
                >
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell>
                    {g.period_start || g.period_end
                      ? `${formatDate(g.period_start)} ~ ${formatDate(g.period_end)}`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">{g.project_count ?? 0}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(g.total_group_purchase)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(g)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("このグループを削除しますか？")) {
                            deleteMutation.mutate(g.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
            <DialogTitle>
              {editingGroup ? "グループ編集" : "グループ作成"}
            </DialogTitle>
            <DialogDescription>
              案件グループの情報を入力してください。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">グループ名 *</Label>
              <Input
                id="name"
                {...form.register("name", { required: true })}
                placeholder="例: 2024年度 総会シリーズ"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">説明</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="グループの説明"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="period_start">開始日</Label>
                <Input
                  id="period_start"
                  type="date"
                  {...form.register("period_start")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period_end">終了日</Label>
                <Input
                  id="period_end"
                  type="date"
                  {...form.register("period_end")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                キャンセル
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingGroup ? "更新" : "作成"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
