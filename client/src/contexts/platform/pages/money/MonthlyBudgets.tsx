/**
 * 月次予算（隔週キープの目標）— お金のルール ⑤ の下
 *
 * ── なぜここにあるか ────────────────────────────────────────
 *
 * 隔週キープ（業績報告）の着地表・見込表は「目標」との差と対目標比を出す
 * （`docs/design/v4/keep-report.md` §1.2・§5.3）。その目標＝`monthly_budgets` は
 * migration 129 からあるのに、v4 で入力画面（`/sales/keep-report`）を削除したまま
 * **どこからも入れられなくなっていた**。お金の決めごとは1画面に集める方針なので
 * ここに戻す（§8「入力画面: 月次予算・経理の補正値は設定「お金のルール」に戻す」）。
 *
 * ── 主体ごとに持つ（2026年10月の会社分割）────────────────────
 *
 * GMOサムライスタジオ／GMOサムライコンテンツスタジオ／GMOインターネットグループ人格
 * の3つ（migration 283 で `year_month × entity` が主キー）。
 * **全体（統合）は主体の合計で、入力させない** — 合計だけ入れると主体別の表が
 * 「—」のままになり、按分すると数字の出どころが消える。
 *
 * ── 表のまま横に流す ────────────────────────────────────────
 *
 * 5つの金額列（128px × 5）は 375px には入らない。縦積みにすると
 * どの数字がどの列か分からなくなる（表頭が消える）ので、
 * **この表だけ `overflow-x-auto` で横に流す**（この画面は PC 専用の枠に入っている）。
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  BUSINESS_ENTITY_LABELS, type EntityScope, type MonthlyBudget,
} from '@gmo-onair/shared/src/keepReport/types';
import { BUSINESS_ENTITIES, useMonthlyBudgets, type MonthlyOverride } from '@/lib/keepApi';
import { MonthlyBudgetEditor } from './MonthlyBudgetEditor';
import {
  BUDGET_FIELDS, budgetKey, monthsOf, sumNullable, viewOf, ymLabel, type BudgetView,
} from './budgetMath';

/** 金額の列幅。**7段のうち 128** — 予算は千万円台まで（8桁＋区切り）がこれに入る */
const MONEY_W = 128;

const SCOPE_ITEMS = [
  { key: 'all' as EntityScope, label: '全体（統合）', count: null },
  ...BUSINESS_ENTITIES.map((e) => ({ key: e as EntityScope, label: BUSINESS_ENTITY_LABELS[e], count: null })),
];

