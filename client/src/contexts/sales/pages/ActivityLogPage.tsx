import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Edit2, Trash2, Clock, AlertCircle } from "lucide-react";

const ACTIVITY_TYPES = [
  { value: "call", label: "電話", color: "bg-blue-100 text-blue-700" },
  { value: "email", label: "メール", color: "bg-green-100 text-green-700" },
  { value: "visit", label: "訪問", color: "bg-purple-100 text-purple-700" },
  { value: "meeting", label: "打合せ", color: "bg-orange-100 text-orange-700" },
  { value: "proposal", label: "提案", color: "bg-red-100 text-red-700" },
  { value: "demo", label: "デモ/見学", color: "bg-pink-100 text-pink-700" },
  { value: "follow_up", label: "フォロー", color: "bg-cyan-100 text-cyan-700" },
  { value: "other", label: "その他", color: "bg-gray-100 text-gray-700" },
];

const getActivityType = (value: string) => ACTIVITY_TYPES.find(t => t.value === value) || ACTIVITY_TYPES[7];

interface FormData {
  project_id: string;
  customer_id: string;
  activity_type: string;
  activity_date: string;
  duration_minutes: string;
  subject: string;
  description: string;
  next_action: string;
  next_action_date: string;
}

const emptyForm: FormData = {
  project_id: "", customer_id: "", activity_type: "call",
  activity_date: new Date().toISOString().split("T")[0],
  duration_minutes: "", subject: "", description: "",
  next_action: "", next_action_date: "",
};

