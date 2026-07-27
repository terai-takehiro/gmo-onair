import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { ProjectStageLabels, ProjectTypeLabels, type ProjectStage, type ProjectType } from "@/types";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import { Search, Loader2, Pencil, Database, X, AlertTriangle } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { EmptyState } from '@gmo-onair/shared/src/client/states';

interface Row {
  id: string;
  gls_number: string | null;
  name: string;
  customer_name: string | null;
  assigned_to_name: string | null;
  stage: ProjectStage;
  gls_category: "A" | "B" | null;
  project_type: ProjectType | null;
  event_start: string | null;
  event_end: string | null;
  total_revenue: number;
  total_purchase: number;
  notes: string | null;
}

interface Marker { marker: string; count: number }

const PAGE_SIZE = 50;

/** notes の [kessan:XXX] からマーカー文字列を取り出す */
function markerOf(notes: string | null): string {
  const m = (notes || "").match(/^\[kessan:([^\]]+)\]/);
  return m ? m[1] : "";
}

type EditState = {
  customer: boolean; customer_id: string;
  assignee: boolean; assigned_to: string;
  category: boolean; gls_category: "A" | "B";
  ptype: boolean; project_type: string;
  stage: boolean; stageVal: string;
  evStart: boolean; event_start: string;
  evEnd: boolean; event_end: string;
  appForm: boolean; application_form: boolean;
  logo: boolean; logo_permission: boolean;
  tags: boolean; tagsMode: "append" | "replace"; tagsVal: string;
};

const initialEdit: EditState = {
  customer: false, customer_id: "",
  assignee: false, assigned_to: "",
  category: false, gls_category: "A",
  ptype: false, project_type: "other",
  stage: false, stageVal: "a_won",
  evStart: false, event_start: "",
  evEnd: false, event_end: "",
  appForm: false, application_form: false,
  logo: false, logo_permission: false,
  tags: false, tagsMode: "append", tagsVal: "",
};

