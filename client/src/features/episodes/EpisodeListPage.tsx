import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  Project,
  Episode,
  EpisodeOrder,
  InvoiceGroup,
  BroadcastType,
  BroadcastTypeLabels,
  MediaPlatform,
  MediaPlatformLabels,
  InvoiceGroupStatusLabels,
  InvoiceGroupStatusColors,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
} from "lucide-react";

import EpisodeBatchDialog from "./components/EpisodeBatchDialog";
import EpisodeEditDialog from "./components/EpisodeEditDialog";
import InvoiceGroupDialog from "./components/InvoiceGroupDialog";

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
  const totalRevenueBudget = episodes.reduce((s, e) => s + (e.revenue_budget ?? 0), 0);
  const totalCostBudget = episodes.reduce((s, e) => s + (e.cost_budget ?? 0), 0);
  const grossProfitBudget = totalRevenueBudget - totalCostBudget;
  const totalActualRevenue = episodes.reduce((s, e) => s + (e.actual_revenue ?? 0), 0);
  const totalActualCost = episodes.reduce((s, e) => s + (e.actual_cost ?? 0), 0);
  const actualGrossProfit = totalActualRevenue - totalActualCost;

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
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <SummaryCard title="売上計" value={formatCurrency(totalRevenueBudget)} />
            <SummaryCard title="仕入計" value={formatCurrency(totalCostBudget)} />
            <SummaryCard title="粗利予算" value={formatCurrency(grossProfitBudget)} />
            <SummaryCard title="実績売上計" value={formatCurrency(totalActualRevenue)} />
            <SummaryCard title="実績仕入計" value={formatCurrency(totalActualCost)} />
            <SummaryCard title="実績粗利" value={formatCurrency(actualGrossProfit)} />
          </div>

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
                  <TableHead>収録日</TableHead>
                  <TableHead>放送日</TableHead>
                  <TableHead>納品日</TableHead>
                  <TableHead className="text-right">売上</TableHead>
                  <TableHead className="text-right">仕入</TableHead>
                  <TableHead className="w-24">操作</TableHead>
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
                      <TableCell className="text-right">{formatCurrency(ep.revenue_budget)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(ep.cost_budget)}</TableCell>
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
          <ProjectSettingsForm projectId={projectId!} project={project} />
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
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
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

// --- Sub-components ---

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-normal text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pb-3 px-4">
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ProjectSettingsForm({ projectId, project }: { projectId: string; project: Project }) {
  const qc = useQueryClient();
  const { handleSubmit, setValue, watch } = useForm({
    defaultValues: {
      broadcast_type: project.broadcast_type as string,
      media_platform: project.media_platform as string,
    },
  });

  const broadcastType = watch("broadcast_type");
  const mediaPlatform = watch("media_platform");

  const mutation = useMutation({
    mutationFn: (values: { broadcast_type: string; media_platform: string }) =>
      api.put(`/projects/${projectId}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
    },
  });

  const onSubmit = (values: { broadcast_type: string; media_platform: string }) => {
    mutation.mutate(values);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-md space-y-6">
      <div className="space-y-3">
        <Label>番組種別</Label>
        <div className="flex gap-4">
          {(Object.keys(BroadcastTypeLabels) as BroadcastType[]).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                value={key}
                checked={broadcastType === key}
                onChange={(e) => setValue("broadcast_type", e.target.value)}
                className="accent-primary"
              />
              <span className="text-sm">{BroadcastTypeLabels[key]}</span>
            </label>
          ))}
        </div>
        {broadcastType === "live" && (
          <p className="text-xs text-muted-foreground">
            生放送の場合、各話数の収録日変更時に放送日も自動連動します
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>配信媒体</Label>
        <Select
          value={mediaPlatform}
          onValueChange={(v) => setValue("media_platform", v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MediaPlatformLabels) as MediaPlatform[]).map((key) => (
              <SelectItem key={key} value={key}>
                {MediaPlatformLabels[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        保存
      </Button>
      {mutation.isSuccess && (
        <p className="text-sm text-green-600">保存しました</p>
      )}
    </form>
  );
}
