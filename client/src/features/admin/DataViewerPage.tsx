import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
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
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface TableInfo {
  name: string;
  count: number;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const TABLE_LABELS: Record<string, string> = {
  users: 'ユーザー',
  customers: '顧客',
  vendors: '仕入先',
  partners: 'パートナー',
  pricing_categories: '料金カテゴリ',
  pricing_items: '料金項目',
  sequences: '自動採番',
  opportunities: 'ヨミ(営業)',
  opportunity_dates: 'ヨミ日程',
  opportunity_simulations: 'シミュレーション',
  project_groups: '案件グループ',
  projects: '案件(番組)',
  episodes: '話数',
  episode_orders: '発注バッチ',
  invoice_groups: '請求グループ',
  invoice_group_episodes: '請求↔話数',
  revenues: '売上',
  purchases: '仕入',
  purchase_allocations: '仕入按分(グループ)',
  purchase_episode_allocations: '仕入按分(話数)',
  sga_expenses: '販管費',
};

const COLUMN_LABELS: Record<string, string> = {
  id: 'ID',
  name: '名前',
  email: 'メール',
  role: '権限',
  short_name: '略称',
  notes: 'メモ',
  address: '住所',
  vendor_type: '種別',
  invoice_registration_number: 'インボイス番号',
  phone: '電話',
  role_title: '役職',
  specialties: '専門分野',
  sort_order: '表示順',
  category_id: 'カテゴリID',
  sub_label: '補足',
  unit_price: '単価',
  calc_type: '計算タイプ',
  seq_name: '採番名',
  prefix: 'プレフィックス',
  year_month: '年月',
  counter: 'カウンター',
  opp_code: 'OPPコード',
  title: '案件名',
  customer_id: '顧客ID',
  project_type: '案件種類',
  project_type_other: '案件種類(その他)',
  stage: 'ステージ',
  expected_amount: '想定金額',
  expected_date: '想定日',
  project_id: '案件ID',
  assigned_to: '担当者',
  opportunity_id: 'ヨミID',
  date_start: '開始日',
  date_end: '終了日',
  label: 'ラベル',
  pricing_item_id: '料金項目ID',
  quantity: '数量',
  days: '日数',
  subtotal: '小計',
  description: '説明',
  gls_number: 'イベントコード',
  group_id: 'グループID',
  rehearsal_start: 'リハ開始',
  rehearsal_end: 'リハ終了',
  event_start: '本番開始',
  event_end: '本番終了',
  status: 'ステータス',
  broadcast_type: '番組種別',
  media_platform: '配信媒体',
  application_form: '申込書',
  logo_permission: 'ロゴ許可',
  episode_number: '話数番号',
  episode_code: 'エピソードコード',
  recording_date: '収録日',
  broadcast_date: '放送日',
  delivery_date: '納品日',
  revenue_budget: '売上高',
  cost_budget: '仕入予算',
  order_date: '発注日',
  episode_count: '発注話数',
  start_episode: '開始話数',
  end_episode: '終了話数',
  invoice_date: '請求日',
  invoice_group_id: '請求グループID',
  episode_id: '話数ID',
  billing_key: '請求KEY',
  tax_category: '税区分',
  amount: '金額',
  recognition_date: '計上日',
  billing_date: '請求予定日',
  payment_due_date: '支払期日',
  vendor_id: '仕入先ID',
  settlement_method: '精算方法',
  settlement_number: '精算番号',
  external_ref_id: '外部参照ID',
  invoice_qualified: 'インボイス',
  inspection_date: '検収日',
  purchase_id: '仕入ID',
  allocated_amount: '按分額',
  vendor_name: '支払先',
  expense_type: '種別',
  amortize_start: '按分開始',
  amortize_end: '按分終了',
  source: '処理元',
  period_start: '期間開始',
  period_end: '期間終了',
  created_at: '作成日',
  updated_at: '更新日',
  created_by: '作成者',
  updated_by: '更新者',
  deleted_at: '削除日',
};

const ID_COLUMNS = ["id", "user_id", "customer_id", "vendor_id", "partner_id", "project_id", "episode_id", "group_id", "opportunity_id", "invoice_group_id", "category_id", "item_id", "order_id", "revenue_id", "purchase_id", "allocation_id", "simulation_id", "created_by", "updated_by"];
const MONEY_COLUMNS = ["amount", "unit_price", "total_amount", "subtotal", "tax_amount", "gross_profit", "price", "cost", "budget", "revenue_amount", "purchase_amount"];

function isIdColumn(col: string): boolean {
  return ID_COLUMNS.includes(col) || col.endsWith("_id");
}

function isMoneyColumn(col: string): boolean {
  return MONEY_COLUMNS.includes(col) || col.endsWith("_amount") || col.endsWith("_price");
}

function formatCell(col: string, value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);

  if (isIdColumn(col)) {
    return str.length > 8 ? str.substring(0, 8) : str;
  }

  if (isMoneyColumn(col)) {
    const num = Number(value);
    if (!isNaN(num)) {
      return `\u00a5${num.toLocaleString()}`;
    }
  }

  return str;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function DataViewerPage() {
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState("rowid");
  const [order, setOrder] = useState<"ASC" | "DESC">("DESC");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

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
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Left sidebar - table list */}
      <div className="w-56 flex-shrink-0 border-r bg-muted/30 overflow-y-auto">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Database className="h-4 w-4" />
            テーブル一覧
          </div>
        </div>
        {tablesLoading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <nav className="p-1">
            {tablesData?.map(table => (
              <button
                key={table.name}
                onClick={() => handleTableSelect(table.name)}
                className={`w-full text-left rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedTable === table.name
                    ? "bg-primary text-white"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <span className="block font-medium truncate">{TABLE_LABELS[table.name] || table.name}</span>
                <span className={`block text-xs truncate ${
                  selectedTable === table.name ? "text-white/70" : "text-muted-foreground"
                }`}>
                  {table.name} ({table.count})
                </span>
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Right content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedTable ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold">
                  {TABLE_LABELS[selectedTable] || selectedTable}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{selectedTable}</span>
                </h2>
                <Badge variant="outline">
                  {selectedTableInfo?.count ?? 0}件
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="検索..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    className="pl-9 w-56"
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
            <div className="flex-1 overflow-auto">
              {dataLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tableData && tableData.data.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {tableData.columns.map(col => (
                          <TableHead
                            key={col}
                            className="cursor-pointer select-none whitespace-nowrap hover:bg-muted/50"
                            onClick={() => handleSort(col)}
                            title={col}
                          >
                            <div className="flex items-center gap-1">
                              {COLUMN_LABELS[col] || col}
                              <ArrowUpDown className={`h-3 w-3 ${sort === col ? "text-primary" : "text-muted-foreground/50"}`} />
                              {sort === col && (
                                <span className="text-xs text-primary">
                                  {order === "ASC" ? "\u2191" : "\u2193"}
                                </span>
                              )}
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableData.data.map((row, ri) => (
                        <TableRow key={ri}>
                          {tableData.columns.map(col => {
                            const raw = row[col];
                            const display = formatCell(col, raw);
                            const fullText = raw !== null && raw !== undefined ? String(raw) : "";
                            const truncated = display.length > 30;
                            return (
                              <TableCell
                                key={col}
                                className={`whitespace-nowrap ${isIdColumn(col) ? "font-mono text-xs" : ""}`}
                                title={truncated ? fullText : undefined}
                              >
                                {truncated ? display.substring(0, 30) + "..." : display}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <Database className="h-10 w-10 mb-2" />
                  <p>データがありません</p>
                </div>
              )}
            </div>

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
    </div>
  );
}
