/**
 * ふりかえり (§4.18 / デザイン 21a / 21b)
 *
 * 「終わったことを見る画面」は 報告資料 (隔週キープ) と 営業レビュー と 日常業務の週次 に分かれていた。
 * どれも**先週より良くなったか**を見るための画面なのに、行き先が3つあって毎回どこを開くか考えていた。
 * `/review` の1画面 + タブ (`?tab=`) にまとめ、**レールには出さない** (毎日開くものではない)。
 *
 * 今週のタブは「件数」だけでなく **守れた割合** を出す。件数は忙しさしか表さないため。
 */
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck, Presentation, TrendingUp, BarChart3, ExternalLink, Sparkles, Info,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DashboardHeader, KpiCard, SectionCard } from "@gmo-onair/shared/src/client/dashboard";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import KeepReportPage from "./KeepReportPage";
import SalesReviewPage from "./SalesReviewPage";
import { cn } from "@/lib/utils";
import { manYen } from "@gmo-onair/shared/src/client/ui";

const TABS = [
  { id: "week", label: "今週", Icon: CalendarCheck },
  { id: "keep", label: "隔週キープ", Icon: Presentation },
  { id: "pl", label: "月次の損益", Icon: TrendingUp },
  { id: "sales", label: "営業レビュー", Icon: BarChart3 },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface WeeklyStats {
  period: { week_start: string; week_end: string };
  new_projects: { count: number; ai_count: number };
  activities: { count: number; ai_count: number; by_type: { activity_type?: string; c?: number }[] };
  revenue: { week_total: number; month_total: number; month: string };
  events_this_week: unknown[];
  next_week: { events: unknown[]; next_actions: unknown[] };
  quality: {
    tasks_due: number;
    tasks_on_time: number;
    tasks_late: number;
    tasks_open: number;
    on_time_rate: number | null;
    ai_reviewed_outputs: number;
    ai_accepted_as_is: number;
    ai_as_is_rate: number | null;
  };
}

// 6章: 万円の丸め方は shared の `manYen` 1本にする
const yen = manYen;
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const fmtDate = (s: string) => {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : `${d.getMonth() + 1}/${d.getDate()}`;
};

const ACTIVITY_LABEL: Record<string, string> = {
  email: "メール", phone: "電話", meeting: "打合せ", visit: "訪問",
  demo: "デモ", follow_up: "フォロー", followup: "フォロー", other: "その他",
};

function WeekTab() {
  const { data, isLoading, isError, refetch } = useQuery<WeeklyStats>({
    queryKey: ["review-weekly-stats"],
    queryFn: async () => (await api.get("/dailyops/weekly-stats")).data.data,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return <Delayed><SkeletonRows rows={4} /></Delayed>;
  }
  if (isError || !data) {
    return <ErrorPanel title="今週の数字を出せませんでした" error={null} onRetry={() => refetch()} />;
  }

  const q = data.quality;
  const onTimeTone = q.on_time_rate === null ? "default"
    : q.on_time_rate >= 0.8 ? "success"
    : q.on_time_rate >= 0.5 ? "warning" : "negative";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {fmtDate(data.period.week_start)} 〜 {fmtDate(data.period.week_end)} の分です。
      </p>

      {/* 守れたか — 件数の前にこちらを出す */}
      <SectionCard
        icon={<CalendarCheck />}
        title="守れたか"
        description="今週が期限だったタスクのうち、期限内に終わった割合"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="期限内に終えた" value={pct(q.on_time_rate)} emphasis={onTimeTone as never} />
          <KpiCard label="今週が期限" value={q.tasks_due} unit="件" />
          <KpiCard label="遅れて終えた" value={q.tasks_late} unit="件" emphasis={q.tasks_late > 0 ? "warning" : "default"} />
          <KpiCard label="まだ終わっていない" value={q.tasks_open} unit="件" emphasis={q.tasks_open > 0 ? "negative" : "default"} />
        </div>
        {q.tasks_due === 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            今週が期限のタスクがありません。期限を入れていないタスクはここに出ないので、割合も出せません。
          </p>
        )}
      </SectionCard>

      {/* 動いた量 */}
      <SectionCard icon={<TrendingUp />} title="動いた量">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="新しい案件" value={data.new_projects.count} unit="件" />
          <KpiCard label="お客様とのやり取り" value={data.activities.count} unit="件" />
          <KpiCard label="今週の確定売上" value={yen(data.revenue.week_total)} />
          <KpiCard label="今月の確定売上" value={yen(data.revenue.month_total)} />
        </div>
        {data.activities.by_type.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {data.activities.by_type.map((t, i) => (
              <span key={i} className="rounded-full bg-muted px-2 py-0.5">
                {ACTIVITY_LABEL[String(t.activity_type)] ?? t.activity_type} {Number(t.c ?? 0)}
              </span>
            ))}
          </p>
        )}
      </SectionCard>

      {/* AI の成績 */}
      <SectionCard
        icon={<Sparkles />}
        title="AI がそのまま通った割合"
        description="直近30日。人が1文字も直さずに採用した割合"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="無修正で採用" value={pct(q.ai_as_is_rate)} />
          <KpiCard label="人が見た件数" value={q.ai_reviewed_outputs} unit="件" />
          <KpiCard label="直さず通した件数" value={q.ai_accepted_as_is} unit="件" />
        </div>
        {q.ai_reviewed_outputs < 10 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            件数が少ないので、この割合で良くなった / 悪くなったを断定はできません。
          </p>
        )}
      </SectionCard>

      <p className="flex items-start gap-1.5 rounded-control border border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        今週のトピック (カテゴリ・内容・記入者) と業界ニュースの採用は
        <a href="/daily/weekly" className="mx-1 inline-flex items-center gap-0.5 font-bold text-primary hover:underline">
          日常業務の週次<ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        で書きます。数字はここが正で、あちらの画面も同じ集計を読んでいます。
      </p>
    </div>
  );
}

