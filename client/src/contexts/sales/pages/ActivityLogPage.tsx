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
import { Plus, Search, Edit2, Trash2, Clock, AlertCircle, Sparkles } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

// v2.9.178+: AI 起票 (MCP 経由のメール取込等) バッジ
function AiCreatedBadge({ requestedBy }: { requestedBy?: string | null }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700"
      title={requestedBy ? `AI が記録しました (指示: ${requestedBy})` : "AI が記録しました"}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      AI作成
    </span>
  );
}

// v2.9.197+: 由来 (プロベナンス) チップ — 流入チャネル + メール取込 + AI 指示者。
// AI 自動入力の「どこから来た情報か」を一目で分かるようにする。
function ProvenanceChips({ log }: { log: Record<string, unknown> }) {
  const channel = log.source_channel as string | null;
  const hasMail = !!log.message_id;
  const requestedBy = log.ai_requested_by as string | null;
  if (!channel && !hasMail && !requestedBy) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {channel && (
        <span className="inline-flex shrink-0 items-center rounded-full bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] text-sky-700" title="どこから届いたか">
          {channel}
        </span>
      )}
      {hasMail && (
        // Message-ID は突合用の内部キーなので title に退避する
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600"
          title={`メールから作られました (Message-ID: ${log.message_id})`}
        >
          ✉ メール
        </span>
      )}
      {requestedBy && (
        <span className="text-[10px] text-violet-600" title="AI に指示した人">指示: {requestedBy}</span>
      )}
    </span>
  );
}

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

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
/** YYYY-MM-DD → 「7月16日 (水)」。今日/昨日はラベルを併記して視認性を上げる */
function dateGroupLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  const base = `${d.getMonth() + 1}月${d.getDate()}日 (${WEEKDAYS[d.getDay()]})`;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;
  if (dateStr === todayStr) return `今日 · ${base}`;
  if (dateStr === yestStr) return `昨日 · ${base}`;
  return base;
}
/** YYYY-MM-DD → 「7/17」 (次回アクション期限のコンパクト表示) */
function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
/** 活動の紐づけ先 (案件名 > 顧客名) — 内部コードではなく人が読める名前を出す */
function relatedName(log: any): string | null {
  return log.project_name || log.customer_name || null;
}