export default function ActivityLogPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  // 活動記録一覧
  const { data, isLoading } = useQuery({
    queryKey: ["activity-logs", page, search, typeFilter],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (typeFilter) params.activity_type = typeFilter;
      return (await api.get("/activity-logs", { params })).data;
    },
  });
  const logs: any[] = data?.data ?? [];
  const pagination = data?.pagination;

  // 次回アクション
  const { data: upcomingData } = useQuery({
    queryKey: ["activity-upcoming"],
    queryFn: async () => (await api.get("/activity-logs/upcoming")).data,
  });
  const upcomingActions: any[] = upcomingData?.data ?? [];

  // 案件一覧（プルダウン用）
  const { data: projectsData } = useQuery({
    queryKey: ["projects-dropdown"],
    queryFn: async () => (await api.get("/projects?limit=200")).data,
    enabled: dialogOpen,
  });
  const projectOptions: any[] = projectsData?.data ?? [];

  // 顧客一覧（プルダウン用）
  const { data: custData } = useQuery({
    queryKey: ["customers-dropdown"],
    queryFn: async () => (await api.get("/customers?limit=200")).data,
    enabled: dialogOpen,
  });
  const customers: any[] = custData?.data ?? [];

  // CRUD
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        ...data,
        duration_minutes: data.duration_minutes ? Number(data.duration_minutes) : null,
        project_id: data.project_id || null,
        customer_id: data.customer_id || null,
        next_action: data.next_action || null,
        next_action_date: data.next_action_date || null,
      };
      if (editingId) {
        return (await api.put(`/activity-logs/${editingId}`, payload)).data;
      }
      return (await api.post("/activity-logs", payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity-logs"] });
      qc.invalidateQueries({ queryKey: ["activity-upcoming"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/activity-logs/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activity-logs"] });
      qc.invalidateQueries({ queryKey: ["activity-upcoming"] });
    },
  });

  const openEdit = (log: any) => {
    setEditingId(log.id);
    setForm({
      project_id: log.project_id || "",
      customer_id: log.customer_id || "",
      activity_type: log.activity_type,
      activity_date: log.activity_date,
      duration_minutes: log.duration_minutes ? String(log.duration_minutes) : "",
      subject: log.subject,
      description: log.description || "",
      next_action: log.next_action || "",
      next_action_date: log.next_action_date || "",
    });
    setDialogOpen(true);
  };

  const isOverdue = (date: string) => date < new Date().toISOString().split("T")[0];

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">営業活動記録</h1>
          <p className="text-sm text-muted-foreground">電話・訪問・メール等の営業活動を記録</p>
        </div>
        <Button onClick={() => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" />活動を記録
        </Button>
      </div>

      {/* 次回アクションアラート */}
      {upcomingActions.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-1">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              次回アクション予定 ({upcomingActions.length}件)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {upcomingActions.slice(0, 5).map((a: any) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <Badge variant={isOverdue(a.next_action_date) ? "destructive" : "secondary"} className="text-xs">
                    {formatDate(a.next_action_date)}
                  </Badge>
                  <span className="truncate">{a.next_action}</span>
                  {a.project_name && (
                    <span className="text-muted-foreground truncate">({a.project_code})</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* フィルター */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="件名で検索..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全種別</SelectItem>
            {ACTIVITY_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 一覧 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">活動記録がありません</div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {logs.map((log: any) => {
                  const at = getActivityType(log.activity_type);
                  return (
                    <div key={log.id} className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${at.color}`}>{at.label}</span>
                            <span className="font-medium truncate">{log.subject}</span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 truncate">
                            {log.project_code ? log.project_code : log.customer_name || "-"}
                            {log.performed_by_name && <span> / {log.performed_by_name}</span>}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span>{formatDate(log.activity_date)}</span>
                            {log.duration_minutes && <span>{log.duration_minutes}分</span>}
                          </div>
                          {log.next_action && (
                            <div className="text-sm mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" />
                              <span className="truncate">{log.next_action}</span>
                              {log.next_action_date && (
                                <Badge variant={isOverdue(log.next_action_date) ? "destructive" : "outline"} className="text-xs ml-1 shrink-0">
                                  {formatDate(log.next_action_date)}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(log)}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                            if (confirm("削除しますか？")) deleteMutation.mutate(log.id);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日付</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead>件名</TableHead>
                    <TableHead>ヨミ / 顧客</TableHead>
                    <TableHead>担当</TableHead>
                    <TableHead className="text-center">時間</TableHead>
                    <TableHead>次回アクション</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => {
                    const at = getActivityType(log.activity_type);
                    return (
                      <TableRow key={log.id}>
                        <TableCell className="text-sm">{formatDate(log.activity_date)}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded ${at.color}`}>{at.label}</span>
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{log.subject}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                          {log.project_code ? `${log.project_code}` : log.customer_name || "-"}
                        </TableCell>
                        <TableCell className="text-sm">{log.performed_by_name}</TableCell>
                        <TableCell className="text-center text-sm">
                          {log.duration_minutes ? `${log.duration_minutes}分` : "-"}
                        </TableCell>
                        <TableCell className="text-sm max-w-[150px] truncate">
                          {log.next_action ? (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {log.next_action}
                              {log.next_action_date && (
                                <Badge variant={isOverdue(log.next_action_date) ? "destructive" : "outline"} className="text-xs ml-1">
                                  {formatDate(log.next_action_date)}
                                </Badge>
                              )}
                            </span>
                          ) : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(log)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                              if (confirm("削除しますか？")) deleteMutation.mutate(log.id);
                            }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ページネーション */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>前へ</Button>
          <span className="text-sm py-1.5">{page} / {pagination.totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>次へ</Button>
        </div>
      )}

      {/* 活動記録ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "活動記録の編集" : "活動を記録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>活動種別</Label>
                <Select value={form.activity_type} onValueChange={(v) => setForm(f => ({ ...f, activity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>活動日</Label>
                <Input type="date" value={form.activity_date} onChange={(e) => setForm(f => ({ ...f, activity_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>件名 *</Label>
              <Input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="打合せ内容の概要" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>案件（任意）</Label>
                <Select value={form.project_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, project_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {projectOptions.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>{o.gls_number || o.code} {o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>顧客（任意）</Label>
                <Select value={form.customer_id || "none"} onValueChange={(v) => setForm(f => ({ ...f, customer_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="選択..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし</SelectItem>
                    {customers.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>所要時間（分）</Label>
              <Input type="number" value={form.duration_minutes} onChange={(e) => setForm(f => ({ ...f, duration_minutes: e.target.value }))} placeholder="30" />
            </div>
            <div>
              <Label>詳細</Label>
              <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-2">次回アクション</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>内容</Label>
                  <Input value={form.next_action} onChange={(e) => setForm(f => ({ ...f, next_action: e.target.value }))} placeholder="見積書を送付" />
                </div>
                <div>
                  <Label>期日</Label>
                  <Input type="date" value={form.next_action_date} onChange={(e) => setForm(f => ({ ...f, next_action_date: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={() => saveMutation.mutate(form)} disabled={!form.subject || !form.activity_date || saveMutation.isPending}>
              {editingId ? "更新" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