export default function ReviewPage() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const tab = (TABS.some((t) => t.id === sp.get("tab")) ? sp.get("tab") : "week") as TabId;

  const setTab = (id: TabId) => {
    const next = new URLSearchParams(sp);
    next.set("tab", id);
    setSp(next, { replace: true });
  };

  const description = useMemo(() => {
    if (tab === "week") return "今週どれだけ守れたかを見ます。件数より割合を先に見てください。";
    if (tab === "keep") return "隔週の報告に載せるイベント報告と議事録をここで確定します。";
    if (tab === "pl") return "月ごとの目標と実績です。○ と ✕ で見ます。";
    return "ファネル・失注理由・営業評価を横断で見ます。";
  }, [tab]);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <DashboardHeader
        title="ふりかえり"
        description={description}
        controls={
          <button
            type="button"
            onClick={() => navigate("/finance")}
            className="inline-flex items-center gap-1 rounded-control border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            お金の画面へ
          </button>
        }
      />

      {/* タブ (URL に載せる。MTG で開いたまま共有できる) */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="ふりかえりの種類">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-control border px-3 text-xs transition-colors",
              tab === t.id
                ? "border-primary bg-primary/10 font-bold text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <t.Icon className="h-3.5 w-3.5" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "week" && <WeekTab />}

      {tab === "keep" && (
        <div className="space-y-4">
          {/* 29章: 資料そのものを組み立てる画面への入口。
              ここ (イベント報告・議事録) はその材料を確定する場所。 */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-divider bg-card p-3">
            <span className="text-sm">
              材料が揃ったら、<strong>資料を組み立てます</strong>（型は Ver.2.5 のまま）。
            </span>
            <Button size="sm" className="ml-auto min-h-[44px] gap-1"
              onClick={() => navigate("/sales/keep")}>
              <Presentation className="h-4 w-4" aria-hidden="true" />
              隔週キープをつくる
            </Button>
          </div>
          <SectionCard
            icon={<Presentation />}
            title="イベントの実施報告"
            description="実施済みで報告がまだの案件を上に出しています。確定したものだけが資料に載ります"
          >
            <KeepReportPage only="events" />
          </SectionCard>
          <SectionCard icon={<CalendarCheck />} title="議事録">
            <KeepReportPage only="minutes" />
          </SectionCard>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            資料そのもの (パワポ) は AI に作らせます。確定したイベント報告・議事録・月次の損益を読んで組み立てるので、
            ここで**確定まで済ませておく**のが仕事です。
          </p>
        </div>
      )}

      {tab === "pl" && <KeepReportPage only="pl" />}

      {tab === "sales" && <SalesReviewPage embedded />}
    </div>
  );
}
