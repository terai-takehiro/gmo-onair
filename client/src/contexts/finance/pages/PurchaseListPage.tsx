import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import {
  Vendor,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from "@/types";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Search, Loader2, Plus } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

function SettlementBadge({ number }: { number: string | null | undefined }) {
  const isApplied = !!number && number !== "pending";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
      isApplied ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
    }`}>
      {isApplied ? '申請済' : '未申請'}
    </span>
  );
}

function formatSettlementNo(method: string, number: string): string {
  if (!number || number === "pending") return "";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
}

export default function PurchaseListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [settlementMethod, setSettlementMethod] = useState("rakuraku");
  const [settlementNumber, setSettlementNumber] = useState("");
  const [invoiceQualified, setInvoiceQualified] = useState("qualified");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [serviceCompletedDate, setServiceCompletedDate] = useState("");
  const [recognitionDate, setRecognitionDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["purchases-all", page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      return (await api.get("/purchases", { params })).data;
    },
  });

  const purchases = data?.data ?? [];
  const pagination = data?.pagination;

  // GLS案件一覧（ダイアログ用）
  const { data: glsProjectsData } = useQuery({
    queryKey: ["gls-projects-for-purchase"],
    queryFn: async () => (await api.get("/projects/gls-projects")).data,
    enabled: dialogOpen,
  });
  const glsProjects: ProjectOption[] = glsProjectsData?.data ?? [];

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
    enabled: dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // 役務提供完了日 → 計上日（当月末）・支払予定日（翌月末）を自動計算
  useEffect(() => {
    if (!serviceCompletedDate) return;
    const d = new Date(serviceCompletedDate);
    const lastOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
    const nextMonthLast = new Date(d.getFullYear(), d.getMonth() + 2, 0).toISOString().split("T")[0];
    setRecognitionDate(lastOfMonth);
    setPaymentDueDate(nextMonthLast);
  }, [serviceCompletedDate]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/purchases", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases-all"] });
      handleCloseDialog();
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setSelectedProjectId("");
    setVendorId("");
    setTaxCategory("tax10");
    setSettlementMethod("rakuraku");
    setSettlementNumber("");
    setInvoiceQualified("qualified");
    setAmount(0);
    setDescription("");
    setServiceCompletedDate("");
    setRecognitionDate("");
    setPaymentDueDate("");
    setIsProvisional(false);
  };

  const handleCreateSubmit = () => {
    if (!selectedProjectId || !vendorId) return;
    createMutation.mutate({
      project_id: selectedProjectId,
      vendor_id: vendorId,
      tax_category: taxCategory,
      settlement_method: settlementMethod,
      settlement_number: settlementNumber || null,
      invoice_qualified: invoiceQualified === "qualified" ? 1 : 0,
      amount,
      description: description || null,
      service_completed_date: serviceCompletedDate || null,
      recognition_date: recognitionDate || null,
      payment_due_date: paymentDueDate || null,
      is_provisional: isProvisional,
    });
  };

  return (
    <PageTransition>
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <h1 className="text-xl lg:text-2xl font-bold">仕入一覧</h1>
        <div className="flex flex-wrap gap-2">
          <ExcelToolbar resource="/purchases" name="仕入" queryKey={["purchases"]} hasDuplicateKey={false} />
          <Button variant="outline" onClick={() => navigate("/project-groups")}>
            按分グループ
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新規仕入
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="GLS番号・案件名・仕入先で検索..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {purchases.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">データがありません</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="space-y-2 lg:hidden">
                {purchases.map((p: Record<string, unknown>) => (
                  <div
                    key={p.id as string}
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                    onClick={() => p.project_id && navigate(`/sales/projects/${p.project_id}/episodes`)}
                    role={p.project_id ? "button" : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs">{(p.gls_number as string) || "-"}</span>
                          <SettlementBadge number={p.settlement_number as string | null} />
                          {(p.group_name as string) && (
                            <Badge variant="outline" className="text-xs">按分</Badge>
                          )}
                        </div>
                        <div className="text-sm mt-1 truncate">{(p.description as string) || (p.project_name as string) || "-"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(p.vendor_name as string) || "-"}
                          {(p.recognition_date as string) && ` / ${formatDate(p.recognition_date as string)}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-medium font-number">{formatCurrency(p.amount as number)}</div>
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
                    <TableHead>GLS番号</TableHead>
                    <TableHead>案件名</TableHead>
                    <TableHead>仕入先</TableHead>
                    <TableHead>説明</TableHead>
                    <TableHead>精算</TableHead>
                    <TableHead>税区分</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>計上日</TableHead>
                    <TableHead>適格</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p: Record<string, unknown>) => (
                    <TableRow key={p.id as string}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {p.project_id ? (
                            <button
                              className="font-mono text-sm font-medium text-primary hover:underline"
                              onClick={() => navigate(`/sales/projects/${p.project_id}/episodes`)}
                            >
                              {(p.gls_number as string) || "-"}
                            </button>
                          ) : (
                            <span className="font-mono text-sm">{(p.gls_number as string) || "-"}</span>
                          )}
                          {(p.group_name as string) && (
                            <Badge variant="outline" className="text-xs">按分</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {(p.project_name as string) || "-"}
                      </TableCell>
                      <TableCell>{(p.vendor_name as string) || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {(p.description as string) || "-"}
                      </TableCell>
                      <TableCell>
                        <SettlementBadge number={p.settlement_number as string | null} />
                        {(p.settlement_number as string) && (p.settlement_number as string) !== "pending" && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            {formatSettlementNo((p.settlement_method as string) ?? "", (p.settlement_number as string) ?? "")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {TaxCategoryLabels[p.tax_category as TaxCategory] ?? (p.tax_category as string)}
                      </TableCell>
                      <TableCell className="text-right font-medium font-number">
                        {formatCurrency(p.amount as number)}
                      </TableCell>
                      <TableCell>{formatDate(p.recognition_date as string)}</TableCell>
                      <TableCell>{p.invoice_qualified ? "○" : "×"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(pagination.page * pagination.limit, pagination.total)}件
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  前へ
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Purchase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規仕入登録</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* 案件選択 */}
            <div>
              <Label>案件 *</Label>
              <SearchableSelect
                options={glsProjects.map((p) => ({
                  value: p.id,
                  label: `${p.gls_number} ${p.name}`,
                }))}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                placeholder="GLS番号で検索..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                複数案件への按分は「按分グループ」から登録してください
              </p>
            </div>

            {/* Vendor */}
            <div>
              <Label>仕入先 *</Label>
              <SearchableSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
                value={vendorId}
                onChange={setVendorId}
                placeholder="仕入先を検索..."
              />
            </div>

            {/* Amount */}
            <div>
              <Label>金額</Label>
              <CurrencyInput value={amount} onChange={setAmount} />
            </div>

            {/* Description */}
            <div>
              <Label>説明</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="仕入の説明"
                rows={3}
              />
            </div>

            {/* 仮チェックボックス */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-provisional"
                checked={isProvisional}
                onCheckedChange={(v) => setIsProvisional(!!v)}
              />
              <Label htmlFor="is-provisional" className="cursor-pointer">仮（確定前の見込み仕入）</Label>
            </div>

            {/* Tax + Settlement */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>税区分</Label>
                <Select value={taxCategory} onValueChange={setTaxCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                      <SelectItem key={key} value={key}>{TaxCategoryLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>精算方法</Label>
                <Select value={settlementMethod} onValueChange={setSettlementMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map((key) => (
                      <SelectItem key={key} value={key}>{SettlementMethodLabels[key]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 役務提供完了日 → 計上日・支払予定日を自動入力 */}
            <div className="space-y-3 rounded-md border p-3">
              <div>
                <Label>役務提供完了日</Label>
                <Input
                  type="date"
                  value={serviceCompletedDate}
                  onChange={(e) => setServiceCompletedDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-0.5">入力すると計上日（当月末）・支払予定日（翌月末）を自動入力します</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>計上日</Label>
                  <Input type="date" value={recognitionDate} onChange={(e) => setRecognitionDate(e.target.value)} />
                </div>
                <div>
                  <Label>支払予定日</Label>
                  <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>精算番号</Label>
                <Input value={settlementNumber} onChange={(e) => setSettlementNumber(e.target.value)} placeholder="任意" />
              </div>
            </div>

            <div>
              <Label>インボイス</Label>
              <Select value={invoiceQualified} onValueChange={setInvoiceQualified}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">適格事業者</SelectItem>
                  <SelectItem value="unqualified">非適格事業者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>キャンセル</Button>
            <Button
              disabled={!selectedProjectId || !vendorId || createMutation.isPending}
              onClick={handleCreateSubmit}
            >
              {createMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
