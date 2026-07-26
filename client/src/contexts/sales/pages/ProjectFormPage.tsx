import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import api from "@/lib/api";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { relativeTime } from "@/lib/aiFeed";
import ProjectQuickLinks from "@/contexts/shared/components/ProjectQuickLinks";
import ProjectToolsCard from "@/contexts/shared/components/ProjectToolsCard";
import { PageTransition } from "@/components/ui/motion";
import { humanizeError } from "@gmo-onair/shared/src/client/states";
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
import { Loader2, Save, ArrowLeft, Trophy, CheckCircle2, ExternalLink, Calculator, AlertTriangle, CalendarDays, FileText, Calendar, Plus, Pencil, Trash2, Check, FolderPlus, Sparkles, Phone, Mail, Users, MessageSquare, CalendarClock, History, ChevronRight, XCircle } from "lucide-react";
import StudioBookingDialog from "@/contexts/production/components/studio/StudioBookingDialog";
import { Switch } from "@/components/ui/switch";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import { cn } from "@/lib/utils";
import { queryKeys } from "@gmo-onair/shared/src/client/hooks/queryKeys";
import {
  ProjectStageLabels, ProjectStageColors,
  ProjectTypeLabels, BroadcastTypeLabels, MediaPlatformLabels,
  type ProjectStage,
  getProjectCategory,
} from "@/types";
import SimulationDialog from "../components/SimulationDialog";
import CustomerDialog from "../components/CustomerDialog";
import ProjectMembersEditor from "../components/ProjectMembersEditor";
import PresenceAvatars from "@gmo-onair/shared/src/client/collab/PresenceAvatars";
import { useProjectCollab } from "../hooks/useProjectCollab";
import ProjectCollabCard from "../components/ProjectCollabCard";
import ProjectCommentsCard from "../components/ProjectCommentsCard";
import ProjectChangesCard from "../components/ProjectChangesCard";
import ProjectMoneyTab from "../components/ProjectMoneyTab";
import ProjectScheduleTab from "../components/ProjectScheduleTab";
import ProjectDocsTab from "../components/ProjectDocsTab";
import { useAuth } from "@/contexts/platform/AuthContext";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { notifyError, notifySuccess } from '@/lib/notify';

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
  /** 'A' = スタジオ案件 (GLS-A) / 'B' = ビジネス案件 (GLS-B) */
  gls_category: '' | 'A' | 'B';
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
  application_form: boolean;
  logo_permission: boolean;
}

interface GlsDialogState {
  open: boolean;
  mode: 'new' | 'link';
  broadcast_types: string[];
  media_platforms: string[];
  target_project_id: string;
}

/**
 * inclusive な終了日 (YYYY-MM-DD) を 1 日進めて exclusive-end に変換する。
 * StudioBookingDialog / FullCalendar は終日イベントの end を exclusive (end-1 が最終日)
 * として扱うため、案件の event 日付 (inclusive) を presetDate に渡すときはこれで揃える。
 * toISOString() の UTC 変換によるズレを避けるためローカル日付演算で計算。
 */
function addOneDayStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`;
}

// v2.9.219+: ジャーニーステッパー — ゴール(受注→完了)から逆算した現在地を可視化。
// 案件のステージ順 (ネタ→仮押さえ→見積提案→口頭決定→受注→完了) を並べ、
// 現在地を強調・通過済みにチェック。失注 (e_lost) は本線から外れた終端として別表示。
const JOURNEY_STAGES: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 's_completed'];
const JOURNEY_SHORT: Record<ProjectStage, string> = {
  neta: 'ネタ', d_hold: '仮押さえ', c_proposal: '見積提案', b_verbal: '口頭決定',
  a_won: '受注', s_completed: '完了', e_lost: '失注',
};
/**
 * ジャーニー (7a) — 6段の現在地を日付つきで出し、**次の一手を1つだけ**主ボタンにする。
 * 他のステージは「ほかのステージ」に畳む (選択肢を10個並べると人は選べない)。
 * 失注は本線から外れた終端として別扱い。
 */
const NEXT_STAGE_LABEL: Partial<Record<ProjectStage, { to: ProjectStage; label: string; note: string }>> = {
  neta: { to: 'd_hold', label: '仮押さえにする', note: 'いまネタ。日程を押さえる目処が立ったら「仮押さえ」に進めてください。' },
  d_hold: { to: 'c_proposal', label: '見積提案にする', note: 'いま仮押さえ。見積を出したら「見積提案」に進めてください。' },
  c_proposal: { to: 'b_verbal', label: '口頭決定にする', note: 'いま見積提案。お客様の合意が取れたら「口頭決定」に進めてください。' },
  b_verbal: { to: 'a_won', label: '受注にする', note: 'いま口頭決定。正式受注が固まったら「受注」に進めてください。見積・売上の明細登録はそこから始まります。' },
  a_won: { to: 's_completed', label: '完了にする', note: 'いま受注済。実施と請求が終わったら「完了」にしてください。' },
};

function JourneyPanel({
  currentStage, project, disabled, onGoStage, onOpenLost,
}: {
  currentStage: ProjectStage;
  project: Record<string, unknown> | undefined;
  disabled: boolean;
  onGoStage: (stage: ProjectStage) => void;
  onOpenLost: () => void;
}) {
  const [otherOpen, setOtherOpen] = useState(false);

  if (currentStage === 'e_lost') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive-surface px-4 py-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-destructive">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          失注
        </p>
        <p className="mt-1 text-[13px] text-foreground">
          この案件は失注として終わっています。本線には戻せますが、学びだけ残すのが基本です。
        </p>
        <button
          type="button"
          className="mt-2 text-[13px] text-primary hover:underline"
          onClick={() => setOtherOpen((v) => !v)}
        >
          ほかのステージに戻す
        </button>
        {otherOpen && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {JOURNEY_STAGES.map((st) => (
              <Button key={st} type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={() => onGoStage(st)}>
                {JOURNEY_SHORT[st]}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const curIdx = JOURNEY_STAGES.indexOf(currentStage);
  const next = NEXT_STAGE_LABEL[currentStage];
  // 各段の日付 (分かるものだけ)。ネタ=作成日 / 受注・完了=実施日
  const dateOf = (st: ProjectStage): string | null => {
    const d = (k: string) => {
      const v = project?.[k];
      return typeof v === 'string' && v ? v.slice(0, 10) : null;
    };
    if (st === 'neta') return d('created_at');
    if (st === 'a_won' || st === 's_completed') return d('event_start');
    return null;
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="overflow-x-auto px-3 py-2.5">
        <ol className="flex min-w-max items-center gap-1">
          {JOURNEY_STAGES.map((st, i) => {
            const done = i < curIdx;
            const current = i === curIdx;
            const dt = dateOf(st);
            return (
              <li key={st} className="flex items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                      current ? "ring-2 ring-offset-1" : "",
                      done || current ? "text-white" : "bg-secondary text-muted-foreground"
                    )}
                    style={done || current ? { backgroundColor: ProjectStageColors[st] } : undefined}
                  >
                    {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                  </span>
                  <span className="whitespace-nowrap">
                    <span className={cn("block text-[12px]", current ? "font-bold text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                      {JOURNEY_SHORT[st]}
                    </span>
                    {dt && <span className="block text-[11px] tabular-nums text-muted-foreground">{dt}</span>}
                  </span>
                </div>
                {i < JOURNEY_STAGES.length - 1 && (
                  <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", i < curIdx ? "text-foreground/40" : "text-muted-foreground/30")} aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-divider px-3 py-2.5">
        <p className="min-w-0 flex-1 text-[13px] text-foreground">{next?.note ?? 'この案件は完了しています。'}</p>
        {next && (
          <Button type="button" size="sm" className="h-9 shrink-0" disabled={disabled} onClick={() => onGoStage(next.to)}>
            {next.label}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-9 shrink-0" onClick={() => setOtherOpen((v) => !v)}>
          ほかのステージ
        </Button>
      </div>

      {otherOpen && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-divider px-3 py-2.5">
          {JOURNEY_STAGES.filter((st) => st !== currentStage).map((st) => (
            <Button key={st} type="button" size="sm" variant="outline" className="h-8" disabled={disabled} onClick={() => onGoStage(st)}>
              {JOURNEY_SHORT[st]}
            </Button>
          ))}
          <Button
            type="button" size="sm" variant="outline"
            className="h-8 border-destructive/40 text-destructive hover:bg-destructive-surface"
            onClick={onOpenLost}
          >
            失注にする
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * やり取りをこの場で記録する (7a)。営業活動ページに飛ばさない —
 * 飛ばすと戻ってこないので、案件の文脈のまま1件残せるようにする。
 * 既存の POST /activity-logs をそのまま使う (新規APIなし)。
 */
function ActivityQuickAdd({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("email");
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: async () =>
      api.post("/activity-logs", {
        project_id: projectId,
        activity_type: kind,
        activity_date: new Date().toISOString().slice(0, 10),
        subject: subject.trim(),
        description: detail.trim() || undefined,
        next_action: nextAction.trim() || undefined,
        next_action_date: nextAction.trim() ? nextDate || undefined : undefined,
      }),
    onSuccess: () => {
      setSubject(""); setDetail(""); setNextAction(""); setNextDate(""); setErr(null); setOpen(false);
      onDone();
    },
    onError: (e: unknown) => setErr(humanizeError(e).cause),
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-control border border-border bg-secondary/40 px-3 py-2.5 text-left text-[13px] text-secondary-foreground transition-colors hover:bg-secondary"
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
        ここにやり取りを書くと、この案件の記録として残ります（次にやることもここで決められます）
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-control border border-primary/30 bg-accent/30 p-3">
      <div className="flex flex-wrap gap-1.5">
        {([["email", "メール"], ["call", "電話"], ["meeting", "打合せ"], ["visit", "訪問"], ["other", "その他"]] as const).map(([v, lbl]) => (
          <button
            key={v}
            type="button"
            onClick={() => setKind(v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
              kind === v ? "border-primary bg-primary font-bold text-primary-foreground" : "border-border bg-card text-secondary-foreground hover:bg-secondary"
            )}
          >
            {lbl}
          </button>
        ))}
      </div>
      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="何があったか (例: 見積の相談を受けた)" className="h-9" />
      <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="くわしく (任意)" className="text-[13px]" />
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
        <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="次にやること (任意)" className="h-9" />
        <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className="h-9" aria-label="次にやることの期限" />
      </div>
      {err && <p className="text-[12px] text-destructive">{err}</p>}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" className="h-9" disabled={!subject.trim() || add.isPending} onClick={() => add.mutate()}>
          {add.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          記録する
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => { setOpen(false); setErr(null); }}>
          やめる
        </Button>
        <span className="text-[12px] text-muted-foreground">期限は「何月何日」で入れてください。</span>
      </div>
    </div>
  );
}

export default function ProjectFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [simOpen, setSimOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  // 楽観ロック: 読み込んだ版と、409 で止まったときのお知らせ
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  // 同時編集 (在席 + メモ/チェックリスト + いま触っている欄)
  const { currentUser, hasPermission } = useAuth();
  const canEditCollab = hasPermission("sales", "editor");
  const collab = useProjectCollab(
    isEdit ? id : undefined,
    currentUser ? { id: currentUser.id, name: currentUser.name } : null,
    canEditCollab,
  );
  const presenceUsers = collab.presence;
  // メモ/チェックリストは専用カードに出ているので、フォームの見出しには出さない
  const formFieldPeers = collab.fieldPeers.filter(
    (p) => p.field !== "作業メモ" && p.field !== "チェックリスト",
  );
  // いま自分が触っている欄を共有する。
  // 案件の中身は**全項目まとめて保存する**ので、別の欄を触っていても相手の変更を消す。
  // 内容そのものは同期しない (書き手を2系統にしない) が、これが見えれば衝突は避けられる。
  useEffect(() => {
    if (!isEdit || !canEditCollab) return;
    const label = (el: HTMLElement): string | null => {
      const aria = el.getAttribute("aria-label");
      if (aria) return aria.slice(0, 24);
      let n: HTMLElement | null = el.parentElement;
      for (let i = 0; i < 3 && n; i++) {
        const t = n.querySelector("label")?.textContent?.replace(/\s*\*$/, "").trim();
        if (t && t.length <= 24) return t;
        n = n.parentElement;
      }
      return null;
    };
    const onIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el?.closest?.("#project-form")) return;
      collab.setField(label(el));
    };
    const onOut = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("#project-form")) collab.setField(null);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, [isEdit, canEditCollab, collab.setField, collab]);

  const [glsDialog, setGlsDialog] = useState<GlsDialogState>({
    open: false, mode: 'new', broadcast_types: ["recording"], media_platforms: ["other"], target_project_id: "",
  });
  const [glsResult, setGlsResult] = useState<{ open: boolean; glsNumber: string } | null>(null);
  // 発番済み案件を別 GLS のエピソードへ紐づけ直す
  const [relinkDialog, setRelinkDialog] = useState<{ open: boolean; target_project_id: string }>({ open: false, target_project_id: "" });
  const [lostDialog, setLostDialog] = useState<LostDialogState>({
    open: false, lost_reason: '', lost_reason_note: '', lessons_learned: '',
  });

  // 失注理由カテゴリ（DBマスタ）
  const { data: lostReasonsData } = useQuery({
    queryKey: ["lost-reason-categories"],
    queryFn: async () => (await api.get("/sales-analytics/lost-reason-categories")).data,
  });
  const lostReasonCategories: { id: string; name: string }[] = lostReasonsData?.data ?? [];

  // 見積シミュレーション (AI 下書き = draft の検出 + 確定)
  const { data: simulationData } = useQuery({
    queryKey: ["simulation", id],
    queryFn: async () => (await api.get(`/projects/${id}/simulation`)).data,
    enabled: isEdit,
    refetchOnMount: "always",
  });
  // 配列でないものが返っても案件画面が丸ごと落ちないようにする (reduce/some は配列前提)
  const simulationItems: Array<{ subtotal: number; status?: string }> =
    Array.isArray(simulationData?.data) ? simulationData.data : [];
  const hasDraftSimulation = simulationItems.length > 0 && simulationItems.some((s) => s.status === "draft");
  const draftSimulationTotal = simulationItems.reduce((sum, s) => sum + (Number(s.subtotal) || 0), 0);
  // AI 下書きの由来 (いつ・誰の指示で・誰の名義で作られたか) — mcp_audit_log から (v2.9.198+)
  const aiDraftOrigin: { created_at?: string; requested_by?: string | null; actor_id?: string | null; actor_name?: string | null } | null =
    simulationData?.ai_draft_origin ?? null;
  const finalizeSimMutation = useMutation({
    mutationFn: async () => (await api.post(`/projects/${id}/simulation/finalize`)).data,
    onSuccess: (res) => {
      const rows: Array<{ subtotal: number }> = res?.data ?? [];
      const total = rows.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
      if (total > 0) setValue("expected_amount", total, { shouldDirty: true });
      qc.invalidateQueries({ queryKey: ["simulation", id] });
      qc.invalidateQueries({ queryKey: ["project", id] });
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      notifyError(`見積の確定に失敗しました: ${msg || "不明なエラー"}`);
    },
  });

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
  // 追加の日程（飛び日対応）
  const [extraDates, setExtraDates] = useState<Array<{ date: string; label: string }>>([]);
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
  const studioLocations: { id: string; name: string; rooms: { id: string; name: string; abbreviation?: string | null; color: string }[] }[] = studioLocationsData ?? [];

  // 編集モード: この案件に紐づくスタジオ予約を取得（単一ソース）
  const { data: projectBookingsData } = useQuery({
    queryKey: ["project-studio-bookings", id],
    queryFn: async () => (await api.get(`/studios/bookings`, { params: { project_id: id } })).data.data,
    enabled: isEdit && !!id,
  });
  const projectBookings: any[] = projectBookingsData ?? [];

  // StudioBookingDialog の制御
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<any | null>(null);
  const handleAddBooking = () => { setEditingBooking(null); setBookingDialogOpen(true); };
  const handleEditBooking = (b: any) => { setEditingBooking(b); setBookingDialogOpen(true); };
  const handleDeleteBooking = async (b: any) => {
    if (!(await confirmAction({ title: "この予約を削除しますか？", confirmLabel: '削除する', tone: 'danger' }))) return;
    try {
      await api.delete(`/studios/bookings/${b.id}`);
      qc.invalidateQueries({ queryKey: ["project-studio-bookings", id] });
      qc.invalidateQueries({ queryKey: ["studio-bookings"] });
    } catch (e) { console.error(e); }
  };

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, dirtyFields } } = useForm<FormValues>({
    defaultValues: {
      name: "", customer_id: "", customer_type: "external", project_type: "", project_type_other: "",
      gls_category: "",
      event_start: "", event_end: "", expected_amount: 0, assigned_to: "",
      broadcast_type: "", media_platform: "", tags: "", notes: "",
      box_url_internal: "", box_url_external: "",
      application_form: false, logo_permission: false,
    },
  });

  const { data: project, isLoading: projectLoading, isError: projectLoadError } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
    enabled: isEdit,
    retry: 1,
  });

  // v2.9.178+: 営業活動タイムライン (この案件の活動履歴。AI メール取込分も含む)
  const { data: activityData } = useQuery({
    queryKey: ["project-activities", id],
    queryFn: async () => (await api.get("/activity-logs", { params: { project_id: id, limit: 20 } })).data,
    enabled: isEdit && !!id,
  });
  const projectActivities: any[] = activityData?.data ?? [];

  // v2.9.178+: AI 起票案件の「確認済み」記録
  const aiReviewMutation = useMutation({
    mutationFn: async () => api.post(`/projects/${id}/ai-review`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", id] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.aiInbox() });
    },
  });

  // v2.9.219+: 「今すべきこと」の次回アクション 完了/延期 (ページ遷移なしのワンタップ)
  const nextActionMutation = useMutation({
    mutationFn: async (p: { activityId: string; action: "complete" | "postpone"; date?: string }) =>
      p.action === "complete"
        ? api.post(`/activity-logs/${p.activityId}/complete-next-action`)
        : api.post(`/activity-logs/${p.activityId}/postpone-next-action`, { date: p.date }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-activities", id] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.overdueActions() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.salesBoard() });
    },
  });
  const [naPostponeFor, setNaPostponeFor] = useState<string | null>(null);
  const dateAfterDays = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

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

  // 読み込んだ版 (楽観ロックの基準)。保存が通ったらサーバーの新しい updated_at に差し替える。
  useEffect(() => {
    if (project?.updated_at) setBaseUpdatedAt((prev) => prev ?? (project.updated_at as string));
  }, [project?.updated_at]);

  useEffect(() => {
    if (project) {
      reset({
        name: project.name || "",
        customer_id: project.customer_id || "",
        customer_type: project.customer_type || "external",
        project_type: project.project_type || "other",
        project_type_other: project.project_type_other || "",
        gls_category: (project.gls_category === 'A' || project.gls_category === 'B') ? project.gls_category : "",
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
        application_form: !!project.application_form,
        logo_permission: !!project.logo_permission,
      });
      // 仮スケジュール（複数日程）の読み込み
      if (Array.isArray(project.dates)) {
        const knownDates = new Set<string>();
        if (project.event_start) knownDates.add(project.event_start);
        if (project.event_end) knownDates.add(project.event_end);
        const extras = (project.dates as Array<{ date: string; label: string | null }>)
          .filter((d) => !knownDates.has(d.date))
          .map((d) => ({ date: d.date, label: d.label || "" }));
        setExtraDates(extras);
      }
    }
  }, [project, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (isEdit) {
        // 読み込んだ版を添えて送る → 誰かが先に保存していればサーバーが 409 で止める
        return (await api.put(`/projects/${id}`, { ...values, expected_updated_at: baseUpdatedAt })).data.data;
      } else {
        return (await api.post("/projects", values)).data.data;
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "alerts"] });
      if (isEdit) {
        setConflictMsg(null);
        setBaseUpdatedAt(result?.updated_at ?? null);
        qc.invalidateQueries({ queryKey: ["project", id] });
        setSaveSuccess(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => setSaveSuccess(false), 4000);
      } else {
        navigate(`/sales/projects/${result.id}`);
      }
    },
    onError: (err: unknown) => {
      const e = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
      if (e?.response?.status === 409) {
        setConflictMsg(
          e.response?.data?.error?.message ??
            "この案件は他の人が先に保存しています。最新を読み込んでから直してください。",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
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
    enabled: (glsDialog.open && glsDialog.mode === 'link') || relinkDialog.open,
  });
  const glsProjects: { id: string; gls_number: string; name: string; customer_name: string }[] = glsProjectsData?.data ?? [];

  const glsMutation = useMutation({
    mutationFn: async (params: { broadcast_type: string | null; media_platform: string | null }) => {
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

  // 発番済み案件を別 GLS のエピソードへ紐づけ直す
  const relinkMutation = useMutation({
    mutationFn: async (targetProjectId: string) => {
      return (await api.post(`/projects/${id}/relink-gls`, { target_project_id: targetProjectId })).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      setRelinkDialog({ open: false, target_project_id: "" });
      notifySuccess(`✓ ${data.data.gls_number} のエピソードに紐づけ直しました（旧GLS番号は履歴に保存されています）`);
    },
    onError: (err: any) => {
      notifyError(err?.response?.data?.error?.message || err?.message || '紐づけに失敗しました');
    },
  });

  // BOX フォルダ手動作成 (既存案件のバックフィル / 失敗ケースのリトライ)
  const createBoxFolderMutation = useMutation({
    mutationFn: async () => (await api.post(`/projects/${id}/create-box-folder`)).data,
    onSuccess: (data) => {
      const result = data?.data;
      if (result?.urlInternal) setValue("box_url_internal", result.urlInternal, { shouldDirty: false });
      if (result?.urlExternal) setValue("box_url_external", result.urlExternal, { shouldDirty: false });
      qc.invalidateQueries({ queryKey: ["project", id] });
      notifySuccess(result?.already
        ? "既に BOX フォルダが登録されています"
        : "✓ BOX フォルダを作成しました（社内限り / 社外共有可）");
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code;
      const msg = err?.response?.data?.error?.message || err?.message || '不明なエラー';
      const friendly = code === 'BOX_NOT_CONFIGURED'
        ? 'BOX 連携が未設定です。管理者に環境変数の設定を依頼してください。'
        : code === 'BOX_FOLDER_CREATE_FAILED'
          ? 'BOX フォルダ作成に失敗しました。親フォルダ ID 設定を確認してください。'
          : `BOX フォルダ作成に失敗しました: ${msg}`;
      notifyError(friendly);
    },
  });

  const handleCreateBoxFolder = async () => {
    if (!(await confirmAction({ title: "BOX に案件フォルダを作成しますか？" }))) return;
    createBoxFolderMutation.mutate();
  };

  const handleGlsConfirm = () => {
    if (glsDialog.mode === 'link') {
      linkGlsMutation.mutate(glsDialog.target_project_id);
    } else {
      glsMutation.mutate({
        broadcast_type: glsDialog.broadcast_types.length > 0 ? glsDialog.broadcast_types.join(',') : null,
        media_platform: glsDialog.media_platforms.length > 0 ? glsDialog.media_platforms.join(',') : null,
      });
    }
  };

  const onSubmit = async (values: FormValues) => {
    // バリデーション
    const errs: string[] = [];
    if (!values.customer_id) errs.push("顧客を選択してください");
    if (!values.project_type) errs.push("案件種類を選択してください");
    if (!values.gls_category) errs.push("案件分類（スタジオ / ビジネス）を選択してください");
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

    // 仮スケジュール（複数日程・飛び日対応）配列を組み立て
    const allDates: Array<{ date: string; label: string | null }> = [];
    if (productionStart) {
      allDates.push({ date: productionStart, label: "本番" });
      if (productionMultiDay && productionEnd && productionEnd !== productionStart) {
        allDates.push({ date: productionEnd, label: "本番（最終日）" });
      }
    }
    if (hasRehearsal && rehearsalStart) {
      allDates.push({ date: rehearsalStart, label: "リハ" });
      if (rehearsalMultiDay && rehearsalEnd && rehearsalEnd !== rehearsalStart) {
        allDates.push({ date: rehearsalEnd, label: "リハ（最終日）" });
      }
    }
    extraDates.forEach((d) => {
      if (d.date) allDates.push({ date: d.date, label: d.label || null });
    });
    if (allDates.length > 0) {
      // 重複日を排除（同じ日付があった場合は最初のラベル優先）
      const uniqueMap = new Map<string, { date: string; label: string | null }>();
      for (const d of allDates) {
        if (!uniqueMap.has(d.date)) uniqueMap.set(d.date, d);
      }
      (values as any).dates = Array.from(uniqueMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    saveMutation.mutate(values, {
      onSuccess: async (res) => {
        const savedProjectId = (res as any)?.id || id;
        // 新規案件作成時のみ、入力されたスケジュールから予約を一度だけ作成する。
        // 編集時はこのフォームから作成しない（案件詳細のスケジュール一覧＋StudioBookingDialogで CRUD）
        if (!isEdit && (scheduleRoomIds.length > 0 || locationNote.trim()) && productionStart) {
          if (locationNote.trim()) saveLocationNote(locationNote.trim());
          try {
            await api.post("/studios/bookings", {
              title: `${values.name} (${formatShortDate(productionStart)})`,
              booking_type: "performance",
              project_id: savedProjectId,
              all_day: true,
              start_time: productionStart,
              end_time: prodEnd || productionStart,
              room_ids: scheduleRoomIds,
              location_note: locationNote.trim() || null,
            });
            if (hasRehearsal && rehearsalStart) {
              const rehEnd = rehearsalMultiDay ? rehearsalEnd : rehearsalStart;
              await api.post("/studios/bookings", {
                title: `${values.name} (${formatShortDate(rehearsalStart)})`,
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
  const glsCategory = watch("gls_category");
  const hasGls = !!project?.gls_number;
  const isYomi = !hasGls;

  // 「スタジオ予約」ショートカットで StudioBookingDialog に渡す presetDate を組み立てる。
  // 案件の event 日付は inclusive のため、dialog が期待する exclusive-end に addOneDayStr で揃える
  // (揃えないと dialog 側の -1 で終了日が開始日より前になり、複数日が誤って ON になる)。
  const buildProjectPresetDate = (): { start: string; end: string; allDay: boolean } | null => {
    const start = productionStart || project?.event_start;
    if (!start) return null;
    const inclusiveEnd = productionEnd || productionStart || project?.event_end || project?.event_start || start;
    return { start, end: addOneDayStr(inclusiveEnd), allDay: true };
  };
  const isTerminal = currentStage === 's_completed' || currentStage === 'e_lost';
  // 分類はユーザー選択値を優先。未選択時のフォールバックとして project_type からの推奨値を使う
  const isCategoryA = glsCategory ? glsCategory === 'A' : getProjectCategory(projectType) === 'A';
  const isCategoryARef = useRef(isCategoryA);
  isCategoryARef.current = isCategoryA;

  // project_type を変更したら gls_category をまだ未選択のときだけデフォルト推奨を当てる
  useEffect(() => {
    if (!projectType) return;
    if (glsCategory) return; // 既に選択済みなら触らない
    setValue('gls_category', getProjectCategory(projectType));
  }, [projectType, glsCategory, setValue]);

  // 案件分類 A↔B 切替 (GLS発番後の採番し直し用)
  const [categorySwitchDialog, setCategorySwitchDialog] = useState<{ open: boolean; target: 'A' | 'B' }>({
    open: false, target: 'A',
  });
  const categorySwitchMutation = useMutation({
    mutationFn: async (target: 'A' | 'B') => {
      return (await api.patch(`/projects/${id}/gls-category`, { gls_category: target })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project", id] });
      setCategorySwitchDialog({ open: false, target: 'A' });
    },
  });

  // 未保存の項目数 (明示保存の目印)
  const dirtyCount = Object.keys(dirtyFields ?? {}).length;
  // スマホでは入力フォームを畳む (§4.19)。xl 以上では常に開いている扱い
  const [formOpen, setFormOpen] = useState(false);
  // お金 / 予定 のタブ (13章 7a / §7.12)。既定は「お金」
  // 15章で「書類」を足した。**お金・予定・書類の3つだけ**
  // (やり取り・タスクは §7.12 で「あとで」と決めている)
  const [detailTab, setDetailTab] = useState<"money" | "schedule" | "docs">("money");

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
    <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-5 sm:py-7">
      {/* ヘッダー (7a): 上=状態、真ん中=案件名、下=事実。右に行き先と保存 */}
      <header className="flex flex-wrap items-start gap-3">
        <Button type="button" variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label="案件一覧へ戻る" onClick={() => navigate("/projects")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* 25章: お試し (練習) はどの画面でも一目で分かるようにする。
                本物と見分けが付かないと、練習を本物と思って進めてしまう */}
            {isEdit && (project as { is_sandbox?: boolean } | undefined)?.is_sandbox && (
              <span className="shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[12px] font-bold text-amber-900 ring-1 ring-amber-300">
                お試し（練習）・数字には入りません
              </span>
            )}
            {isEdit && (
              <Badge className="shrink-0" style={{ backgroundColor: ProjectStageColors[currentStage], color: '#fff' }}>
                {ProjectStageLabels[currentStage] || currentStage}
              </Badge>
            )}
            {isEdit && project?.gls_category && (
              <span className="text-[12px] text-secondary-foreground">
                {project.gls_category === 'A' ? 'スタジオ案件' : 'ビジネス案件'}
              </span>
            )}
            {isEdit && project?.assigned_to_name && (
              <span className="text-[12px] text-secondary-foreground">担当 {project.assigned_to_name}</span>
            )}
          </div>
          <h1 className="mt-1 text-xl font-bold text-foreground sm:text-2xl [overflow-wrap:anywhere]">
            {isEdit ? (watch("name") || project?.name || "案件") : "新しい案件"}
          </h1>
          {isEdit && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-secondary-foreground">
              {project?.customer_name && <span>{project.customer_name}</span>}
              {project?.event_start && (
                <span>
                  {String(project.event_start).slice(0, 10)}
                  {project?.event_end && project.event_end !== project.event_start ? ` 〜 ${String(project.event_end).slice(0, 10)}` : ""}
                </span>
              )}
              {(project?.gls_number || project?.code) && (
                <span className="tabular-nums text-muted-foreground">
                  {project.gls_number || project.code}
                  <span className="ml-1 text-[12px]">経理・請求で使う番号です</span>
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* 今この案件を開いている人 (他に誰もいなければ何も出さない) */}
          <PresenceAvatars users={presenceUsers} currentUserId={currentUser?.id} />
          {isEdit && id && (
            <ProjectQuickLinks
              projectId={id}
              projectName={watch("name") || project?.name}
              currentPage="project"
            />
          )}
          {/* 明示保存。自動保存にはしない (金額を含む画面なので勝手に確定させない) */}
          {dirtyCount > 0 && (
            <span className="rounded-full bg-warning-surface px-2 py-1 text-[12px] font-bold text-warning-strong">
              未保存の変更 {dirtyCount}件
            </span>
          )}
          <Button type="submit" form="project-form" disabled={saveMutation.isPending} className="h-9 gap-1.5">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
        </div>
      </header>

      {/* ジャーニー (現在地 + 次の一手1つ) */}
      {isEdit && project && (
        <JourneyPanel
          currentStage={currentStage}
          project={project}
          disabled={stageMutation.isPending}
          onGoStage={(st) => { setStageSelectValue(st); setStageConfirmOpen(true); }}
          onOpenLost={() => setLostDialog({ open: true, lost_reason: '', lost_reason_note: '', lessons_learned: '' })}
        />
      )}

      {/* 競合バナー: 他の人が先に保存していた (保存は通していない = 相手の変更は消していない) */}
      {conflictMsg && (
        <div className="sticky top-2 z-40 rounded-lg border border-destructive bg-destructive-surface p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {conflictMsg}
          </div>
          <p className="mt-1 text-[13px] text-secondary-foreground">
            入力した内容はこの画面に残っています。必要な箇所を控えてから「最新を読み込む」を押してください。
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setConflictMsg(null);
                setBaseUpdatedAt(null);
                qc.invalidateQueries({ queryKey: ["project", id] });
              }}
            >
              最新を読み込む
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConflictMsg(null)}>
              閉じる
            </Button>
          </div>
        </div>
      )}

      {/* 保存完了バナー（画面上部・幅広） */}
      {saveSuccess && (
        <div className="sticky top-2 z-40 rounded-lg bg-green-100 border border-green-300 p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-sm font-medium text-green-800">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
            保存しました
          </div>
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

      {/* v2.9.178+: AI 起票バナー。判定はサーバー計算の is_ai_created (OAuth 本人名義でも検出) */}
      {isEdit && !!project?.is_ai_created && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
          <Sparkles className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            AI がメールから作った案件です。内容が合っているか見てください。
            {project.ai_requested_by ? <span className="ml-1 font-medium">指示: {project.ai_requested_by}</span> : null}
          </span>
          {project.ai_reviewed_at ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-green-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              確認済み ({new Date(project.ai_reviewed_at).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })})
            </span>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 h-8 gap-1 border-violet-300 text-violet-700 hover:bg-violet-100"
              disabled={aiReviewMutation.isPending}
              onClick={() => aiReviewMutation.mutate()}
            >
              {aiReviewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              確認した
            </Button>
          )}
        </div>
      )}

      {/* ───── 左=進める / 右=事実 (7a) ───── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="min-w-0 space-y-4">
      {/* ① 今すべきこと — 次回アクション + 未設定の警告 (自問自答⑩「ネクストアクションはあるか」) */}
      {isEdit && project && (() => {
        const openActions = projectActivities.filter(
          (a) => a.next_action && !a.next_action_done_at
        );
        const today = new Date().toISOString().slice(0, 10);
        // 進行中 (ネタ・失注・完了以外) で次アクションが1つも無ければ「異常」として警告
        const needsNextAction = !isTerminal && currentStage !== 'neta' && openActions.length === 0;
        if (openActions.length === 0 && !needsNextAction) return null;
        return (
          <Card className={needsNextAction ? "border-amber-300 bg-amber-50/50" : "border-blue-200"}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className={cn("h-4 w-4", needsNextAction ? "text-amber-600" : "text-blue-600")} aria-hidden="true" />
                今すべきこと
              </CardTitle>
            </CardHeader>
            <CardContent>
              {needsNextAction ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  <span className="font-medium text-amber-800">次にやることが決まっていません。</span>
                  <span className="text-amber-700">お客様を待たせないよう、次回アクションを設定しましょう。</span>
                  <Button
                    type="button" size="sm" variant="outline"
                    className="ml-auto h-8 gap-1 border-amber-300 text-xs text-amber-700"
                    onClick={() => navigate("/sales/activity-logs")}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> やり取りを記録
                  </Button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {openActions.map((a) => {
                    const overdue = a.next_action_date && a.next_action_date < today;
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className={cn("min-w-0 flex-1", overdue ? "text-red-700 font-medium" : "text-foreground")}>
                          → {a.next_action}
                          {a.next_action_date ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              （期限 {a.next_action_date}{overdue ? " · 超過" : ""}）
                            </span>
                          ) : null}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]"
                            disabled={nextActionMutation.isPending}
                            onClick={() => nextActionMutation.mutate({ activityId: a.id, action: "complete" })}
                          >
                            <Check className="h-3 w-3" aria-hidden="true" /> 完了
                          </Button>
                          {naPostponeFor === a.id ? (
                            <>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[11px]" onClick={() => nextActionMutation.mutate({ activityId: a.id, action: "postpone", date: dateAfterDays(1) })}>明日</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[11px]" onClick={() => nextActionMutation.mutate({ activityId: a.id, action: "postpone", date: dateAfterDays(7) })}>1週間</Button>
                              <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-[11px]" onClick={() => setNaPostponeFor(null)}>×</Button>
                            </>
                          ) : (
                            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setNaPostponeFor(a.id)}>延期</Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* ② お客様とのやり取り (タイムライン — 高頻度なので上部に配置。AI メール取込分も含む) */}
      {isEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <History className="h-4 w-4 text-primary" aria-hidden="true" />
              お客様とのやり取り
              {projectActivities.length > 0 ? (
                <span className="text-xs font-normal text-muted-foreground">直近 {projectActivities.length} 件</span>
              ) : null}
              <span className="ml-auto text-[12px] font-normal text-muted-foreground">
                メールは AI が自動で取り込みます
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* この場で記録する (画面を離れさせない) */}
            <ActivityQuickAdd projectId={id!} onDone={() => qc.invalidateQueries({ queryKey: ["project-activities", id] })} />
            {projectActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                やり取りの記録はまだありません。上の欄に書くと、この案件の記録として残ります。
              </p>
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5 ml-1.5">
                {projectActivities.map((a: any) => {
                  const actMeta: Record<string, { label: string; icon: React.ElementType }> = {
                    call: { label: "電話", icon: Phone },
                    email: { label: "メール", icon: Mail },
                    meeting: { label: "打合せ", icon: Users },
                    visit: { label: "訪問", icon: Users },
                    proposal: { label: "提案", icon: FileText },
                    demo: { label: "デモ", icon: MessageSquare },
                    followup: { label: "フォロー", icon: MessageSquare },
                    follow_up: { label: "フォロー", icon: MessageSquare },
                    other: { label: "その他", icon: MessageSquare },
                  };
                  const m = actMeta[a.activity_type] ?? actMeta.other;
                  const MIcon = m.icon;
                  const naOverdue = a.next_action_date && !a.next_action_done_at && a.next_action_date < new Date().toISOString().slice(0, 10);
                  return (
                    <li key={a.id} className="relative">
                      {/* AI 取込は violet、手入力は orange でバレットを色分け (一目で入力元が分かる) */}
                      <span className={cn(
                        "absolute -left-[27px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border bg-card",
                        a.is_ai_created ? "border-violet-300 bg-violet-50" : "border-border"
                      )}>
                        <MIcon className={cn("h-3 w-3", a.is_ai_created ? "text-violet-600" : "text-orange-600")} aria-hidden="true" />
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{m.label}</span>
                        <span>{a.activity_date}</span>
                        {a.user_name ? <span>{a.user_name}</span> : null}
                        {a.is_ai_created ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-violet-50 border border-violet-200 px-1.5 py-0.5 text-[10px] text-violet-700"
                            title={a.ai_requested_by ? `AI が記録しました (指示: ${a.ai_requested_by})` : "AI が記録しました"}
                          >
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            AI作成
                          </span>
                        ) : null}
                        {a.ai_requested_by ? (
                          <span className="text-[10px] text-violet-600">指示: {a.ai_requested_by}</span>
                        ) : null}
                        {a.source_channel ? (
                          <span className="inline-flex items-center rounded-full bg-sky-50 border border-sky-200 px-1.5 py-0.5 text-[10px] text-sky-700" title="流入チャネル">
                            {a.source_channel}
                          </span>
                        ) : null}
                        {a.message_id ? (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600"
                            title={`メール由来 (Message-ID: ${a.message_id})`}
                          >
                            ✉ メール取込
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm font-medium text-foreground">{a.subject}</p>
                      {a.description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-line line-clamp-3">{a.description}</p>
                      ) : null}
                      {a.next_action ? (
                        <p className={cn(
                          "mt-1 flex items-center gap-1.5 text-xs",
                          a.next_action_done_at ? "text-muted-foreground line-through" : naOverdue ? "text-red-600 font-medium" : "text-blue-700"
                        )}>
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          {a.next_action_date ?? ""} {a.next_action}
                          {a.next_action_done_at ? <span className="no-underline">✓ 完了</span> : naOverdue ? <span>(期限超過)</span> : null}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      )}


        {/* みんなで書くメモとチェックリスト — ここだけは2人で同時に打っても消えない */}
        {isEdit && id && (
          <ProjectCollabCard
            projectId={id}
            canEdit={canEditCollab}
            synced={collab.synced}
            failed={collab.failed}
            doc={collab.doc}
            mutate={collab.mutate}
            presenceCount={presenceUsers.length}
            setField={collab.setField}
          />
        )}

        {/* コメントと知らせる人 — メモと違い「言った・言わない」の記録なので残す */}
        {isEdit && id && <ProjectCommentsCard projectId={id} editable={canEditCollab} />}

        {/* 変更の記録 (主要な項目だけ)。既定は畳む — 毎回見るものではない */}
        {isEdit && id && <ProjectChangesCard projectId={id} />}

        {/* 現場の道具 — 案件から開くと、この案件の記録として残る (§4.14) */}
        {isEdit && id && <ProjectToolsCard projectId={id} projectName={watch("name") || project?.name} />}

        {/*
          お金 と 予定 は案件の中で**往復がいちばん多い**ので、この2つだけタブにする
          (§7.12 / デザイン 13章 7a)。やり取り・タスク・書類はあとで、
          現場の道具はリンクのまま。
          旧「財務サマリー」(3値・売上か仕入があるときだけ表示) を置き換えている —
          3値だと**想定金額が出ず、受注前は粗利が常にマイナスに見えた**。
        */}
        {isEdit && id && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="お金と予定と書類">
                {([
                  { key: "money" as const, label: "お金" },
                  { key: "schedule" as const, label: "予定" },
                  { key: "docs" as const, label: "書類" },
                ]).map((t) => (
                  <button key={t.key} type="button" role="tab"
                    aria-selected={detailTab === t.key}
                    onClick={() => setDetailTab(t.key)}
                    className={cn(
                      "min-h-[40px] flex-1 rounded-lg px-3 text-sm",
                      detailTab === t.key ? "bg-card font-bold shadow-sm" : "text-muted-foreground",
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                {detailTab === "money" && <ProjectMoneyTab projectId={id} />}
                {detailTab === "schedule" && <ProjectScheduleTab projectId={id} canEdit={canEditCollab} />}
                {detailTab === "docs" && <ProjectDocsTab projectId={id} />}
              </div>
            </CardContent>
          </Card>
        )}

      {/* 見積 (30章 37a)。**ヨミ段階に限らない** — 口頭決定・受注のあとに直すことも多い */}
      {isEdit && !isTerminal && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <span className="font-medium">見積</span>
                <p className="text-xs text-muted-foreground">
                  料金表から選ぶか AI に下書きさせて、粗利をその場で見ながら組みます。
                  確定すると想定金額に入ります{isYomi ? "（GLS発番時に確定売上へ変わります）" : ""}。
                </p>
              </div>
            </div>
            {/* スマホのタップ領域を44px以上にする (size="sm" は36px。iOS HIG の下限を割る) */}
            <Button size="sm" variant="outline" className="min-h-[44px]"
              onClick={() => navigate(`/sales/projects/${id}/estimates`)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              見積をつくる
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
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setRelinkDialog({ open: true, target_project_id: "" })}>
                別GLSへ紐づけ
              </Button>
              <Button size="sm" onClick={() => navigate(`/sales/projects/${id}/episodes`)}>
                <ExternalLink className="mr-2 h-4 w-4" />
                見積・売上管理
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      </div>

      <div className="min-w-0 space-y-4">
        {/* 仮押さえ中 + A系：スタジオ予約ショートカット */}
        {currentStage === 'd_hold' && isCategoryA && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={() => navigate("/schedule?layers=studio", {
              state: {
                presetRoomIds: scheduleRoomIds,
                presetDate: buildProjectPresetDate(),
                presetProjectId: id,
              },
            })}
          >
            <CalendarDays className="mr-1 h-4 w-4" />
            スタジオ予約
          </Button>
        )}

      {/*
        スマホでは「案件の中身」(入力フォーム) を既定で畳む (§4.19 / デザイン 19b)。
        スマホで見るのは 状態 → 3値 → 今すべきこと → やり取り で、長い入力フォームは
        その下に積むと延々スクロールすることになる。
        **unmount ではなく CSS で隠す** — ヘッダーの「保存」は form="project-form" で
        この form を submit するので、外すと畳んだ状態で保存が黙って効かなくなる。
      */}
      <button
        type="button"
        onClick={() => setFormOpen((v) => !v)}
        aria-expanded={formOpen}
        className="flex w-full items-center justify-between rounded-control border border-border bg-card px-3 py-2.5 text-sm font-bold text-foreground xl:hidden"
      >
        案件の中身を{formOpen ? "閉じる" : "開いて直す"}
        {dirtyCount > 0 && (
          <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[11px] font-bold text-warning-strong">
            未保存 {dirtyCount}件
          </span>
        )}
      </button>

      <form
        id="project-form"
        onSubmit={handleSubmit(onSubmit)}
        className={cn("space-y-4", formOpen ? "" : "hidden xl:block")}
      >
        {/* 基本情報 (常に表示) */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex flex-wrap items-baseline gap-2 text-base">案件の中身<span className="text-[12px] font-normal text-muted-foreground">直したら右上の「保存」を押してください</span>
            {/* 誰がどの欄を触っているか。まとめて保存するので、別の欄でも相手の変更を消す */}
            {formFieldPeers.length > 0 && (
              <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[12px] font-bold text-warning-strong">
                いま編集中: {formFieldPeers.map((p) => `${p.field}（${p.name}）`).join(" / ")}
              </span>
            )}
          </CardTitle></CardHeader>
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
            {/* 案件種類(その他) は 14章 27a の「やめる」。同じ意味の言葉が増えるだけで、
                検索も集計も使っていなかった。既存データは残るが新しくは入れない。 */}

            {/* 案件分類 (GLS-A / GLS-B) — 登録時必須。発番後は採番し直しダイアログ経由 */}
            <div>
              <Label>案件分類 *</Label>
              {hasGls ? (
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className={glsCategory === 'A'
                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'}>
                    {glsCategory === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCategorySwitchDialog({
                      open: true,
                      target: glsCategory === 'A' ? 'B' : 'A',
                    })}
                  >
                    {glsCategory === 'A' ? 'ビジネス案件 (B) に変更…' : 'スタジオ案件 (A) に変更…'}
                  </Button>
                  <p className="w-full text-xs text-muted-foreground">
                    GLS発番済のため、分類変更時はGLS番号が採番し直されます（BOXフォルダ名・エピソードコードも自動で更新）。
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setValue('gls_category', 'A', { shouldDirty: true })}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition',
                        glsCategory === 'A'
                          ? 'border-blue-400 bg-blue-50 text-blue-800 ring-2 ring-blue-200'
                          : 'border-input bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      スタジオ案件 (GLS-A)
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue('gls_category', 'B', { shouldDirty: true })}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm font-medium transition',
                        glsCategory === 'B'
                          ? 'border-amber-400 bg-amber-50 text-amber-800 ring-2 ring-amber-200'
                          : 'border-input bg-background text-foreground hover:bg-muted',
                      )}
                    >
                      ビジネス案件 (GLS-B)
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    スタジオ収録・配信・イベント等は「スタジオ案件」、コンサル・GMO内部案件等は「ビジネス案件」を選択してください。
                  </p>
                </>
              )}
            </div>


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
                {hasDraftSimulation && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-amber-900">AI が作った見積の下書きがあります</p>
                        <p className="mt-0.5 text-xs text-amber-800">
                          合計 <span className="font-number font-semibold">{formatCurrency(draftSimulationTotal)}</span>。
                          「確定する」を押すと想定金額に入ります。
                        </p>
                        {aiDraftOrigin?.created_at && (
                          // 実行者は主線に出さず title に退避する (認証方式そのものは書かない)
                          <p
                            className="mt-0.5 text-[11px] text-amber-700"
                            title={`実行: ${aiDraftOrigin.actor_id === "mcp-claude" ? "AI（担当者の記録なし）" : (aiDraftOrigin.actor_name ?? "不明")}`}
                          >
                            {relativeTime(aiDraftOrigin.created_at)}に作成
                            {aiDraftOrigin.requested_by ? `（指示: ${aiDraftOrigin.requested_by}）` : ""}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 bg-amber-600 text-xs hover:bg-amber-700"
                            onClick={() => finalizeSimMutation.mutate()}
                            disabled={finalizeSimMutation.isPending}
                          >
                            {finalizeSimMutation.isPending
                              ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              : <Check className="mr-1 h-3 w-3" />}
                            確定する
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 border-amber-300 text-xs"
                            onClick={() => setSimOpen(true)}
                          >
                            <Calculator className="mr-1 h-3 w-3" />
                            内容を確認・編集
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <Label>主担当</Label>
                <SearchableSelect
                  options={(users as Array<{ id: string; name: string }>).map((u) => ({ value: u.id, label: u.name }))}
                  value={watch("assigned_to")}
                  onChange={(v) => setValue("assigned_to", v)}
                  placeholder="主担当を検索..."
                />
              </div>
            </div>

            {/* 担当メンバー (複数担当・外部の方対応) — 案件保存後に利用可能 */}
            {isEdit && id ? (
              <div className="rounded-lg border bg-card p-4">
                <ProjectMembersEditor projectId={id} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                担当メンバー（複数・外部の方の手入力）は、案件を保存後に追加できます。
              </p>
            )}

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

            {/* Box フォルダ — 案件作成時に社内限り / 社外共有可の 2 親フォルダへ自動作成される (v2.7.11+) */}
            {/* URL は表示専用。フォーム送信時に値を保持するため hidden register */}
            <input type="hidden" {...register("box_url_internal")} />
            <input type="hidden" {...register("box_url_external")} />
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="font-semibold">Box フォルダ</Label>
                {isEdit && (!watch("box_url_internal") || !watch("box_url_external")) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateBoxFolder}
                    disabled={createBoxFolderMutation.isPending}
                    className="gap-1.5"
                    title="BOX に案件フォルダを作成"
                  >
                    {createBoxFolderMutation.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FolderPlus className="h-4 w-4" />}
                    <span>{(watch("box_url_internal") || watch("box_url_external")) ? "未作成側を作成" : "BOX フォルダ作成"}</span>
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                案件作成時に「社内限り（機密情報）」「社外共有可（顧客と共有）」の 2 フォルダが BOX に自動作成されます。
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border bg-background p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">社内限り（機密情報）</div>
                  {watch("box_url_internal") ? (
                    <a href={watch("box_url_internal")} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" />
                      BOX で開く
                    </a>
                  ) : (
                    <div className="text-sm text-muted-foreground">未作成</div>
                  )}
                </div>
                <div className="rounded-lg border bg-background p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">社外共有可（顧客とも共有）</div>
                  {watch("box_url_external") ? (
                    <a href={watch("box_url_external")} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" />
                      BOX で開く
                    </a>
                  ) : (
                    <div className="text-sm text-muted-foreground">未作成</div>
                  )}
                </div>
              </div>
            </div>

            {/* 書類管理 — application_form (申込書) と logo_permission (ロゴ使用許諾) */}
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <Label className="font-semibold">まだ揃っていない書類</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                申込書を ON にするとダッシュボードの「申込書未提出」アラート対象から外れます。
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-medium">申込書 受領済</Label>
                    <p className="text-xs text-muted-foreground">先方から申込書を受け取って保管済</p>
                  </div>
                  <Switch
                    checked={!!watch("application_form")}
                    onCheckedChange={(v) => setValue("application_form", !!v, { shouldDirty: true })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-sm font-medium">ロゴ使用許諾 取得済</Label>
                    <p className="text-xs text-muted-foreground">先方からロゴ使用の許可を取得済</p>
                  </div>
                  <Switch
                    checked={!!watch("logo_permission")}
                    onCheckedChange={(v) => setValue("logo_permission", !!v, { shouldDirty: true })}
                  />
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
              スタジオの日程
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 編集モード: 既存の studio_bookings を一覧表示 (単一ソース) */}
            {isEdit && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">登録済みの予約</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddBooking}>
                    <Plus className="mr-1 h-3 w-3" />
                    予約を追加
                  </Button>
                </div>
                {projectBookings.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    この案件に紐づく予約はまだありません
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {projectBookings.map((b: any) => {
                      const typeLabel = b.booking_type === 'performance' ? '本番'
                        : b.booking_type === 'rehearsal' ? 'リハーサル'
                        : b.booking_type === 'hold' ? '仮押さえ'
                        : b.booking_type;
                      const dateDisp = formatShortDate(b.start_time);
                      const roomNames = (b.rooms ?? []).map((r: any) => r.room_name).join(' / ');
                      return (
                        <div
                          key={b.id}
                          className="flex items-center gap-2 rounded border p-2 hover:bg-accent/50 cursor-pointer"
                          onClick={() => handleEditBooking(b)}
                        >
                          <Badge variant="outline" className="shrink-0">{typeLabel}</Badge>
                          <div className="flex-1 min-w-0 text-sm truncate">
                            <span className="font-medium">{dateDisp}</span>
                            {roomNames && <span className="ml-2 text-muted-foreground">{roomNames}</span>}
                            {b.location_note && <span className="ml-2 text-muted-foreground">{b.location_note}</span>}
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleEditBooking(b); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); handleDeleteBooking(b); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {projectBookings.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    以下の入力欄は、案件にまだ予約が無いとき用です。予約を登録すると非表示になります（以後は上の「予約を追加」から管理してください）
                  </p>
                )}
              </div>
            )}
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                以下を入力すると、案件登録時にスタジオ予約も同時に作成されます（後から個別に編集・追加可能）
              </p>
            )}
            {/* 予約登録前（仮押さえ前）のみ表示。予約が登録されたら以後はスケジュール一覧＋「予約を追加」で管理 */}
            {projectBookings.length === 0 && (
            <>
            {/* 部屋選択 */}
            <div>
              <Label className="mb-2 block">使用する部屋・空間</Label>
              <div className="space-y-4">
                {studioLocations.map((loc) => {
                  const rooms = loc.rooms ?? [];
                  const allSelected = rooms.length > 0 && rooms.every(r => scheduleRoomIds.includes(r.id));
                  return (
                    <div key={loc.id}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-muted-foreground">{loc.name}</p>
                        {rooms.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const roomIds = rooms.map(r => r.id);
                              setScheduleRoomIds(prev =>
                                allSelected
                                  ? prev.filter(id => !roomIds.includes(id))
                                  : [...new Set([...prev, ...roomIds])]
                              );
                            }}
                            className={cn(
                              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                              allSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input hover:bg-accent"
                            )}
                          >
                            {allSelected ? '全て解除' : '全て選択'}
                          </button>
                        )}
                      </div>
                      {rooms.length === 0 ? (
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
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                          {rooms.map((room) => {
                            const selected = scheduleRoomIds.includes(room.id);
                            return (
                              <button
                                key={room.id}
                                type="button"
                                role="switch"
                                aria-checked={selected}
                                onClick={() => {
                                  setScheduleRoomIds(prev =>
                                    selected ? prev.filter(id => id !== room.id) : [...prev, room.id]
                                  );
                                }}
                                className={cn(
                                  "min-h-[44px] flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm text-left transition-all",
                                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  selected
                                    ? "border-transparent text-white shadow-sm"
                                    : "border-input hover:border-primary/40 bg-background hover:bg-muted/30"
                                )}
                                style={selected ? { background: room.color } : undefined}
                              >
                                <span
                                  className={cn(
                                    "inline-block h-2.5 w-2.5 rounded-full shrink-0",
                                    selected && "ring-2 ring-white/60"
                                  )}
                                  style={{ background: selected ? '#ffffff' : room.color }}
                                />
                                <span className="truncate flex-1 font-medium">{room.name}</span>
                                {selected && <Check className="h-4 w-4 shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>複数日程</span>
                <Switch
                  checked={productionMultiDay}
                  onCheckedChange={(v) => {
                    setProductionMultiDay(!!v);
                    if (!v) setProductionEnd("");
                  }}
                />
              </div>
            </div>

            {/* リハーサル */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>リハーサルあり</span>
                <Switch
                  checked={hasRehearsal}
                  onCheckedChange={(v) => {
                    setHasRehearsal(!!v);
                    if (!v) { setRehearsalStart(""); setRehearsalEnd(""); setRehearsalMultiDay(false); }
                  }}
                />
              </div>
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
                  <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                    <span>複数日程</span>
                    <Switch
                      checked={rehearsalMultiDay}
                      onCheckedChange={(v) => {
                        setRehearsalMultiDay(!!v);
                        if (!v) setRehearsalEnd("");
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 追加の日程（飛び日対応） */}
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <Label>追加の日程（飛び日対応）</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    本番・リハと別の日（撤去日や中日など）を追加できます
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExtraDates((prev) => [...prev, { date: "", label: "" }])
                  }
                >
                  + 日程を追加
                </Button>
              </div>
              {extraDates.length > 0 && (
                <div className="space-y-2">
                  {extraDates.map((d, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">日付</Label>
                        <Input
                          type="date"
                          value={d.date}
                          onChange={(e) =>
                            setExtraDates((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], date: e.target.value };
                              return next;
                            })
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">ラベル</Label>
                        <Input
                          value={d.label}
                          onChange={(e) =>
                            setExtraDates((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx], label: e.target.value };
                              return next;
                            })
                          }
                          placeholder="例: 撤去 / 中日 / 予備日"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive shrink-0"
                        onClick={() =>
                          setExtraDates((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
            )}
          </CardContent>
        </Card>

        {/* 番組情報 (A系 + GLS発番後のみ表示) */}
        {hasGls && isCategoryA && (
          <Card>
            <CardHeader><CardTitle className="text-base">番組情報</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <Label>番組種別 <span className="text-xs text-muted-foreground">(複数選択可)</span></Label>
                  {(() => {
                    const selected = (watch("broadcast_type") || "").split(",").map((s) => s.trim()).filter(Boolean);
                    return (
                      <div className="mt-2">
                        <ToggleButtonGroup
                          options={(Object.entries(BroadcastTypeLabels) as [string, string][]).map(([val, label]) => ({ value: val, label }))}
                          value={selected}
                          onChange={(next) => setValue("broadcast_type", next.join(","))}
                          multi
                          cols={{ base: 2 }}
                        />
                      </div>
                    );
                  })()}
                </div>
                <div>
                  <Label>配信媒体 <span className="text-xs text-muted-foreground">(複数選択可)</span></Label>
                  {(() => {
                    const selected = (watch("media_platform") || "").split(",").map((s) => s.trim()).filter(Boolean);
                    return (
                      <div className="mt-2">
                        <ToggleButtonGroup
                          options={(Object.entries(MediaPlatformLabels) as [string, string][]).map(([val, label]) => ({ value: val, label }))}
                          value={selected}
                          onChange={(next) => setValue("media_platform", next.join(","))}
                          multi
                          cols={{ base: 2, sm: 3 }}
                        />
                      </div>
                    );
                  })()}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* タグ */}
        {/* タグは 14章 27a の「やめる」。入れる手間だけがかかっていて検索に使われていない。
            サーバー側の絞り込み (?tag=) と MCP の一括更新は残してあるので既存データは読める。 */}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-[13px] font-bold text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              保存しました
            </span>
          )}
          <Button type="button" variant="outline" className="h-9" onClick={() => navigate("/projects")}>案件一覧へ戻る</Button>
          <Button type="submit" disabled={saveMutation.isPending} className="h-9 gap-1.5">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存
          </Button>
        </div>
      </form>
      </div>
      </div>


      {/* 新規顧客ダイアログ */}
      <CustomerDialog
        open={customerDialogOpen}
        onOpenChange={setCustomerDialogOpen}
        onCreated={(customer) => setValue("customer_id", customer.id)}
      />

      {/* ステージ変更確認ダイアログ */}
      <Dialog open={stageConfirmOpen} onOpenChange={setStageConfirmOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
        onOpenChange={(o) => {
          setSimOpen(o);
          // 閉じたら見積の draft/final 状態を取り直す (ダイアログ内保存は final 化するため)
          if (!o) qc.invalidateQueries({ queryKey: ["simulation", id] });
        }}
        projectId={isEdit ? id : undefined}
        onApply={(total) => setValue("expected_amount", total, { shouldDirty: true })}
      />

      {/* GLS発番ダイアログ */}
      <Dialog open={glsDialog.open} onOpenChange={(open) => setGlsDialog({ ...glsDialog, open })}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {/* 新規モード: A系の場合は番組種別と配信媒体（複数選択可） */}
            {glsDialog.mode === 'new' && isCategoryA && (
              <>
                <div>
                  <Label>番組種別 * <span className="text-xs text-muted-foreground">(複数選択可)</span></Label>
                  <div className="mt-2">
                    <ToggleButtonGroup
                      options={(Object.entries(BroadcastTypeLabels) as [string, string][]).map(([val, label]) => ({ value: val, label }))}
                      value={glsDialog.broadcast_types}
                      onChange={(next) => setGlsDialog({ ...glsDialog, broadcast_types: next })}
                      multi
                      cols={{ base: 2 }}
                    />
                  </div>
                </div>
                <div>
                  <Label>配信媒体 * <span className="text-xs text-muted-foreground">(複数選択可)</span></Label>
                  <div className="mt-2">
                    <ToggleButtonGroup
                      options={(Object.entries(MediaPlatformLabels) as [string, string][]).map(([val, label]) => ({ value: val, label }))}
                      value={glsDialog.media_platforms}
                      onChange={(next) => setGlsDialog({ ...glsDialog, media_platforms: next })}
                      multi
                      cols={{ base: 2, sm: 3 }}
                    />
                  </div>
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
                (glsDialog.mode === 'link' && !glsDialog.target_project_id) ||
                (glsDialog.mode === 'new' && isCategoryA &&
                  (glsDialog.broadcast_types.length === 0 || glsDialog.media_platforms.length === 0))
              }
            >
              {(glsMutation.isPending || linkGlsMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {glsDialog.mode === 'link' ? 'GLS番号をリンク' : 'GLS発番する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 別GLSへ紐づけ直しダイアログ (発番済み案件をエピソード化) */}
      <Dialog open={relinkDialog.open} onOpenChange={(open) => setRelinkDialog({ ...relinkDialog, open })}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>別GLSのエピソードへ紐づけ直す</DialogTitle>
            <DialogDescription>
              この案件（現在 {project?.gls_number}）を、選択した既存GLS案件のエピソードとして付け替えます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>紐づけ先のGLS案件</Label>
              <SearchableSelect
                options={glsProjects
                  .filter((p) => p.id !== id)
                  .map((p) => ({ value: p.id, label: `${p.gls_number}　${p.name}`, subLabel: p.customer_name }))}
                value={relinkDialog.target_project_id}
                onChange={(v) => setRelinkDialog({ ...relinkDialog, target_project_id: v })}
                placeholder="GLS番号で検索..."
              />
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <p>適用すると以下が行われます：</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>GLS番号が紐づけ先のものに変わり、エピソードコードは新GLSで採番し直されます</li>
                <li>現在のGLS番号（{project?.gls_number}）は履歴 (previous_gls_numbers) に保存されます</li>
                <li>BOXフォルダ名・Qシートのエピソードコードも新GLSに更新されます</li>
                <li>概算見積が残っていれば確定売上に変換されます（売上/仕入の実績はそのまま保持）</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelinkDialog({ open: false, target_project_id: "" })}>キャンセル</Button>
            <Button
              disabled={!relinkDialog.target_project_id || relinkMutation.isPending}
              onClick={async () => {
                if ((await confirmAction({ title: "この案件を選択したGLSのエピソードに紐づけ直します。よろしいですか？" }))) {
                  relinkMutation.mutate(relinkDialog.target_project_id);
                }
              }}
            >
              {relinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              紐づけ直す
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* GLS発番完了ダイアログ */}
      {glsResult && (
        <Dialog open={glsResult.open} onOpenChange={(open) => { if (!open) setGlsResult(null); }}>
          <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                  <span className=" font-bold text-lg">{glsResult.glsNumber}</span>
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
                navigate("/schedule?layers=studio", {
                  state: {
                    presetRoomIds: scheduleRoomIds,
                    presetDate: buildProjectPresetDate(),
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

      {/* スタジオ予約ダイアログ (編集モード) */}
      {isEdit && id && (
        <StudioBookingDialog
          open={bookingDialogOpen}
          onOpenChange={(v) => {
            setBookingDialogOpen(v);
            if (!v) setEditingBooking(null);
          }}
          locations={studioLocations as any}
          editingBooking={editingBooking}
          presetDate={null}
          presetProjectId={id}
        />
      )}

      {/* 案件分類 A↔B 切替 (GLS発番済の採番し直し確認) */}
      <Dialog open={categorySwitchDialog.open} onOpenChange={(o) => setCategorySwitchDialog((s) => ({ ...s, open: o }))}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>案件分類を変更しますか？</DialogTitle>
            <DialogDescription>
              {glsCategory === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
              {' → '}
              {categorySwitchDialog.target === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
              に切り替えます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3 text-sm">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-medium">この案件は GLS 発番済みです ({project?.gls_number})</p>
                  <p>切替に伴い以下が自動で更新されます:</p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    <li>GLS 番号を新カテゴリ側で<strong>採番し直し</strong></li>
                    <li>エピソードコード (例: <code>{project?.gls_number}-001</code>) も新番号に書換</li>
                    <li>BOX フォルダ名（社内限り / 社外共有可）を新 GLS 番号にリネーム</li>
                    <li>既発行 PDF（見積書 / 請求書）の手元ファイルは更新されません</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategorySwitchDialog({ open: false, target: 'A' })} disabled={categorySwitchMutation.isPending}>
              キャンセル
            </Button>
            <Button
              onClick={() => categorySwitchMutation.mutate(categorySwitchDialog.target)}
              disabled={categorySwitchMutation.isPending}
            >
              {categorySwitchMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              採番し直して変更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