/** 次回アクション行 — 「次回」ラベル + 期限 (超過は赤) + 完了は ✓ 打消し */
function NextActionLine({ log, className = "" }: { log: any; className?: string }) {
  if (!log.next_action) return null;
  const done = !!log.next_action_done_at;
  const overdue = !done && log.next_action_date && log.next_action_date < new Date().toISOString().split("T")[0];
  return (
    <div className={`flex items-center gap-1.5 text-sm min-w-0 ${className}`}>
      {done ? (
        <span className="inline-flex items-center gap-1 text-muted-foreground min-w-0">
          <span className="shrink-0 text-emerald-600">✓</span>
          <span className="truncate line-through">{log.next_action}</span>
          <span className="shrink-0 text-xs">対応済み</span>
        </span>
      ) : (
        <span className={`inline-flex items-center gap-1.5 min-w-0 ${overdue ? "text-red-600" : "text-foreground"}`}>
          <Clock className={`h-3.5 w-3.5 shrink-0 ${overdue ? "text-red-500" : "text-amber-500"}`} aria-hidden="true" />
          <span className={`shrink-0 text-xs font-semibold ${overdue ? "text-red-600" : "text-amber-700"}`}>
            次回{log.next_action_date ? ` ${shortDate(log.next_action_date)}` : ""}{overdue ? " (期限超過)" : ""}
          </span>
          <span className="truncate">{log.next_action}</span>
        </span>
      )}
    </div>
  );
}

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
  const [originFilter, setOriginFilter] = useState<"" | "ai" | "human">("");
  const [sort, setSort] = useState<"date" | "next_action">("date");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  // 活動記録一覧
  const { data, isLoading } = useQuery({
    queryKey: ["activity-logs", page, search, typeFilter, originFilter, sort],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      if (typeFilter) params.activity_type = typeFilter;
      if (originFilter) params.origin = originFilter;
      if (sort !== "date") params.sort = sort;
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
      setDialogOpen(false);
      setEditingId(null);
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
          <PageTitle>営業活動記録</PageTitle>
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
                <div key={a.id} className="flex items-center gap-2 text-sm min-w-0">
                  <Badge variant={isOverdue(a.next_action_date) ? "destructive" : "secondary"} className="text-xs shrink-0">
                    {isOverdue(a.next_action_date) ? "超過 " : ""}{shortDate(a.next_action_date)}
                  </Badge>
                  <span className="truncate font-medium">{a.next_action}</span>
                  {relatedName(a) && (
                    <span className="text-muted-foreground truncate shrink-0 max-w-[40%]">— {relatedName(a)}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-sm min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="件名・案件名・顧客名で検索..."
            className="pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={typeFilter || "all"} onValueChange={(v) => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全種別</SelectItem>
            {ACTIVITY_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => { setSort(v as "date" | "next_action"); setPage(1); }}>
          <SelectTrigger className="w-[168px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="date">活動日が新しい順</SelectItem>
            <SelectItem value="next_action">次回アクション期限順</SelectItem>
          </SelectContent>
        </Select>
        {/* 入力元フィルタ (AI 取込 / 手入力) */}
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {([["", "すべて"], ["ai", "AI作成"], ["human", "手入力"]] as ["" | "ai" | "human", string][]).map(([v, lbl]) => (
            <button
              key={v || "all"}
              type="button"
              onClick={() => { setOriginFilter(v); setPage(1); }}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors ${
                originFilter === v
                  ? v === "ai"
                    ? "bg-violet-600 text-white font-medium"
                    : "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {v === "ai" && <Sparkles className="h-3 w-3" aria-hidden="true" />}
              {lbl}
            </button>
          ))}
        </div>
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
              {/* Mobile cards — 活動日でグルーピングし、カードは「件名 → 案件/顧客 → 次回」の順に整理。
                  タップで編集ダイアログを開く (編集/削除アイコンは廃止して情報密度を下げる) */}
              <div className="lg:hidden p-2">
                {logs.map((log: any, i: number) => {
                  const at = getActivityType(log.activity_type);
                  const showDateHeader = sort === "date" && (i === 0 || logs[i - 1].activity_date !== log.activity_date);
                  return (
                    <div key={log.id}>
                      {showDateHeader && (
                        <div className={`px-1 pb-1.5 text-xs font-semibold text-muted-foreground ${i === 0 ? "pt-1" : "pt-4"}`}>
                          {dateGroupLabel(log.activity_date)}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(log)}
                        className={`mb-2 block w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted ${
                          log.is_ai_created ? "border-l-4 border-l-violet-400 border-violet-200 bg-violet-50/30" : "bg-card"
                        }`}
                      >
                        {/* 1行目: 種別 + 件名 (全文・最大2行) + AI */}
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs ${at.color}`}>{at.label}</span>
                          <span className="min-w-0 flex-1 font-medium leading-snug line-clamp-2">{log.subject}</span>
                          {log.is_ai_created && <span className="mt-0.5"><AiCreatedBadge requestedBy={log.ai_requested_by} /></span>}
                        </div>
                        {/* 2行目: 案件名/顧客名 (人が読める名前) + 担当 + 活動日 (期限順ソート時のみ) */}
                        <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                          <span className="truncate">
                            {relatedName(log) ?? "案件・顧客ひも付けなし"}
                          </span>
                          {log.user_name && <span className="shrink-0 text-xs">· {log.user_name}</span>}
                          {sort !== "date" && <span className="shrink-0 text-xs">· {shortDate(log.activity_date)}</span>}
                        </div>
                        {/* 3行目: 由来チップ (あるときだけ) */}
                        <div className="mt-1 empty:hidden">
                          <ProvenanceChips log={log} />
                        </div>
                        {/* 4行目: 次回アクション (あるときだけ) */}
                        <NextActionLine log={log} className="mt-1.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden lg:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[110px]">活動日</TableHead>
                    <TableHead className="w-[80px]">種別</TableHead>
                    <TableHead>件名</TableHead>
                    <TableHead>案件 / 顧客</TableHead>
                    <TableHead className="w-[90px]">担当</TableHead>
                    <TableHead>次回アクション</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => {
                    const at = getActivityType(log.activity_type);
                    return (
                      <TableRow key={log.id} className={log.is_ai_created ? "bg-violet-50/40 hover:bg-violet-50/70" : undefined}>
                        <TableCell className="text-sm whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {log.is_ai_created ? <span className="h-4 w-1 shrink-0 rounded-full bg-violet-400" aria-hidden="true" /> : null}
                            {formatDate(log.activity_date)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${at.color}`}>{at.label}</span>
                        </TableCell>
                        <TableCell className="font-medium max-w-[320px]">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate" title={log.subject}>{log.subject}</span>
                            {log.is_ai_created && <AiCreatedBadge requestedBy={log.ai_requested_by} />}
                          </span>
                          <ProvenanceChips log={log} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                          <span className="block truncate" title={log.project_gls || log.project_code || undefined}>
                            {relatedName(log) ?? "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{log.user_name}</TableCell>
                        <TableCell className="max-w-[240px]">
                          {log.next_action ? <NextActionLine log={log} /> : <span className="text-sm text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(log)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => {
                              if ((await confirmAction({ title: "削除しますか？", confirmLabel: '削除する', tone: 'danger' }))) deleteMutation.mutate(log.id);
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
          <DialogFooter className="gap-2 sm:justify-between">
            {editingId ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={async () => { if ((await confirmAction({ title: "この活動記録を削除しますか？", confirmLabel: '削除する', tone: 'danger' }))) deleteMutation.mutate(editingId); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />削除
              </Button>
            ) : <span className="hidden sm:block" />}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button onClick={() => saveMutation.mutate(form)} disabled={!form.subject || !form.activity_date || saveMutation.isPending}>
                {editingId ? "更新" : "保存"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
