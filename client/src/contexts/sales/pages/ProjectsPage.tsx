/**
 * ProjectsPage — 案件 一覧とボード (§4.6 / デザイン 8a / 8b)
 *
 * 1画面・表示切替 (`?view=list|board`)。旧「ヨミ・パイプライン」(別ページ) は
 * ここのボード表示に統合した (同じ進行中案件を2つの画面で見ていたため)。
 *
 * 行は**案件名が主役**。GLS番号は経理で使う番号なので副情報に落とす。
 * 次にやることが決まっていない案件は橙で明示する (空欄を「普通」にしない)。
 */
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import StageAskDialog from "@/contexts/sales/components/StageAskDialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { ProjectStageColors, ProjectStageLabels, type ProjectStage } from "@/types";
import { PageTransition } from "@/components/ui/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Search, Info, Sparkles, ChevronRight, CalendarClock, AlertTriangle,
  LayoutList, Columns3, Loader2, GripVertical,
} from "lucide-react";
import ExcelToolbar from "@/components/ExcelToolbar";

type SortKey = "default" | "created_at" | "name" | "customer" | "stage" | "expected_amount" | "event_start";
type SortDir = "asc" | "desc";
type TabFilter = "all" | "yomi" | "active" | "completed" | "lost";
type PeriodMode = "half" | "month" | "quarter" | "year" | "all";
type ViewMode = "list" | "board";

interface Row {
  id: string;
  code?: string | null;
  gls_number?: string | null;
  gls_category?: string | null;
  name: string;
  customer_name?: string | null;
  assigned_to_name?: string | null;
  stage: ProjectStage;
  expected_amount?: number | null;
  total_revenue?: number | null;
  event_start?: string | null;
  event_end?: string | null;
  dates_count?: number;
  next_action?: string | null;
  next_action_date?: string | null;
  is_ai_created?: boolean | null;
  ai_reviewed_at?: string | null;
  ai_requested_by?: string | null;
}

interface Summary {
  groups: { grp: string; count: number; expected_total: number; confirmed_total: number }[];
  tabs: { all_count: number; yomi: number; active: number; completed: number; lost: number };
  expected_total: number;
}

const TABS: { value: TabFilter; label: string; countKey: keyof Summary["tabs"] }[] = [
  { value: "all", label: "すべて", countKey: "all_count" },
  { value: "yomi", label: "ヨミ", countKey: "yomi" },
  { value: "active", label: "進行中", countKey: "active" },
  { value: "completed", label: "完了", countKey: "completed" },
  { value: "lost", label: "失注", countKey: "lost" },
];

const SORTS: { value: `${SortKey}:${SortDir}`; label: string }[] = [
  { value: "default:asc", label: "おすすめの順 (ネタ → 提案中 → 受注済)" },
  { value: "event_start:asc", label: "実施日が近い順" },
  { value: "event_start:desc", label: "実施日が遠い順" },
  { value: "created_at:desc", label: "作った日が新しい順" },
  { value: "created_at:asc", label: "作った日が古い順" },
  { value: "expected_amount:desc", label: "金額が大きい順" },
  { value: "expected_amount:asc", label: "金額が小さい順" },
  { value: "name:asc", label: "案件名 (50音)" },
  { value: "customer:asc", label: "お客様名 (50音)" },
];

/** 区分。既定ソート (ネタ先頭) と同じ並び */
const GROUPS: { key: string; label: string; hint: string }[] = [
  { key: "neta", label: "ネタ", hint: "まだ提案前。動かすかどうかを決める段階" },
  { key: "proposal", label: "提案中", hint: "仮押さえ・見積提案・口頭決定" },
  { key: "won", label: "受注済・完了", hint: "GLS発番済み。実施と請求へ" },
  { key: "lost", label: "失注", hint: "終わった案件。学びだけ残す" },
];

const groupOf = (stage: string): string => {
  if (stage === "neta") return "neta";
  if (stage === "b_verbal" || stage === "c_proposal" || stage === "d_hold") return "proposal";
  if (stage === "s_completed" || stage === "a_won") return "won";
  return "lost";
};

