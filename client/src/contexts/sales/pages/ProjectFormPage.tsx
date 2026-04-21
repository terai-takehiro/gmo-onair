import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { PageTransition } from "@/components/ui/motion";
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
import { Loader2, Save, ArrowLeft, Trophy, CheckCircle2, ExternalLink, Calculator, AlertTriangle, Info, CalendarDays, FileText, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ProjectStageLabels, ProjectStageColors,
  ProjectTypeLabels, BroadcastTypeLabels, MediaPlatformLabels,
  type ProjectStage,
  getProjectCategory,
} from "@/types";
import SimulationDialog from "../components/SimulationDialog";
import CustomerDialog from "../components/CustomerDialog";

interface LostDialogState {
  open: boolean;
  lost_reason: string;
  lost_reason_note: string;
  lessons_learned: string;
}

interface FormValues {
  name: string;
  customer_id: string;
  customer_type: string;
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
  box_url_internal: string;
  box_url_external: string;
}

interface GlsDialogState {
  open: boolean;
  mode: 'new' | 'link';
  broadcast_type: string;
  media_platform: string;
  target_project_id: string;
}

export default function ProjectFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [simOpen, setSimOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [glsDialog, setGlsDialog] = useState<GlsDialogState>({
    open: false, mode: 'new', broadcast_type: "recording", media_platform: "other", target_project_id: "",
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
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [stageSelectValue, setStageSelectValue] = useState("");
  const [stageConfirmOpen, setStageConfirmOpen] = useState(false);

  // スタジオスケジュール
  const [scheduleRoomIds, setScheduleRoomIds] = useState<string[]>([]);
  const [productionStart, setProductionStart] = useState("");
  const [productionEnd, setProductionEnd] = useState("");
  const [productionMultiDay, setProductionMultiDay] = useState(false);
  const [hasRehearsal, setHasRehearsal] = useState(false);
  const [rehearsalStart, setRehearsalStart] = useState("");
  const [rehearsalEnd, setRehearsalEnd] = useState("");
  const [rehearsalMultiDay, setRehearsalMultiDay] = useState(false);
  const [locationNote, setLocationNote] = useState("");
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const locationSuggestionsRef = useRef<HTMLDivElement>(null);
  const LOCATION_NOTE_KEY = "studio_location_note_history";
  const getLocationHistory = (): string[] => {
    try { return JSON.parse(localStorage.getItem(LOCATION_NOTE_KEY) || "[]"); } catch { return []; }
  };
  const saveLocationNote = (note: string) => {
    const history = getLocationHistory().filter(h => h !== note).slice(0, 14);
    localStorage.setItem(LOCATION_NOTE_KEY, JSON.stringify([note, ...history]));
  };
  const locationHistory = getLocationHistory().filter(h =>
    locationNote ? h.toLowerCase().includes(locationNote.toLowerCase()) : true
  ).slice(0, 6);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (locationSuggestionsRef.current && !locationSuggestionsRef.current.contains(e.target as Node)) {
        setShowLocationSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: studioLocationsData } = useQuery({
    queryKey: ["studio-locations"],
    queryFn: async () => (await api.get("/studios/locations")).data.data,
  });
  const studioLocations: { id: string; name: string; rooms: { id: string; name: string; color: string }[] }[] = studioLocationsData ?? [];

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      name: "", customer_id: "", customer_type: "external", project_type: "", project_type_other: "",
      event_start: "", event_end: "", expected_amount: 0, assigned_to: "",
      broadcast_type: "", media_platform: "", tags: "", notes: "",
      box_url_internal: "", box_url_external: "",
    },
  });

  const { data: project, isLoading: projectLoading, isError: projectLoadError } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
    enabled: isEdit,
    retry: 1,
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-select"],
    queryFn: async () => (await api.get("/customers", { params: { limit: 200 } })).data,
  });
  const customers = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ["users-by-module-sales"],
    queryFn: async () => (await api.get("/users/by-module/sales")).data.data,
  });
  const users = usersData ?? [];

  useEffect(() => {
    if (project) {
      reset({
        name: project.name || "",
        customer_id: project.customer_id || "",
        customer_type: project.customer_type || "external",
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
        box_url_internal: project.box_url_internal || "",
        box_url_external: project.box_url_external || "",
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
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        navigate(`/sales/projects/${result.id}`);
      }
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

  // GLS番号付き案件一覧（リンク先選択用）
  const { data: glsProjectsData } = useQuery({
    queryKey: ["gls-projects"],
    queryFn: async () => (await api.get("/projects/gls-projects")).data,
    enabled: glsDialog.open && glsDialog.mode === 'link',
  });
  const glsProjects: { id: string; gls_number: string; name: string; customer_name: string }[] = glsProjectsData?.data ?? [];

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

  const linkGlsMutation = useMutation({
    mutationFn: async (targetProjectId: string) => {
      return (await api.post(`/projects/${id}/link-gls`, { target_project_id: targetProjectId })).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      setGlsDialog({ ...glsDialog, open: false });
      setGlsResult({ open: true, glsNumber: data.data.gls_number });
    },
  });

  const handleGlsConfirm = () => {
    if (glsDialog.mode === 'link') {
      linkGlsMutation.mutate(glsDialog.target_project_id);
    } else {
      glsMutation.mutate({
        broadcast_type: glsDialog.broadcast_type,
        media_platform: glsDialog.media_platform,
      });
    }
  };

  const onSubmit = async (values: FormValues) => {
    // バリデーション
    const errs: string[] = [];
    if (!values.customer_id) errs.push("顧客を選択してください");
    if (!values.project_type) errs.push("案件種類を選択してください");
    if (errs.length > 0) {
      setSubmitErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitErrors([]);

    // event_start/event_end をスタジオ日程から自動設定
    const prodEnd = productionMultiDay ? productionEnd : productionStart;
    if (productionStart) {
      values.event_start = (hasRehearsal && rehearsalStart) ? rehearsalStart : productionStart;
      values.event_end = prodEnd || productionStart;
    }
    saveMutation.mutate(values, {
      onSuccess: async (res) => {
        const savedProjectId = (res as any)?.id || id;
        // スタジオ予約を同時作成 (部屋・日程が指定されている場合)
        if ((scheduleRoomIds.length > 0 || locationNote.trim()) && productionStart) {
          if (locationNote.trim()) saveLocationNote(locationNote.trim());
          try {
            // 本番予約
            await api.post("/studios/bookings", {
              title: `${values.name} 本番`,
              booking_type: "performance",
              project_id: savedProjectId,
              all_day: true,
              start_time: productionStart,
              end_time: prodEnd || productionStart,
              room_ids: scheduleRoomIds,
              location_note: locationNote.trim() || null,
            });
            // リハーサル予約
            if (hasRehearsal && rehearsalStart) {
              const rehEnd = rehearsalMultiDay ? rehearsalEnd : rehearsalStart;
              await api.post("/studios/bookings", {
                title: `${values.name} リハーサル`,
                booking_type: "rehearsal",
                project_id: savedProjectId,
                all_day: true,
                start_time: rehearsalStart,
                end_time: rehEnd || rehearsalStart,
                room_ids: scheduleRoomIds,
                location_note: locationNote.trim() || null,
              });
            }
          } catch { /* 予約失敗しても案件保存は成功 */ }
        }
      },
    });
  };

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

  if (isEdit && projectLoadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4 p-6">
        <p className="text-destructive">案件データの取得に失敗しました</p>
        <Button variant="outline" onClick={() => navigate("/sales/projects")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          一覧に戻る
        </Button>
      </div>
    );
  }

  return (
    <PageTransition>
    <div className="mx-auto max-w-3xl space-y-4 lg:space-y-6 p-3 lg:p-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => navigate("/sales/projects")}>
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

      {/* 保存成功バナー */}
      {saveSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          保存しました
        </div>
      )}

      {/* バリデーションエラー */}
      {submitErrors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3">
          <div className="flex items-center gap-2 mb-1 text-sm font-medium text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            以下の項目を確認してください
          </div>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-0.5">
            {submitErrors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

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
            {currentStage === 'b_verbal' && 'GLS発番済みです。正式受注が確定したら「A 受注済へ」に進み、見積・売上管理で制作準備を始めましょう。'}
            {currentStage === 'a_won' && '受注済みです。見積・売上管理から明細を登録しましょう。'}
          </span>
        </div>
      )}

      {/* Stage change actions */}
      {isEdit && project && (
        <Card>
          <CardHeader><CardTitle className="text-base">ステージ変更</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <Label className="text-xs text-muted-foreground mb-1 block">変更先ステージ</Label>
                <Select value={stageSelectValue} onValueChange={setStageSelectValue} disabled={stageMutation.isPending}>
                  <SelectTrigger>
                    <SelectValue placeholder="ステージを選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ProjectStageLabels) as [string, string][])
                      .filter(([val]) => val !== currentStage)
                      .map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!stageSelectValue || stageMutation.isPending}
                onClick={() => {
                  if (!stageSelectValue) return;
                  if (stageSelectValue === 'e_lost') {
                    setLostDialog({ open: true, lost_reason: '', lost_reason_note: '', lessons_learned: '' });
                    setStageSelectValue("");
                  } else {
                    setStageConfirmOpen(true);
                  }
                }}
              >
                {stageMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "変更"}
              </Button>

              {/* GLS発番 */}
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
            </div>

            {/* 仮押さえ中 + A系：スタジオ予約ショートカット */}
            {currentStage === 'd_hold' && isCategoryA && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={() => navigate("/studio/calendar", {
                  state: {
                    presetRoomIds: scheduleRoomIds,
                    presetDate: (productionStart || project?.event_start)
                      ? { start: productionStart || project.event_start, end: productionEnd || productionStart || project?.event_end || project?.event_start, allDay: true }
                      : null,
                    presetProjectId: id,
                  },
                })}
              >
                <CalendarDays className="mr-1 h-4 w-4" />
                スタジオ予約
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 概算見積セクション (ヨミ段階のみ) */}
      {isEdit && isYomi && !isTerminal && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-orange-600" />
              <div>
                <span className="font-medium text-orange-800">概算見積書</span>
                <p className="text-xs text-orange-600">提案用の概算見積を作成できます。GLS発番時に確定売上へ自動変換されます。</p>
              </div>
            </div>
            <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100" onClick={() => navigate(`/sales/projects/${id}/estimates`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              概算見積作成
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
            <Button size="sm" onClick={() => navigate(`/sales/projects/${id}/episodes`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              見積・売上管理
            </Button>
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
                <div className="flex items-center justify-between mb-1">
                  <Label>顧客 *</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setCustomerDialogOpen(true)}
                  >
                    + 新規顧客
                  </button>
                </div>
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
                <Label>想定金額（税別）</Label>
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>グループ区分</Label>
                <Select value={watch("customer_type") || "external"} onValueChange={(v) => setValue("customer_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="external">グループ外</SelectItem>
                    <SelectItem value="internal">グループ内</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>社内限Box URL</Label>
                <div className="flex gap-2">
                  <Input {...register("box_url_internal")} type="url" placeholder="https://gmo.box.com/..." className="flex-1" />
                  {watch("box_url_internal") && (
                    <a href={watch("box_url_internal")} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent text-muted-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
              <div>
                <Label>外部共有Box URL</Label>
                <div className="flex gap-2">
                  <Input {...register("box_url_external")} type="url" placeholder="https://gmo.box.com/..." className="flex-1" />
                  {watch("box_url_external") && (
                    <a href={watch("box_url_external")} target="_blank" rel="noopener noreferrer"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent text-muted-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div>
              <Label>メモ</Label>
              <Textarea {...register("notes")} rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* スタジオスケジュール */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              スタジオスケジュール
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 部屋選択 */}
            <div>
              <Label className="mb-2 block">使用する部屋・空間</Label>
              <div className="space-y-2">
                {studioLocations.map((loc) => (
                  <div key={loc.id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{loc.name}</p>
                    {(loc.rooms ?? []).length === 0 ? (
                      /* 外現場: 自由記述 + 履歴サジェスト */
                      <div className="relative" ref={locationSuggestionsRef}>
                        <Input
                          placeholder="場所を入力（例: 東京国際フォーラム）"
                          value={locationNote}
                          onChange={(e) => setLocationNote(e.target.value)}
                          onFocus={() => setShowLocationSuggestions(true)}
                          className="text-sm"
                        />
                        {showLocationSuggestions && locationHistory.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md">
                            {locationHistory.map((h) => (
                              <button
                                key={h}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                                onMouseDown={(e) => { e.preventDefault(); setLocationNote(h); setShowLocationSuggestions(false); }}
                              >
                                {h}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span />
                          <label className="flex items-center gap-1 text-xs cursor-pointer text-muted-foreground">
                            <Checkbox
                              checked={(loc.rooms ?? []).every(r => scheduleRoomIds.includes(r.id))}
                              onCheckedChange={(checked) => {
                                const roomIds = (loc.rooms ?? []).map(r => r.id);
                                setScheduleRoomIds(prev =>
                                  checked
                                    ? [...new Set([...prev, ...roomIds])]
                                    : prev.filter(id => !roomIds.includes(id))
                                );
                              }}
                            />
                            全て選択
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(loc.rooms ?? []).map((room) => (
                            <label key={room.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <Checkbox
                                checked={scheduleRoomIds.includes(room.id)}
                                onCheckedChange={(checked) => {
                                  setScheduleRoomIds(prev =>
                                    checked ? [...prev, room.id] : prev.filter(id => id !== room.id)
                                  );
                                }}
                              />
                              <span className="inline-block w-2 h-2 rounded-full" style={{ background: room.color }} />
                              {room.name}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 本番日 */}
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label>本番日</Label>
                  <Input type="date" value={productionStart} onChange={(e) => setProductionStart(e.target.value)} />
                </div>
                {productionMultiDay && (
                  <div className="flex-1">
                    <Label>本番 終了日</Label>
                    <Input type="date" value={productionEnd} onChange={(e) => setProductionEnd(e.target.value)} />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                <Checkbox
                  checked={productionMultiDay}
                  onCheckedChange={(v) => {
                    setProductionMultiDay(!!v);
                    if (!v) setProductionEnd("");
                  }}
                />
                複数日程
              </label>
            </div>

            {/* リハーサル */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={hasRehearsal} onCheckedChange={(v) => {
                  setHasRehearsal(!!v);
                  if (!v) { setRehearsalStart(""); setRehearsalEnd(""); setRehearsalMultiDay(false); }
                }} />
                リハーサルあり
              </label>
              {hasRehearsal && (
                <div className="pl-6 space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label>リハーサル日</Label>
                      <Input type="date" value={rehearsalStart} onChange={(e) => setRehearsalStart(e.target.value)} />
                    </div>
                    {rehearsalMultiDay && (
                      <div className="flex-1">
                        <Label>リハーサル 終了日</Label>
                        <Input type="date" value={rehearsalEnd} onChange={(e) => setRehearsalEnd(e.target.value)} />
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer text-muted-foreground">
                    <Checkbox
                      checked={rehearsalMultiDay}
                      onCheckedChange={(v) => {
                        setRehearsalMultiDay(!!v);
                        if (!v) setRehearsalEnd("");
                      }}
                    />
                    複数日程
                  </label>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
          <Button type="button" variant="outline" onClick={() => navigate("/sales/projects")}>キャンセル</Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            保存
          </Button>
        </div>
      </form>

      {/* 新規顧客ダイアログ */}
      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(customer) => setValue("customer_id", customer.id)}
      />

      {/* ステージ変更確認ダイアログ */}
      <Dialog open={stageConfirmOpen} onOpenChange={setStageConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              ステージ変更の確認
            </DialogTitle>
            <DialogDescription>
              {(currentStage === 's_completed' || currentStage === 'e_lost') && (
                <span className="font-semibold text-red-600">終了済みステージから復帰します。意図的な操作か確認してください。</span>
              )}
              {currentStage !== 's_completed' && currentStage !== 'e_lost' && (
                <span>「{ProjectStageLabels[currentStage]}」から「{stageSelectValue ? ProjectStageLabels[stageSelectValue as ProjectStage] : ''}」に変更します。</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStageConfirmOpen(false); setStageSelectValue(""); }}>キャンセル</Button>
            <Button
              onClick={() => {
                setStageConfirmOpen(false);
                stageMutation.mutate({ stage: stageSelectValue });
                setStageSelectValue("");
              }}
            >
              変更する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              新規番組としてGLS番号を発番するか、既存のGLS案件にエピソードを追加するか選択してください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* モード選択 */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className={`rounded-lg border-2 p-3 text-left transition-colors ${glsDialog.mode === 'new' ? 'border-green-500 bg-green-50' : 'border-muted hover:border-green-300'}`}
                onClick={() => setGlsDialog({ ...glsDialog, mode: 'new', target_project_id: '' })}
              >
                <div className="font-medium text-sm">新規番組</div>
                <p className="text-xs text-muted-foreground mt-1">新しいGLS番号を発番</p>
              </button>
              <button
                type="button"
                className={`rounded-lg border-2 p-3 text-left transition-colors ${glsDialog.mode === 'link' ? 'border-blue-500 bg-blue-50' : 'border-muted hover:border-blue-300'}`}
                onClick={() => setGlsDialog({ ...glsDialog, mode: 'link' })}
              >
                <div className="font-medium text-sm">既存案件に追加</div>
                <p className="text-xs text-muted-foreground mt-1">エピソード追加</p>
              </button>
            </div>

            <div>
              <Label>案件名</Label>
              <Input value={project?.name || ""} disabled className="bg-muted" />
            </div>

            {/* 新規モード: A系の場合は番組種別と配信媒体 */}
            {glsDialog.mode === 'new' && isCategoryA && (
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

            {/* リンクモード: 既存GLS案件を選択 */}
            {glsDialog.mode === 'link' && (
              <div>
                <Label>リンク先GLS案件 *</Label>
                <SearchableSelect
                  options={glsProjects.map((p) => ({
                    value: p.id,
                    label: `${p.gls_number} ${p.name}`,
                    subLabel: p.customer_name,
                  }))}
                  value={glsDialog.target_project_id}
                  onChange={(v) => setGlsDialog({ ...glsDialog, target_project_id: v })}
                  placeholder="GLS番号で検索..."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  選択した案件のGLS番号が割り当てられ、概算見積が確定売上に変換されます。
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGlsDialog({ ...glsDialog, open: false })}>キャンセル</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleGlsConfirm}
              disabled={
                glsMutation.isPending || linkGlsMutation.isPending ||
                (glsDialog.mode === 'link' && !glsDialog.target_project_id)
              }
            >
              {(glsMutation.isPending || linkGlsMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {glsDialog.mode === 'link' ? 'GLS番号をリンク' : 'GLS発番する'}
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
              <Button onClick={() => { setGlsResult(null); navigate(`/sales/projects/${id}/episodes`); }}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  見積・売上管理へ
              </Button>
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
                navigate("/studio/calendar", {
                  state: {
                    presetRoomIds: scheduleRoomIds,
                    presetDate: (productionStart || project?.event_start)
                      ? { start: productionStart || project.event_start, end: productionEnd || productionStart || project?.event_end || project?.event_start, allDay: true }
                      : null,
                    presetProjectId: id,
                  },
                });
              }}
            >
              <CalendarDays className="mr-2 h-4 w-4" />
              スタジオ予約へ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
