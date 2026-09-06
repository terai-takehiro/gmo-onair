/**
 * 月次予算（隔週キープの目標）の計算と形 — 画面の物を1つも import しない
 *
 * `MonthlyBudgets.tsx`（表）と `MonthlyBudgetEditor.tsx`（入力）が同じ式を読むための1か所。
 * **営業利益は入力させない** — 売上高 − 固定原価 − 変動原価 − 販管費 で必ず出す
 * （9/4 の資料で、手計算の写し間違いがそのまま会議に出た。`keep-report.md` §5.3）。
 *
 * ── null と 0 を混ぜない ────────────────────────────────────
 *
 * `null` は「未登録」、`0` は「0 円と決めた」。全体（統合）の合計は
 * **登録のある主体だけを足し、1つも無ければ null（「—」）のまま**にする（按分しない）。
 * 営業利益は4つとも入って初めて出す — 片方が未登録のまま引き算すると、
 * 「販管費を決めていない月」が「販管費 0 円の月」として利益に見える。
 */
import type { BusinessEntity, EntityScope, MonthlyBudget } from '@gmo-onair/shared/src/keepReport/types';
import type { MonthlyOverride } from '@/lib/keepApi';

export type BudgetField = 'revenue' | 'cogs_fixed' | 'cogs_variable' | 'sga';

/** 入力する4つ。並びは資料の表と同じ（売上 → 原価 → 販管費） */
export const BUDGET_FIELDS: { key: BudgetField; label: string; hint: string | null }[] = [
  { key: 'revenue', label: '売上高', hint: null },
  { key: 'cogs_fixed', label: '固定原価', hint: '償却相当額' },
  { key: 'cogs_variable', label: '変動原価', hint: '案件の仕入' },
  { key: 'sga', label: '販管費', hint: null },
];

/** その年の12か月（`YYYY-MM`） */
export function monthsOf(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

/** `2026-08` → `2026/08`（画面の日付は `/` 区切り） */
export function ymLabel(ym: string): string {
  return ym.replace('-', '/');
}

/** サーバーの数値（pg の numeric は文字列で届くことがある）を数か null に */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 4つとも入っているときだけ営業利益を出す */
export function operatingProfit(b: Record<BudgetField, number | null>): number | null {
  if (b.revenue === null || b.cogs_fixed === null || b.cogs_variable === null || b.sga === null) return null;
  return b.revenue - b.cogs_fixed - b.cogs_variable - b.sga;
}

/** 登録のあるものだけ足す。1つも無ければ null */
export function sumNullable(values: (number | null)[]): number | null {
  const hit = values.filter((v): v is number => v !== null);
  return hit.length === 0 ? null : hit.reduce((a, b) => a + b, 0);
}

/** 補正値が1つでも入っているか（表に「補正値あり」を出すため） */
export function hasOverrideValues(o: MonthlyOverride | undefined): boolean {
  if (!o) return false;
  return num(o.cogs_fixed_actual) !== null || num(o.sga_actual) !== null || !!(o.note && o.note.trim());
}

/** 表の1行（主体1つ、または全体の合計） */
export interface BudgetView extends Record<BudgetField, number | null> {
  operating_profit: number | null;
  hasOverride: boolean;
}

export const budgetKey = (ym: string, entity: BusinessEntity) => `${ym}:${entity}`;

/**
 * 主体ごとの値を表の1行に。`all` は主体の合計。
 * **営業利益の合計は「主体ごとの営業利益」を足す**（合計の4つから引き直さない —
 * 販管費が未登録の主体があると、合計の引き算では利益が実際より大きく見える）。
 */
export function viewOf(
  ym: string,
  scope: EntityScope,
  entities: readonly BusinessEntity[],
  budgets: Map<string, MonthlyBudget>,
  overrides: Map<string, MonthlyOverride>,
): BudgetView {
  const targets = scope === 'all' ? entities : [scope];
  const rows = targets.map((e) => budgets.get(budgetKey(ym, e)));
  const field = (k: BudgetField) => sumNullable(rows.map((r) => (r ? num(r[k]) : null)));
  const view: Record<BudgetField, number | null> = {
    revenue: field('revenue'),
    cogs_fixed: field('cogs_fixed'),
    cogs_variable: field('cogs_variable'),
    sga: field('sga'),
  };
  const ops = rows.map((r) => (r ? operatingProfit({
    revenue: num(r.revenue), cogs_fixed: num(r.cogs_fixed), cogs_variable: num(r.cogs_variable), sga: num(r.sga),
  }) : null));
  return {
    ...view,
    operating_profit: sumNullable(ops),
    hasOverride: targets.some((e) => hasOverrideValues(overrides.get(budgetKey(ym, e)))),
  };
}

/** 入力欄の文字（数字だけ）→ 円。**空欄は null**（未登録） */
export function toYen(s: string): number | null {
  const digits = s.replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}

/** 数字だけの文字に桁区切りを付けて出す（`''` はそのまま） */
export function formatDigits(s: string): string {
  const digits = s.replace(/[^\d]/g, '');
  return digits === '' ? '' : Number(digits).toLocaleString('ja-JP');
}

/** 円 → 入力欄の文字（null は空欄） */
export function fromYen(v: number | null): string {
  return v === null ? '' : String(Math.round(v));
}
