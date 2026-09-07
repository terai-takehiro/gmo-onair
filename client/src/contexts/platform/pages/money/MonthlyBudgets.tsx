/**
 * 月次予算（隔週キープの目標）— お金のルール ⑤ の下・会社タブの会社ぶん
 *
 * ── なぜここにあるか ────────────────────────────────────────
 *
 * 隔週キープ（業績報告）の着地表・見込表は「目標」との差と対目標比を出す
 * （`docs/design/v4/keep-report.md` §1.2・§5.3）。その目標＝`monthly_budgets` は
 * migration 129 からあるのに、v4 で入力画面（`/sales/keep-report`）を削除したまま
 * **どこからも入れられなくなっていた**。お金の決めごとは1画面に集める方針なので
 * ここに戻す（§8「入力画面: 月次予算・経理の補正値は設定「お金のルール」に戻す」）。
 *
 * ── 会社（計上会社）ごとに持つ ──────────────────────────────
 *
 * 2026年10月の事業再編（`docs/reorg-2026-10-plan.md` §4.5・§6 P2 Round 1）で
 * `monthly_budgets` は `(entity_code, year_month)` が主キーになった（migration 288）。
 * **どの会社の分を見る・直すかはこの部品では選ばず、お金のルールの会社タブ（`entityCode`）
 * に従う** — 締め日・税率と同じ「会社ごとの設定」なので、同じ切替で動くほうが迷わない
 * （ここに別の切替を置くと「タブは GSS なのに表は GJV」ができる）。
 * **全体（統合）＝3社の合計は読むだけ**（切替で見られる・入力させない） — 合計だけ入れると
 * 会社別の表が「—」のままになり、按分すると数字の出どころが消える。
 *
 * ── 表のまま横に流す ────────────────────────────────────────
 *
 * 5つの金額列（128px × 5）は 375px には入らない。縦積みにすると
 * どの数字がどの列か分からなくなる（表頭が消える）ので、
 * **この表だけ `overflow-x-auto` で横に流す**（この画面は PC 専用の枠に入っている）。
 * 幅は**行ごと**に `w-fit min-w-full`（固定列が入らなければ中身ぶん・入るなら枠いっぱい）で持たせる。
 * `w-max` だと合計の行の「2026年 合計」の文字ぶんだけ広がって 1440px でも 12px はみ出し、
 * 包む側に `min-w-max` を置くと行の下に開く編集欄の説明文まで折り返さなくなって
 * 表が説明文の長さまで広がった（どちらも実測で直した）。
 */
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { EntityScope } from '@gmo-onair/shared/src/keepReport/types';
import { ENTITY_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { useMonthlyBudgets } from '@/lib/keepApi';
import type { LegalEntityCode } from '../reorg/types';
import { MonthlyBudgetEditor } from './MonthlyBudgetEditor';
import { BUDGET_FIELDS, monthsOf, rowOf, sumNullable, viewOf, ymLabel, type BudgetView } from './budgetMath';

/** 金額の列幅。**7段のうち 128** — 予算は千万円台まで（8桁＋区切り）がこれに入る */
const MONEY_W = 128;
/** 行の幅（冒頭「表のまま横に流す」）。表頭・月の行・合計の行で同じ */
const ROW_W = 'w-fit min-w-full';

export function MonthlyBudgets({ entityCode, canEdit }: {
  /** お金のルールの会社タブで選んでいる会社（`MoneyRulesPage.tsx` の `entityCode`） */
  entityCode: LegalEntityCode;
  canEdit: boolean;
}) {
  // **年度ではなく暦年**（資料の表が暦年の月で並んでいる）。年は前後に動かせる
  const [year, setYear] = useState(() => new Date().getFullYear());
  // 全体（統合）＝3社の合計を見る（読むだけ）。既定はタブの会社
  const [showTotal, setShowTotal] = useState(false);
  // 開いている編集欄。**会社ごとに持つ** — タブを切り替えたら別の会社の欄は出さない
  //（同じ月の欄が別の会社の値で開いたままになると、どの会社に保存されるのか読めない）
  const [editing, setEditing] = useState<{ entityCode: LegalEntityCode; ym: string } | null>(null);
  const q = useMonthlyBudgets(`${year}-01`, `${year}-12`);

  const scope: EntityScope = showTotal ? 'all' : entityCode;
  const budgets = q.data?.budgets ?? [];
  const overrides = q.data?.overrides ?? [];
  const months = monthsOf(year);
  const views = months.map((ym) => [ym, viewOf(ym, scope, budgets, overrides)] as const);
  const yearTotal: BudgetView = {
    revenue: sumNullable(views.map(([, v]) => v.revenue)),
    cogs_fixed: sumNullable(views.map(([, v]) => v.cogs_fixed)),
    cogs_variable: sumNullable(views.map(([, v]) => v.cogs_variable)),
    sga: sumNullable(views.map(([, v]) => v.sga)),
    operating_profit: sumNullable(views.map(([, v]) => v.operating_profit)),
    hasOverride: false,
  };

  // **会社を選んでいるときだけ直せる。** 全体は合計なので入力欄を出さない（冒頭の理由）
  const editable = canEdit && !showTotal;
  const editingYm = editing && editing.entityCode === entityCode ? editing.ym : null;
  const moveYear = (delta: number) => { setYear((y) => y + delta); setEditing(null); };
  const toggleTotal = (on: boolean) => { setShowTotal(on); setEditing(null); };

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
          会社ごとの目標。着地表・見込表の「目標」と対目標比になります
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b border-border-faint px-4 py-2.5">
        {/* いま出している会社。タブと同じ呼び名（`ENTITY_BADGE_LABEL` ＝ `legal_entities.short_name`） */}
        <span className="text-sub">
          {showTotal ? (
            <><strong className="font-bold">全体（統合）</strong>＝3社の合計（読むだけ）</>
          ) : (
            <><strong className="font-bold">{ENTITY_BADGE_LABEL[entityCode]}</strong>
              <span className="font-number ml-1 text-muted-foreground">{entityCode}</span> の目標</>
          )}
        </span>
        <span className="flex items-center gap-2">
          <Switch id="mb-total" checked={showTotal} onCheckedChange={(v) => toggleTotal(!!v)} />
          <label htmlFor="mb-total" className="text-note text-muted-foreground">全体（統合）を見る</label>
        </span>
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
          <div>
            <RowHeader className={ROW_W}>
              <RowMain>月</RowMain>
              {BUDGET_FIELDS.map((f) => (
                <RowSlot key={f.key} w={MONEY_W} align="right">{f.label}</RowSlot>
              ))}
              <RowSlot w={MONEY_W} align="right">営業利益</RowSlot>
              {editable && <RowSlot w={72} align="right"> </RowSlot>}
            </RowHeader>

            {views.map(([ym, v]) => (
              <div key={ym}>
                <Row density="table" divider className={cn(ROW_W, editingYm === ym && 'bg-primary-surface-weak')}>
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
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ entityCode, ym })}>
                        編集
                      </Button>
                    </RowSlot>
                  )}
                </Row>
                {/* `editable` が真なら `showTotal` は偽 — 表もこの会社の行だけを出している */}
                {editable && editingYm === ym && (
                  <MonthlyBudgetEditor
                    // 年を動かす・全体に切り替えると閉じる（`moveYear` / `toggleTotal`）。
                    // 会社が変われば `editingYm` が null になるので、月×会社で作り直せば十分
                    key={`${ym}:${entityCode}`}
                    ym={ym}
                    entityCode={entityCode}
                    budget={rowOf(budgets, ym, entityCode)}
                    override={rowOf(overrides, ym, entityCode)}
                    onClose={() => setEditing(null)}
                  />
                )}
              </div>
            ))}

            <Row density="table" className={cn(ROW_W, 'border-t border-border-subtle bg-surface-subtle')}>
              <RowMain><span className="text-list font-bold">{year}年 合計</span></RowMain>
              {BUDGET_FIELDS.map((f) => money(f.key, yearTotal[f.key], true))}
              {money('op', yearTotal.operating_profit, true)}
              {editable && <RowSlot w={72} align="right"> </RowSlot>}
            </Row>
          </div>
        </div>
      )}

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
        <strong className="font-bold">全体（統合）は3社の合計</strong>です。上の会社タブで会社を選び、月ごとに入れてください
        （会社の予算が無い月は「—」のままで、按分しません）。
        営業利益は 売上高 − 固定原価 − 変動原価 − 販管費 で計算し、手では入れません。
        {!canEdit && <> 直せるのは<strong className="font-bold">案件管理の編集以上</strong>の人です。</>}
      </p>
    </div>
  );
}
