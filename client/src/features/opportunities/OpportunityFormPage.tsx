import { useEffect } from "react";
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
import { Loader2, Save, ArrowLeft, Trophy } from "lucide-react";

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

export default function OpportunityFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      title: "",
      customer_id: "",
      expected_date: "",
      expected_amount: 0,
      probability: 50,
      assigned_to: "",
      notes: "",
      stage: "lead",
    },
  });

  // Fetch existing opportunity
  const { data: opportunity, isLoading: oppLoading } = useQuery({
    queryKey: ["opportunity", id],
    queryFn: async () => (await api.get(`/opportunities/${id}`)).data.data,
    enabled: isEdit,
  });

  // Fetch customers for select
  const { data: customersData } = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/customers", { params: { limit: 200 } })).data,
  });
  const customers = customersData?.data ?? [];

  // Fetch users for select
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
    mutationFn: async (newStage: string) => {
      return (await api.patch(`/opportunities/${id}/stage`, { stage: newStage })).data.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["opportunity", id] });
      if (data.project) {
        navigate(`/projects/${data.project.id}`);
      } else {
        navigate("/opportunities");
      }
    },
  });

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
          <Badge color={stageColor[currentStage]}>{stageLabel[currentStage] || currentStage}</Badge>
        )}
      </div>

      {/* Stage change actions for edit mode */}
      {isEdit && opportunity && opportunity.stage !== "won" && opportunity.stage !== "lost" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ステージ変更</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {opportunity.stage === "lead" && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate("proposal")}>
                提案中へ
              </Button>
            )}
            {(opportunity.stage === "lead" || opportunity.stage === "proposal") && (
              <Button variant="outline" size="sm" onClick={() => stageMutation.mutate("negotiation")}>
                交渉中へ
              </Button>
            )}
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => stageMutation.mutate("won")}
              disabled={stageMutation.isPending}
            >
              <Trophy className="mr-2 h-4 w-4" />
              受注 → GLS発番
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stageMutation.mutate("lost")}
              disabled={stageMutation.isPending}
            >
              失注
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
    </div>
  );
}
