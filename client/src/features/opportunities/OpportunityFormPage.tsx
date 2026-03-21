import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Save, ArrowLeft, Trophy, CheckCircle2, ExternalLink } from "lucide-react";
import {
  BroadcastTypeLabels, MediaPlatformLabels,
} from "@/types";

const stageLabel: Record<string, string> = {
  lead: "リード",
  proposal: "提案中",
  negotiation: "交渉中",
  won: "受注",
  lost: "失注",
};

const stageColor: Record<string, string> = {
  lead: "#6b7280",
  proposal: "#3b82f6",
  negotiation: "#f59e0b",
  won: "#22c55e",
  lost: "#ef4444",
};

interface FormValues {
  title: string;
  customer_id: string;
  expected_date: string;
  expected_amount: number;
  probability: number;
  assigned_to: string;
  notes: string;
  stage: string;
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

  const [wonDialog, setWonDialog] = useState<WonDialogState>({
    open: false, broadcast_type: "recording", media_platform: "other", initial_episode_count: 0,
  });
  const [wonResult, setWonResult] = useState<WonResultState>({
    open: false, glsNumber: "", projectName: "", projectId: "", episodeCount: 0,
  });

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      title: "", customer_id: "", expected_date: "", expected_amount: 0,
      probability: 50, assigned_to: "", notes: "", stage: "lead",
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

  useEffect(() => {
    if (opportunity) {
      reset({
        title: opportunity.title || "",
        customer_id: opportunity.customer_id || "",
        expected_date: opportunity.expected_date?.split("T")[0] || "",
        expected_amount: opportunity.expected_amount || 0,
        probability: opportunity.probability ?? 50,
        assigned_to: opportunity.assigned_to || "",
        notes: opportunity.notes || "",
        stage: opportunity.stage || "lead",
      });
    }
  }, [opportunity, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        return (await api.put(`/opportunities/${id}`, values)).data.data;
      }
      return (await api.post("/opportunities", values)).data.data;
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
      } else {
        navigate("/opportunities");
      }
    },
  });

  const handleWonConfirm = () => {
    setWonDialog({ ...wonDialog, open: false });
    stageMutation.mutate({
      stage: "won",
      broadcast_type: wonDialog.broadcast_type,
      media_platform: wonDialog.media_platform,
      initial_episode_count: wonDialog.initial_episode_count,
    });
  };

  const onSubmit = (values: FormValues) => {
    saveMutation.mutate(values);
  };

  const currentStage = watch("stage");

  if (isEdit && oppLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/opportunities")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {isEdit ? "ヨミ編集" : "新規ヨミ作成"}
        </h1>
        {isEdit && (
          <Badge style={{ backgroundColor: stageColor[currentStage] }} className="text-white">
            {stageLabel[currentStage] || currentStage}
          </Badge>
        )}
      </div>

      {/* Stage change actions */}
      {isEdit && opportunity && opportunity.stage !== "won" && opportunity.stage !== "lost" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ステージ変更</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {opportunity.stage === "lead" && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate({ stage: "proposal" })}>
                提案中へ
              </Button>
            )}
            {(opportunity.stage === "lead" || opportunity.stage === "proposal") && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate({ stage: "negotiation" })}>
                交渉中へ
              </Button>
            )}
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setWonDialog({ ...wonDialog, open: true })}
              disabled={stageMutation.isPending}
            >
              <Trophy className="mr-2 h-4 w-4" />
              受注確定
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stageMutation.mutate({ stage: "lost" })}
              disabled={stageMutation.isPending}
            >
              失注
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 受注済みの場合、番組管理へのリンクを表示 */}
      {isEdit && opportunity && opportunity.stage === "won" && opportunity.project_id && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <span className="font-medium text-green-800">受注済み</span>
            </div>
            <Button
              size="sm"
              onClick={() => navigate(`/projects/${opportunity.project_id}/episodes`)}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              番組管理を開く
            </Button>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">基本情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>案件仮称 *</Label>
              <Input {...register("title", { required: "必須です" })} />
              {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div>
              <Label>顧客 *</Label>
              <Select
                value={watch("customer_id")}
                onValueChange={(v) => setValue("customer_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="顧客を選択" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>想定実施日 *</Label>
                <Input type="date" {...register("expected_date", { required: "必須です" })} />
                {errors.expected_date && <p className="mt-1 text-xs text-destructive">{errors.expected_date.message}</p>}
              </div>
              <div>
                <Label>想定金額 *</Label>
                <Input type="number" {...register("expected_amount", { required: "必須です", valueAsNumber: true })} />
                {errors.expected_amount && <p className="mt-1 text-xs text-destructive">{errors.expected_amount.message}</p>}
              </div>
              <div>
                <Label>受注確度(%) *</Label>
                <Input type="number" min={0} max={100} {...register("probability", { required: "必須です", valueAsNumber: true })} />
              </div>
            </div>

            <div>
              <Label>担当者</Label>
              <Select
                value={watch("assigned_to")}
                onValueChange={(v) => setValue("assigned_to", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="担当者を選択" />
                </SelectTrigger>
                <SelectContent>
                  {(users as Array<{ id: string; name: string }>).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>メモ</Label>
              <Textarea {...register("notes")} rows={4} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/opportunities")}>
            キャンセル
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </form>

      {/* 受注確定ダイアログ */}
      <Dialog open={wonDialog.open} onOpenChange={(open) => setWonDialog({ ...wonDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-green-600" />
              受注確定
            </DialogTitle>
            <DialogDescription>
              GLS番号を発番し、番組を作成します。初回発注話数も設定できます。
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
                      type="radio"
                      name="broadcast_type"
                      value={val}
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
              <Select
                value={wonDialog.media_platform}
                onValueChange={(v) => setWonDialog({ ...wonDialog, media_platform: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
                type="number"
                min={0}
                max={999}
                value={wonDialog.initial_episode_count}
                onChange={(e) => setWonDialog({ ...wonDialog, initial_episode_count: parseInt(e.target.value) || 0 })}
                placeholder="0 = 後から設定"
              />
              <p className="mt-1 text-xs text-muted-foreground">0の場合、番組管理画面から後で発注追加できます</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWonDialog({ ...wonDialog, open: false })}>
              キャンセル
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleWonConfirm}
              disabled={stageMutation.isPending}
            >
              {stageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              受注確定する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 受注完了ダイアログ */}
      <Dialog open={wonResult.open} onOpenChange={(open) => { if (!open) setWonResult({ ...wonResult, open: false }); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" />
              受注確定完了
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="rounded-lg border bg-green-50 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">GLS番号</span>
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
