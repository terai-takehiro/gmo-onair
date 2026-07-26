/**
 * KeepReportPage — 隔週キープ資料 (報告資料) の基礎データ整理ページ (v2.9.201+)
 * 営業・案件管理の情報を踏まえた「パワポ報告資料の基礎データ」をここで整理・確定する。
 * MCP (list_event_reports / get_monthly_pl / get_meeting_minutes) が同じデータを読んで資料を自動生成する。
 *   タブ1: イベント実施報告 (案件 1:1 — トピック / 来場者数 / 写真 Box 参照 / draft→confirmed)
 *   タブ2: 月次損益 (予算目標 + 経理確定値補正 + 対目標判定 ○/✕)
 *   タブ3: 議事録サマリ (決定事項 / 領域別トピック / 次回開催日)
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { PageTransition } from "@/components/ui/motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Presentation, Loader2, Check, Plus, Trash2, Image as ImageIcon,
  CalendarDays, TrendingUp, FileText, Users,
} from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";

// ============================================================
// 型
// ============================================================
interface PhotoEntry { id: string; box_file_id: string; caption: string | null; sort_order: number }
interface Summary { total_revenue: number; total_purchase: number; gross_profit: number; gross_margin: number }
interface EventReport {
  id: string; project_id: string; headline: string | null; highlights: string[];
  attendees_onsite: number | null; attendees_online: number | null; attendees_note: string | null;
  photos: PhotoEntry[]; report_status: "draft" | "confirmed"; reported_at: string | null;
  project_name?: string; gls_number?: string | null; event_start?: string | null; event_end?: string | null;
  summary?: Summary;
}
interface Candidate {
  id: string; name: string; gls_number: string | null; stage: string;
  event_start: string | null; event_end: string | null; summary?: Summary;
}
interface VarianceItem { actual: number; budget: number | null; diff: number | null; ratio: number | null; judge: string }
interface MonthlyPl {
  year_month: string;
  budget: { revenue: number | null; cogs_fixed: number | null; cogs_variable: number | null; sga: number | null; operating_profit: number | null } | null;
  actual: { revenue: number; cogs_fixed: number; cogs_variable: number; sga: number; marginal_profit: number; gross_profit: number; operating_profit: number };
  variance: Record<"revenue" | "cogs_fixed" | "cogs_variable" | "sga" | "operating_profit", VarianceItem>;
  has_override: boolean; override_note: string | null;
  override: { cogs_fixed_actual: number | null; sga_actual: number | null; note: string | null } | null;
}
interface Minutes { meeting_date: string; decisions: string[]; topics: Array<{ area: string; text: string }>; next_meeting_date: string | null }

const fmtYen = (v: number | null | undefined) => (v == null ? "-" : formatCurrency(v));
const currentYm = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function StatusBadge({ status }: { status: "draft" | "confirmed" }) {
  return status === "confirmed"
    ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 shrink-0">確定 (資料掲載)</Badge>
    : <Badge variant="secondary" className="shrink-0">下書き</Badge>;
}

// ============================================================
// タブ1: イベント実施報告
// ============================================================
function EventReportsTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["keep-event-reports"],
    queryFn: async () => (await api.get("/keep/event-reports", { params: { status: "all" } })).data.data,
    refetchOnMount: "always",
  });
  const reports: EventReport[] = data?.reports ?? [];
  const candidates: Candidate[] = data?.candidates ?? [];

  const [editing, setEditing] = useState<{ projectId: string; projectName: string; report: EventReport | null } | null>(null);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {candidates.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <p className="mb-2 text-sm font-semibold text-amber-900">報告が未作成の実施済み案件 ({candidates.length}件)</p>
              <ul className="space-y-1.5">
                {candidates.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="truncate font-medium">{c.name}</span>
                    {c.gls_number && <span className="shrink-0 text-xs text-muted-foreground">{c.gls_number}</span>}
                    {c.summary && (
                      <span className="shrink-0 text-xs text-muted-foreground hidden sm:inline">
                        売上 {fmtYen(c.summary.total_revenue)} / 粗利 {fmtYen(c.summary.gross_profit)}
                      </span>
                    )}
                    <Button
                      size="sm" variant="outline" className="ml-auto h-7 text-xs shrink-0 border-amber-300"
                      onClick={() => setEditing({ projectId: c.id, projectName: c.name, report: null })}
                    >
                      <Plus className="h-3 w-3 mr-1" />報告を作成
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reports.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">イベント実施報告がまだありません。上の候補から作成してください。</p>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="block w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                  onClick={() => setEditing({ projectId: r.project_id, projectName: r.project_name ?? "", report: r })}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">{r.project_name}</span>
                    {r.gls_number && <span className="shrink-0 text-xs text-muted-foreground">{r.gls_number}</span>}
                    <span className="ml-auto shrink-0"><StatusBadge status={r.report_status} /></span>
                  </div>
                  {r.headline && <p className="mt-1 text-sm text-muted-foreground truncate">{r.headline}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {r.reported_at && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />報告 {r.reported_at}</span>}
                    <span>トピック {r.highlights.length}点</span>
                    <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />
                      来場 {r.attendees_onsite ?? "-"} / オンライン {r.attendees_online ?? "-"}
                    </span>
                    <span className="inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" />写真 {r.photos.length}枚</span>
                    {r.summary && <span>売上 {fmtYen(r.summary.total_revenue)} / 粗利 {fmtYen(r.summary.gross_profit)}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <EventReportDialog
          projectId={editing.projectId}
          projectName={editing.projectName}
          report={editing.report}
          onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["keep-event-reports"] }); }}
        />
      )}
    </div>
  );
}

function EventReportDialog({ projectId, projectName, report, onClose }: {
  projectId: string; projectName: string; report: EventReport | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [headline, setHeadline] = useState(report?.headline ?? "");
  const [highlightsText, setHighlightsText] = useState((report?.highlights ?? []).join("\n"));
  const [onsite, setOnsite] = useState(report?.attendees_onsite != null ? String(report.attendees_onsite) : "");
  const [online, setOnline] = useState(report?.attendees_online != null ? String(report.attendees_online) : "");
  const [note, setNote] = useState(report?.attendees_note ?? "");
  const [reportedAt, setReportedAt] = useState(report?.reported_at ?? "");
  const [photos, setPhotos] = useState<PhotoEntry[]>(report?.photos ?? []);
  const [newBoxId, setNewBoxId] = useState("");
  const [newCaption, setNewCaption] = useState("");

  const save = useMutation({
    mutationFn: async (status: "draft" | "confirmed") => (await api.put(`/keep/event-reports/${projectId}`, {
      headline: headline || null,
      highlights: highlightsText.split("\n").map((s) => s.trim()).filter(Boolean),
      attendees_onsite: onsite === "" ? null : Number(onsite),
      attendees_online: online === "" ? null : Number(online),
      attendees_note: note || null,
      reported_at: reportedAt || null,
      report_status: status,
    })).data,
    onSuccess: onClose,
  });

  const addPhoto = useMutation({
    mutationFn: async () => (await api.post(`/keep/event-reports/${projectId}/photos`, {
      box_file_id: newBoxId.trim(), caption: newCaption.trim() || null,
    })).data.data,
    onSuccess: (d: { photos: PhotoEntry[] }) => {
      setPhotos(d.photos);
      setNewBoxId(""); setNewCaption("");
      qc.invalidateQueries({ queryKey: ["keep-event-reports"] });
    },
  });
  const removePhoto = useMutation({
    mutationFn: async (photoId: string) => (await api.delete(`/keep/event-photos/${photoId}`)).data,
    onSuccess: (_d, photoId) => {
      setPhotos((p) => p.filter((x) => x.id !== photoId));
      qc.invalidateQueries({ queryKey: ["keep-event-reports"] });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">イベント実施報告 — {projectName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>1行サマリ (headline)</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} placeholder="未入力なら資料側で案件名を使用" />
          </div>
          <div>
            <Label>トピック (1行 = 1点・3〜5点目安)</Label>
            <Textarea rows={4} value={highlightsText} onChange={(e) => setHighlightsText(e.target.value)}
              placeholder={"来場者アンケート満足度98%\n配信同時視聴が過去最高の1,200人"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>リアル来場者数</Label>
              <Input type="number" min={0} value={onsite} onChange={(e) => setOnsite(e.target.value)} />
            </div>
            <div>
              <Label>オンライン参加者数</Label>
              <Input type="number" min={0} value={online} onChange={(e) => setOnline(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>来場者数の注記</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="速報値 等" />
            </div>
            <div>
              <Label>報告対象会議日</Label>
              <Input type="date" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} />
            </div>
          </div>

          {/* 写真 (Box 参照) */}
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />写真 (Box ファイル参照 · {photos.length}枚)
            </p>
            {photos.length > 0 && (
              <ul className="mb-2 space-y-1">
                {photos.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">{p.box_file_id}</span>
                    <span className="truncate text-muted-foreground">{p.caption ?? "(キャプションなし)"}</span>
                    <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0 text-destructive"
                      onClick={() => removePhoto.mutate(p.id)} aria-label="写真を削除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Input className="h-8 flex-1 min-w-[120px] text-sm" placeholder="Box ファイル ID" value={newBoxId} onChange={(e) => setNewBoxId(e.target.value)} />
              <Input className="h-8 flex-1 min-w-[120px] text-sm" placeholder="キャプション (任意)" value={newCaption} onChange={(e) => setNewCaption(e.target.value)} />
              <Button size="sm" variant="outline" className="h-8" disabled={!newBoxId.trim() || addPhoto.isPending} onClick={() => addPhoto.mutate()}>
                <Plus className="h-3.5 w-3.5 mr-1" />追加
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">実体は Box に保管し ID のみ参照します (資料生成時にサムネイルを取得)。</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate("draft")}>下書き保存</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate("confirmed")} className="bg-emerald-600 hover:bg-emerald-700">
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            確定して保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// タブ2: 月次損益 (目標 vs 実績)
// ============================================================
const PL_ROWS: Array<{ key: keyof MonthlyPl["variance"]; label: string }> = [
  { key: "revenue", label: "売上" },
  { key: "cogs_fixed", label: "固定原価 (償却)" },
  { key: "cogs_variable", label: "変動原価" },
  { key: "sga", label: "販管費" },
  { key: "operating_profit", label: "営業利益" },
];

function MonthlyPlTab() {
  const qc = useQueryClient();
  const [ym, setYm] = useState(currentYm());
  const { data: pl, isLoading } = useQuery<MonthlyPl>({
    queryKey: ["keep-monthly-pl", ym],
    queryFn: async () => (await api.get(`/keep/monthly-pl/${ym}`)).data.data,
    refetchOnMount: "always",
  });

  // 予算フォーム
  const [budgetForm, setBudgetForm] = useState<Record<string, string>>({});
  const [overrideForm, setOverrideForm] = useState<Record<string, string>>({});
  const [editBudget, setEditBudget] = useState(false);
  const [editOverride, setEditOverride] = useState(false);

  const saveBudget = useMutation({
    mutationFn: async () => {
      const body: Record<string, number> = {};
      for (const k of ["revenue", "cogs_fixed", "cogs_variable", "sga"]) {
        if (budgetForm[k] !== undefined && budgetForm[k] !== "") body[k] = Number(budgetForm[k]);
      }
      return (await api.put(`/keep/monthly-budget/${ym}`, body)).data;
    },
    onSuccess: () => { setEditBudget(false); qc.invalidateQueries({ queryKey: ["keep-monthly-pl", ym] }); },
  });
  const saveOverride = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (overrideForm.cogs_fixed_actual !== undefined) body.cogs_fixed_actual = overrideForm.cogs_fixed_actual === "" ? null : Number(overrideForm.cogs_fixed_actual);
      if (overrideForm.sga_actual !== undefined) body.sga_actual = overrideForm.sga_actual === "" ? null : Number(overrideForm.sga_actual);
      if (overrideForm.note !== undefined) body.note = overrideForm.note || null;
      return (await api.put(`/keep/monthly-override/${ym}`, body)).data;
    },
    onSuccess: () => { setEditOverride(false); qc.invalidateQueries({ queryKey: ["keep-monthly-pl", ym] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="month" className="w-[160px]" value={ym} onChange={(e) => { setYm(e.target.value); setEditBudget(false); setEditOverride(false); }} />
        {pl?.has_override && (
          <Badge variant="outline" className="border-sky-300 text-sky-700">
            経理補正あり{pl.override_note ? `: ${pl.override_note}` : ""}
          </Badge>
        )}
      </div>

      {isLoading || !pl?.variance || !pl?.actual ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* 目標 vs 実績 テーブル */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">項目</th>
                  <th className="px-3 py-2 text-right font-medium">目標</th>
                  <th className="px-3 py-2 text-right font-medium">実績</th>
                  <th className="px-3 py-2 text-right font-medium">対目標差</th>
                  <th className="px-3 py-2 text-right font-medium">対目標比</th>
                  <th className="px-3 py-2 text-center font-medium">判定</th>
                </tr>
              </thead>
              <tbody>
                {PL_ROWS.map(({ key, label }) => {
                  const v = pl.variance[key];
                  return (
                    <tr key={key} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{label}</td>
                      <td className="px-3 py-2 text-right font-number">{fmtYen(v.budget)}</td>
                      <td className="px-3 py-2 text-right font-number">{fmtYen(v.actual)}</td>
                      <td className={`px-3 py-2 text-right font-number ${v.diff != null && v.diff < 0 && (key === "revenue" || key === "operating_profit") ? "text-red-600" : ""}`}>
                        {v.diff == null ? "-" : `${v.diff >= 0 ? "+" : ""}${formatCurrency(v.diff)}`}
                      </td>
                      <td className="px-3 py-2 text-right font-number">{v.ratio == null ? "-" : `${v.ratio}%`}</td>
                      <td className={`px-3 py-2 text-center font-bold ${v.judge === "○" ? "text-emerald-600" : v.judge === "✕" ? "text-red-600" : "text-muted-foreground"}`}>
                        {v.judge}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!pl.budget && (
            <p className="text-xs text-muted-foreground">この月の予算 (目標) が未登録のため判定は "-" です。下の「予算を編集」から登録してください。</p>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* 予算編集 */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">予算 (目標)</p>
                {!editBudget && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    setBudgetForm({
                      revenue: pl.budget?.revenue != null ? String(pl.budget.revenue) : "",
                      cogs_fixed: pl.budget?.cogs_fixed != null ? String(pl.budget.cogs_fixed) : "",
                      cogs_variable: pl.budget?.cogs_variable != null ? String(pl.budget.cogs_variable) : "",
                      sga: pl.budget?.sga != null ? String(pl.budget.sga) : "",
                    });
                    setEditBudget(true);
                  }}>予算を編集</Button>
                )}
              </div>
              {editBudget ? (
                <div className="space-y-2">
                  {([["revenue", "売上目標"], ["cogs_fixed", "固定原価目標"], ["cogs_variable", "変動原価目標"], ["sga", "販管費目標"]] as const).map(([k, lbl]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 text-xs text-muted-foreground">{lbl}</span>
                      <Input type="number" className="h-8 text-sm" value={budgetForm[k] ?? ""} onChange={(e) => setBudgetForm((f) => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">営業利益目標は 売上 − 固定原価 − 変動原価 − 販管費 で自動計算されます。</p>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditBudget(false)}>キャンセル</Button>
                    <Button size="sm" className="h-7 text-xs" disabled={saveBudget.isPending} onClick={() => saveBudget.mutate()}>保存</Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {pl.budget ? `営業利益目標: ${fmtYen(pl.budget.operating_profit)}` : "未登録"}
                </p>
              )}
            </div>

            {/* 経理補正編集 */}
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">実績補正 (経理確定値)</p>
                {!editOverride && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                    setOverrideForm({
                      cogs_fixed_actual: pl.override?.cogs_fixed_actual != null ? String(pl.override.cogs_fixed_actual) : "",
                      sga_actual: pl.override?.sga_actual != null ? String(pl.override.sga_actual) : "",
                      note: pl.override?.note ?? "",
                    });
                    setEditOverride(true);
                  }}>補正を編集</Button>
                )}
              </div>
              {editOverride ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">償却費 確定値</span>
                    <Input type="number" className="h-8 text-sm" value={overrideForm.cogs_fixed_actual ?? ""} onChange={(e) => setOverrideForm((f) => ({ ...f, cogs_fixed_actual: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">販管費 確定値</span>
                    <Input type="number" className="h-8 text-sm" value={overrideForm.sga_actual ?? ""} onChange={(e) => setOverrideForm((f) => ({ ...f, sga_actual: e.target.value }))} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">注記</span>
                    <Input className="h-8 text-sm" placeholder="償却再計上 等" value={overrideForm.note ?? ""} onChange={(e) => setOverrideForm((f) => ({ ...f, note: e.target.value }))} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">空欄で保存すると補正を解除し自動集計値に戻ります。</p>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditOverride(false)}>キャンセル</Button>
                    <Button size="sm" className="h-7 text-xs" disabled={saveOverride.isPending} onClick={() => saveOverride.mutate()}>保存</Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {pl.has_override
                    ? `償却: ${fmtYen(pl.override?.cogs_fixed_actual)} / 販管費: ${fmtYen(pl.override?.sga_actual)}`
                    : "補正なし (自動集計値を使用)"}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// タブ3: 議事録サマリ
// ============================================================
function MinutesTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Minutes[]>({
    queryKey: ["keep-minutes"],
    queryFn: async () => (await api.get("/keep/minutes")).data.data,
    refetchOnMount: "always",
  });
  const list = data ?? [];
  const [editing, setEditing] = useState<Minutes | "new" | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4 mr-1" />議事録を追加
        </Button>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">議事録がまだありません。</p>
      ) : (
        <div className="space-y-2">
          {list.map((m) => (
            <button
              key={m.meeting_date}
              type="button"
              className="block w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
              onClick={() => setEditing(m)}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.meeting_date}</span>
                <span className="text-xs text-muted-foreground">決定事項 {m.decisions.length}件 · トピック {m.topics.length}件</span>
                {m.next_meeting_date && <span className="ml-auto text-xs text-muted-foreground">次回 {m.next_meeting_date}</span>}
              </div>
              {m.decisions.length > 0 && (
                <p className="mt-1 truncate text-sm text-muted-foreground">・{m.decisions[0]}{m.decisions.length > 1 ? ` ほか${m.decisions.length - 1}件` : ""}</p>
              )}
            </button>
          ))}
        </div>
      )}
      {editing && (
        <MinutesDialog
          initial={editing === "new" ? null : editing}
          onClose={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["keep-minutes"] }); }}
        />
      )}
    </div>
  );
}

function MinutesDialog({ initial, onClose }: { initial: Minutes | null; onClose: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(initial?.meeting_date ?? today);
  const [decisionsText, setDecisionsText] = useState((initial?.decisions ?? []).join("\n"));
  const [topics, setTopics] = useState<Array<{ area: string; text: string }>>(initial?.topics ?? []);
  const [nextDate, setNextDate] = useState(initial?.next_meeting_date ?? "");

  const save = useMutation({
    mutationFn: async () => (await api.put(`/keep/minutes/${date}`, {
      decisions: decisionsText.split("\n").map((s) => s.trim()).filter(Boolean),
      topics: topics.filter((t) => t.area.trim() && t.text.trim()),
      ...(nextDate ? { next_meeting_date: nextDate } : {}),
    })).data,
    onSuccess: onClose,
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>議事録サマリ</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>開催日</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!initial} />
            </div>
            <div>
              <Label>次回開催日</Label>
              <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>決定事項 (1行 = 1件)</Label>
            <Textarea rows={4} value={decisionsText} onChange={(e) => setDecisionsText(e.target.value)}
              placeholder={"用賀スタジオの改修予算を承認\nAI活用の月次レビューを開始"} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>領域別トピック</Label>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTopics((t) => [...t, { area: "", text: "" }])}>
                <Plus className="h-3 w-3 mr-1" />行追加
              </Button>
            </div>
            {topics.length === 0 ? (
              <p className="text-xs text-muted-foreground">数値報告 / 構築 / 採用 / AI / 技術支援 などの領域ごとのサマリを追加できます。</p>
            ) : (
              <div className="space-y-2">
                {topics.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <Input className="h-8 w-28 shrink-0 text-sm" placeholder="領域" value={t.area}
                      onChange={(e) => setTopics((arr) => arr.map((x, j) => j === i ? { ...x, area: e.target.value } : x))} />
                    <Input className="h-8 flex-1 text-sm" placeholder="サマリ" value={t.text}
                      onChange={(e) => setTopics((arr) => arr.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive"
                      onClick={() => setTopics((arr) => arr.filter((_, j) => j !== i))} aria-label="行を削除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>キャンセル</Button>
          <Button disabled={!date || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// ページ本体
// ============================================================
/**
 * 報告資料の基礎データ。
 *
 * `only` を渡すと、そのタブの中身だけを枠なしで返す (ふりかえり `/review` に埋める用)。
 * ふりかえり側が「今週 / 隔週キープ / 月次の損益 / 営業レビュー」のタブを持つので、
 * ここのタブ列を一緒に出すと同じ階層の切り替えが2組並んでしまう。
 */
export default function KeepReportPage({ only }: { only?: "events" | "pl" | "minutes" } = {}) {
  if (only) {
    if (only === "events") return <EventReportsTab />;
    if (only === "pl") return <MonthlyPlTab />;
    return <MinutesTab />;
  }
  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-4 p-3 lg:p-6">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border bg-muted/40">
            <Presentation className="h-5 w-5 text-primary" aria-hidden="true" />
          </span>
          <div>
            <PageTitle>報告資料</PageTitle>
            <p className="text-xs text-muted-foreground">
              パワポ報告資料の基礎データをここで整理・確定します。確定 (confirmed) したデータを AI (MCP) が読んで資料を自動生成します。
            </p>
          </div>
        </div>

        <Tabs defaultValue="events">
          <TabsList>
            <TabsTrigger value="events" className="gap-1.5"><FileText className="h-4 w-4" />イベント報告</TabsTrigger>
            <TabsTrigger value="pl" className="gap-1.5"><TrendingUp className="h-4 w-4" />月次損益</TabsTrigger>
            <TabsTrigger value="minutes" className="gap-1.5"><CalendarDays className="h-4 w-4" />議事録</TabsTrigger>
          </TabsList>
          <TabsContent value="events" className="mt-4"><EventReportsTab /></TabsContent>
          <TabsContent value="pl" className="mt-4"><MonthlyPlTab /></TabsContent>
          <TabsContent value="minutes" className="mt-4"><MinutesTab /></TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  );
}
