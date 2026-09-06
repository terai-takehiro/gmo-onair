/**
 * 月次予算の1か月ぶんを直す欄（`MonthlyBudgets.tsx` の行の下に開く）— 会社タブの会社ぶん
 *
 * ── 入れるのは4つだけ・営業利益は出すだけ ──────────────────
 *
 * 売上高・固定原価（償却相当額）・変動原価（案件の仕入）・販管費。
 * 営業利益は **売上高 − 固定原価 − 変動原価 − 販管費** で画面が出し、
 * 保存でも同じ値を送る（`budgetMath.ts` の式）。人に打たせると資料の表と
 * 食い違う（9/4 の資料で手計算の写し間違いがそのまま会議に出た）。
 *
 * ── 空欄は「未登録」・0 は「0 円と決めた」 ──────────────────
 *
 * 部品の `CurrencyInput` は空欄を 0 として返すので、ここでは使わない。
 * 販管費を会社ごとに分け始めるまではコンテンツスタジオ（GJV）の販管費は
 * **未登録のまま**にする決め（`keep-report.md` §12-4）で、0 と区別が要る。
 *
 * ── 経理の補正値は畳んでおく ────────────────────────────────
 *
 * 着地表で台帳の集計の代わりに使う「経理が確定した数字」。毎月入れるものでは
 * ないので、入っている月だけ開いた状態にする（欄が並ぶと予算と取り違える）。
 *
 * ── 変わったものだけ送る ────────────────────────────────────
 *
 * 予算と補正値は別の口（`PUT /keep/monthly-budget/:ym`・`PUT /keep/monthly-override/:ym`）。
 * 触っていない側まで送ると、補正値を入れていない月に空の補正の行ができる。
 * どちらも**会社（`entity_code`）を必ず付けて送る** — 省くとサーバーが今の会社（GSS）に
 * 倒すので、GJV のタブで直した値が GSS の予算に書かれる（`lib/keepApi.ts` 冒頭）。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import type { BusinessEntity, MonthlyBudget } from '@gmo-onair/shared/src/keepReport/types';
import { ENTITY_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { useSaveMonthlyBudget, useSaveMonthlyOverride, type MonthlyOverride } from '@/lib/keepApi';
import {
  BUDGET_FIELDS, formatDigits, fromYen, hasOverrideValues, num, operatingProfit, toYen, ymLabel,
  type BudgetField,
} from './budgetMath';

interface Draft extends Record<BudgetField, string> {
  cogs_fixed_actual: string;
  sga_actual: string;
  note: string;
}

function draftOf(budget: MonthlyBudget | undefined, override: MonthlyOverride | undefined): Draft {
  return {
    revenue: fromYen(num(budget?.revenue)),
    cogs_fixed: fromYen(num(budget?.cogs_fixed)),
    cogs_variable: fromYen(num(budget?.cogs_variable)),
    sga: fromYen(num(budget?.sga)),
    cogs_fixed_actual: fromYen(num(override?.cogs_fixed_actual)),
    sga_actual: fromYen(num(override?.sga_actual)),
    note: override?.note ?? '',
  };
}

/** 円の入力欄。**空欄を空欄のまま返す**（`CurrencyInput` は 0 にしてしまう） */
function YenInput({ id, value, onChange, disabled }: {
  id: string; value: string; onChange: (digits: string) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sub shrink-0 text-muted-foreground">¥</span>
      <Input
        id={id} inputMode="numeric" className="font-number" disabled={disabled}
        value={formatDigits(value)} placeholder="空欄 = 未登録"
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ''))}
      />
    </div>
  );
}

