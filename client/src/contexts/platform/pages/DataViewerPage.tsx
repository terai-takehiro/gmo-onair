/**
 * データビューア（設定 ＞ システム）— **DB の中身をそのまま見る／直す画面**
 *
 * ── 何をする画面か ──────────────────────────────────────────
 *
 * 左のレールで表を選び、右で中身を見る（検索・並べ替え・ページ送り・CSV）。
 * システム管理者だけは1行ずつ直す／消すこともできる（サーバー側も同じ縛り）。
 *
 * ── 何がどこにあるか（1ファイル400行の上限で分けたもの）───────────
 *
 *   `dataViewer/tables.ts`      … どの表がどのアプリのものか・表の日本語名
 *   `dataViewer/columns.ts`     … 列の日本語名・ID/金額列の判定・1マスの文字
 *   `dataViewer/TableList.tsx`  … 左のレール（表の一覧）
 *   `dataViewer/DataTable.tsx`  … 選んだ表の中身
 *   `dataViewer/RowDialogs.tsx` … 1行を直す／消すダイアログ
 *
 * このファイルに残しているのは**状態と通信**（どの表・何ページ目・並び順・
 * 検索語、取得・更新・削除、CSV 出力）だけ。切り出した先は受け取ったものを
 * 描くだけで、**JSX は1文字も変えずに移してある**。
 */
