/**
 * 営業活動記録・営業レビュー (v4)
 *
 * 電話・訪問・メール等のやり取りを、案件をまたいで探す・直す「記録」タブと、
 * ファネル・失注分析・営業評価という**分析3タブ**を、1画面のタブ切替に統合した
 * 画面です（ご指示）。**単一案件のやり取りは案件詳細⑥「やり取り」タブ**
 * （`projectDetail/ThreadTab.tsx`）が持ち、そちらは打ちっぱなしで書ける専用の作り
 * （AI が整形・削除不可）です。こちらは**全案件を横断して探す・古い記録を直す・
 * 削除する台帳**と**全案件を横断して集計する分析**という役割が近い2画面だったため、
 * 別画面のまま並べておく理由が薄いと判断してまとめました。
 *
 * ── 統合で決めたこと（2026-08）──────────────────────────────
 *
 * - **`/sales/activity-logs` を主URLにした。** 旧 `/sales/review` は
 *   `?tab=funnel` 付きで転送する（`App.tsx` の `RedirectKeepQuery`）
 * - **タブは `?tab=` の URL 引数**（`取引先（財務）` の `CounterpartyPage.tsx` と同じ形）。
 *   `記録`（既定・引数なし）／`funnel`／`lost`／`performance`。ローカル state にすると
 *   `/sales/review` からの転送先を「開いたらファネルタブ」にできない
 * - **タブごとに `useQuery` の `enabled` を絞る。** 4タブぶんまとめて叩くと、
 *   記録タブを開いているだけで分析3本のAPIも毎回走ることになる
 *
 * ── スマホで開けるようにした（この回・利用者からのご指摘）────
 *
 * 統合したときに**画面全体を PC 専用へ戻して**いた（分析3タブが「3列を並べて
 * 打合せの場で映す」前提だったため）。ところが**営業活動記録は外で開く画面**で、
 * 「スマホから開けない」とご指摘をいただいた。
 *
 * - `pcOnlyScreens.ts` の `/sales/activity-logs` を `CLIENT_MOBILE_OK` へ移した
 * - **この画面の中の `PcOnlyPanel` の門も外した**（`openedAnyway` / `analysisBlocked`）。
 *   タブごとにスマホ対応が割れると `useIsMobile()` の判定を画面の中に書くことになり、
 *   PC専用の判定を1か所（`pcOnlyScreens.ts`）に集める方針が崩れる。
 *   分析3タブの中身は別途スマホ対応する
 *
  * ── 記録タブ（この回で営業担当の立場から作り直した）──────────
 *
 * 中身は `activityLog/LogTab.tsx`（案件別／時系列の切替・期限の4区分）。
 * この画面はヘッダーとタブ、編集ダイアログの開け閉めだけを持つ
 * （1ファイル400行の上限・`scripts/check-file-size.mjs`）。
 *
  * ── 分析3タブ（v4 で作り直した点・旧実装から） ──────────────
 *
 * - `shadcn/Tabs` を、案件台帳の「閲覧／編集」と同じセグメント切替に差し替えた
 *   （旧実装は1ファイル929行）
 * - 数字の書き方を v4 ダッシュボード（①）と揃えた: KPI はカードではなく帯
 *   （`Strip`）、金額は `Money`/`manYen`、棒グラフは状態の色トークン
 * - ⚠️ 目標設定ダイアログが保存できていなかったバグ・営業評価タブが
 *   実績のある担当者で必ず 500 落ちするバグを直した（`salesReview/TargetDialog.tsx`
 *   ／ `sales-analytics.service.ts` の `GROUP BY` の説明を参照）
 * - 「目標設定」ボタンは `sales:editor` 権限で出し分けている
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, ClipboardList, BarChart3, AlertTriangle, Award } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogTab, type LogView } from './activityLog/LogTab';
import { ActivityLogDialog, ActivityLogDialogById } from './activityLog/ActivityLogDialog';
import type { SortKey } from './activityLog/Filters';
import type { ActivityLogRow } from './activityLog/types';
import { FunnelPanel } from './salesReview/FunnelPanel';
import { LostPanel } from './salesReview/LostPanel';
import { PerformancePanel } from './salesReview/PerformancePanel';
import { TargetDialog } from './salesReview/TargetDialog';
import type { FunnelData, LostAnalysis, PerformanceRow, StaffUser } from './salesReview/types';

const now = new Date();
const currentYear = now.getFullYear();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const TABS = [
  { key: 'log', label: '記録', icon: ClipboardList },
  { key: 'funnel', label: 'ファネル', icon: BarChart3 },
  { key: 'lost', label: '失注分析', icon: AlertTriangle },
  { key: 'performance', label: '営業評価', icon: Award },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function ActivityLogPage() {
  const { hasPermission } = useAuth();
  const canDelete = hasPermission('sales', 'manager');
  const canSetTarget = hasPermission('sales', 'editor');
  // サーバー（`activity-logs.routes.ts`）は POST '/'・PUT '/:id' に editor を要求する。
  // 削除だけ `manager` に絞って直した穴と同じで、記録・編集も見ていないと
  // reader に「押せるのに403」のボタン・編集導線が出る
  const canEdit = hasPermission('sales', 'editor');

  const [urlParams, setUrlParams] = useSearchParams();
  const tabParam = urlParams.get('tab');
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'log';
  const setTab = (k: TabKey) => {
    const next = new URLSearchParams(urlParams);
    if (k === 'log') next.delete('tab'); else next.set('tab', k);
    setUrlParams(next, { replace: true });
  };

  /*
    ── 記録タブの並び（案件別／時系列）も URL に持つ ────────────
    `?view=timeline` のときだけ時系列。**既定は案件別**（利用者のご指摘
    「案件別に見られないと分からない」）。タブと同じくローカル state にはしない —
    URL にしておくと「案件別のこの絞り込み」をそのまま人に渡せる。
  */
  const viewParam = urlParams.get('view');
  /*
    ⚠️ **`?sort=next_action` の入口を壊さないこと。** 営業ダッシュボードの
    「期限が過ぎたやること」（`OverduePanel.tsx`）がこの引数でリンクしている。
    並び順は時系列だけの概念なので、`view` が指定されていないときは
    **時系列で開く**（既定の案件別のまま開くと、リンクの意図＝期限順に並べる が消える）。
  */
  const initialSort: SortKey = urlParams.get('sort') === 'next_action' ? 'next_action' : 'date';
  const view: LogView = viewParam === 'timeline' || (!viewParam && initialSort === 'next_action')
    ? 'timeline' : 'project';
  const setView = (v: LogView) => {
    const next = new URLSearchParams(urlParams);
    if (v === 'project') next.delete('view'); else next.set('view', v);
    setUrlParams(next, { replace: true });
  };

  /** 開いているダイアログ。`'new'` は新規、行なら編集、文字列の id なら読み直して編集 */
  const [editing, setEditing] = useState<ActivityLogRow | 'new' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingRow = editing === 'new' ? null : editing;

  // ── 分析3タブ ─────────────────────────────────────────────
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [targetOpen, setTargetOpen] = useState(false);

  const funnelQuery = useQuery<{ data: FunnelData }>({
    queryKey: ['sales-funnel', year, month],
    queryFn: async () => (await api.get('/sales-analytics/funnel', { params: { year, month } })).data,
    enabled: tab === 'funnel',
  });

  const lostQuery = useQuery<{ data: LostAnalysis }>({
    queryKey: ['sales-lost-reasons', year],
    queryFn: async () => (await api.get('/sales-analytics/lost-reasons', { params: { year } })).data,
    enabled: tab === 'lost',
  });

  const perfQuery = useQuery<{ data: PerformanceRow[] }>({
    queryKey: ['sales-performance', year, month],
    queryFn: async () => (await api.get('/sales-analytics/performance', { params: { year, month } })).data,
    enabled: tab === 'performance',
  });

  const { data: usersData } = useQuery<{ data: StaffUser[] }>({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/auth/users')).data,
    enabled: tab === 'performance',
  });
  const staffUsers = (usersData?.data ?? []).filter((u) => u.role === 'staff' || u.role === 'system_admin');

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="営業活動記録"
        sub={
          tab === 'log'
            ? '電話・訪問・メール等、案件をまたいだ営業活動の記録です'
            : `${year}年${month ? ` ${month}月` : ' 通年'} ・ ファネル・失注理由・営業評価を確認します`
        }
        primaryAction={
          tab === 'log' ? (
            canEdit ? (
              <Button onClick={() => setEditing('new')}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />活動を記録
              </Button>
            ) : null
          ) : (
            <div className="flex items-center gap-2">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={month ? String(month) : 'all'} onValueChange={(v) => setMonth(v === 'all' ? undefined : Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">通年</SelectItem>
                  {MONTHS.map((m) => <SelectItem key={m} value={String(m)}>{m}月</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )
        }
      />

      {/* タブ切替。案件台帳の「閲覧／編集」と同じセグメント（`ProjectLedgerPage.tsx`） */}
      {/* スマホでは折り返さず横スクロールにする（折り返すと「失注分 析」と割れる） */}
      <div className="flex w-fit max-w-full overflow-x-auto rounded-control border border-border p-0.5" role="group" aria-label="表示の切替">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`text-sub flex min-h-tap shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3.5 lg:min-h-[32px] ${
              tab === t.key ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'log' && (
        <LogTab
          view={view}
          onView={setView}
          initialSort={initialSort}
          canEdit={canEdit}
          onOpen={setEditing}
          onEditId={setEditingId}
        />
      )}

      {tab === 'funnel' && (
        funnelQuery.isError ? (
          <ErrorPanel title="ファネル分析を読み込めませんでした" error={funnelQuery.error} onRetry={() => funnelQuery.refetch()} />
        ) : !funnelQuery.data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : (
          <FunnelPanel funnel={funnelQuery.data.data} year={year} />
        )
      )}

      {tab === 'lost' && (
        lostQuery.isError ? (
          <ErrorPanel title="失注分析を読み込めませんでした" error={lostQuery.error} onRetry={() => lostQuery.refetch()} />
        ) : !lostQuery.data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : (
          <LostPanel lost={lostQuery.data.data} year={year} />
        )
      )}

      {tab === 'performance' && (
        perfQuery.isError ? (
          <ErrorPanel title="営業評価を読み込めませんでした" error={perfQuery.error} onRetry={() => perfQuery.refetch()} />
        ) : !perfQuery.data ? (
          <Delayed><SkeletonRows rows={6} /></Delayed>
        ) : (
          <PerformancePanel
            performance={perfQuery.data.data}
            canSetTarget={canSetTarget}
            onOpenTarget={() => setTargetOpen(true)}
          />
        )
      )}

      {editing && (
        <ActivityLogDialog
          key={editing === 'new' ? 'new' : editing.id}
          editing={editingRow}
          canDelete={canDelete}
          onClose={() => setEditing(null)}
        />
      )}

      {/* 案件別の並びの「編集」。行を持っていないので id で読み直してから開く */}
      {editingId && (
        <ActivityLogDialogById
          key={editingId}
          id={editingId}
          canDelete={canDelete}
          onClose={() => setEditingId(null)}
        />
      )}

      {targetOpen && (
        <TargetDialog year={year} staffUsers={staffUsers} onClose={() => setTargetOpen(false)} />
      )}
    </div>
  );
}
