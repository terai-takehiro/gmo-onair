import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { Loader2, Save, ArrowLeft, Trophy, CheckCircle2, ExternalLink, Calculator, AlertTriangle, Info, CalendarDays } from "lucide-react";
import {
  ProjectStageLabels, ProjectStageColors,
  ProjectTypeLabels, BroadcastTypeLabels, MediaPlatformLabels,
  type ProjectStage,
  getProjectCategory,
} from "@/types";
import SimulationDialog from "../components/SimulationDialog";

interface LostDialogState {
  open: boolean;
  lost_reason: string;
  lost_reason_note: string;
  lessons_learned: string;
}

interface FormValues {
  name: string;
  customer_id: string;
  project_type: string;
  project_type_other: string;
  event_start: string;
  event_end: string;
  expected_amount: number;
  assigned_to: string;
  broadcast_type: string;
  media_platform: string;
  tags: string;
  notes: string;
}

interface GlsDialogState {
  open: boolean;
  broadcast_type: string;
  media_platform: string;
}

export default function ProjectFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [simOpen, setSimOpen] = useState(false);
  const [glsDialog, setGlsDialog] = useState<GlsDialogState>({
    open: false, broadcast_type: "recording", media_platform: "other",
  });
  const [glsResult, setGlsResult] = useState<{ open: boolean; glsNumber: string } | null>(null);
  const [lostDialog, setLostDialog] = useState<LostDialogState>({
    open: false, lost_reason: '', lost_reason_note: '', lessons_learned: '',
  });

  // 失注理由カテゴリ（DBマスタ）
  const { data: lostReasonsData } = useQuery({
    queryKey: ["lost-reason-categories"],
    queryFn: async () => (await api.get("/sales-analytics/lost-reason-categories")).data,
  });
  const lostReasonCategories: { id: string; name: string }[] = lostReasonsData?.data ?? [];
  const [holdPromptOpen, setHoldPromptOpen] = useState(false);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: "", customer_id: "", project_type: "", project_type_other: "",
      event_start: "", event_end: "", expected_amount: 0, assigned_to: "",
      broadcast_type: "", media_platform: "", tags: "", notes: "",
    },
  });

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
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

  useEffect(() => {
    if (project) {
      reset({
        name: project.name || "",
        customer_id: project.customer_id || "",
        project_type: project.project_type || "other",
        project_type_other: project.project_type_other || "",
        event_start: project.event_start || "",
        event_end: project.event_end || "",
        expected_amount: project.expected_amount || 0,
        assigned_to: project.assigned_to || "",
        broadcast_type: project.broadcast_type || "",
        media_platform: project.media_platform || "",
        tags: project.tags || "",
        notes: project.notes || "",
      });
    }
  }, [project, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        return (await api.put(`/projects/${id}`, values)).data.data;
      } else {
        return (await api.post("/projects", values)).data.data;
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ["project", id] });
      }
      navigate(`/projects/${result.id}`);
    },
  });

  const stageMutation = useMutation({
    mutationFn: async (params: { stage: string; lost_reason?: string; lost_reason_note?: string; lessons_learned?: string }) => {
      return (await api.patch(`/projects/${id}/stage`, params)).data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      // A系で仮押さえに移行した場合、スタジオ予約を促す
      if (variables.stage === 'd_hold' && isCategoryARef.current) {
        setHoldPromptOpen(true);
      }
    },
  });

  const glsMutation = useMutation({
    mutationFn: async (params: { broadcast_type: string; media_platform: string }) => {
      return (await api.post(`/projects/${id}/issue-gls`, params)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      setGlsDialog({ ...glsDialog, open: false });
      setGlsResult({ open: true, glsNumber: data.data.gls_number });
    },
  });

  const handleGlsConfirm = () => {
    glsMutation.mutate({
      broadcast_type: glsDialog.broadcast_type,
      media_platform: glsDialog.media_platform,
    });
  };

  const onSubmit = (values: FormValues) => saveMutation.mutate(values);

  const currentStage = (project?.stage || "neta") as ProjectStage;
  const projectType = watch("project_type");
  const hasGls = !!project?.gls_number;
  const isYomi = !hasGls;
  const isTerminal = currentStage === 's_completed' || currentStage === 'e_lost';
  const isCategoryA = getProjectCategory(projectType) === 'A';
  const isCategoryARef = useRef(isCategoryA);
  isCategoryARef.current = isCategoryA;

  if (isEdit && projectLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl lg:text-2xl font-bold">{isEdit ? "案件編集" : "新規案件作成"}</h1>
        {isEdit && (
          <Badge style={{ backgroundColor: ProjectStageColors[currentStage], color: '#fff' }}>
            {ProjectStageLabels[currentStage] || currentStage}
          </Badge>
        )}
        {isEdit && project?.code && (
          <span className="text-sm font-mono text-muted-foreground">{project.gls_number || project.code}</span>
        )}
      </div>

      {/* Stage guide */}
      {isEdit && project && !isTerminal && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {currentStage === 'neta' && 'ネタ段階です。仮押さえ・見積提案を経て、確度が高まったらGLS発番で正式な案件にしましょう。'}
            {currentStage === 'd_hold' && (isCategoryA
              ? '仮押さえ中です。スタジオ予約カレンダーで日程を押さえましょう。見積提案を経てGLS発番へ進みます。'
              : '仮押さえ中です。見積提案を行うか、確定したらGLS発番に進みましょう。')}
            {currentStage === 'c_proposal' && '見積提案済みです。顧客の承認が得られたらGLS発番で案件を確定しましょう。'}
            {currentStage === 'b_verbal' && (isCategoryA
              ? 'GLS発番済みです。正式受注が確定したら「A 受注済へ」に進み、エピソード管理で制作準備を始めましょう。'
              : 'GLS発番済みです。正式受注が確定したら「A 受注済へ」に進みましょう。')}
            {currentStage === 'a_won' && (isCategoryA
              ? '受注済みです。エピソード管理で制作を進めましょう。イベント完了後は案件終了になります。'
              : '受注済みです。売上管理から売上明細を登録しましょう。')}
          </span>
        </div>
      )}

      {/* Stage change actions */}
      {isEdit && project && !isTerminal && (
        <Card>
          <CardHeader><CardTitle className="text-base">ステージ変更</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {/* ヨミ段階の遷移 */}
            {currentStage === 'neta' && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate({ stage: "d_hold" })} disabled={stageMutation.isPending}>
                D 仮押さえへ
              </Button>
            )}
            {(currentStage === 'neta' || currentStage === 'd_hold') && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate({ stage: "c_proposal" })} disabled={stageMutation.isPending}>
                C 見積提案済へ
              </Button>
            )}

            {/* 仮押さえ中 + A系：スタジオ予約ショートカット */}
            {currentStage === 'd_hold' && isCategoryA && (
              <Button
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/studio")}
              >
                <CalendarDays className="mr-1 h-4 w-4" />
                スタジオ予約
              </Button>
            )}

            {/* GLS発番ボタン (ヨミ段階のみ) */}
            {isYomi && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => setGlsDialog({ ...glsDialog, open: true })}
                disabled={glsMutation.isPending}
              >
                <Trophy className="mr-2 h-4 w-4" />
                GLS発番
              </Button>
            )}

            {/* GLS発番済みの遷移 */}
            {hasGls && currentStage === 'b_verbal' && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => stageMutation.mutate({ stage: "a_won" })}
                disabled={stageMutation.isPending}
              >
                A 受注済へ
              </Button>
            )}

            {/* 失注 */}
            <Button variant="destructive" size="sm" onClick={() => setLostDialog({ open: true, lost_reason: '', lost_reason_note: '', lessons_learned: '' })} disabled={stageMutation.isPending}>
              E 失注
            </Button>
          </CardContent>
        </Card>
      )}

      {/* GLS発番済みバナー */}
      {isEdit && hasGls && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">
                GLS: {project.gls_number}
                {currentStage === 'a_won' && ' (A 受注済)'}
                {currentStage === 's_completed' && ' (S 案件終了)'}
              </span>
            </div>
            {isCategoryA ? (
              <Button size="sm" onClick={() => navigate(`/projects/${id}/episodes`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                エピソード管理
              </Button>
            ) : (
              <Button size="sm" onClick={() => navigate(`/revenues`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                売上管理
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 基本情報 (常に表示) */}
        <Card>
          <CardHeader><CardTitle className="text-base">基本情報</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>案件名 *</Label>
              <Input {...register("name", { required: "必須です" })} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
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
                <Label>案件種類</Label>
                <Select value={projectType} onValueChange={(v) => setValue("project_type", v)}>
                  <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>想定金額</Label>
                <CurrencyInput
                  value={watch("expected_amount")}
                  onChange={(v) => setValue("expected_amount", v)}
                />
                {isEdit && isCategoryA && (
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
                )}
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
            </div>

            <div>
              <Label>メモ</Label>
              <Textarea {...register("notes")} rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* イベント日程 (A系のみ) */}
        {isCategoryA && (
          <Card>
            <CardHeader><CardTitle className="text-base">日程</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>イベント開始日</Label>
                  <Input type="date" {...register("event_start")} />
                </div>
                <div>
                  <Label>イベント終了日</Label>
                  <Input type="date" {...register("event_end")} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 番組情報 (A系 + GLS発番後のみ表示) */}
        {hasGls && isCategoryA && (
          <Card>
            <CardHeader><CardTitle className="text-base">番組情報</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>番組種別</Label>
                  <Select value={watch("broadcast_type") || ""} onValueChange={(v) => setValue("broadcast_type", v)}>
                    <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(BroadcastTypeLabels) as [string, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>配信媒体</Label>
                  <Select value={watch("media_platform") || ""} onValueChange={(v) => setValue("media_platform", v)}>
                    <SelectTrigger><SelectValue placeholder="選択してください" /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(MediaPlatformLabels) as [string, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* タグ */}
        <Card>
          <CardHeader><CardTitle className="text-base">タグ</CardTitle></CardHeader>
          <CardContent>
            <div>
              <Label>タグ (カンマ区切り)</Label>
              <Input {...register("tags")} placeholder="例: 定期案件,重要顧客" />
              <p className="mt-1 text-xs text-muted-foreground">複数のタグをカンマ区切りで入力できます</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/projects")}>キャンセル</Button>
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
        projectId={isEdit ? id : undefined}
        onApply={(total) => setValue("expected_amount", total)}
      />

      {/* GLS発番ダイアログ */}
      <Dialog open={glsDialog.open} onOpenChange={(open) => setGlsDialog({ ...glsDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-600" />
              GLS発番
            </DialogTitle>
            <DialogDescription>
              {isCategoryA
                ? 'イベントコード（GLS-A）を発番します。番組種別と配信媒体を設定してください。'
                : '案件コード（GLS-B）を発番します。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>案件名</Label>
              <Input value={project?.name || ""} disabled className="bg-muted" />
            </div>
            {isCategoryA && (
              <>
                <div>
                  <Label>番組種別 *</Label>
                  <div className="mt-2 flex gap-4">
                    {(Object.entries(BroadcastTypeLabels) as [string, string][]).map(([val, label]) => (
                      <label key={val} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio" name="broadcast_type" value={val}
                          checked={glsDialog.broadcast_type === val}
                          onChange={(e) => setGlsDialog({ ...glsDialog, broadcast_type: e.target.value })}
                          className="accent-primary"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>配信媒体 *</Label>
                  <Select value={glsDialog.media_platform} onValueChange={(v) => setGlsDialog({ ...glsDialog, media_platform: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(MediaPlatformLabels) as [string, string][]).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGlsDialog({ ...glsDialog, open: false })}>キャンセル</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleGlsConfirm} disabled={glsMutation.isPending}>
              {glsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              GLS発番する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GLS発番完了ダイアログ */}
      {glsResult && (
        <Dialog open={glsResult.open} onOpenChange={(open) => { if (!open) setGlsResult(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-6 w-6" />
                GLS発番完了
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div className="rounded-lg border bg-green-50 p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">イベントコード</span>
                  <span className="font-mono font-bold text-lg">{glsResult.glsNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">案件名</span>
                  <span className="font-medium">{project?.name}</span>
                </div>
              </div>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => { setGlsResult(null); }}>
                閉じる
              </Button>
              {isCategoryA ? (
                <Button onClick={() => { setGlsResult(null); navigate(`/projects/${id}/episodes`); }}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  エピソード管理へ
                </Button>
              ) : (
                <Button onClick={() => { setGlsResult(null); navigate(`/revenues`); }}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  売上管理へ
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* 失注ダイアログ */}
      <Dialog open={lostDialog.open} onOpenChange={(open) => setLostDialog({ ...lostDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              失注登録
            </DialogTitle>
            <DialogDescription>
              失注理由を記録してください。今後の営業改善に活用されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>失注理由 *</Label>
              <div className="mt-2 space-y-2">
                {lostReasonCategories.map((cat) => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio" name="lost_reason" value={cat.name}
                      checked={lostDialog.lost_reason === cat.name}
                      onChange={(e) => setLostDialog({ ...lostDialog, lost_reason: e.target.value })}
                      className="accent-red-500"
                    />
                    <span className="text-sm">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>補足メモ</Label>
              <Textarea
                value={lostDialog.lost_reason_note}
                onChange={(e) => setLostDialog({ ...lostDialog, lost_reason_note: e.target.value })}
                placeholder="失注に至った経緯など"
                rows={2}
              />
            </div>
            <div>
              <Label>教訓・学び</Label>
              <Textarea
                value={lostDialog.lessons_learned}
                onChange={(e) => setLostDialog({ ...lostDialog, lessons_learned: e.target.value })}
                placeholder="次回に活かすべきポイント、改善すべき点など"
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                ここに記録した内容は営業レビューの失注分析で共有されます
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLostDialog({ ...lostDialog, open: false })}>キャンセル</Button>
            <Button
              variant="destructive"
              onClick={() => {
                stageMutation.mutate({
                  stage: 'e_lost',
                  lost_reason: lostDialog.lost_reason,
                  lost_reason_note: lostDialog.lost_reason_note,
                  lessons_learned: lostDialog.lessons_learned,
                });
                setLostDialog({ open: false, lost_reason: '', lost_reason_note: '', lessons_learned: '' });
              }}
              disabled={!lostDialog.lost_reason || stageMutation.isPending}
            >
              {stageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              失注にする
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 仮押さえ完了 → スタジオ予約誘導ダイアログ */}
      <Dialog open={holdPromptOpen} onOpenChange={setHoldPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              <CalendarDays className="h-5 w-5" />
              仮押さえに移行しました
            </DialogTitle>
            <DialogDescription>
              スタジオの日程を押さえましょう。カレンダーから空き状況を確認して予約できます。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">案件名</span>
                <span className="font-medium text-sm">{project?.name}</span>
              </div>
              {project?.event_start && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">イベント予定日</span>
                  <span className="font-medium text-sm">{project.event_start}{project.event_end && project.event_end !== project.event_start ? ` 〜 ${project.event_end}` : ''}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setHoldPromptOpen(false)}>
              あとで
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700"
              onClick={() => {
                setHoldPromptOpen(false);
                navigate("/studio");
              }}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              スタジオ予約へ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
