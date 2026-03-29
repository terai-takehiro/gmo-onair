import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Project,
  ProjectTypeLabels,
  BroadcastTypeLabels,
  MediaPlatformLabels,
  getProjectCategory,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  FileText,
  Download,
} from "lucide-react";

interface RevenueItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Revenue {
  id: string;
  billing_key: string;
  amount: number;
  tax_category: string;
  recognition_date: string | null;
  billing_date: string | null;
  payment_due_date: string | null;
  notes: string | null;
  subtitle: string | null;
  customer_name: string;
  items?: RevenueItem[];
}

interface Props {
  project: Project;
  projectId: string;
  isEstimateMode?: boolean;
}

const taxLabels: Record<string, string> = {
  tax10: "10%課税",
  tax8: "8%課税(軽減)",
  exempt: "非課税",
};

export default function BusinessProjectView({ project, projectId, isEstimateMode }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isCategoryA = getProjectCategory(project.project_type) === "A";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [recognitionDate, setRecognitionDate] = useState("");
  const [billingDate, setBillingDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [items, setItems] = useState<RevenueItem[]>([
    { description: "", quantity: 1, unit_price: 0, amount: 0 },
  ]);

  // Fetch revenues for this project
  const { data: revenuesData, isLoading } = useQuery({
    queryKey: ["revenues-project", projectId],
    queryFn: async () =>
      (await api.get("/revenues", { params: { project_id: projectId, limit: 100 } })).data,
  });
  const revenues: Revenue[] = revenuesData?.data ?? [];

  // Fetch project summary
  const { data: summaryData } = useQuery({
    queryKey: ["project-summary", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/summary`)).data,
  });
  const summary = summaryData?.data;

  // Create/Update revenue
  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingId) {
        return (await api.put(`/revenues/${editingId}`, data)).data;
      }
      return (await api.post("/revenues", data)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      closeDialog();
    },
  });

  // Delete revenue
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/revenues/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-project", projectId] });
      qc.invalidateQueries({ queryKey: ["project-summary", projectId] });
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
    },
  });

  const handleDownloadPdf = async (revenueId: string) => {
    try {
      const res = await api.get(`/revenues/${revenueId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename\*=UTF-8''(.+)/);
      a.download = match ? decodeURIComponent(match[1]) : 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF生成に失敗しました');
    }
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setTaxCategory("tax10");
    setRecognitionDate("");
    setBillingDate("");
    setPaymentDueDate("");
    setNotes("");
    setSubtitle("");
    setItems([{ description: "", quantity: 1, unit_price: 0, amount: 0 }]);
  };

  const openNew = () => {
    closeDialog();
    setDialogOpen(true);
  };

  const openEdit = async (rev: Revenue) => {
    setEditingId(rev.id);
    setTaxCategory(rev.tax_category || "tax10");
    setRecognitionDate(rev.recognition_date || "");
    setBillingDate(rev.billing_date || "");
    setPaymentDueDate(rev.payment_due_date || "");
    setNotes(rev.notes || "");
    setSubtitle(rev.subtitle || "");
    // Fetch detail with items
    try {
      const res = await api.get(`/revenues/${rev.id}`);
      const detail = res.data.data;
      if (detail.items && detail.items.length > 0) {
        setItems(
          detail.items.map((it: any) => ({
            description: it.description,
            quantity: it.quantity,
            unit_price: it.unit_price,
            amount: it.amount,
          }))
        );
      } else {
        setItems([
          {
            description: "",
            quantity: 1,
            unit_price: rev.amount,
            amount: rev.amount,
          },
        ]);
      }
    } catch {
      setItems([
        {
          description: "",
          quantity: 1,
          unit_price: rev.amount,
          amount: rev.amount,
        },
      ]);
    }
    setDialogOpen(true);
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_price") {
          updated.amount = (updated.quantity || 0) * (updated.unit_price || 0);
        }
        return updated;
      })
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { description: "", quantity: 1, unit_price: 0, amount: 0 },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((s, it) => s + (it.amount || 0), 0);

  const handleSubmit = () => {
    saveMutation.mutate({
      project_id: projectId,
      customer_id: project.customer_id,
      tax_category: taxCategory,
      amount: totalAmount,
      recognition_date: recognitionDate || null,
      billing_date: billingDate || null,
      payment_due_date: paymentDueDate || null,
      notes: notes || null,
      subtitle: subtitle || null,
      items: items.filter((it) => it.description),
      ...(isEstimateMode ? { status: 'estimate' } : {}),
    });
  };

  return (
    <div className="space-y-4 lg:space-y-6 p-3 lg:p-6">
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() =>
            isEstimateMode
              ? navigate(`/projects/${projectId}`)
              : navigate(
                  isCategoryA
                    ? "/projects/confirmed/studio"
                    : "/projects/confirmed/business"
                )
          }
        >
          <ArrowLeft className="h-4 w-4" />
          {isEstimateMode ? "案件に戻る" : "確定案件一覧"}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-bold">
            {project.gls_number && (
              <span className="font-mono text-primary">
                {project.gls_number}{" "}
              </span>
            )}
            {project.name}
          </h1>
          {isEstimateMode && (
            <Badge className="bg-orange-500 text-white">概算見積</Badge>
          )}
          {isCategoryA && project.broadcast_type && (
            <Badge color="#005bac">
              {BroadcastTypeLabels[
                project.broadcast_type as keyof typeof BroadcastTypeLabels
              ] ?? project.broadcast_type}
            </Badge>
          )}
          {isCategoryA && project.media_platform && (
            <Badge variant="outline">
              {MediaPlatformLabels[
                project.media_platform as keyof typeof MediaPlatformLabels
              ] ?? project.media_platform}
            </Badge>
          )}
          {!isCategoryA && (
            <Badge variant="outline">
              {ProjectTypeLabels[
                project.project_type as keyof typeof ProjectTypeLabels
              ] || project.project_type}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {(project as any).customer_name}
        </p>
      </div>

      {/* Estimate mode info banner */}
      {isEstimateMode && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            概算見積の作成モードです。ここで作成した見積はGLS発番時に自動で確定売上に変換されます。
          </span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              売上高計
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <p className="text-lg font-bold font-number">
              {formatCurrency(summary?.total_revenue ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              仕入実績計
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <p className="text-lg font-bold font-number">
              {formatCurrency(summary?.total_purchase ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-normal text-muted-foreground">
              粗利(実績)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-4">
            <p className="text-lg font-bold font-number">
              {formatCurrency(summary?.gross_profit ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue List = 見積/売上明細 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {isEstimateMode ? "概算見積書" : "見積・売上明細"}
          </h2>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />
            {isEstimateMode ? "見積追加" : "明細追加"}
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : revenues.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              売上明細がありません。「明細追加」から見積構成を作成してください。
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {revenues.map((rev) => (
              <Card key={rev.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">
                          {rev.billing_key}
                        </span>
                        {rev.subtitle && (
                          <span className="text-sm font-medium">{rev.subtitle}</span>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {taxLabels[rev.tax_category] || rev.tax_category}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {rev.recognition_date && (
                          <span>計上日: {formatDate(rev.recognition_date)}</span>
                        )}
                        {rev.billing_date && (
                          <span>請求日: {formatDate(rev.billing_date)}</span>
                        )}
                        {rev.payment_due_date && (
                          <span>支払期日: {formatDate(rev.payment_due_date)}</span>
                        )}
                      </div>
                      {rev.notes && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">
                          {rev.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="font-number text-lg font-bold mr-2">
                        {formatCurrency(rev.amount)}
                      </span>
                      {rev.items && rev.items.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="PDF出力"
                          onClick={() => handleDownloadPdf(rev.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(rev)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          if (confirm("この明細を削除しますか？"))
                            deleteMutation.mutate(rev.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {/* 明細項目の展開表示 */}
                  {rev.items && rev.items.length > 0 && (
                    <div className="mt-3 border-t pt-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left font-normal pb-1">項目</th>
                            <th className="text-right font-normal pb-1 w-16">数量</th>
                            <th className="text-right font-normal pb-1 w-24">単価</th>
                            <th className="text-right font-normal pb-1 w-24">金額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rev.items.map((item, idx) => (
                            <tr key={idx} className="border-t border-dashed">
                              <td className="py-1">{item.description}</td>
                              <td className="py-1 text-right font-number">{item.quantity}</td>
                              <td className="py-1 text-right font-number">{formatCurrency(item.unit_price)}</td>
                              <td className="py-1 text-right font-number font-medium">{formatCurrency(item.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 明細追加/編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEstimateMode
                ? (editingId ? "概算見積の編集" : "概算見積の追加")
                : (editingId ? "売上明細の編集" : "売上明細の追加")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Subtitle (A-type only) */}
            {isCategoryA && (
              <div>
                <Label>番号ラベル（小見出し）</Label>
                <Input
                  placeholder="例: 2025年株主総会"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  この番号が何を表すかのラベル（番組名・イベント年度など）
                </p>
              </div>
            )}

            {/* Line Items */}
            <div>
              <Label className="text-sm font-semibold">明細項目</Label>
              <div className="mt-2 space-y-2">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        項目 {idx + 1}
                      </span>
                      {items.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input
                      placeholder="項目名（例: コンサルティング費用）"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(idx, "description", e.target.value)
                      }
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-[10px]">数量</Label>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              idx,
                              "quantity",
                              parseInt(e.target.value) || 0
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">単価</Label>
                        <CurrencyInput
                          value={item.unit_price}
                          onChange={(v) =>
                            updateItem(idx, "unit_price", v)
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">金額</Label>
                        <p className="h-9 flex items-center font-number font-medium text-sm">
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={addItem}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  項目追加
                </Button>
              </div>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm font-medium">合計金額</span>
              <span className="text-lg font-bold font-number">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            {/* Tax & Dates */}
            <div className={`grid gap-3 ${isEstimateMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
              <div>
                <Label>税区分</Label>
                <Select value={taxCategory} onValueChange={setTaxCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tax10">10%課税</SelectItem>
                    <SelectItem value="tax8">8%課税(軽減)</SelectItem>
                    <SelectItem value="exempt">非課税</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!isEstimateMode && (
                <>
                  <div>
                    <Label>計上日</Label>
                    <Input
                      type="date"
                      value={recognitionDate}
                      onChange={(e) => setRecognitionDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>請求日</Label>
                    <Input
                      type="date"
                      value={billingDate}
                      onChange={(e) => setBillingDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>支払期日</Label>
                    <Input
                      type="date"
                      value={paymentDueDate}
                      onChange={(e) => setPaymentDueDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Notes */}
            <div>
              <Label>メモ</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="備考など"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                saveMutation.isPending ||
                items.filter((it) => it.description).length === 0
              }
            >
              {saveMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingId ? "更新" : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