export default function GlsImportProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [marker, setMarker] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [edit, setEdit] = useState<EditState>(initialEdit);

  const { data: markersData } = useQuery({
    queryKey: ["kessan-markers"],
    queryFn: async () => (await api.get("/projects/kessan-markers")).data.data as Marker[],
  });
  const markers = markersData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["gls-import-projects", page, search, marker],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: PAGE_SIZE, source: "kessan" };
      if (search) params.search = search;
      if (marker !== "all") params.kessan_marker = marker;
      return (await api.get("/projects", { params })).data;
    },
  });
  const rows: Row[] = data?.data ?? [];
  const pagination = data?.pagination;

  const { data: customersData } = useQuery({
    queryKey: ["customers-200"],
    queryFn: async () => (await api.get("/customers", { params: { limit: 200 } })).data,
  });
  const customers = (customersData?.data ?? []) as { id: string; name: string }[];

  const { data: usersData } = useQuery({
    queryKey: ["users-by-module-sales"],
    queryFn: async () => (await api.get("/users/by-module/sales")).data.data as { id: string; name: string }[],
  });
  const users = usersData ?? [];

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulk = useMutation({
    mutationFn: async () => {
      const set: Record<string, unknown> = {};
      if (edit.customer && edit.customer_id) set.customer_id = edit.customer_id;
      if (edit.assignee && edit.assigned_to) set.assigned_to = edit.assigned_to;
      if (edit.category) set.gls_category = edit.gls_category;
      if (edit.ptype) set.project_type = edit.project_type;
      if (edit.stage) set.stage = edit.stageVal;
      if (edit.evStart) set.event_start = edit.event_start;
      if (edit.evEnd) set.event_end = edit.event_end;
      if (edit.appForm) set.application_form = edit.application_form ? 1 : 0;
      if (edit.logo) set.logo_permission = edit.logo_permission ? 1 : 0;
      if (edit.tags) { set.tags = edit.tagsVal; set.tagsMode = edit.tagsMode; }
      return (await api.patch("/projects/bulk", { ids: [...selected], set })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gls-import-projects"] });
      setDialogOpen(false);
      setEdit(initialEdit);
      setSelected(new Set());
    },
  });

  const anyFieldEnabled = edit.customer || edit.assignee || edit.category || edit.ptype ||
    edit.stage || edit.evStart || edit.evEnd || edit.appForm || edit.logo || edit.tags;

  const bulkErr =
    (bulk.error as { response?: { data?: { error?: { message?: string } } } } | null)
      ?.response?.data?.error?.message || "";

  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name })),
    [customers]
  );

  return (
    <PageTransition>
      <div className="space-y-4 p-3 lg:p-6">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <Database className="h-6 w-6 text-primary" />
          <PageTitle>旧GLS（決算インポート案件）</PageTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          決算インポートで取り込んだ案件の一覧です。チェックを入れて「一括編集」で、顧客・担当・分類・ステージ・開催日・タグなどをまとめて変更できます。
          取込直後は顧客が「(顧客不明)」、取引先が科目名プレースホルダになっている場合があります。
        </p>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="GLS番号 / 案件名 / 顧客名で検索"
              className="pl-8"
            />
          </div>
          <div>
            <Label className="block text-xs text-muted-foreground mb-1">取込バッチ（マーカー）</Label>
            <Select value={marker} onValueChange={(v) => { setMarker(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべて</SelectItem>
                {markers.map((m) => (
                  <SelectItem key={m.marker} value={m.marker}>{m.marker}（{m.count}件）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium">{selected.size} 件を選択中</span>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Pencil className="mr-1.5 h-4 w-4" /> 一括編集
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              <X className="mr-1 h-4 w-4" /> 選択解除
            </Button>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Database />} title="該当する案件がありません" description="決算インポートを実行すると、ここに取り込んだ案件が表示されます。" />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 w-10">
                    <Checkbox checked={allOnPageSelected} onCheckedChange={toggleAll} aria-label="このページを全選択" />
                  </th>
                  <th className="px-3 py-2 text-left">GLS番号</th>
                  <th className="px-3 py-2 text-left">案件名</th>
                  <th className="px-3 py-2 text-left">顧客</th>
                  <th className="px-3 py-2 text-left">担当</th>
                  <th className="px-3 py-2 text-left">ステージ</th>
                  <th className="px-3 py-2 text-center">分類</th>
                  <th className="px-3 py-2 text-left">開催日</th>
                  <th className="px-3 py-2 text-right">売上</th>
                  <th className="px-3 py-2 text-right">仕入</th>
                  <th className="px-3 py-2 text-left">バッチ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border hover:bg-muted/40 cursor-pointer ${selected.has(r.id) ? "bg-primary/5" : ""}`}
                    onClick={() => navigate(`/sales/projects/${r.id}`)}
                  >
                    <td className="px-3 py-2" onClick={(e) => { e.stopPropagation(); toggleOne(r.id); }}>
                      <Checkbox checked={selected.has(r.id)} aria-label="選択" />
                    </td>
                    <td className="px-3 py-2 font-number whitespace-nowrap">{r.gls_number || "—"}</td>
                    <td className="px-3 py-2 max-w-[260px] truncate">{r.name}</td>
                    <td className="px-3 py-2 max-w-[160px] truncate">{r.customer_name || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.assigned_to_name || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ProjectStageLabels[r.stage] ?? r.stage}</td>
                    <td className="px-3 py-2 text-center">
                      {r.gls_category ? <Badge variant="outline">{r.gls_category}</Badge> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.event_start ? formatShortDate(r.event_start) : "—"}</td>
                    <td className="px-3 py-2 text-right font-number whitespace-nowrap">{formatCurrency(r.total_revenue)}</td>
                    <td className="px-3 py-2 text-right font-number whitespace-nowrap">{formatCurrency(r.total_purchase)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{markerOf(r.notes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.total > PAGE_SIZE && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              全 {pagination.total} 件中 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pagination.total)} 件
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>前へ</Button>
              <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= pagination.total} onClick={() => setPage((p) => p + 1)}>次へ</Button>
            </div>
          </div>
        )}

        {/* Bulk edit dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>一括編集（{selected.size} 件）</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              変更したい項目だけチェックを入れてください。チェックした項目のみ、選択中の {selected.size} 件すべてに適用されます。
            </p>

            <div className="space-y-3 py-1">
              {/* 顧客 */}
              <FieldRow checked={edit.customer} onCheck={(v) => setEdit((s) => ({ ...s, customer: v }))} label="顧客（取引先）">
                <SearchableSelect
                  options={customerOptions}
                  value={edit.customer_id}
                  onChange={(v) => setEdit((s) => ({ ...s, customer_id: v }))}
                  placeholder="顧客を検索…"
                  disabled={!edit.customer}
                />
              </FieldRow>

              {/* 担当者 */}
              <FieldRow checked={edit.assignee} onCheck={(v) => setEdit((s) => ({ ...s, assignee: v }))} label="担当者">
                <Select value={edit.assigned_to} onValueChange={(v) => setEdit((s) => ({ ...s, assigned_to: v }))} disabled={!edit.assignee}>
                  <SelectTrigger><SelectValue placeholder="担当者を選択" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* 案件分類 */}
              <FieldRow checked={edit.category} onCheck={(v) => setEdit((s) => ({ ...s, category: v }))} label="案件分類">
                <Select value={edit.gls_category} onValueChange={(v) => setEdit((s) => ({ ...s, gls_category: v as "A" | "B" }))} disabled={!edit.category}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A（スタジオ）</SelectItem>
                    <SelectItem value="B">B（ビジネス）</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* 案件種別 */}
              <FieldRow checked={edit.ptype} onCheck={(v) => setEdit((s) => ({ ...s, ptype: v }))} label="案件種別">
                <Select value={edit.project_type} onValueChange={(v) => setEdit((s) => ({ ...s, project_type: v }))} disabled={!edit.ptype}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ProjectTypeLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* ステージ */}
              <FieldRow checked={edit.stage} onCheck={(v) => setEdit((s) => ({ ...s, stage: v }))} label="ステージ">
                <Select value={edit.stageVal} onValueChange={(v) => setEdit((s) => ({ ...s, stageVal: v }))} disabled={!edit.stage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ProjectStageLabels).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* イベント開始日 */}
              <FieldRow checked={edit.evStart} onCheck={(v) => setEdit((s) => ({ ...s, evStart: v }))} label="イベント開始日">
                <Input type="date" value={edit.event_start} onChange={(e) => setEdit((s) => ({ ...s, event_start: e.target.value }))} disabled={!edit.evStart} />
              </FieldRow>

              {/* イベント終了日 */}
              <FieldRow checked={edit.evEnd} onCheck={(v) => setEdit((s) => ({ ...s, evEnd: v }))} label="イベント終了日">
                <Input type="date" value={edit.event_end} onChange={(e) => setEdit((s) => ({ ...s, event_end: e.target.value }))} disabled={!edit.evEnd} />
              </FieldRow>

              {/* 申込書 */}
              <FieldRow checked={edit.appForm} onCheck={(v) => setEdit((s) => ({ ...s, appForm: v }))} label="申込書">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={edit.application_form} onCheckedChange={(v) => setEdit((s) => ({ ...s, application_form: !!v }))} disabled={!edit.appForm} />
                  申込書あり
                </label>
              </FieldRow>

              {/* ロゴ許諾 */}
              <FieldRow checked={edit.logo} onCheck={(v) => setEdit((s) => ({ ...s, logo: v }))} label="ロゴ許諾">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={edit.logo_permission} onCheckedChange={(v) => setEdit((s) => ({ ...s, logo_permission: !!v }))} disabled={!edit.logo} />
                  ロゴ使用許諾あり
                </label>
              </FieldRow>

              {/* タグ */}
              <FieldRow checked={edit.tags} onCheck={(v) => setEdit((s) => ({ ...s, tags: v }))} label="タグ">
                <div className="flex gap-2">
                  <Select value={edit.tagsMode} onValueChange={(v) => setEdit((s) => ({ ...s, tagsMode: v as "append" | "replace" }))} disabled={!edit.tags}>
                    <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="append">追加</SelectItem>
                      <SelectItem value="replace">置換</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input value={edit.tagsVal} onChange={(e) => setEdit((s) => ({ ...s, tagsVal: e.target.value }))} placeholder="タグ（カンマ区切り）" disabled={!edit.tags} />
                </div>
              </FieldRow>
            </div>

            {bulkErr && (
              <p className="text-sm text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {bulkErr}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
              <Button
                disabled={!anyFieldEnabled || bulk.isPending}
                onClick={async () => {
                  if ((await confirmAction({ title: `選択中の ${selected.size} 件にチェックした項目を一括適用します。よろしいですか？` }))) bulk.mutate();
                }}
              >
                {bulk.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                {selected.size} 件に適用
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}

function FieldRow({
  checked, onCheck, label, children,
}: { checked: boolean; onCheck: (v: boolean) => void; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <Checkbox checked={checked} onCheckedChange={(v) => onCheck(!!v)} />
        {label}
      </label>
      <div className={checked ? "" : "opacity-50 pointer-events-none"}>{children}</div>
    </div>
  );
}
