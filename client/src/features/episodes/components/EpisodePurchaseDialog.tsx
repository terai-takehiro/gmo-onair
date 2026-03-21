import { useState } from "react";
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";

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
      tax_category: taxCategory,
      description,
      invoice_qualified: 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
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
                <TableHead>仕入先</TableHead>
                <TableHead>説明</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    仕入データなし
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((pur) => (
                  <TableRow key={pur.id}>
                    <TableCell>{pur.vendor_name ?? "-"}</TableCell>
                    <TableCell>{pur.description ?? "-"}</TableCell>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>仕入先</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
