import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Project,
  Episode,
  EpisodeOrder,
  InvoiceGroup,
  BroadcastTypeLabels,
  MediaPlatformLabels,
  InvoiceGroupStatusLabels,
  InvoiceGroupStatusColors,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
  ShoppingCart,
} from "lucide-react";

import EpisodeBatchDialog from "../components/episodes/EpisodeBatchDialog";
import EpisodeEditDialog from "../components/episodes/EpisodeEditDialog";
import EpisodePurchaseDialog from "../components/episodes/EpisodePurchaseDialog";
import InvoiceGroupDialog from "../components/episodes/InvoiceGroupDialog";
import EpisodeSummaryCards from "../components/episodes/EpisodeSummaryCards";
import ProjectSettingsTab from "../components/episodes/ProjectSettingsTab";

function getDateLabels(projectType: string): { recording: string; broadcast: string; delivery: string } {
  switch (projectType) {
    case 'offline_event': return { recording: 'リハ日', broadcast: '本番日', delivery: '納品日' };
    case 'hybrid_event': return { recording: 'リハ日', broadcast: '本番・放送日', delivery: '納品日' };
    case 'live_broadcast': return { recording: '収録日(=放送日)', broadcast: '放送日', delivery: '納品日' };
    case 'recording': return { recording: '収録日', broadcast: '放送日', delivery: '納品日' };
    case 'gmo_project': case 'other': return { recording: '対応開始日', broadcast: '対応終了日', delivery: '完了日' };
    default: return { recording: '収録日', broadcast: '放送日', delivery: '納品日' };
  }
}