export function MonthlyBudgets({ canEdit }: { canEdit: boolean }) {
  // **年度ではなく暦年**（資料の表が暦年の月で並んでいる）。年は前後に動かせる
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [scope, setScope] = useState<EntityScope>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const q = useMonthlyBudgets(`${year}-01`, `${year}-12`);

  const months = monthsOf(year);
  const budgets = new Map<string, MonthlyBudget>(
    (q.data?.budgets ?? []).map((b) => [budgetKey(b.year_month, b.entity), b]),
  );
  const overrides = new Map<string, MonthlyOverride>(
    (q.data?.overrides ?? []).map((o) => [budgetKey(o.year_month, o.entity), o]),
  );
  const views = months.map((ym) => [ym, viewOf(ym, scope, BUSINESS_ENTITIES, budgets, overrides)] as const);
  const yearTotal: BudgetView = {
    revenue: sumNullable(views.map(([, v]) => v.revenue)),
    cogs_fixed: sumNullable(views.map(([, v]) => v.cogs_fixed)),
    cogs_variable: sumNullable(views.map(([, v]) => v.cogs_variable)),
    sga: sumNullable(views.map(([, v]) => v.sga)),
    operating_profit: sumNullable(views.map(([, v]) => v.operating_profit)),
    hasOverride: false,
  };

  // **主体を選んだときだけ直せる。** 全体は合計なので入力欄を出さない（冒頭の理由）
  const editable = canEdit && scope !== 'all';
  const moveYear = (delta: number) => { setYear((y) => y + delta); setEditing(null); };
  const pickScope = (s: EntityScope) => { setScope(s); setEditing(null); };

  /** 金額の1マス。`key` は行の中で列を見分けるため（同じ行に同じ値が並ぶ） */
  const money = (key: string, v: number | null, bold = false) => (
    <MoneyCell
      key={key}
      width={MONEY_W}
      value={v}
      className={cn('text-sub text-right', bold && 'font-bold', v !== null && v < 0 && 'text-destructive')}
    />
  );

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-success-surface">
          <Target className="h-4 w-4 text-success" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">月次予算（隔週キープの目標）</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          主体ごとの目標。着地表・見込表の「目標」と対目標比になります
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border-faint px-4 py-2.5">
        <FilterChips label="事業主体で絞り込む" items={SCOPE_ITEMS} value={scope} onChange={pickScope} />
        <span className="flex-1" />
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" aria-label="前の年" onClick={() => moveYear(-1)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="text-list font-number px-2">{year}年</span>
          <Button type="button" variant="outline" size="sm" aria-label="次の年" onClick={() => moveYear(1)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {q.isError ? (
        <div className="p-4">
          <ErrorPanel title="月次予算を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : !q.data ? (
        <div className="p-4"><Delayed><SkeletonRows rows={6} /></Delayed></div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <RowHeader>
              <RowMain>月</RowMain>
              {BUDGET_FIELDS.map((f) => (
                <RowSlot key={f.key} w={MONEY_W} align="right">{f.label}</RowSlot>
              ))}
              <RowSlot w={MONEY_W} align="right">営業利益</RowSlot>
              {editable && <RowSlot w={72} align="right"> </RowSlot>}
            </RowHeader>

            {views.map(([ym, v]) => (
              <div key={ym}>
                <Row density="table" divider className={cn(editing === ym && 'bg-primary-surface-weak')}>
                  <RowMain>
                    <span className="text-list font-number">{ymLabel(ym)}</span>
                    {v.hasOverride && (
                      <span className="text-note ml-2 text-muted-foreground">補正値あり</span>
                    )}
                  </RowMain>
                  {BUDGET_FIELDS.map((f) => money(f.key, v[f.key]))}
                  {money('op', v.operating_profit, true)}
                  {editable && (
                    <RowSlot w={72} align="right">
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(ym)}>
                        編集
                      </Button>
                    </RowSlot>
                  )}
                </Row>
                {/* `editable` が真なら `scope` は主体（`all` ではない）— 上の定義どおり */}
                {editable && editing === ym && (
                  <MonthlyBudgetEditor
                    // 年・主体を変えたら閉じる（`moveYear` / `pickScope`）ので、月ごとに作り直せば十分
                    key={`${ym}:${scope}`}
                    ym={ym}
                    entity={scope}
                    budget={budgets.get(budgetKey(ym, scope))}
                    override={overrides.get(budgetKey(ym, scope))}
                    onClose={() => setEditing(null)}
                  />
                )}
              </div>
            ))}

            <Row density="table" className="border-t border-border-subtle bg-surface-subtle">
              <RowMain><span className="text-list font-bold">{year}年 合計</span></RowMain>
              {BUDGET_FIELDS.map((f) => money(f.key, yearTotal[f.key], true))}
              {money('op', yearTotal.operating_profit, true)}
              {editable && <RowSlot w={72} align="right"> </RowSlot>}
            </Row>
          </div>
        </div>
      )}

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
        <strong className="font-bold">全体（統合）は主体の合計</strong>です。主体を選んで月ごとに入れてください
        （主体の予算が無い月は「—」のままで、按分しません）。
        営業利益は 売上高 − 固定原価 − 変動原価 − 販管費 で計算し、手では入れません。
        {!canEdit && <> 直せるのは<strong className="font-bold">案件管理の編集以上</strong>の人です。</>}
      </p>
    </div>
  );
}