import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/platform/AuthContext";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Database,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { TABLE_LABELS, type TableInfo, type PaginationInfo } from "./dataViewer/tables";
import { TableList } from "./dataViewer/TableList";
import { DataTable } from "./dataViewer/DataTable";
import { RowEditDialog, RowDeleteDialog } from "./dataViewer/RowDialogs";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function DataViewerPage() {
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [selectedTable, setSelectedTable] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState("rowid");
  const [order, setOrder] = useState<"ASC" | "DESC">("DESC");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  // v2.8.0+: 編集ダイアログ / 削除確認ダイアログの状態
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [editFormValues, setEditFormValues] = useState<Record<string, string>>({});
  const [deletingRow, setDeletingRow] = useState<Record<string, unknown> | null>(null);

  // Reset page when table or search changes
  useEffect(() => { setPage(1); }, [selectedTable, debouncedSearch]);

  // Fetch table list
  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ["dv-tables"],
    queryFn: async () => {
      const res = await api.get("/data-viewer/tables");
      return res.data.data as TableInfo[];
    },
  });

  // Auto-select first table
  useEffect(() => {
    if (tablesData && tablesData.length > 0 && !selectedTable) {
      setSelectedTable(tablesData[0].name);
    }
  }, [tablesData, selectedTable]);

  // Fetch table data
  const { data: tableData, isLoading: dataLoading } = useQuery({
    queryKey: ["dv-data", selectedTable, page, sort, order, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        order,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await api.get(`/data-viewer/tables/${selectedTable}?${params}`);
      return res.data as {
        data: Record<string, unknown>[];
        columns: string[];
        pagination: PaginationInfo;
      };
    },
    enabled: !!selectedTable,
  });

  // v2.8.0+: スキーマ取得 (編集可否・型情報を含む)
  const { data: schema } = useQuery({
    queryKey: ["dv-schema", selectedTable],
    queryFn: async () => {
      const res = await api.get(`/data-viewer/tables/${selectedTable}/schema`);
      return res.data.data as Array<{ name: string; type: string; nullable: boolean; editable: boolean }>;
    },
    enabled: !!selectedTable && isSystemAdmin,
  });

  // 削除可能か (deleted_at カラムがあるテーブルのみ論理削除可)
  const canLogicallyDelete = !!schema?.some(c => c.name === 'deleted_at');

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, unknown> }) => {
      return (await api.patch(`/data-viewer/tables/${selectedTable}/rows/${id}`, updates)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dv-data", selectedTable] });
      qc.invalidateQueries({ queryKey: ["dv-tables"] });
      setEditingRow(null);
      setEditFormValues({});
    },
    onError: (err: any) => {
      window.alert(`この行を更新できませんでした。入れた値を確かめて、もう一度お試しください。\n（${err?.response?.data?.error || err.message}）`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/data-viewer/tables/${selectedTable}/rows/${id}`)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dv-data", selectedTable] });
      qc.invalidateQueries({ queryKey: ["dv-tables"] });
      setDeletingRow(null);
    },
    onError: (err: any) => {
      window.alert(`この行を削除できませんでした。時間をおいて、もう一度お試しください。\n（${err?.response?.data?.error || err.message}）`);
    },
  });

  const openEdit = (row: Record<string, unknown>) => {
    const initial: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === null || v === undefined) initial[k] = "";
      else if (v instanceof Date) initial[k] = v.toISOString();
      else initial[k] = String(v);
    }
    setEditFormValues(initial);
    setEditingRow(row);
  };

  const submitEdit = () => {
    if (!editingRow) return;
    const id = editingRow.id as string;
    if (!id) {
      window.alert("id が無いため更新できません");
      return;
    }
    // 編集可能なフィールドかつ元と異なるものだけ送信
    const updates: Record<string, unknown> = {};
    const editableSet = new Set((schema ?? []).filter(c => c.editable).map(c => c.name));
    for (const [k, v] of Object.entries(editFormValues)) {
      if (!editableSet.has(k)) continue;
      const orig = editingRow[k];
      const origStr = orig === null || orig === undefined ? "" : String(orig);
      if (v !== origStr) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      setEditingRow(null);
      return;
    }
    updateMutation.mutate({ id, updates });
  };

  const submitDelete = () => {
    if (!deletingRow) return;
    const id = deletingRow.id as string;
    if (!id) {
      window.alert("id が無いため削除できません");
      return;
    }
    deleteMutation.mutate(id);
  };

  const handleSort = useCallback((col: string) => {
    setSort(prev => {
      if (prev === col) {
        setOrder(o => o === "ASC" ? "DESC" : "ASC");
        return col;
      }
      setOrder("ASC");
      return col;
    });
  }, []);

  const handleExport = async () => {
    if (!selectedTable) return;
    const res = await api.get(`/data-viewer/tables/${selectedTable}/export`, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedTable}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTableSelect = (name: string) => {
    setSelectedTable(name);
    setSort("rowid");
    setOrder("DESC");
    setSearchInput("");
  };

  const selectedTableInfo = tablesData?.find(t => t.name === selectedTable);
  const pagination = tableData?.pagination;

  return (
    <PageTransition>
    <div className="flex flex-col lg:flex-row h-[calc(100vh-3.5rem)] overflow-hidden">
      <TableList
        tablesLoading={tablesLoading} tablesData={tablesData}
        selectedTable={selectedTable} handleTableSelect={handleTableSelect}
      />

      {/* Right content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTable ? (
          <>
            {/* Header */}
            <div className="flex flex-wrap gap-2 items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">
                  {TABLE_LABELS[selectedTable] || selectedTable}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{selectedTable}</span>
                </h2>
                <Badge variant="outline">
                  {selectedTableInfo?.count ?? 0}件
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="検索…"
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    className="pl-9 w-40 sm:w-56"
                  />
                </div>
                <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25件</SelectItem>
                    <SelectItem value="50">50件</SelectItem>
                    <SelectItem value="100">100件</SelectItem>
                    <SelectItem value="200">200件</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="h-4 w-4 mr-1" />
                  CSV
                </Button>
              </div>
            </div>

            {/* Data table */}
            <DataTable
              dataLoading={dataLoading} tableData={tableData} isSystemAdmin={isSystemAdmin}
              sort={sort} order={order} handleSort={handleSort}
              canLogicallyDelete={canLogicallyDelete} openEdit={openEdit}
              setDeletingRow={setDeletingRow} debouncedSearch={debouncedSearch}
            />

            {/* Pagination */}
            {pagination && pagination.totalPages > 0 && (
              <div className="flex items-center justify-between border-t px-4 py-2 text-sm">
                <span className="text-muted-foreground">
                  全 {pagination.total} 件中 {(pagination.page - 1) * pagination.limit + 1}〜
                  {Math.min(pagination.page * pagination.limit, pagination.total)} 件
                  （ページ {pagination.page} / {pagination.totalPages}）
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= (pagination.totalPages || 1)}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Database className="h-12 w-12 mb-3" />
            <p>テーブルを選択してください</p>
          </div>
        )}
      </div>

      {/* v2.8.0+: 行を直す／消すダイアログ（中身は `dataViewer/RowDialogs.tsx`） */}
      <RowEditDialog
        editingRow={editingRow} setEditingRow={setEditingRow}
        editFormValues={editFormValues} setEditFormValues={setEditFormValues}
        selectedTable={selectedTable} schema={schema}
        updateMutation={updateMutation} submitEdit={submitEdit}
      />

      <RowDeleteDialog
        deletingRow={deletingRow} setDeletingRow={setDeletingRow}
        selectedTable={selectedTable}
        deleteMutation={deleteMutation} submitDelete={submitDelete}
      />
    </div>
    </PageTransition>
  );
}
