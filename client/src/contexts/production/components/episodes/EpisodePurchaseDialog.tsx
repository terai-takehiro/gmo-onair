import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import {
  Purchase,
  Vendor,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Loader2, Plus, Trash2 } from "lucide-react";

function formatSettlementNo(method: string, number: string): string {
  if (!number || number === "pending") return "未定";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

function generateBillingKeyPreview(
  episodeCode: string,
  taxCategory: string
): string {
  if (!episodeCode) return "";
  const taxSuffix = taxCategory === "tax8" ? "-8" : "-10";
  return `${episodeCode}${taxSuffix}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  episodeId: string;
  episodeCode: string;
}

export default function EpisodePurchaseDialog({
  open,
  onOpenChange,
  projectId,
  episodeId,
  episodeCode,
}: Props) {
  const qc = useQueryClient();

  // Form state
  const [vendorId, setVendorId] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [settlementMethod, setSettlementMethod] = useState<string>("rakuraku");
  const [taxCategory, setTaxCategory] = useState<string>("tax10");
  const [description, setDescription] = useState("");
  const [settlementNumber, setSettlementNumber] = useState("");
  const [settlementNumberPending, setSettlementNumberPending] = useState(false);
  const [invoiceQualified, setInvoiceQualified] = useState<string>("qualified");

  // Billing key preview
  const billingKeyPreview = useMemo(
    () => generateBillingKeyPreview(episodeCode, taxCategory),
    [episodeCode, taxCategory]
  );

  // Fetch existing purchases for this episode
  const { data: purchasesData, isLoading: purchasesLoading } = useQuery({
    queryKey: ["episode-purchases", episodeId],
    queryFn: async () =>
      (await api.get(`/purchases?episode_id=${episodeId}`)).data,
    enabled: open && !!episodeId,
  });
  const purchases: Purchase[] = purchasesData?.data ?? [];

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
    enabled: open,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // Create purchase mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/purchases", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episode-purchases", episodeId] });
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
      // Reset form
      setVendorId("");
      setAmount(0);
      setSettlementMethod("rakuraku");
      setTaxCategory("tax10");
      setDescription("");
      setSettlementNumber("");
      setSettlementNumberPending(false);
      setInvoiceQualified("qualified");
    },
  });

  // Delete purchase mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/purchases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episode-purchases", episodeId] });
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
    },
  });

  const handleSubmit = () => {
    if (!vendorId) return;
    createMutation.mutate({
      project_id: projectId,
      episode_id: episodeId,
      vendor_id: vendorId,
      amount,
      settlement_method: settlementMethod,
      settlement_number: settlementNumberPending
        ? "pending"
        : settlementNumber || null,
      tax_category: taxCategory,
      description,
      invoice_qualified: invoiceQualified === "qualified" ? 1 : 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>仕入管理 - {episodeCode}</DialogTitle>
        </DialogHeader>

        {/* Existing purchases table */}
        {purchasesLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>請求KEY</TableHead>
                <TableHead>仕入先</TableHead>
                <TableHead>説明</TableHead>
                <TableHead>精算No.</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    仕入データなし
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((pur) => (
                  <TableRow key={pur.id}>
                    <TableCell className="font-mono text-xs">
                      {pur.billing_key || "-"}
                    </TableCell>
                    <TableCell>{pur.vendor_name ?? "-"}</TableCell>
                    <TableCell>{pur.description ?? "-"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatSettlementNo(
                        pur.settlement_method ?? "",
                        pur.settlement_number ?? ""
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(pur.amount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm("この仕入を削除しますか？")) {
                            deleteMutation.mutate(pur.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {/* Add purchase form */}
        <div className="space-y-3 border-t pt-4">
          <h4 className="flex items-center gap-1 text-sm font-medium">
            <Plus className="h-4 w-4" />
            仕入追加
          </h4>

          {/* Billing key preview */}
          {billingKeyPreview && (
            <p className="text-xs text-muted-foreground">
              請求KEY: {billingKeyPreview}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>仕入先</Label>
              <SearchableSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name, subLabel: v.vendor_type || '' }))}
                value={vendorId}
                onChange={setVendorId}
                placeholder="仕入先を検索..."
              />
            </div>
            <div className="space-y-1">
              <Label>金額</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  ¥
                </span>
                <Input
                  type="number"
                  min={0}
                  className="pl-7"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>精算方法</Label>
              <Select
                value={settlementMethod}
                onValueChange={setSettlementMethod}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(SettlementMethodLabels) as SettlementMethod[]
                  ).map((key) => (
                    <SelectItem key={key} value={key}>
                      {SettlementMethodLabels[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>税区分</Label>
              <Select value={taxCategory} onValueChange={setTaxCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TaxCategoryLabels) as TaxCategory[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {TaxCategoryLabels[key]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>精算番号</Label>
              <div className="flex items-center gap-2 mb-1">
                <Checkbox
                  checked={settlementNumberPending}
                  onCheckedChange={(checked) => {
                    setSettlementNumberPending(!!checked);
                    if (checked) setSettlementNumber("");
                  }}
                />
                <span className="text-sm text-muted-foreground">未定</span>
              </div>
              <Input
                type="number"
                disabled={settlementNumberPending}
                value={settlementNumber}
                onChange={(e) => setSettlementNumber(e.target.value)}
                placeholder="精算番号"
              />
              {(settlementNumber || settlementNumberPending) && (
                <p className="text-xs text-muted-foreground">
                  表示:{" "}
                  {formatSettlementNo(
                    settlementMethod,
                    settlementNumberPending ? "pending" : settlementNumber
                  )}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>インボイス</Label>
              <Select
                value={invoiceQualified}
                onValueChange={setInvoiceQualified}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="qualified">適格事業者</SelectItem>
                  <SelectItem value="unqualified">非適格事業者</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>説明</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="仕入の説明"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!vendorId || createMutation.isPending}
              onClick={handleSubmit}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              )}
              追加
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
