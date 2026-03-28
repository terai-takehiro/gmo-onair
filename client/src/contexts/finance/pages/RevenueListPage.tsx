import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search, Loader2, Plus } from "lucide-react";

interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
  customer_id: string;
  customer_name?: string;
}

interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
}

export default function RevenueListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeId, setSelectedEpisodeId] = useState("");
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [amount, setAmount] = useState<number>(0);
  const [recognitionDate, setRecognitionDate] = useState("");
  const [billingDate, setBillingDate] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["revenues-all", page, search],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (search) params.search = search;
      return (await api.get("/revenues", { params })).data;
    },
  });

  const revenues = data?.data ?? [];
  const pagination = data?.pagination;

  // Search projects for dialog
  const { data: projectsData } = useQuery({
    queryKey: ["projects-search", projectSearch],
    queryFn: async () =>
      (
        await api.get("/projects", {
          params: { search: projectSearch, limit: 20 },
        })
      ).data,
    enabled: dialogOpen && projectSearch.length > 0,
  });
  const projects: ProjectOption[] = projectsData?.data ?? [];

  // Fetch episodes for selected project
  const { data: episodesData } = useQuery({
    queryKey: ["project-episodes", selectedProjectId],
    queryFn: async () =>
      (await api.get(`/projects/${selectedProjectId}/episodes?limit=100`)).data,
    enabled: dialogOpen && !!selectedProjectId,
  });
  const episodes: EpisodeOption[] = episodesData?.data ?? [];

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Billing key preview
  const billingKeyPreview = useMemo(() => {
    const ep = episodes.find((e) => e.id === selectedEpisodeId);
    if (!ep) return "";
    const taxSuffix = taxCategory === "tax8" ? "-8" : "-10";
    return `${ep.episode_code}${taxSuffix}`;
  }, [selectedEpisodeId, taxCategory, episodes]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post("/revenues", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenues-all"] });
      handleCloseDialog();
    },
  });

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setProjectSearch("");
    setSelectedProjectId("");
    setSelectedEpisodeId("");
    setTaxCategory("tax10");
    setAmount(0);
    setRecognitionDate("");
    setBillingDate("");
    setPaymentDueDate("");
    setNotes("");
  };

  const handleCreateSubmit = () => {
    if (!selectedProjectId || !selectedEpisodeId) return;
    createMutation.mutate({
      project_id: selectedProjectId,
      episode_id: selectedEpisodeId,
      customer_id: selectedProject?.customer_id ?? null,
      tax_category: taxCategory,
      amount,
      recognition_date: recognitionDate || null,
      billing_date: billingDate || null,
      payment_due_date: paymentDueDate || null,
      notes: notes || null,
    });
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">売上一覧</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新規売上
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="イベントコード・案件名・顧客名で検索..."
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>請求KEY</TableHead>
                <TableHead>イベントコード</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>顧客</TableHead>
                <TableHead>税区分</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>計上日</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenues.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                revenues.map((r: Record<string, unknown>) => (
                  <TableRow key={r.id as string}>
                    <TableCell className="font-mono text-xs">
                      {(r.billing_key as string) || "-"}
                    </TableCell>
                    <TableCell>
                      {r.project_id ? (
                        <button
                          className="font-mono text-sm font-medium text-primary hover:underline"
                          onClick={() => navigate(`/projects/${r.project_id}/episodes`)}
                        >
                          {(r.gls_number as string) || "-"}
                        </button>
                      ) : (
                        <span className="text-primary">{(r.gls_number as string) || "-"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(r.project_name as string) || "-"}
                    </TableCell>
                    <TableCell>
                      {(r.customer_name as string) || "-"}
                    </TableCell>
                    <TableCell>{r.tax_type as string}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(r.amount as number)}
                    </TableCell>
                    <TableCell>
                      {formatDate(r.recording_date as string)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                全{pagination.total}件中{" "}
                {(pagination.page - 1) * pagination.limit + 1}-
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}
                件
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  前へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Revenue Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規売上登録</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Project search */}
            <div className="space-y-1">
              <Label>案件</Label>
              <Input
                placeholder="案件名で検索..."
                value={projectSearch}
                onChange={(e) => {
                  setProjectSearch(e.target.value);
                  setSelectedProjectId("");
                  setSelectedEpisodeId("");
                }}
              />
              {projectSearch && projects.length > 0 && !selectedProjectId && (
                <div className="max-h-40 overflow-y-auto rounded border bg-popover">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setProjectSearch(p.name);
                      }}
                    >
                      <span className="font-mono text-xs text-primary">
                        {p.gls_number}
                      </span>
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedProject && (
                <p className="text-xs text-muted-foreground">
                  GLS: {selectedProject.gls_number} / 顧客:{" "}
                  {selectedProject.customer_name ?? "-"}
                </p>
              )}
            </div>

            {/* Episode select */}
            <div className="space-y-1">
              <Label>話数</Label>
              <Select
                value={selectedEpisodeId}
                onValueChange={setSelectedEpisodeId}
                disabled={!selectedProjectId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="話数を選択" />
                </SelectTrigger>
                <SelectContent>
                  {episodes.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {ep.episode_code} (第{ep.episode_number}話)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tax category */}
            <div className="space-y-1">
              <Label>税区分</Label>
              <Select value={taxCategory} onValueChange={setTaxCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax10">10%課税</SelectItem>
                  <SelectItem value="tax8">8%課税(軽減)</SelectItem>
                </SelectContent>
              </Select>
              {billingKeyPreview && (
                <p className="text-xs text-muted-foreground">
                  請求KEY: {billingKeyPreview}
                </p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <Label>金額</Label>
              <CurrencyInput
                value={amount}
                onChange={(v) => setAmount(v)}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>計上年月</Label>
                <Input
                  type="date"
                  value={recognitionDate}
                  onChange={(e) => setRecognitionDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>請求予定日</Label>
                <Input
                  type="date"
                  value={billingDate}
                  onChange={(e) => setBillingDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>入金予定日</Label>
                <Input
                  type="date"
                  value={paymentDueDate}
                  onChange={(e) => setPaymentDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label>備考</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="備考"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleCloseDialog}>
                キャンセル
              </Button>
              <Button
                disabled={
                  !selectedProjectId ||
                  !selectedEpisodeId ||
                  createMutation.isPending
                }
                onClick={handleCreateSubmit}
              >
                {createMutation.isPending && (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                )}
                登録
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
