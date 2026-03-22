import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
// format utils available if needed
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Save, ArrowLeft, Trophy, CheckCircle2, ExternalLink, Calculator, Plus, Trash2 } from "lucide-react";
import {
  OpportunityStageLabels, OpportunityStageColors,
  ProjectTypeLabels, BroadcastTypeLabels, MediaPlatformLabels,
  type OpportunityStage,
} from "@/types";
import SimulationDialog from "./SimulationDialog";

const stageOrder: OpportunityStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed', 'e_lost'];

interface FormValues {
  title: string;
  customer_id: string;
  project_type: string;
  project_type_other: string;
  expected_date: string;
  expected_amount: number;
  stage: string;
  assigned_to: string;
  notes: string;
}

interface DateEntry {
  id?: string;
  date_start: string;
  date_end: string;
  label: string;
}

interface WonDialogState {
  open: boolean;
  broadcast_type: string;
  media_platform: string;
  initial_episode_count: number;
}

interface WonResultState {
  open: boolean;
  glsNumber: string;
  projectName: string;
  projectId: string;
  episodeCount: number;
}

export default function OpportunityFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [dates, setDates] = useState<DateEntry[]>([]);
  const [simOpen, setSimOpen] = useState(false);
  const [wonDialog, setWonDialog] = useState<WonDialogState>({
    open: false, broadcast_type: "recording", media_platform: "other", initial_episode_count: 0,
  });
  const [wonResult, setWonResult] = useState<WonResultState>({
    open: false, glsNumber: "", projectName: "", projectId: "", episodeCount: 0,
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      title: "", customer_id: "", project_type: "other", project_type_other: "",
      expected_date: "", expected_amount: 0, stage: "neta", assigned_to: "", notes: "",
    },
  });

  const { data: opportunity, isLoading: oppLoading } = useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => (await api.get(`/opportunities/${id}`)).data.data,
    enabled: isEdit,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/customers", { params: { limit: 200 } })).data,
  });
  const customers = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ["users-select"],
    queryFn: async () => (await api.get("/auth/users")).data.data,
  });
  const users = usersData ?? [];

  // Fetch dates for existing opportunity
  const { data: datesData } = useQuery({
    queryKey: ["opportunity-dates", id],
    queryFn: async () => (await api.get(`/opportunities/${id}/dates`)).data.data,
    enabled: isEdit,
  });

  useEffect(() => {
    if (opportunity) {
      reset({
        title: opportunity.title || "",
        customer_id: opportunity.customer_id || "",
        project_type: opportunity.project_type || "other",
        project_type_other: opportunity.project_type_other || "",
        expected_date: opportunity.expected_date?.split("T")[0] || "",
        expected_amount: opportunity.expected_amount || 0,
        stage: opportunity.stage || "neta",
        assigned_to: opportunity.assigned_to || "",
        notes: opportunity.notes || "",
      });
    }
  }, [opportunity, reset]);

  useEffect(() => {
    if (datesData) {
      setDates(datesData.map((d: DateEntry) => ({
        id: d.id, date_start: d.date_start, date_end: d.date_end || "", label: d.label || "",
      })));
    }
  }, [datesData]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
      };
      let result;
      if (isEdit) {
        result = (await api.put(`/opportunities/${id}`, payload)).data.data;
        // Save dates
        await api.put(`/opportunities/${id}/dates`, {
          dates: dates.filter(d => d.date_start).map((d, i) => ({
            date_start: d.date_start, date_end: d.date_end || null, label: d.label || null, sort_order: i,
          })),
        });
      } else {
        result = (await api.post("/opportunities", payload)).data.data;
        // Save dates for new opportunity
        if (dates.some(d => d.date_start)) {
          await api.put(`/opportunities/${result.id}/dates`, {
            dates: dates.filter(d => d.date_start).map((d, i) => ({
              date_start: d.date_start, date_end: d.date_end || null, label: d.label || null, sort_order: i,
            })),
          });
        }
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      navigate("/opportunities");
    },
  });

  const stageMutation = useMutation({
    mutationFn: async (params: { stage: string; broadcast_type?: string; media_platform?: string; initial_episode_count?: number }) => {
      return (await api.patch(`/opportunities/${id}/stage`, params)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity", id] });
      if (data.project) {
        setWonResult({
          open: true,
          glsNumber: data.project.gls_number,
          projectName: data.project.name,
          projectId: data.project.id,
          episodeCount: data.episodes?.length || 0,
        });
      }
    },
  });

  const handleGlsConfirm = () => {
    setWonDialog({ ...wonDialog, open: false });
    stageMutation.mutate({
      stage: "b_verbal",
      broadcast_type: wonDialog.broadcast_type,
      media_platform: wonDialog.media_platform,
      initial_episode_count: wonDialog.initial_episode_count,
    });
  };

  const onSubmit = (values: FormValues) => saveMutation.mutate(values);

  const currentStage = watch("stage") as OpportunityStage;
  const projectType = watch("project_type");

  const addDate = () => setDates([...dates, { date_start: "", date_end: "", label: "" }]);
  const removeDate = (idx: number) => setDates(dates.filter((_, i) => i !== idx));
  const updateDate = (idx: number, field: keyof DateEntry, value: string) => {
    const updated = [...dates];
    updated[idx] = { ...updated[idx], [field]: value };
    setDates(updated);
  };

  if (isEdit && oppLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isTerminal = currentStage === 'a_won' || currentStage === 's_completed' || currentStage === 'e_lost';
  const hasProject = opportunity?.project_id;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/opportunities")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">{isEdit ? "ヨミ編集" : "新規ヨミ作成"}</h1>
        {isEdit && (
          <Badge style={{ backgroundColor: OpportunityStageColors[currentStage] }} className="text-white">
            {OpportunityStageLabels[currentStage] || currentStage}
          </Badge>
        )}
      </div>

      {/* Stage change actions */}
      {isEdit && opportunity && !isTerminal && (
        <Card>
          <CardHeader><CardTitle className="text-base">ステージ変更</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {currentStage === 'neta' && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate({ stage: "d_hold" })}>
                D 仮押さえへ
              </Button>
            )}
            {(currentStage === 'neta' || currentStage === 'd_hold') && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate({ stage: "c_proposal" })}>
                C 見積提案済へ
              </Button>
            )}
            {!hasProject && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setWonDialog({ ...wonDialog, open: true })}
                disabled={stageMutation.isPending}
              >
                <Trophy className="mr-2 h-4 w-4" />
                B 口頭決定 → GLS発番
              </Button>
            )}
            {hasProject && currentStage === 'b_verbal' && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => stageMutation.mutate({ stage: "a_won" })}
                disabled={stageMutation.isPending}
              >
                A 受注済へ
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => stageMutation.mutate({ stage: "e_lost" })} disabled={stageMutation.isPending}>
              E 失注
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 番組管理リンク(B以降) */}
      {isEdit && hasProject && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">
                {currentStage === 'a_won' ? 'A 受注済' : currentStage === 's_completed' ? 'S 案件終了' : 'B 口頭決定済'}
              </span>
            </div>
            <Button size="sm" onClick={() => navigate(`/projects/${opportunity.project_id}/episodes`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              番組管理を開く
            </Button>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">基本情報</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>案件仮称 *</Label>
              <Input {...register("title", { required: "必須です" })} />
              {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>顧客 *</Label>
                <SearchableSelect
                  options={customers.map((c: { id: string; name: string; short_name?: string }) => ({ value: c.id, label: c.name, subLabel: c.short_name || '' }))}
                  value={watch("customer_id")}
                  onChange={(v) => setValue("customer_id", v)}
                  placeholder="顧客を検索..."
                />
              </div>
              <div>
                <Label>案件種類 *</Label>
                <Select value={projectType} onValueChange={(v) => setValue("project_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ProjectTypeLabels) as [string, string][]).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {projectType === "other" && (
              <div>
                <Label>案件種類(その他)</Label>
                <Input {...register("project_type_other")} placeholder="案件種類を入力" />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>ヨミ区分 *</Label>
                <Select value={currentStage} onValueChange={(v) => setValue("stage", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stageOrder.filter(s => !['s_completed'].includes(s)).map((s) => (
                      <SelectItem key={s} value={s}>{OpportunityStageLabels[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>想定金額 *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">¥</span>
                  <Input
                    type="number"
                    className="pl-7"
                    {...register("expected_amount", { required: "必須です", valueAsNumber: true })}
                  />
                </div>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0 text-xs"
                  onClick={() => setSimOpen(true)}
                >
                  <Calculator className="mr-1 h-3 w-3" />
                  料金シミュレーション
                </Button>
              </div>
              <div>
                <Label>想定実施日</Label>
                <Input type="date" {...register("expected_date")} />
              </div>
            </div>

            <div>
              <Label>担当者</Label>
              <SearchableSelect
                options={(users as Array<{ id: string; name: string }>).map((u) => ({ value: u.id, label: u.name }))}
                value={watch("assigned_to")}
                onChange={(v) => setValue("assigned_to", v)}
                placeholder="担当者を検索..."
              />
            </div>

            <div>
              <Label>メモ</Label>
              <Textarea {...register("notes")} rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* 日程管理 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">日程</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addDate}>
                <Plus className="mr-1 h-4 w-4" />
                日程追加
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dates.length === 0 && (
              <p className="text-sm text-muted-foreground">日程が設定されていません</p>
            )}
            {dates.map((d, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="w-32">
                  <Label className="text-xs">ラベル</Label>
                  <Input
                    value={d.label}
                    onChange={(e) => updateDate(i, "label", e.target.value)}
                    placeholder="本番日"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">開始日</Label>
                  <Input
                    type="date"
                    value={d.date_start}
                    onChange={(e) => updateDate(i, "date_start", e.target.value)}
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">終了日</Label>
                  <Input
                    type="date"
                    value={d.date_end}
                    onChange={(e) => updateDate(i, "date_end", e.target.value)}
                    className="text-sm"
                    placeholder="単日なら空欄"
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => removeDate(i)} className="shrink-0">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/opportunities")}>キャンセル</Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </form>

      {/* 料金シミュレーションダイアログ */}
      <SimulationDialog
        open={simOpen}
        onOpenChange={setSimOpen}
        opportunityId={isEdit ? id : undefined}
        onApply={(total) => setValue("expected_amount", total)}
      />

      {/* GLS発番ダイアログ */}
      <Dialog open={wonDialog.open} onOpenChange={(open) => setWonDialog({ ...wonDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-600" />
              B 口頭決定 → GLS発番
            </DialogTitle>
            <DialogDescription>
              イベントコードを発番し、番組を作成します。初回発注話数も設定できます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>番組名</Label>
              <Input value={opportunity?.title || ""} disabled className="bg-muted" />
            </div>
            <div>
              <Label>番組種別 *</Label>
              <div className="mt-2 flex gap-4">
                {(Object.entries(BroadcastTypeLabels) as [string, string][]).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="broadcast_type" value={val}
                      checked={wonDialog.broadcast_type === val}
                      onChange={(e) => setWonDialog({ ...wonDialog, broadcast_type: e.target.value })}
                      className="accent-primary"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>配信媒体 *</Label>
              <Select value={wonDialog.media_platform} onValueChange={(v) => setWonDialog({ ...wonDialog, media_platform: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(MediaPlatformLabels) as [string, string][]).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>初回発注話数</Label>
              <Input
                type="number" min={0} max={999}
                value={wonDialog.initial_episode_count}
                onChange={(e) => setWonDialog({ ...wonDialog, initial_episode_count: parseInt(e.target.value) || 0 })}
                placeholder="0 = 後から設定"
              />
              <p className="mt-1 text-xs text-muted-foreground">0の場合、番組管理画面から後で発注追加できます</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWonDialog({ ...wonDialog, open: false })}>キャンセル</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleGlsConfirm} disabled={stageMutation.isPending}>
              {stageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              GLS発番する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GLS発番完了ダイアログ */}
      <Dialog open={wonResult.open} onOpenChange={(open) => { if (!open) setWonResult({ ...wonResult, open: false }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
              イベントコード 発番完了
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="rounded-lg border bg-green-50 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">イベントコード</span>
                <span className="font-mono font-bold text-lg">{wonResult.glsNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">番組名</span>
                <span className="font-medium">{wonResult.projectName}</span>
              </div>
              {wonResult.episodeCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">作成話数</span>
                  <span className="font-medium">{wonResult.episodeCount}話</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setWonResult({ ...wonResult, open: false }); navigate("/opportunities"); }}>
              ヨミ一覧に戻る
            </Button>
            <Button onClick={() => { setWonResult({ ...wonResult, open: false }); navigate(`/projects/${wonResult.projectId}/episodes`); }}>
              <ExternalLink className="mr-2 h-4 w-4" />
              番組管理へ進む
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
