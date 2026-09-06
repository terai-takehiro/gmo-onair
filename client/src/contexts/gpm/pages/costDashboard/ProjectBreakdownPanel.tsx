/**
 * 案件別内訳（コスト側ダッシュボード）
 * — 2026年10月の事業再編・P3（`docs/reorg-2026-10-plan.md` §4.7）
 *
 * `GET /gpm/cost-dashboard` の `projects`（コストセンター案件の予算対実績）を
 * 一覧で見せる。行を押すと GPM プロジェクト詳細（`/gpm/projects/:id`）へ遷移する
 * （このダッシュボードはコストセンターの案件＝旧 GLS-B の集計なので、詳細も
 * GPM 側に置く）。
 *
 * **ステージのバッジは案件一覧・プロジェクト一覧と同じ部品**
 * （`sales/pages/projectList/stages.ts`）を使う。プロジェクトは案件と同じ
 * 7段の `stage` 列をそのまま使う（`gpm/types.ts` の `GpmProjectBase` 参照）ため、
 * 同じ値に画面ごとに違う色・言葉を当てない。
 *
 * **スマホでは予算・実績・執行率を隠す**（`RowSlot hideOnMobile`）。ステージと
 * 「残」（予算 − 実績）の2つが「いま気にすべきこと」で、内訳の全部は PC で見る
 * （`sales/pages/projectList/ProjectRows.tsx` と同じ考え方 — 金額列を丸ごと
 * 隠すのではなく、判断に使う1本だけを残す）。
 *
 * ── `Panel`（KPI・月次推移が使う）ではなくここだけ独立した節にした ──
 *
 * `Row`/`RowHeader` は自分で `px-4` を持つ「枠いっぱいに敷く」前提の部品
 * （`GpmProjectListPage.tsx` の一覧と同じ形）。`Panel` の `p-4` の中に入れると
 * 二重に余白ができるので、`gpm/pages/projectDetail/OverviewTab.tsx` の
 * 「工程に付いていないタスク」節と同じ形（見出し帯＋枠いっぱいの表）にする。
 */
import { useNavigate } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import {
  Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot,
} from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money, MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import {
  STAGE_BADGE_LABEL, STAGE_BADGE_TONE,
} from '@/contexts/sales/pages/projectList/stages';
import type { CostCenterProjectSummary } from '../../queries';

/** 執行率（実績 ÷ 予算・%）。予算が無ければ算出できない（`null`） */
function executionRate(p: CostCenterProjectSummary): number | null {
  if (p.budget <= 0) return null;
  return Math.round((p.actual / p.budget) * 100);
}

function BreakdownRow({ p, onOpen }: { p: CostCenterProjectSummary; onOpen: () => void }) {
  const rate = executionRate(p);
  return (
    <Row
      divider
      interactive
      stackOnMobile
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <RowMain>
        <RowTitle>{p.name}</RowTitle>
        <RowSub>{p.gls_number ?? '未発番'}</RowSub>
      </RowMain>

      <TableBadge w={96} label={STAGE_BADGE_LABEL[p.stage]} className={STAGE_BADGE_TONE[p.stage]} />

      <RowSlot w={128} align="right" hideOnMobile className="flex-col items-end justify-center gap-0.5">
        <Money value={p.budget} className="text-sub w-full" />
      </RowSlot>

      <RowSlot w={128} align="right" hideOnMobile className="flex-col items-end justify-center gap-0.5">
        <Money value={p.actual} className="text-sub w-full" />
      </RowSlot>

      {/* 「残」だけはスマホでも出す — マイナス（予算超過）は赤で気づける */}
      <MoneyCell value={p.remaining} width={128} negativeIsDanger className="text-sub" />

      <RowSlot w={72} align="right" hideOnMobile placeholder="—">
        {rate === null ? null : (
          <span className={`font-number text-sub ${rate > 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
            {rate}%
          </span>
        )}
      </RowSlot>
    </Row>
  );
}

export function ProjectBreakdownPanel({ projects }: { projects: CostCenterProjectSummary[] }) {
  const navigate = useNavigate();

  return (
    <section className="overflow-hidden rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle bg-surface-subtle px-4 py-2.5">
        <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-cardtitle min-w-0 flex-1">案件別内訳</h2>
        <span className="text-note text-muted-foreground">{projects.length}件</span>
      </div>

      <RowHeader className="hidden sm:flex">
        <RowMain>案件</RowMain>
        <RowSlot w={96}>ステージ</RowSlot>
        <RowSlot w={128} align="right">予算</RowSlot>
        <RowSlot w={128} align="right">実績</RowSlot>
        <RowSlot w={128} align="right">残</RowSlot>
        <RowSlot w={72} align="right">執行率</RowSlot>
      </RowHeader>

      {projects.map((p) => (
        <BreakdownRow key={p.id} p={p} onOpen={() => navigate(`/gpm/projects/${p.id}`)} />
      ))}
    </section>
  );
}
