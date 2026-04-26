/**
 * PurchaseListPage — Phase 2A 移行 (v2.6.4)
 * useCrudPage / FilterBar / Pagination の shared プリミティブを使用。
 * 列リサイズ + ダイアログ内の多数の useState フィールドは既存のまま維持。
 */
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { FilterBar } from "@gmo-onair/shared/src/client/ui/filter-bar";
import { Pagination } from "@gmo-onair/shared/src/client/ui/pagination";
import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import api from "@/lib/api";
import { formatCurrency, formatMonth, localDateStr } from "@/lib/format";
import { useCrudPage } from "@/hooks/useCrudPage";
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
import { Loader2, Plus, Trash2 } from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

function SettlementBadge({ number }: { number: string | null | undefined }) {
  const isApplied = !!number && number !== "pending";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        isApplied ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
      }`}
    >
      {isApplied ? "申請済" : "未申請"}
    </span>
  );
}

function formatSettlementNo(method: string, number: string): string {
  if (!number || number === "pending") return "";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

interface PurchaseRow {
  id: string;
  billing_key: string | null;
  project_id: string | null;
  project_name: string | null;
  gls_number: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  description: string | null;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  group_id: string | null;
  group_name: string | null;
  settlement_method: string | null;
  settlement_number: string | null;
  is_provisional: boolean;
  invoice_qualified: number | boolean | null;
}

interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
}

export default function PurchaseListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const filterProjectId = searchParams.get("project_id") || "";
  const filterProjectName = searchParams.get("project_name") || "";
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const crud = useCrudPage<PurchaseRow>({
    endpoint: "/purchases",
    queryKey: ["purchases-all"],
    extraParams: { project_id: filterProjectId || undefined },
  });

  // Dialog form state — フィールドが多く form ライブラリ未使用なので個別 useState を維持
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [settlementMethod, setSettlementMethod] = useState("rakuraku");
  const [settlementNumber, setSettlementNumber] = useState("");
  const [invoiceQualified, setInvoiceQualified] = useState("qualified");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [serviceCompletedDate, setServiceCompletedDate] = useState("");
  const [recognitionMonth, setRecognitionMonth] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [isProvisional, setIsProvisional] = useState(false);

  // editingItem 同期
  useEffect(() => {
    if (crud.editingItem) {
      const p = crud.editingItem;
      setSelectedProjectId(p.project_id || "");
      setVendorId(p.vendor_id || "");
      setTaxCategory(p.tax_category || "tax10");
      setSettlementMethod(p.settlement_method || "rakuraku");
      setSettlementNumber(
        p.settlement_number && p.settlement_number !== "pending" ? p.settlement_number : "",
      );
      setInvoiceQualified(p.invoice_qualified ? "qualified" : "unqualified");
      setAmount(p.amount || 0);
      setDescription(p.description || "");
      setNotes(p.notes || "");
      setServiceCompletedDate("");
      setRecognitionMonth(p.recognition_date ? p.recognition_date.slice(0, 7) : "");
      setPaymentDueDate(p.payment_due_date ? p.payment_due_date.slice(0, 10) : "");
      setIsProvisional(!!p.is_provisional);
    } else {
      setSelectedProjectId("");
      setVendorId("");
      setTaxCategory("tax10");
      setSettlementMethod("rakuraku");
      setSettlementNumber("");
      setInvoiceQualified("qualified");
      setAmount(0);
      setDescription("");
      setNotes("");
      setServiceCompletedDate("");
      setRecognitionMonth("");
      setPaymentDueDate("");
      setIsProvisional(false);
    }
  }, [crud.editingItem]);

  const startResize = useCallback((col: string, e: React.MouseEvent, currentWidth: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { col, startX: e.clientX, startW: currentWidth };
    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const newW = Math.max(60, resizeRef.current.startW + ev.clientX - resizeRef.current.startX);
      setColWidths((prev) => ({ ...prev, [resizeRef.current!.col]: newW }));
    };
    const onMouseUp = () => {
      resizeRef.current = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const { data: glsProjectsData } = useQuery({
    queryKey: ["gls-projects-for-purchase"],
    queryFn: async () => (await api.get("/projects/gls-projects")).data,
    enabled: crud.dialogOpen,
  });
  const glsProjects: ProjectOption[] = glsProjectsData?.data ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
    enabled: crud.dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  const handleDelete = () => {
    if (!crud.editingItem) return;
    if (!window.confirm("この仕入を削除しますか？この操作は元に戻せません。")) return;
    crud.remove.mutate(crud.editingItem.id, {
      onSuccess: () => crud.closeDialog(),
    });
  };

  const handleSubmit = () => {
    if (!selectedProjectId || !vendorId) return;
    crud.save.mutate({
      project_id: selectedProjectId,
      vendor_id: vendorId,
      tax_category: taxCategory,
      settlement_method: settlementMethod,
      settlement_number: settlementNumber || null,
      invoice_qualified: invoiceQualified === "qualified" ? 1 : 0,
      amount,
      description: description || null,
      notes: notes || null,
      service_completed_date: serviceCompletedDate || null,
      recognition_date: recognitionMonth ? `${recognitionMonth}-01` : null,
      payment_due_date: paymentDueDate || null,
      is_provisional: isProvisional,
    });
  };

  return (
    <PageTransition>
      <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold">仕入一覧</h1>
            {filterProjectId && filterProjectName && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">
                  絞り込み:{" "}
                  <span className="font-medium text-foreground">{filterProjectName}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  onClick={() => navigate("/budget/purchases")}
                >
                  解除
                </Button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <ExcelToolbar
              resource="/purchases"
              name="仕入"
              queryKey={["purchases"]}
              hasDuplicateKey={false}
            />
            <Button variant="outline" onClick={() => navigate("/project-groups")}>
              按分グループ
            </Button>
            <Button onClick={crud.openAdd}>
              <Plus className="mr-1 h-4 w-4" />
              新規仕入
            </Button>
          </div>
        </div>
        {filterProjectId && (
          <ProjectQuickLinks
            projectId={filterProjectId}
            projectName={filterProjectName}
            currentPage="purchases"
          />
        )}

        <FilterBar
          search={crud.search}
          onSearchChange={crud.setSearch}
          searchPlaceholder="GLS番号・案件名・仕入先で検索..."
          layout="inline"
        />

        {crud.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : crud.items.length === 0 ? (
          <EmptyState title="データがありません" />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="space-y-2 lg:hidden">
              {crud.items.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => crud.openEdit(p)}
                  role="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs">{p.gls_number || "-"}</span>
                        <SettlementBadge number={p.settlement_number} />
                        {p.group_name && (
                          <Badge variant="outline" className="text-xs">
                            按分
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm mt-1 truncate">
                        {p.description || p.project_name || "-"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.vendor_name || "-"}
                        {p.recognition_date && ` / ${formatMonth(p.recognition_date)}`}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-medium font-number">{formatCurrency(p.amount)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <Table className={Object.keys(colWidths).length > 0 ? "table-fixed" : ""}>
                <TableHeader>
                  <TableRow>
                    {(
                      [
                        { key: "gls", label: "GLS番号", defaultW: 100 },
                        { key: "project", label: "案件名", defaultW: 180 },
                        { key: "vendor", label: "仕入先", defaultW: 130 },
                        { key: "desc", label: "説明", defaultW: 180 },
                        { key: "settlement", label: "精算", defaultW: 90 },
                        { key: "tax", label: "税区分", defaultW: 80 },
                        { key: "amount", label: "金額", defaultW: 100, align: "right" },
                        { key: "recognition", label: "計上月", defaultW: 90 },
                        { key: "invoice", label: "適格", defaultW: 50 },
                      ] as { key: string; label: string; defaultW: number; align?: string }[]
                    ).map(({ key, label, defaultW, align }) => {
                      const w =
                        colWidths[key] ??
                        (Object.keys(colWidths).length > 0 ? defaultW : undefined);
                      return (
                        <TableHead
                          key={key}
                          style={w ? { width: w, minWidth: 40 } : undefined}
                          className={`select-none whitespace-nowrap relative${
                            align === "right" ? " text-right" : ""
                          }`}
                        >
                          {label}
                          <span
                            className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize opacity-0 hover:opacity-100 hover:bg-primary/40 select-none"
                            onMouseDown={(e) =>
                              startResize(key, e, colWidths[key] ?? defaultW)
                            }
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crud.items.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => crud.openEdit(p)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-sm">{p.gls_number || "-"}</span>
                          {p.group_name && (
                            <Badge variant="outline" className="text-xs">
                              按分
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {p.project_name || "-"}
                      </TableCell>
                      <TableCell>{p.vendor_name || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {p.description || "-"}
                      </TableCell>
                      <TableCell>
                        <SettlementBadge number={p.settlement_number} />
                        {p.settlement_number && p.settlement_number !== "pending" && (
                          <span className="ml-1 font-mono text-xs text-muted-foreground">
                            {formatSettlementNo(
                              p.settlement_method ?? "",
                              p.settlement_number ?? "",
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {TaxCategoryLabels[p.tax_category as TaxCategory] ?? p.tax_category}
                      </TableCell>
                      <TableCell className="text-right font-medium font-number">
                        {formatCurrency(p.amount)}
                      </TableCell>
                      <TableCell>{formatMonth(p.recognition_date)}</TableCell>
                      <TableCell>{p.invoice_qualified ? "○" : "×"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        <Pagination
          page={crud.page}
          totalPages={crud.pagination?.totalPages ?? 1}
          total={crud.pagination?.total ?? 0}
          onChange={crud.setPage}
          disabled={crud.isLoading}
        />

        {/* Purchase Dialog (新規 / 編集兼用) */}
        <Dialog
          open={crud.dialogOpen}
          onOpenChange={(v) => {
            if (!v) crud.closeDialog();
            else crud.setDialogOpen(v);
          }}
        >
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{crud.isEditing ? "仕入編集" : "新規仕入登録"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
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

              <div>
                <Label>仕入先 *</Label>
                <SearchableSelect
                  options={vendors.map((v) => ({
                    value: v.id,
                    label: v.name,
                    subLabel: v.vendor_type || "",
                  }))}
                  value={vendorId}
                  onChange={setVendorId}
                  placeholder="仕入先を検索..."
                />
              </div>

              <div>
                <Label>金額</Label>
                <CurrencyInput value={amount} onChange={setAmount} />
              </div>

              <div>
                <Label>説明</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="仕入の説明"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="is-provisional"
                  checked={isProvisional}
                  onCheckedChange={(v) => setIsProvisional(!!v)}
                />
                <Label htmlFor="is-provisional" className="cursor-pointer">
                  仮（確定前の見込み仕入）
                </Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>税区分</Label>
                  <Select value={taxCategory} onValueChange={setTaxCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map((key) => (
                        <SelectItem key={key} value={key}>
                          {TaxCategoryLabels[key]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>精算方法</Label>
                  <Select value={settlementMethod} onValueChange={setSettlementMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(SettlementMethodLabels) as SettlementMethod[]).map(
                        (key) => (
                          <SelectItem key={key} value={key}>
                            {SettlementMethodLabels[key]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div>
                  <Label>役務提供完了日</Label>
                  <Input
                    type="date"
                    value={serviceCompletedDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setServiceCompletedDate(val);
                      if (val) {
                        const [y, m] = val.split("-").map(Number);
                        setRecognitionMonth(`${y}-${String(m).padStart(2, "0")}`);
                        setPaymentDueDate(localDateStr(new Date(y, m + 1, 0)));
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-0.5">
                    入力すると計上月（当月）・支払予定日（翌月末）を自動入力します
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>計上月</Label>
                    <Input
                      type="month"
                      value={recognitionMonth}
                      onChange={(e) => setRecognitionMonth(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>支払予定日</Label>
                    <Input
                      type="date"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>精算番号</Label>
                  <Input
                    value={settlementNumber}
                    onChange={(e) => setSettlementNumber(e.target.value)}
                    placeholder="任意"
                  />
                </div>
              </div>

              <div>
                <Label>インボイス</Label>
                <Select value={invoiceQualified} onValueChange={setInvoiceQualified}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualified">適格事業者</SelectItem>
                    <SelectItem value="unqualified">非適格事業者</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>備考</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="任意"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter className="flex sm:justify-between gap-2">
              <div>
                {crud.isEditing && (
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={crud.remove.isPending}
                  >
                    {crud.remove.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 h-4 w-4" />
                    )}
                    削除
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={crud.closeDialog}>
                  キャンセル
                </Button>
                <Button
                  disabled={!selectedProjectId || !vendorId || crud.save.isPending}
                  onClick={handleSubmit}
                >
                  {crud.save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {crud.isEditing ? "更新" : "登録"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
