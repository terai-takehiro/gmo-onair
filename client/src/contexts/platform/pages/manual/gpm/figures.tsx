/**
 * 利用マニュアル・プロジェクト管理編 (GPM) — figure その1（p1・p2・p4・p5・p6）
 *
 * `../figures.tsx`（トップページ編）と同じ2つの方針:
 *   ① **完全に props 駆動で副作用の無い部品**はそのまま埋め込む
 *      （`KpiStrip`・`Panel`・`BasicStep`・`EmptyState`・`Row` 系・`FilterChips`・
 *      `TableBadge`・`Money` はどれも fetch/mutation を持たない）
 *   ② API 呼び出し・画面遷移を内部に持つ画面コンポーネント（`GpmDashboardPage`・
 *      `GpmProjectListPage`・`GpmProjectDetailPage` 本体など）は埋め込まず、
 *      実装の class 名・トークンを手本にした static な再現にする
 *
 * `ManualGpmPage.tsx` 側で `<FigureFrame>`（`pointer-events-none`）が包む。
 */
import { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { FilterChips, type FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import {
  Row, RowHeader, RowMain, RowTitle, RowSlot,
} from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { KpiStrip, type GpmKpis } from '@/contexts/gpm/pages/dashboard/KpiStrip';
import { Panel } from '@/contexts/gpm/pages/dashboard/Panel';
import { BasicStep, type BasicValues } from '@/contexts/gpm/pages/projectForm/BasicStep';
import { DETAIL_TABS } from '@/contexts/gpm/pages/projectDetail/DetailHeader';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import type { ProjectStage } from '@/types';

/** 「ここに注目」の枠。ハイライト指定のある要素にだけ付ける（新しい色は作らず既存トークンの組み合わせ） */
const HI = 'rounded-control-lg border border-primary-border-strong bg-primary-surface-weak';

// ══════════════════════════════════════════════════
// p1 — ダッシュボード
// ══════════════════════════════════════════════════
export function DashboardFigure() {
  const kpis: GpmKpis = {
    active: 2, planning: 0, onhold: 0, weekDue: 0, overdueTasks: 0, openAsks: 0, overdueAsks: 0,
  };
  const est = {
    draft: 0, draft_amount: 0, sent: 0, sent_amount: 0,
    awaiting_inspection: 0, awaiting_inspection_amount: 0,
  };
  return (
    <div className="flex min-w-[760px] flex-col gap-3">
      <KpiStrip kpis={kpis} est={est} />
      <p className="text-note rounded-note border border-dashed border-border-subtle bg-surface-subtle px-3 py-2.5 text-muted-foreground">
        ⚠ 止まっているプロジェクト・未確認事項がここにカード表示されます
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="止まっているプロジェクト" tone="alert">
          <p className="text-sub text-muted-foreground">工程が進められない理由がついているものが並びます。</p>
        </Panel>
        <Panel title="未確認事項">
          <p className="text-sub text-muted-foreground">先方・社内の判断待ちの一覧が並びます。</p>
        </Panel>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// p2 — プロジェクト一覧
// ══════════════════════════════════════════════════
const STAGE_CHIPS: FilterChipItem[] = [
  { key: 'open', label: '動いているもの', count: 3 },
  { key: 'active', label: '進行中', count: 2 },
  { key: 'planning', label: '準備中', count: 1 },
  { key: 'done', label: '完了', count: 0 },
];

export function ProjectListFigure() {
  const [stage, setStage] = useState('open');
  return (
    <div className="flex min-w-[780px] flex-col gap-3">
      <FilterChips label="状態で絞り込む" items={STAGE_CHIPS} value={stage} onChange={setStage} />

      <div className="flex flex-wrap items-center gap-2">
        <div className={cn('relative min-w-0 max-w-md flex-1 p-0.5', HI)}>
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value=""
            readOnly
            placeholder="プロジェクト名・依頼元で探す"
            aria-label="プロジェクトを探す"
            className="border-0 bg-transparent pl-9"
          />
        </div>
        <span className="min-h-tap text-sub inline-flex items-center rounded-control border border-border px-3.5 text-muted-foreground lg:min-h-[40px]">
          すべての区分
        </span>
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-card">
        <RowHeader>
          <RowMain>プロジェクト</RowMain>
          <RowSlot w={96}>状態</RowSlot>
          <RowSlot w={128}>いまの工程</RowSlot>
          <RowSlot w={200}>次にやること</RowSlot>
          <RowSlot w={56} align="right">未確認</RowSlot>
        </RowHeader>
        <Row divider>
          <RowMain><RowTitle>GMO渋谷スタジオプロジェクト</RowTitle></RowMain>
          <RowSlot w={96}>
            <TableBadge label="受注済" w={null} className="border-transparent bg-success-surface text-success" />
          </RowSlot>
          <RowSlot w={128}>{null}</RowSlot>
          <RowSlot w={200} className="text-sub">音声PFI作成</RowSlot>
          <RowSlot w={56} align="right">
            <span className="text-sub font-number text-muted-foreground">0</span>
          </RowSlot>
        </Row>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// p4 — 新規作成ウィザード
// ══════════════════════════════════════════════════
const WIZARD_STEPS = [
  { n: 1, label: '基本情報' },
  { n: 2, label: '標準工程を選ぶ' },
  { n: 3, label: '着手日と工程' },
  { n: 4, label: '体制' },
  { n: 5, label: 'メンバー・書類' },
] as const;

const BASIC_VALUES: BasicValues = {
  name: '', kind: 'self_build', customerId: '', pmCompany: '', pmUserId: '',
  stage: 'a_won' as ProjectStage, notes: '',
};

export function NewProjectFigure() {
  return (
    <div className="flex min-w-[720px] flex-col gap-3.5">
      <div className="flex gap-2">
        {WIZARD_STEPS.map((s) => {
          const on = s.n === 1;
          return (
            <span
              key={s.n}
              className={cn(
                'min-h-tap rounded-control-lg flex shrink-0 items-center gap-2 border px-3.5 lg:min-h-[40px]',
                on ? 'border-primary-border-strong bg-primary-surface-weak' : 'border-border bg-card',
              )}
            >
              <span
                className={cn(
                  'text-badge font-number flex h-6 w-6 items-center justify-center rounded-chip',
                  on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {s.n}
              </span>
              <span className={cn('text-sub', on ? 'font-bold text-primary' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </span>
          );
        })}
      </div>

      {/* ①基本情報。本物の入力部品をそのまま置く（fetch/mutation を持たない props 駆動） */}
      <BasicStep values={BASIC_VALUES} onChange={() => {}} users={[]} customers={[]} />
    </div>
  );
}

// ══════════════════════════════════════════════════
// p5 — プロジェクト詳細「概要」（工程・タスク）
// ══════════════════════════════════════════════════
const STAGE_STEPS: ProjectStage[] = ['c_proposal', 'b_verbal', 'a_won', 's_completed'];

export function PhaseTaskFigure() {
  return (
    <div className="min-w-[720px] overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 pb-3 pt-3.5">
        <h1 className="text-h1 min-w-0 truncate">GMO渋谷スタジオプロジェクト</h1>
      </div>

      <div className="flex flex-wrap items-end gap-3 px-4">
        <div className="-mb-px flex min-w-0 flex-1 overflow-x-auto">
          {DETAIL_TABS.map((t) => (
            <span
              key={t.key}
              className={cn(
                'min-h-tap text-list inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 lg:min-h-[44px]',
                t.key === 'overview' ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground',
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className="mb-2 inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group">
          {STAGE_STEPS.map((s, i) => {
            const on = s === 'a_won';
            return (
              <span
                key={s}
                className={cn(
                  'min-h-tap text-sub inline-flex items-center px-3 lg:min-h-[36px]',
                  i > 0 && 'border-l border-border',
                  on ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {STAGE_BADGE_LABEL[s]}
              </span>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <EmptyState
          title="工程がまだありません"
          description="標準工程を選んで作ると、工程とタスクが日付付きで入ります。"
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// p6 — 未確認事項（プロジェクト詳細タブ）
// ══════════════════════════════════════════════════
const ASK_TABS = [
  { key: 'overview', label: '概要' },
  { key: 'asks', label: '未確認事項' },
  { key: 'members', label: '体制' },
];

export function OpenItemsFigure() {
  return (
    <div className="min-w-[560px] overflow-hidden rounded-card border border-border bg-card">
      <div className="flex px-4 pt-3">
        {ASK_TABS.map((t) => (
          <span
            key={t.key}
            className={cn(
              'min-h-tap text-list inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 lg:min-h-[44px]',
              t.key === 'asks' ? 'border-primary text-primary' : 'border-transparent font-normal text-muted-foreground',
            )}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="border-t border-border p-4">
        <EmptyState
          title="未確認事項はありません"
          description="先方や社内の判断待ちで工程が進められないものを、ここに書いておくとダッシュボードと全プロジェクトの一覧に出ます。"
        />
      </div>
    </div>
  );
}
