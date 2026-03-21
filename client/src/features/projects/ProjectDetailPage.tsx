import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Plus, Trash2 } from "lucide-react";

const statusLabel: Record<string, string> = {
  tentative: "仮",
  confirmed: "確定",
  completed: "完了",
  cancelled: "中止",
};

const statusColor: Record<string, string> = {
  tentative: "#f59e0b",
  confirmed: "#005bac",
  completed: "#22c55e",
  cancelled: "#ef4444",
};

interface RevenueForm {
  item_name: string;
  amount: number;
  tax_type: string;
  recording_date: string;
}

interface PurchaseForm {
  item_name: string;
  vendor_id: string;
  amount: number;
  tax_type: string;
  settlement_method: string;
  recording_date: string;
  is_qualified_invoice: boolean;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [revenueDialogOpen, setRevenueDialogOpen] = useState(false);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);

  const { data: project, isLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
  });

  const { data: summary } = useQuery({
    queryKey: ["project-summary", id],
    queryFn: async () => (await api.get(`/projects/${id}/summary`)).data.data,
  });

  const { data: revenuesData } = useQuery({
    queryKey: ["revenues", id],
    queryFn: async () => (await api.get("/revenues", { params: { project_id: id, limit: 100 } })).data,
  });

  const { data: purchasesData } = useQuery({
    queryKey: ["purchases", id],
    queryFn: async () => (await api.get("/purchases", { params: { project_id: id, limit: 100 } })).data,
  });

  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-select"],
    queryFn: async () => (await api.get("/vendors", { params: { limit: 200 } })).data,
  });

  const revenues = revenuesData?.data ?? [];
  const purchases = purchasesData?.data ?? [];
  const vendors = vendorsData?.data ?? [];

  const revenueForm = useForm<RevenueForm>({
    defaultValues: { item_name: "", amount: 0, tax_type: "taxable_10", recording_date: "" },
  });

  const purchaseForm = useForm<PurchaseForm>({
    defaultValues: { item_name: "", vendor_id: "", amount: 0, tax_type: "taxable_10", settlement_method: "bank_transfer", recording_date: "", is_qualified_invoice: true },
  });

  const addRevenueMutation = useMutation({
    mutationFn: async (values: RevenueForm) => {
      return (await api.post("/revenues", { ...values, project_id: id })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues", id] });
      qc.invalidateQueries({ queryKey: ["project-summary", id] });
      setRevenueDialogOpen(false);
      revenueForm.reset();
    },
  });

  const addPurchaseMutation = useMutation({
    mutationFn: async (values: PurchaseForm) => {
      return (await api.post("/purchases", { ...values, project_id: id })).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases", id] });
      qc.invalidateQueries({ queryKey: ["project-summary", id] });
      setPurchaseDialogOpen(false);
      purchaseForm.reset();
    },
  });

  const deleteRevenueMutation = useMutation({
    mutationFn: async (revId: string) => {
      await api.delete(`/revenues/${revId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues", id] });
      qc.invalidateQueries({ queryKey: ["project-summary", id] });
    },
  });

  const deletePurchaseMutation = useMutation({
    mutationFn: async (purId: string) => {
      await api.delete(`/purchases/${purId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases", id] });
      qc.invalidateQueries({ queryKey: ["project-summary", id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return <div className="p-6 text-muted-foreground">案件が見つかりません</div>;
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              <span className="text-primary">{project.gls_number}</span> {project.name}
            </h1>
            <Badge color={statusColor[project.status]}>
              {statusLabel[project.status] || project.status}
            </Badge>
          </div>
          {project.customer_name && (
            <p className="text-sm text-muted-foreground">{project.customer_name}</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="revenue">売上</TabsTrigger>
          <TabsTrigger value="purchase">仕入</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">基本情報</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">本番日</span>
                  <span>{formatDate(project.event_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">リハ日</span>
                  <span>{formatDate(project.rehearsal_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">会場手配</span>
                  <span>{project.venue_arranged ? "済" : "未"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">機材手配</span>
                  <span>{project.equipment_arranged ? "済" : "未"}</span>
                </div>
                {project.notes && (
                  <div className="pt-2">
                    <span className="text-muted-foreground">備考</span>
                    <p className="mt-1 whitespace-pre-wrap">{project.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gross profit summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">損益サマリー</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">売上合計</span>
                      <span className="font-semibold text-green-600">{formatCurrency(summary.total_revenue)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">仕入合計</span>
                      <span className="font-semibold text-red-600">{formatCurrency(summary.total_purchase)}</span>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">粗利</span>
                        <span className="font-bold">{formatCurrency(summary.gross_profit)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">粗利率</span>
                        <span className="font-bold">{formatPercent(summary.gross_margin)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setRevenueDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              追加
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>項目名</TableHead>
                <TableHead>税区分</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>計上日</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    売上データがありません
                  </TableCell>
                </TableRow>
              ) : (
                revenues.map((r: Record<string, unknown>) => (
                  <TableRow key={r.id as string}>
                    <TableCell>{r.item_name as string}</TableCell>
                    <TableCell>{r.tax_type as string}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.amount as number)}</TableCell>
                    <TableCell>{formatDate(r.recording_date as string)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deleteRevenueMutation.mutate(r.id as string)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Revenue Dialog */}
          <Dialog open={revenueDialogOpen} onOpenChange={setRevenueDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>売上追加</DialogTitle>
                <DialogDescription>新しい売上項目を追加します</DialogDescription>
              </DialogHeader>
              <form onSubmit={revenueForm.handleSubmit((v) => addRevenueMutation.mutate(v))} className="space-y-4">
                <div>
                  <Label>項目名</Label>
                  <Input {...revenueForm.register("item_name", { required: true })} />
                </div>
                <div>
                  <Label>金額</Label>
                  <Input type="number" {...revenueForm.register("amount", { required: true, valueAsNumber: true })} />
                </div>
                <div>
                  <Label>税区分</Label>
                  <Select
                    value={revenueForm.watch("tax_type")}
                    onValueChange={(v) => revenueForm.setValue("tax_type", v)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="taxable_10">課税10%</SelectItem>
                      <SelectItem value="taxable_8">課税8%</SelectItem>
                      <SelectItem value="tax_exempt">非課税</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>計上日</Label>
                  <Input type="date" {...revenueForm.register("recording_date", { required: true })} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setRevenueDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button type="submit" disabled={addRevenueMutation.isPending}>
                    {addRevenueMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    追加
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Purchase Tab */}
        <TabsContent value="purchase" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setPurchaseDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              追加
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>項目名</TableHead>
                <TableHead>仕入先</TableHead>
                <TableHead>精算方法</TableHead>
                <TableHead>税区分</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>計上日</TableHead>
                <TableHead>適格</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    仕入データがありません
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((p: Record<string, unknown>) => (
                  <TableRow key={p.id as string}>
                    <TableCell>{p.item_name as string}</TableCell>
                    <TableCell>{(p.vendor_name as string) || "-"}</TableCell>
                    <TableCell>{p.settlement_method as string}</TableCell>
                    <TableCell>{p.tax_type as string}</TableCell>
                    <TableCell className="text-right">{formatCurrency(p.amount as number)}</TableCell>
                    <TableCell>{formatDate(p.recording_date as string)}</TableCell>
                    <TableCell>{p.is_qualified_invoice ? "○" : "×"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => deletePurchaseMutation.mutate(p.id as string)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Purchase Dialog */}
          <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>仕入追加</DialogTitle>
                <DialogDescription>新しい仕入項目を追加します</DialogDescription>
              </DialogHeader>
              <form onSubmit={purchaseForm.handleSubmit((v) => addPurchaseMutation.mutate(v))} className="space-y-4">
                <div>
                  <Label>項目名</Label>
                  <Input {...purchaseForm.register("item_name", { required: true })} />
                </div>
                <div>
                  <Label>仕入先</Label>
                  <Select
                    value={purchaseForm.watch("vendor_id")}
                    onValueChange={(v) => purchaseForm.setValue("vendor_id", v)}
                  >
                    <SelectTrigger><SelectValue placeholder="仕入先を選択" /></SelectTrigger>
                    <SelectContent>
                      {vendors.map((v: { id: string; name: string }) => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>金額</Label>
                  <Input type="number" {...purchaseForm.register("amount", { required: true, valueAsNumber: true })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>税区分</Label>
                    <Select
                      value={purchaseForm.watch("tax_type")}
                      onValueChange={(v) => purchaseForm.setValue("tax_type", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="taxable_10">課税10%</SelectItem>
                        <SelectItem value="taxable_8">課税8%</SelectItem>
                        <SelectItem value="tax_exempt">非課税</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>精算方法</Label>
                    <Select
                      value={purchaseForm.watch("settlement_method")}
                      onValueChange={(v) => purchaseForm.setValue("settlement_method", v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank_transfer">銀行振込</SelectItem>
                        <SelectItem value="cash">現金</SelectItem>
                        <SelectItem value="credit_card">クレジットカード</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>計上日</Label>
                  <Input type="date" {...purchaseForm.register("recording_date", { required: true })} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setPurchaseDialogOpen(false)}>
                    キャンセル
                  </Button>
                  <Button type="submit" disabled={addPurchaseMutation.isPending}>
                    {addPurchaseMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    追加
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
