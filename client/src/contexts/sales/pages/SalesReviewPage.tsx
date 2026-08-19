/**
 * 営業レビュー (v4)
 *
 * ファネル分析・失注分析・営業評価の3つを横断で見る画面です。**PC専用のまま**
 * にしてあります（`pcOnlyScreens.ts`）— 3列を並べて打合せの場で映すための画面で、
 * 縦に畳むと比べられません。
 *
 * ── v4 で作り直した点（旧実装から） ──────────────────────────
 *
 * - `shadcn/Tabs` を、案件台帳の「閲覧／編集」と同じ**セグメント切替**に差し替えた。
 *   タブごとに専用ファイル（`salesReview/*Panel.tsx`）へ分割した（旧実装は1ファイル929行）
 * - 数字の書き方を v4 ダッシュボード（①）と揃えた: KPI はカードではなく**帯**
 *   （`Strip`）、金額は `Money`/`manYen`、棒グラフは状態の色トークン
 *   （`bg-primary`/`bg-success`/`bg-destructive` 系）で生のパレットを使わない
 * - 営業評価タブの表を `Row`/`RowSlot`/`MoneyCell`（列幅7段）に載せ替えた
 * - ⚠️ **目標設定ダイアログが保存できていなかったバグを直した**
 *   （`salesReview/TargetDialog.tsx` の説明）。あわせて、サーバーに保存先を
 *   持たない「目標件数」欄を削除した
 * - 「目標設定」ボタンを `sales:editor` 権限で出し分けた（サーバーは前から
 *   `requirePermission('sales', 'editor')` を要求しており、それ以外の人には
 *   **押せるのに 403** だった）
 *
 * 計算そのもの（ファネル・失注理由・営業評価の集計式）は**1行も変えていません**
 * — `sales-analytics.service.ts` はこの回では触っていません。
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, AlertTriangle, Award } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FunnelPanel } from './salesReview/FunnelPanel';
import { LostPanel } from './salesReview/LostPanel';
import { PerformancePanel } from './salesReview/PerformancePanel';
import { TargetDialog } from './salesReview/TargetDialog';
import type { FunnelData, LostAnalysis, PerformanceRow, StaffUser } from './salesReview/types';

const now = new Date();
const currentYear = now.getFullYear();
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const TABS = [
  { key: 'funnel', label: 'ファネル', icon: BarChart3 },
  { key: 'lost', label: '失注分析', icon: AlertTriangle },
  { key: 'performance', label: '営業評価', icon: Award },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function SalesReviewPage() {
  const { hasPermission } = useAuth();
  const canSetTarget = hasPermission('sales', 'editor');

  const [tab, setTab] = useState<TabKey>('funnel');
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
        title="営業レビュー"
        sub={`${year}年${month ? ` ${month}月` : ' 通年'} ・ ファネル・失注理由・営業評価を確認します`}
      >
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
      </PageHeader>

      {/* タブ切替。案件台帳の「閲覧／編集」と同じセグメント（`ProjectLedgerPage.tsx`） */}
      <div className="flex w-fit rounded-control border border-border p-0.5" role="group" aria-label="表示の切替">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`text-sub flex min-h-tap items-center gap-1.5 rounded-control px-3.5 lg:min-h-[32px] ${
              tab === t.key ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />{t.label}
          </button>
        ))}
      </div>

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

      {targetOpen && (
        <TargetDialog year={year} staffUsers={staffUsers} onClose={() => setTargetOpen(false)} />
      )}
    </div>
  );
}
