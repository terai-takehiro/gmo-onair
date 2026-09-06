/**
 * ① ダッシュボード (v4 GPM) — いま何が動いていて、どこで止まっているか
 *
 * ── 最後に作った理由 ────────────────────────────────────────
 *
 * 数えるものが他の画面で確定してから作りました。数字は**他の画面と同じ
 * 問い合わせ**（`useGpmProjects` / `useGpmOpenItems`）から数えています。
 * ダッシュボード専用の集計を持つと、一覧と件数が食い違ったときに
 * どちらが正しいのか分からなくなります。
 *
 * ── 出さないと決めたもの ────────────────────────────────────
 *
 *   ・**活動履歴** … GPM には活動記録のテーブルがありません。案件管理の
 *     `activity_logs` は `projects` に紐づくので、GPM の行は1件も返りません
 *   ・**今週の工程（曜日ごとの割り付け）** … 工程の日付を全プロジェクトぶん
 *     まとめて引く口が無く、プロジェクトの数だけ問い合わせることになります
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CircleHelp, FolderOpen, Plus } from 'lucide-react';
import { localDateStr } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useGpmEstimateSummary, useGpmOpenItems, useGpmProjects } from '../queries';
import { TERMINAL_STAGES } from '@/contexts/sales/pages/projectList/stages';
import { TO_KIND_LABEL, dueLabel, dueTone, progressPct, ymd, type GpmOpenItem } from '../types';
import { KpiStrip, countKpis } from './dashboard/KpiStrip';
import { MobileKpiRail } from './dashboard/MobileKpiRail';
import { MobileActiveProjectCard, MobileStuckCard, MobileOpenAskCard } from './dashboard/MobileDashboardCards';
import { Panel } from './dashboard/Panel';

/** 何日前に訊いたか。**「3日前から待ち」は読み手が判断に使う数字** */
function daysSince(iso: string, today: string): number {
  const from = ymd(iso);
  if (!from) return 0;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

export default function GpmDashboardPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  // **薄い親で1回だけ**（`shared/CLAUDE.md`「`useIsMobile()` で早期 return しない」）。
  // 下で「どちらを描くか」だけを決め、部品ごと入れ替える
  const isMobile = useIsMobile();

  const { today, weekEnd } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 6);
    return { today: localDateStr(now), weekEnd: localDateStr(end) };
  }, []);

  const projects = useGpmProjects('');
  const asks = useGpmOpenItems('all');
  // KPI の後ろ2枚（個別見積 未提出 / 検収待ち）。**サーバーが数える** —
  // 見積は画面が持っていないので、ここで数えると 0 のままになる
  const estimates = useGpmEstimateSummary();

  const loading = projects.isLoading || asks.isLoading;
  const rows = useMemo(() => projects.data ?? [], [projects.data]);
  const allAsks = useMemo(() => asks.data ?? [], [asks.data]);
  const kpis = useMemo(() => countKpis(rows, allAsks, today, weekEnd), [rows, allAsks, today, weekEnd]);

  /** 止まっているもの＝**「何が止まっているか」が書かれている未確認事項** */
  const stuck = useMemo(
    () => allAsks.filter((a) => a.status !== 'resolved' && a.blocks),
    [allAsks],
  );
  const openAsks = useMemo(() => allAsks.filter((a) => a.status !== 'resolved'), [allAsks]);
  const active = useMemo(
    () => rows.filter((p) => !TERMINAL_STAGES.includes(p.stage)).slice(0, 6),
    [rows],
  );

  if (projects.isError || asks.isError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorPanel
          title="ダッシュボードを読み込めませんでした"
          onRetry={() => { projects.refetch(); asks.refetch(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3.5 p-4 lg:px-6 lg:pb-6 lg:pt-5">
      <PageHeader
        title="ダッシュボード"
        // ⚠️ **`sub` は PR③（`gpm-format-alignment.html` 項目12）で外した。**
        // 2026-08-18 の UX レポートで「案件管理と見分けが付かない」という指摘を受け、
        // いったんここに「案件管理とは別の画面（自社構築・グループ受託の工程管理）」を
        // 足していたが、**毎日開く画面のサブタイトルは読ませない**という案件管理の
        // ダッシュボードと同じ方針をこちらにも揃えることになった
        // （`platform/pages/DashboardPage.tsx` の「見出しの下に説明を置かない」）。
        // 見分ける手掛かりは左メニューの並び（「プロジェクト管理」の区画）に
        // すでにある、というのがこの版の判断。もし見分けにくさが再燃したら、
        // ここへ戻す前に左メニュー側の見え方を先に見直すこと。
        primaryAction={
          canEdit ? (
            <Button onClick={() => navigate('/gpm/projects/new')}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />プロジェクトを作成
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : (
        <>
          {isMobile ? (
            <MobileKpiRail kpis={kpis} est={estimates.data} />
          ) : (
            <KpiStrip kpis={kpis} est={estimates.data} />
          )}

          <div className="grid gap-3.5 lg:grid-cols-3">
            <div className="space-y-3.5 lg:col-span-2">
              <Panel
                title="停滞プロジェクト"
                note="返事待ち・判断待ちで停滞"
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                tone="alert"
                to="/gpm/tasks"
                toLabel="すべて表示"
              >
                {stuck.length === 0 ? (
                  <p className="text-sub text-muted-foreground">
                    停滞しているプロジェクトはありません。返事待ち・判断待ちが出たら、プロジェクトの「未解決事項」から登録してください。
                  </p>
                ) : isMobile ? (
                  <ul className="v4-card-in flex flex-col gap-2">
                    {stuck.slice(0, 4).map((a) => (
                      <MobileStuckCard key={a.id} a={a} days={daysSince(a.raised_at, today)} />
                    ))}
                  </ul>
                ) : (
                  <ul className="divide-y divide-border-faint">
                    {stuck.slice(0, 4).map((a) => <StuckRow key={a.id} a={a} today={today} />)}
                  </ul>
                )}
              </Panel>

              <Panel
                title="進行中のプロジェクト"
                note="進行中と準備中"
                icon={<FolderOpen className="h-4 w-4 text-primary" aria-hidden="true" />}
                to="/gpm/projects"
                toLabel="一覧を開く"
              >
                {active.length === 0 ? (
                  <EmptyState
                    title="進行中のプロジェクトはありません"
                    description="発注が確定した構築案件を作ると、ここに工程の進み具合が出ます。"
                    action={canEdit ? <Button onClick={() => navigate('/gpm/projects/new')}>プロジェクトを作成</Button> : undefined}
                  />
                ) : isMobile ? (
                  <ul className="v4-card-in flex flex-col gap-2">
                    {active.map((p) => <MobileActiveProjectCard key={p.id} p={p} today={today} />)}
                  </ul>
                ) : (
                  <ul className="divide-y divide-border-faint">
                    {active.map((p) => {
                      const pct = progressPct(p.phase_done, p.phase_count);
                      const due = ymd(p.next_due);
                      return (
                        <li key={p.id}>
                          <Link
                            to={`/gpm/projects/${p.id}`}
                            className="min-h-tap -mx-2 flex flex-wrap items-center gap-3 rounded-note px-2 py-2.5 hover:bg-background"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="text-list block truncate">{p.name}</span>
                              <span className="text-sub-sm block truncate text-muted-foreground">
                                {p.current_phase ?? '工程なし'}
                                {p.assigned_to_name ? ` ・ 担当 ${p.assigned_to_name}` : ''}
                              </span>
                            </span>
                            <span className="w-24 shrink-0">
                              <span className="block h-1.5 overflow-hidden rounded-chip bg-muted">
                                <span className="v4-bar block h-1.5 rounded-chip bg-primary" style={{ width: `${pct ?? 0}%` }} />
                              </span>
                              <span className="text-sub-sm font-number mt-1 block text-muted-foreground">
                                {pct === null ? '工程なし' : `${pct}%`}
                              </span>
                            </span>
                            <span className="w-28 shrink-0 text-right">
                              <span className={cn('text-sub-sm font-number block', dueTone(due, today))}>
                                {dueLabel(due, today) ?? '期限なし'}
                              </span>
                              {p.open_items > 0 && (
                                <span className="text-sub-sm font-number block text-destructive">
                                  未確認 {p.open_items}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </div>

            <Panel
              title="未解決事項"
              note={`${openAsks.length}件`}
              icon={<CircleHelp className="h-4 w-4 text-destructive" aria-hidden="true" />}
              to="/gpm/tasks"
              toLabel="すべて表示"
            >
              {openAsks.length === 0 ? (
                <p className="text-sub text-muted-foreground">返事待ちのものはありません。</p>
              ) : isMobile ? (
                <ul className="v4-card-in flex flex-col gap-2">
                  {openAsks.slice(0, 6).map((a) => (
                    <MobileOpenAskCard
                      key={a.id} a={a} days={daysSince(a.raised_at, today)} toLabel={TO_KIND_LABEL[a.to_kind]}
                    />
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-border-faint">
                  {openAsks.slice(0, 6).map((a) => (
                    <li key={a.id} className="py-2.5 first:pt-0">
                      <Link to={`/gpm/projects/${a.project_id}/asks`} className="block hover:underline">
                        <span className="text-list block">{a.question}</span>
                      </Link>
                      <p className="text-sub-sm text-muted-foreground">
                        {[TO_KIND_LABEL[a.to_kind], a.to_name].filter(Boolean).join(' ')}
                        {' ・ '}
                        <span className="font-number">{daysSince(a.raised_at, today)}</span>日前から待ち
                      </p>
                      {a.blocks && (
                        <p className="text-sub-sm text-destructive">{a.blocks} が止まっています</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function StuckRow({ a, today }: { a: GpmOpenItem; today: string }) {
  return (
    <li className="py-2.5 first:pt-0">
      <Link
        to={`/gpm/projects/${a.project_id}/asks`}
        className="min-h-tap -mx-2 flex flex-wrap items-center gap-3 rounded-note px-2 py-1 hover:bg-background"
      >
        <span className="min-w-0 flex-1">
          <span className="text-list block truncate">{a.project_name ?? 'プロジェクト'}</span>
          <span className="text-sub block text-foreground">{a.question}</span>
          <span className="text-sub-sm block text-destructive">{a.blocks} が止まっています</span>
        </span>
        <span className="text-sub font-number shrink-0 text-destructive">
          {daysSince(a.raised_at, today)}日 停止
        </span>
      </Link>
    </li>
  );
}
