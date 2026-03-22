import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Vendor,
  SettlementMethod,
  SettlementMethodLabels,
  TaxCategory,
  TaxCategoryLabels,
} from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Search, Loader2, Plus } from "lucide-react";

function formatSettlementNo(method: string, number: string): string {
  if (!number || number === "pending") return "未定";
  if (method === "xpoint") return `X-${number}`;
  if (method === "rakuraku") return `楽-${number}`;
  return number;
}

interface ProjectOption {
  id: string;
  gls_number: string;
  name: string;
}

interface EpisodeOption {
  id: string;
  episode_code: string;
  episode_number: number;
}

export default function PurchaseListPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [projectSearch, setProjectSearch] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<string[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [taxCategory, setTaxCategory] = useState("tax10");
  const [settlementMethod, setSettlementMethod] = useState("rakuraku");
  const [settlementNumber, setSettlementNumber] = useState("");
  const [settlementNumberPending, setSettlementNumberPending] = useState(false);
  const [invoiceQualified, setInvoiceQualified] = useState("qualified");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");

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

  // Fetch vendors
  const { data: vendorsData } = useQuery({
    queryKey: ["vendors-list"],
    queryFn: async () => (await api.get("/vendors?limit=200")).data,
    enabled: dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // Allocation preview
  const allocationPreview = useMemo(() => {
    if (selectedEpisodeIds.length <= 1 || !amount) return null;
    const perEpisode = Math.floor(amount / selectedEpisodeIds.length);
    const remainder = amount - perEpisode * selectedEpisodeIds.length;
    return selectedEpisodeIds.map((eid, idx) => {
      const ep = episodes.find((e) => e.id === eid);
      return {
        episodeCode: ep?.episode_code ?? eid,
        amount: perEpisode + (idx === 0 ? remainder : 0),
      };
    });
  }, [selectedEpisodeIds, amount, episodes]);

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
    setProjectSearch("");
    setSelectedProjectId("");
    setSelectedEpisodeIds([]);
    setVendorId("");
    setTaxCategory("tax10");
    setSettlementMethod("rakuraku");
    setSettlementNumber("");
    setSettlementNumberPending(false);
    setInvoiceQualified("qualified");
    setAmount(0);
    setDescription("");
  };

  const toggleEpisode = (eid: string) => {
    setSelectedEpisodeIds((prev) =>
      prev.includes(eid) ? prev.filter((id) => id !== eid) : [...prev, eid]
    );
  };

  const handleCreateSubmit = () => {
    if (!selectedProjectId || !vendorId || selectedEpisodeIds.length === 0)
      return;

    const payload: Record<string, unknown> = {
      project_id: selectedProjectId,
      vendor_id: vendorId,
      tax_category: taxCategory,
      settlement_method: settlementMethod,
      settlement_number: settlementNumberPending
        ? "pending"
        : settlementNumber || null,
      invoice_qualified: invoiceQualified === "qualified" ? 1 : 0,
      amount,
      description: description || null,
      episode_ids: selectedEpisodeIds,
    };

    // If single episode, set episode_id directly
    if (selectedEpisodeIds.length === 1) {
      payload.episode_id = selectedEpisodeIds[0];
    }

    createMutation.mutate(payload);
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">仕入一覧</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新規仕入
        </Button>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>請求KEY</TableHead>
                <TableHead>GLS番号</TableHead>
                <TableHead>案件名</TableHead>
                <TableHead>仕入先</TableHead>
                <TableHead>精算方法</TableHead>
                <TableHead>精算No.</TableHead>
                <TableHead>税区分</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>計上日</TableHead>
                <TableHead>適格</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={10}
                    className="text-center text-muted-foreground"
                  >
                    データがありません
                  </TableCell>
                </TableRow>
              ) : (
                purchases.map((p: Record<string, unknown>) => (
                  <TableRow key={p.id as string}>
                    <TableCell className="font-mono text-xs">
                      {(p.billing_key as string) || "-"}
                    </TableCell>
                    <TableCell className="text-primary">
                      {(p.gls_number as string) || "-"}
                    </TableCell>
                    <TableCell>
                      {(p.project_name as string) || "-"}
                    </TableCell>
                    <TableCell>
                      {(p.vendor_name as string) || "-"}
                    </TableCell>
                    <TableCell>
                      {SettlementMethodLabels[
                        p.settlement_method as SettlementMethod
                      ] ?? (p.settlement_method as string) ?? "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatSettlementNo(
                        (p.settlement_method as string) ?? "",
                        (p.settlement_number as string) ?? ""
                      )}
                    </TableCell>
                    <TableCell>
                      {TaxCategoryLabels[p.tax_category as TaxCategory] ??
                        (p.tax_type as string)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(p.amount as number)}
                    </TableCell>
                    <TableCell>
                      {formatDate(p.recording_date as string)}
                    </TableCell>
                    <TableCell>
                      {p.is_qualified_invoice ? "○" : "×"}
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

      {/* New Purchase Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新規仕入登録</DialogTitle>
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
                  setSelectedEpisodeIds([]);
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
            </div>

            {/* Episode multi-select */}
            {selectedProjectId && (
              <div className="space-y-1">
                <Label>話数（複数選択可 - 均等按分）</Label>
                <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
                  {episodes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      話数がありません
                    </p>
                  ) : (
                    episodes.map((ep) => (
                      <label
                        key={ep.id}
                        className="flex items-center gap-2 cursor-pointer rounded px-2 py-1 hover:bg-accent"
                      >
                        <Checkbox
                          checked={selectedEpisodeIds.includes(ep.id)}
                          onCheckedChange={() => toggleEpisode(ep.id)}
                        />
                        <span className="text-sm">
                          {ep.episode_code} (第{ep.episode_number}話)
                        </span>
                      </label>
                    ))
                  )}
                </div>
                {selectedEpisodeIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedEpisodeIds.length}話選択中
                  </p>
                )}
              </div>
            )}

            {/* Vendor */}
            <div className="space-y-1">
              <Label>仕入先</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="仕入先を選択" />
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

            {/* Tax + Settlement */}
            <div className="grid grid-cols-2 gap-3">
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
                      Object.keys(
                        SettlementMethodLabels
                      ) as SettlementMethod[]
                    ).map((key) => (
                      <SelectItem key={key} value={key}>
                        {SettlementMethodLabels[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Settlement number */}
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

            {/* Invoice */}
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

            {/* Amount */}
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

            {/* Allocation preview */}
            {allocationPreview && (
              <div className="rounded border bg-muted/50 p-3">
                <p className="text-sm font-medium mb-2">
                  均等按分プレビュー
                </p>
                <div className="space-y-1">
                  {allocationPreview.map((a) => (
                    <div
                      key={a.episodeCode}
                      className="flex justify-between text-sm"
                    >
                      <span>{a.episodeCode}</span>
                      <span className="font-mono">
                        {formatCurrency(a.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <Label>説明</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="仕入の説明"
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
                  !vendorId ||
                  selectedEpisodeIds.length === 0 ||
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
