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
                className={`w-full flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors ${
                  selectedTable === table.name
                    ? "bg-primary text-white"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <span className="truncate">{table.name}</span>
                <Badge
                  variant={selectedTable === table.name ? "secondary" : "outline"}
                  className="ml-1 text-xs tabular-nums"
                >
                  {table.count}
                </Badge>
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
                <h2 className="text-lg font-semibold">{selectedTable}</h2>
                <Badge variant="outline">
                  {selectedTableInfo?.count ?? 0} rows
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
                          >
                            <div className="flex items-center gap-1">
                              {col}
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