/** ボードの列 = 商談のステージ (ネタ→受注) */
const BOARD_STAGES: { stage: ProjectStage; label: string }[] = [
  { stage: "neta", label: "ネタ" },
  { stage: "d_hold", label: "仮押さえ" },
  { stage: "c_proposal", label: "見積提案" },
  { stage: "b_verbal", label: "口頭決定" },
  { stage: "a_won", label: "受注" },
];

/** ステージの略号 (行の先頭に置くアバター) */
const STAGE_SHORT: Record<ProjectStage, string> = {
  neta: "ネタ", d_hold: "D", c_proposal: "C", b_verbal: "B",
  a_won: "A", s_completed: "S", e_lost: "E",
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const yen = (v: unknown) => formatCurrency(Number(v) || 0);

export default function ProjectsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();

  const view: ViewMode = sp.get("view") === "board" ? "board" : "list";
  const filterParam = sp.get("filter"); // confirmed_studio / confirmed_business

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabFilter>(filterParam ? "active" : "all");
  const [termOpen, setTermOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [aiUnreviewedOnly, setAiUnreviewedOnly] = useState(false);
  const [sort, setSort] = useState<`${SortKey}:${SortDir}`>("default:asc");
  const [sortKey, sortDir] = sort.split(":") as [SortKey, SortDir];

  const now = new Date();
  const [periodMode, setPeriodMode] = useState<PeriodMode>("half");
  const [month, setMonth] = useState(`${now.getFullYear()}-${pad2(now.getMonth() + 1)}`);
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);

  const period = useMemo(() => {
    if (periodMode === "all") return null;
    if (periodMode === "month") return { from: `${month}-01`, to: `${month}-31`, label: month };
    if (periodMode === "quarter") {
      const sm = (quarter - 1) * 3 + 1;
      return { from: `${year}-${pad2(sm)}-01`, to: `${year}-${pad2(sm + 2)}-31`, label: `${year}年 ${quarter}Q` };
    }
    if (periodMode === "year") return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}年` };
    const from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    const end = new Date(now.getFullYear(), now.getMonth() + 7, 0);
    return { from, to: `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`, label: "今月〜半年先" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodMode, month, year, quarter]);

  const glsCategory = filterParam === "confirmed_studio" ? "A" : filterParam === "confirmed_business" ? "B" : undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["projects", view, page, search, tab, sortKey, sortDir, period?.from, period?.to, aiUnreviewedOnly, glsCategory],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: view === "board" ? 200 : 20 };
      if (search) params.search = search;
      if (tab !== "all") params.tab = tab;
      if (period) { params.event_from = period.from; params.event_to = period.to; }
      if (aiUnreviewedOnly) { params.ai_created = 1; params.ai_reviewed = "unreviewed"; }
      if (glsCategory) params.gls_category = glsCategory;
      params.sort_by = sortKey;
      params.sort_dir = sortDir;
      return (await api.get("/projects", { params })).data;
    },
    placeholderData: (prev) => prev,
  });

  const rows: Row[] = data?.data ?? [];
  const pagination = data?.pagination;
  const summary: Summary | undefined = data?.summary;

  // ステージ変更 (ボードのドラッグ)。既存の PATCH /projects/:id/stage をそのまま使う
  const stageMutation = useMutation({
    mutationFn: async (p: { id: string; stage: ProjectStage }) =>
      api.patch(`/projects/${p.id}/stage`, { stage: p.stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  // 進んだ段で聞く (14章 27c)。ボードで動かしたときに足りない項目があれば
  // その場で1〜2問だけ聞く。無ければそのまま動かす (押すだけの段で1手増やさない)。
  const [ask, setAsk] = useState<{ id: string; stage: ProjectStage } | null>(null);
  const moveStage = async (id: string, stage: ProjectStage) => {
    try {
      const res = await api.get(`/projects/${id}/stage-ask`, { params: { to: stage } });
      if ((res.data?.data?.missing ?? []).length > 0) {
        setAsk({ id, stage });
        return;
      }
    } catch {
      // 聞く項目が取れなくても動かせるようにする (サーバー側で必須は止まる)
    }
    stageMutation.mutate({ id, stage });
  };

  const setView = (v: ViewMode) => {
    const next = new URLSearchParams(sp);
    if (v === "board") next.set("view", "board");
    else next.delete("view");
    setSp(next, { replace: true });
  };

  const groupTotal = (key: string) => summary?.groups?.find((g) => g.grp === key);
  const headerCount = summary?.tabs?.all_count ?? pagination?.total ?? 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-screen-2xl space-y-4 px-4 py-5 sm:py-7">
        {/* ヘッダー */}
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">
              案件
              {filterParam === "confirmed_studio" && <span className="ml-2 text-[15px] font-bold text-secondary-foreground">スタジオ (GLS-A)</span>}
              {filterParam === "confirmed_business" && <span className="ml-2 text-[15px] font-bold text-secondary-foreground">ビジネス (GLS-B)</span>}
            </h1>
            <p className="mt-1 text-[13px] text-secondary-foreground">
              {period ? `${period.label}に実施する案件` : "すべての案件"}{" "}
              <span className="font-bold tabular-nums text-foreground">{headerCount}件</span>
              {summary && summary.expected_total > 0 && (
                <> ・ 想定 <span className="font-bold tabular-nums text-foreground">{yen(summary.expected_total)}</span></>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 表示切替 */}
            <div className="inline-flex rounded-control border border-border p-0.5">
              {([["list", "リスト", LayoutList], ["board", "ボード", Columns3]] as const).map(([v, lbl, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[13px] transition-colors",
                    view === v ? "bg-primary font-bold text-primary-foreground" : "text-secondary-foreground hover:bg-secondary"
                  )}
                  aria-pressed={view === v}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {lbl}
                </button>
              ))}
            </div>
            <ExcelToolbar resource="/projects" name="案件" queryKey={["projects"]} />
            <Button onClick={() => navigate("/sales/projects/new")} className="gap-1.5">
              <Plus className="h-4 w-4" aria-hidden="true" />
              案件をつくる
            </Button>
          </div>
        </header>

        {/* 絞り込み帯 */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* 検索 */}
            <div className="relative min-w-[200px] max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="案件名・お客様名でさがす"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            {/* タブ (件数つき) */}
            <div className="inline-flex flex-wrap rounded-control border border-border p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { setTab(t.value); setPage(1); }}
                  className={cn(
                    "rounded-[9px] px-2.5 py-1.5 text-[13px] transition-colors",
                    tab === t.value ? "bg-primary font-bold text-primary-foreground" : "text-secondary-foreground hover:bg-secondary"
                  )}
                  aria-pressed={tab === t.value}
                >
                  {t.label}
                  {summary && (
                    <span className={cn("ml-1 tabular-nums", tab === t.value ? "opacity-80" : "text-muted-foreground")}>
                      {summary.tabs[t.countKey] ?? 0}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 期間 */}
            <div className="inline-flex rounded-control border border-border p-0.5">
              {([["half", "半年"], ["month", "月"], ["quarter", "四半期"], ["year", "年"], ["all", "全件"]] as [PeriodMode, string][]).map(([m, lbl]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setPeriodMode(m); setPage(1); }}
                  className={cn(
                    "rounded-[9px] px-2.5 py-1 text-[12px] transition-colors",
                    periodMode === m ? "bg-secondary font-bold text-foreground" : "text-muted-foreground hover:bg-secondary"
                  )}
                  aria-pressed={periodMode === m}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {periodMode === "month" && (
              <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPage(1); }} className="h-9 w-36" aria-label="実施月でしぼる" />
            )}
            {periodMode === "quarter" && (
              <>
                <Input type="number" value={year} onChange={(e) => { setYear(Number(e.target.value) || year); setPage(1); }} className="h-9 w-20" aria-label="年" />
                <Select value={String(quarter)} onValueChange={(v) => { setQuarter(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1Q（1〜3月）</SelectItem>
                    <SelectItem value="2">2Q（4〜6月）</SelectItem>
                    <SelectItem value="3">3Q（7〜9月）</SelectItem>
                    <SelectItem value="4">4Q（10〜12月）</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}
            {periodMode === "year" && (
              <Input type="number" value={year} onChange={(e) => { setYear(Number(e.target.value) || year); setPage(1); }} className="h-9 w-24" aria-label="年" />
            )}

            {/* 並び順 */}
            <Select value={sort} onValueChange={(v) => { setSort(v as typeof sort); setPage(1); }}>
              <SelectTrigger className="h-9 w-full sm:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* AI作成の未確認 */}
            <button
              type="button"
              onClick={() => { setAiUnreviewedOnly((v) => !v); setPage(1); }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] transition-colors",
                aiUnreviewedOnly ? "border-ai-border bg-ai-surface font-bold text-ai" : "border-border text-secondary-foreground hover:bg-secondary"
              )}
              aria-pressed={aiUnreviewedOnly}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              AI作成の未確認
            </button>

            {/* 用語 */}
            <button
              type="button"
              onClick={() => setTermOpen((v) => !v)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-control border transition-colors",
                termOpen ? "border-primary/40 bg-accent text-primary" : "border-border text-muted-foreground hover:bg-secondary"
              )}
              aria-expanded={termOpen}
              aria-label="用語の説明"
              title="ネタ・ヨミ・GLS番号の説明"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {search && (
            <p className="text-[12px] text-muted-foreground">
              さがしているあいだは実施期間のしぼり込みを外して、すべての期間から探します。
            </p>
          )}

          {termOpen && (
            <div className="space-y-1 rounded-control border border-border bg-secondary/40 px-3 py-2.5 text-[12px] text-secondary-foreground">
              <p><span className="font-bold text-foreground">ネタ</span> … 最初の見込み。まだ提案前の「案件のタネ」。</p>
              <p><span className="font-bold text-foreground">ヨミ</span> … GLS番号を出す前の見込み案件ぜんぶ (ネタ → 提案 → 口頭決定)。</p>
              <p><span className="font-bold text-foreground">GLS番号</span> … 受注が固まった案件に出す番号 (GLS-A… / GLS-B…)。経理・請求で使います。</p>
            </div>
          )}
        </div>

        {/* 本体 */}
        {error && !data ? (
          <ErrorPanel title="案件を読み込めませんでした" error={error} onRetry={() => refetch()} />
        ) : isLoading && !data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : rows.length === 0 ? (
          <EmptyState
            title="この条件に当てはまる案件はありません"
            description="しぼり込みを変えるか、新しく案件をつくってください。"
            action={<Button onClick={() => navigate("/sales/projects/new")}>案件をつくる</Button>}
          />
        ) : view === "board" ? (
          <BoardView
            rows={rows}
            onOpen={(id) => navigate(`/sales/projects/${id}`)}
            onMove={(id, stage) => { void moveStage(id, stage); }}
            moving={stageMutation.isPending}
          />
        ) : (
          <>
            {GROUPS.map((g) => {
              const items = rows.filter((r) => groupOf(r.stage) === g.key);
              if (items.length === 0) return null;
              const agg = groupTotal(g.key);
              return (
                <section key={g.key} className="space-y-1.5" aria-label={g.label}>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1">
                    <h2 className="text-[14px] font-bold text-foreground">{g.label}</h2>
                    {agg && (
                      <span className="text-[12px] tabular-nums text-secondary-foreground">
                        {agg.count}件
                        {g.key === "won"
                          ? agg.confirmed_total > 0 && <> ・ 確定 {yen(agg.confirmed_total)}</>
                          : agg.expected_total > 0 && <> ・ 想定 {yen(agg.expected_total)}</>}
                      </span>
                    )}
                    <span className="hidden text-[12px] text-muted-foreground sm:inline">{g.hint}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {items.map((r) => (
                      <ProjectRow key={r.id} row={r} onClick={() => navigate(`/sales/projects/${r.id}`)} />
                    ))}
                  </ul>
                </section>
              );
            })}

            {pagination && pagination.totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <p className="text-[13px] text-secondary-foreground">
                  {pagination.total}件のうち {(pagination.page - 1) * pagination.limit + 1}〜
                  {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-9" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    前の{pagination.limit}件
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                    次の{pagination.limit}件
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 進んだ段で聞く (14章 27c)。足りない項目があるときだけ出る */}
      {ask && (
        <StageAskDialog
          projectId={ask.id}
          toStage={ask.stage}
          open
          onClose={() => setAsk(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["projects"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
    </PageTransition>
  );
}

// ══════════════════════════════════════════════════════════
// リストの1行 — 案件名が主役 / 次にやることを1行で読み切る
// ══════════════════════════════════════════════════════════
function ProjectRow({ row: r, onClick }: { row: Row; onClick: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !!r.next_action_date && r.next_action_date < today;
  const confirmed = Number(r.total_revenue) || 0;
  const expected = Number(r.expected_amount) || 0;
  const terminal = r.stage === "e_lost";
  const period =
    r.event_start && r.event_end && r.event_end !== r.event_start
      ? `${formatDate(r.event_start)} 〜 ${formatDate(r.event_end)}`
      : r.event_start
        ? formatDate(r.event_start)
        : null;
  // 進行中 (ネタ・完了・失注以外) で次にやることが無いのは異常として出す
  const needsNextAction =
    !r.next_action && !["neta", "s_completed", "e_lost"].includes(r.stage);

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
          terminal ? "border-border bg-secondary/30 hover:bg-secondary/60" : "border-border bg-card hover:border-primary/40 hover:bg-accent/40"
        )}
      >
        {/* ステージ略号 */}
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: ProjectStageColors[r.stage] }}
          aria-hidden="true"
        >
          {STAGE_SHORT[r.stage]}
        </span>

        <span className="min-w-0 flex-1">
          {/* 案件名 (主) */}
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[15px] font-bold text-foreground [overflow-wrap:anywhere]">{r.name}</span>
            {r.is_ai_created && (
              <span
                className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-ai-border bg-ai-surface px-1.5 py-0.5 text-[11px] font-bold text-ai"
                title={r.ai_requested_by ? `AI が作りました (指示: ${r.ai_requested_by})` : "AI が作りました"}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                AI作成
                {!r.ai_reviewed_at && <span className="text-warning-strong">・未確認</span>}
              </span>
            )}
          </span>

          {/* 副情報 */}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-secondary-foreground">
            <span className="truncate">{r.customer_name || "お客様 未設定"}</span>
            {period && (
              <span className="whitespace-nowrap">
                {period}
                {Number(r.dates_count) > 2 && (
                  <span className="ml-1 rounded bg-warning-surface px-1 py-0.5 text-[11px] font-bold text-warning-strong">
                    {r.dates_count}日 (飛び日)
                  </span>
                )}
              </span>
            )}
            {r.assigned_to_name && <span className="whitespace-nowrap">担当 {r.assigned_to_name}</span>}
            {(r.gls_number || r.code) && (
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">{r.gls_number || r.code}</span>
            )}
          </span>

          {/* 次にやること */}
          {needsNextAction ? (
            <span className="mt-1 flex items-center gap-1 text-[12px] font-bold text-warning-strong">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              次にやることが決まっていません
            </span>
          ) : r.next_action ? (
            <span className={cn("mt-1 flex items-center gap-1 text-[12px]", overdue ? "font-bold text-destructive" : "text-secondary-foreground")}>
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {r.next_action_date && `${formatDate(r.next_action_date)}まで `}
                {r.next_action}
                {overdue && " (期限を過ぎています)"}
              </span>
            </span>
          ) : null}
        </span>

        {/* 金額 */}
        <span className="shrink-0 text-right">
          {confirmed > 0 ? (
            <>
              <span className="block text-[15px] font-bold tabular-nums text-foreground">{yen(confirmed)}</span>
              <span className="block text-[11px] text-muted-foreground">確定した売上</span>
            </>
          ) : expected > 0 ? (
            <>
              <span className="block text-[15px] font-bold tabular-nums text-secondary-foreground">{yen(expected)}</span>
              <span className="block text-[11px] text-muted-foreground">想定</span>
            </>
          ) : (
            <span className="block text-[12px] text-muted-foreground">金額 未設定</span>
          )}
        </span>

        {/* ステージ */}
        <span className="hidden shrink-0 self-center rounded-full border border-border px-2 py-0.5 text-[11px] font-bold text-secondary-foreground lg:inline">
          {ProjectStageLabels[r.stage]}
        </span>

        <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

// ══════════════════════════════════════════════════════════
// ボード — 列 = ステージ。カードを右の列へ運ぶとステージが変わる
// ══════════════════════════════════════════════════════════
function BoardView({
  rows, onOpen, onMove, moving,
}: {
  rows: Row[];
  onOpen: (id: string) => void;
  onMove: (id: string, stage: ProjectStage) => void;
  moving: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ProjectStage | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const columns = BOARD_STAGES.map((c) => {
    const deals = rows.filter((r) => r.stage === c.stage);
    return { ...c, deals, total: deals.reduce((s, d) => s + (Number(d.expected_amount) || 0), 0) };
  });
  const offBoard = rows.filter((r) => !BOARD_STAGES.some((c) => c.stage === r.stage));
  const noNextAction = rows.filter(
    (r) => !r.next_action && !["neta", "s_completed", "e_lost"].includes(r.stage)
  ).length;

  return (
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-secondary-foreground">
        <span>カードを右の列へ運ぶとステージが変わります。</span>
        {noNextAction > 0 && (
          <span className="font-bold text-warning-strong">次にやることが決まっていない案件 {noNextAction}件</span>
        )}
        {moving && (
          <span className="inline-flex items-center gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            変更しています
          </span>
        )}
      </p>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => (
          <div
            key={col.stage}
            className="flex w-[264px] shrink-0 flex-col"
            onDragOver={(e) => { e.preventDefault(); setOverStage(col.stage); }}
            onDragLeave={() => setOverStage((s) => (s === col.stage ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setOverStage(null);
              const id = dragId || e.dataTransfer.getData("text/plain");
              const from = rows.find((r) => r.id === id);
              setDragId(null);
              if (id && from && from.stage !== col.stage) onMove(id, col.stage);
            }}
          >
            <div className="mb-2 flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ProjectStageColors[col.stage] }} aria-hidden="true" />
              <span className="text-[13px] font-bold text-foreground">{col.label}</span>
              <span className="text-[12px] tabular-nums text-muted-foreground">{col.deals.length}</span>
              {col.total > 0 && (
                <span className="ml-auto text-[12px] tabular-nums text-secondary-foreground">{yen(col.total)}</span>
              )}
            </div>

            <div
              className={cn(
                "min-h-[80px] space-y-2 rounded-control p-1 transition-colors",
                overStage === col.stage ? "bg-accent ring-2 ring-primary/40" : ""
              )}
            >
              {col.deals.length === 0 ? (
                <p className="rounded-control border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">
                  なし
                </p>
              ) : (
                col.deals.map((d) => {
                  const overdue = !!d.next_action_date && d.next_action_date < today;
                  return (
                    <div
                      key={d.id}
                      draggable
                      onDragStart={(e) => { setDragId(d.id); e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      className={cn(
                        "rounded-control border bg-card p-2.5 shadow-sm transition-opacity",
                        dragId === d.id ? "opacity-40" : "opacity-100",
                        "border-border"
                      )}
                    >
                      <div className="flex items-start gap-1.5">
                        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden="true" />
                        <button
                          type="button"
                          onClick={() => onOpen(d.id)}
                          className="min-w-0 flex-1 text-left text-[13px] font-bold text-foreground hover:text-primary"
                        >
                          {d.name}
                        </button>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-secondary-foreground">{d.customer_name || "お客様 未設定"}</p>
                      {Number(d.expected_amount) > 0 && (
                        <p className="mt-0.5 text-[12px] font-bold tabular-nums text-foreground">{yen(d.expected_amount)}</p>
                      )}
                      {d.next_action ? (
                        <p className={cn("mt-1 flex items-center gap-1 text-[11px]", overdue ? "font-bold text-destructive" : "text-secondary-foreground")}>
                          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {d.next_action_date ? `${formatDate(d.next_action_date)} ` : ""}{d.next_action}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-warning-strong">
                          <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                          次にやること 未設定
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {offBoard.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          完了・失注の {offBoard.length}件はボードに出しません。リスト表示で見られます。
        </p>
      )}
    </div>
  );
}