export default function EpisodeListPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Dialog states
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [editEpisode, setEditEpisode] = useState<Episode | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [invoiceGroupDialogOpen, setInvoiceGroupDialogOpen] = useState(false);
  const [editInvoiceGroup, setEditInvoiceGroup] = useState<InvoiceGroup | null>(null);
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseEpisode, setPurchaseEpisode] = useState<Episode | null>(null);

  // Fetch project
  const { data: projectData, isLoading: projectLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
  });
  const project: Project | undefined = projectData?.data;

  // Fetch episodes
  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ["episodes", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`)).data,
    enabled: !!projectId,
  });
  const episodes: Episode[] = episodesData?.data ?? [];

  // Fetch orders
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["episode-orders", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/orders`)).data,
    enabled: !!projectId,
  });
  const orders: EpisodeOrder[] = ordersData?.data ?? [];

  // Fetch invoice groups
  const { data: invoiceGroupsData, isLoading: igLoading } = useQuery({
    queryKey: ["invoice-groups", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/invoice-groups`)).data,
    enabled: !!projectId,
  });
  const invoiceGroups: InvoiceGroup[] = invoiceGroupsData?.data ?? [];

  // Delete episode
  const deleteEpisodeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/episodes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["episodes", projectId] }),
  });

  // Delete order
  const deleteOrderMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["episode-orders", projectId] });
      qc.invalidateQueries({ queryKey: ["episodes", projectId] });
    },
  });

  // Delete invoice group
  const deleteIgMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${projectId}/invoice-groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-groups", projectId] }),
  });

  // Summary calculations
  const totalActualRevenue = episodes.reduce((s, e) => s + (e.actual_revenue ?? 0), 0);
  const totalActualCost = episodes.reduce((s, e) => s + (e.actual_cost ?? 0), 0);
  const grossProfit = totalActualRevenue - totalActualCost;

  // Dynamic date labels based on project type
  const projectType = (projectData?.data as any)?.project_type ?? "";
  const dateLabels = getDateLabels(projectType);

  if (projectLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center text-muted-foreground">案件が見つかりません</div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() => navigate("/projects")}
        >
          <ArrowLeft className="h-4 w-4" />
          案件一覧
        </Button>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            <span className="font-mono text-primary">{project.gls_number}</span>{" "}
            {project.name}
          </h1>
          <Badge color="#005bac">
            {BroadcastTypeLabels[project.broadcast_type] ?? project.broadcast_type}
          </Badge>
          <Badge variant="outline">
            {MediaPlatformLabels[project.media_platform] ?? project.media_platform}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="episodes">
        <TabsList>
          <TabsTrigger value="episodes">話数一覧</TabsTrigger>
          <TabsTrigger value="orders">発注履歴</TabsTrigger>
          <TabsTrigger value="invoice-groups">請求グループ</TabsTrigger>
          <TabsTrigger value="settings">番組設定</TabsTrigger>
        </TabsList>

        {/* Tab 1: Episodes */}
        <TabsContent value="episodes" className="space-y-4">
          <EpisodeSummaryCards
            totalActualRevenue={totalActualRevenue}
            totalActualCost={totalActualCost}
            grossProfit={grossProfit}
            formatCurrency={formatCurrency}
          />

          <div className="flex justify-end">
            <Button size="sm" onClick={() => setBatchDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              発注追加
            </Button>
          </div>

          {episodesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>エピソードコード</TableHead>
                  <TableHead>{dateLabels.recording}</TableHead>
                  <TableHead>{dateLabels.broadcast}</TableHead>
                  <TableHead>{dateLabels.delivery}</TableHead>
                  <TableHead className="text-right">売上高</TableHead>
                  <TableHead className="text-right">仕入実績</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {episodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  episodes.map((ep) => (
                    <TableRow
                      key={ep.id}
                      className="cursor-pointer"
                      onClick={() => {
                        setEditEpisode(ep);
                        setEditDialogOpen(true);
                      }}
                    >
                      <TableCell>{ep.episode_number}</TableCell>
                      <TableCell className="font-mono text-sm">{ep.episode_code}</TableCell>
                      <TableCell>{formatDate(ep.recording_date)}</TableCell>
                      <TableCell>{formatDate(ep.broadcast_date)}</TableCell>
                      <TableCell>{formatDate(ep.delivery_date)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm ${
                          (ep.revenue_count ?? 0) > 0 ? 'bg-blue-50 text-blue-700' : 'text-muted-foreground'
                        }`}>
                          <span className="font-mono">{formatCurrency(ep.actual_revenue ?? 0)}</span>
                          {(ep.revenue_count ?? 0) > 0 && (
                            <span className="text-xs opacity-70">({ep.revenue_count}件)</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm transition-colors ${
                            (ep.purchase_count ?? 0) > 0
                              ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 cursor-pointer'
                              : 'text-muted-foreground'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if ((ep.purchase_count ?? 0) > 0 || true) {
                              setPurchaseEpisode(ep);
                              setPurchaseDialogOpen(true);
                            }
                          }}
                          title="クリックで仕入詳細を表示"
                        >
                          <span className="font-mono">{formatCurrency(ep.actual_cost ?? 0)}</span>
                          {(ep.purchase_count ?? 0) > 0 && (
                            <span className="text-xs opacity-70">({ep.purchase_count}件)</span>
                          )}
                          <ShoppingCart className="h-3 w-3 opacity-50" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditEpisode(ep);
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPurchaseEpisode(ep);
                              setPurchaseDialogOpen(true);
                            }}
                            title="仕入管理"
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("この話数を削除しますか？")) {
                                deleteEpisodeMutation.mutate(ep.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Tab 2: Orders */}
        <TabsContent value="orders" className="space-y-4">
          {ordersLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>発注日</TableHead>
                  <TableHead>話数</TableHead>
                  <TableHead>範囲</TableHead>
                  <TableHead>メモ</TableHead>
                  <TableHead className="w-16">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{formatDate(o.order_date)}</TableCell>
                      <TableCell>{o.episode_count}</TableCell>
                      <TableCell>
                        #{o.start_episode}~#{o.end_episode}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{o.notes || "-"}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm("この発注履歴を削除しますか？")) {
                              deleteOrderMutation.mutate(o.id);
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
        </TabsContent>

        {/* Tab 3: Invoice Groups */}
        <TabsContent value="invoice-groups" className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setEditInvoiceGroup(null);
                setInvoiceGroupDialogOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              請求グループ追加
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await api.post(`/projects/${projectId}/invoice-groups/auto-by-recording-date`);
                  qc.invalidateQueries({ queryKey: ["invoice-groups", projectId] });
                } catch {}
              }}
            >
              収録日で自動グループ化
            </Button>
          </div>

          {igLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>グループ名</TableHead>
                  <TableHead>話数</TableHead>
                  <TableHead className="text-right">合計額</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoiceGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      データがありません
                    </TableCell>
                  </TableRow>
                ) : (
                  invoiceGroups.map((ig) => (
                    <TableRow key={ig.id}>
                      <TableCell className="font-medium">{ig.title}</TableCell>
                      <TableCell>{ig.episode_count ?? ig.episodes?.length ?? 0}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(ig.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge color={InvoiceGroupStatusColors[ig.status]}>
                          {InvoiceGroupStatusLabels[ig.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setEditInvoiceGroup(ig);
                              setInvoiceGroupDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => {
                              if (confirm("この請求グループを削除しますか？")) {
                                deleteIgMutation.mutate(ig.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        {/* Tab 4: Settings */}
        <TabsContent value="settings" className="space-y-4">
          <ProjectSettingsTab projectId={projectId!} project={project} />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <EpisodeBatchDialog
        projectId={projectId!}
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
      />
      <EpisodeEditDialog
        projectId={projectId!}
        episode={editEpisode}
        broadcastType={project.broadcast_type}
        projectType={projectType}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onOpenPurchases={editEpisode ? () => {
          setPurchaseEpisode(editEpisode);
          setEditDialogOpen(false);
          setPurchaseDialogOpen(true);
        } : undefined}
      />
      {purchaseEpisode && (
        <EpisodePurchaseDialog
          projectId={projectId!}
          episodeId={purchaseEpisode.id}
          episodeCode={purchaseEpisode.episode_code}
          open={purchaseDialogOpen}
          onOpenChange={setPurchaseDialogOpen}
        />
      )}
      <InvoiceGroupDialog
        projectId={projectId!}
        episodes={episodes}
        invoiceGroup={editInvoiceGroup}
        open={invoiceGroupDialogOpen}
        onOpenChange={setInvoiceGroupDialogOpen}
      />
    </div>
  );
}