export function MonthlyBudgetEditor({ ym, entityCode, budget, override, onClose }: {
  ym: string;
  /** 計上会社（GJV / GSS / GMO）。呼び名はタブと同じ `ENTITY_BADGE_LABEL` で出す */
  entityCode: BusinessEntity;
  budget: MonthlyBudget | undefined;
  override: MonthlyOverride | undefined;
  onClose: () => void;
}) {
  const saveBudget = useSaveMonthlyBudget();
  const saveOverride = useSaveMonthlyOverride();
  const [draft, setDraft] = useState<Draft>(() => draftOf(budget, override));
  const [showOverride, setShowOverride] = useState(() => hasOverrideValues(override));
  const busy = saveBudget.isPending || saveOverride.isPending;
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const values: Record<BudgetField, number | null> = {
    revenue: toYen(draft.revenue),
    cogs_fixed: toYen(draft.cogs_fixed),
    cogs_variable: toYen(draft.cogs_variable),
    sga: toYen(draft.sga),
  };
  const op = operatingProfit(values);

  const submit = async () => {
    const budgetChanged = BUDGET_FIELDS.some((f) => values[f.key] !== num(budget?.[f.key]));
    const nextOverride = {
      cogs_fixed_actual: toYen(draft.cogs_fixed_actual),
      sga_actual: toYen(draft.sga_actual),
      note: draft.note.trim() || null,
    };
    const overrideChanged =
      nextOverride.cogs_fixed_actual !== num(override?.cogs_fixed_actual)
      || nextOverride.sga_actual !== num(override?.sga_actual)
      || nextOverride.note !== (override?.note?.trim() || null);
    if (!budgetChanged && !overrideChanged) { onClose(); return; }
    try {
      if (budgetChanged) await saveBudget.mutateAsync({ ym, entity_code: entityCode, ...values, operating_profit: op });
      if (overrideChanged) await saveOverride.mutateAsync({ ym, entity_code: entityCode, ...nextOverride });
      notifySuccess(`${ymLabel(ym)} の予算を保存しました`, {
        description: `${ENTITY_BADGE_LABEL[entityCode]}（${entityCode}）。隔週キープの着地表・見込表の「目標」に効きます。`,
      });
      onClose();
    } catch (e) {
      notifyApiError('保存できませんでした', e);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-border-faint bg-surface-subtle px-4 py-3">
      <p className="text-note text-muted-foreground">
        <strong className="font-bold">{ymLabel(ym)}・{ENTITY_BADGE_LABEL[entityCode]}</strong> の目標を円で入れます。
        <strong className="font-bold">空欄は「未登録」</strong>です（0 と入れると「0 円と決めた」になります）。
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BUDGET_FIELDS.map((f) => (
          <label key={f.key} htmlFor={`mb-${ym}-${f.key}`} className="text-note flex flex-col gap-1">
            <span>
              {f.label}
              {f.hint && <span className="ml-1 text-muted-foreground">（{f.hint}）</span>}
            </span>
            <YenInput id={`mb-${ym}-${f.key}`} value={draft[f.key]} disabled={busy}
              onChange={(v) => set(f.key, v)} />
          </label>
        ))}
      </div>

      <p className="text-sub flex flex-wrap items-baseline gap-2">
        <span className="text-muted-foreground">営業利益（計算）</span>
        <Money inline value={op} className={cn('font-bold', op !== null && op < 0 && 'text-destructive')} />
        {op === null && <span className="text-note text-muted-foreground">4つとも入ると出ます</span>}
      </p>

      <button
        type="button"
        onClick={() => setShowOverride((s) => !s)}
        aria-expanded={showOverride}
        className="text-sub min-h-tap inline-flex items-center gap-1.5 self-start text-primary hover:underline lg:min-h-0"
      >
        {showOverride
          ? <ChevronDown className="h-4 w-4" aria-hidden="true" />
          : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        経理の補正値
        {!showOverride && hasOverrideValues(override) && <span className="text-note text-muted-foreground">（入っています）</span>}
      </button>

      {showOverride && (
        <div className="flex flex-col gap-3 rounded-note border border-border bg-card p-3">
          <p className="text-note text-muted-foreground">
            着地表で<strong className="font-bold">台帳の集計の代わりに使う、経理が確定した数字</strong>です。
            空欄なら台帳の集計をそのまま使います。
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label htmlFor={`mo-${ym}-cf`} className="text-note flex flex-col gap-1">
              固定原価の実績（補正）
              <YenInput id={`mo-${ym}-cf`} value={draft.cogs_fixed_actual} disabled={busy}
                onChange={(v) => set('cogs_fixed_actual', v)} />
            </label>
            <label htmlFor={`mo-${ym}-sga`} className="text-note flex flex-col gap-1">
              販管費の実績（補正）
              <YenInput id={`mo-${ym}-sga`} value={draft.sga_actual} disabled={busy}
                onChange={(v) => set('sga_actual', v)} />
            </label>
            <label htmlFor={`mo-${ym}-note`} className="text-note flex flex-col gap-1">
              補正の理由
              <Input id={`mo-${ym}-note`} value={draft.note} disabled={busy} maxLength={200}
                placeholder="例）経理の月次確定値に合わせた" onChange={(e) => set('note', e.target.value)} />
            </label>
          </div>
        </div>
      )}

      <div className="ml-auto flex gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>キャンセル</Button>
        <Button type="button" disabled={busy} onClick={() => void submit()}>
          {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
          保存する
        </Button>
      </div>
    </div>
  );
}
