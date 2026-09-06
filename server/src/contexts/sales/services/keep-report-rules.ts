/**
 * 隔週キープ（業績報告）の計算列と設定の決めごと — **純粋関数だけ**（DB も HTTP も触らない）
 *
 * `keep-report.service.ts` から呼ぶ。分けてあるのは `shared/tests/keepReportPl.test.ts` が
 * 直接 import して固定するため（サービス本体は pg を読み込むのでテストから読めない）。
 *
 * 正は docs/design/v4/keep-report.md §5.3（計算列）・§5.4（稼働率）。
 */
import type { LegalEntityCode } from '../../platform/services/legal-entity.service';

// ── 計算列（手計算しない・§5.3）──────────────────────────────────────

export type VarianceKind = 'higher_better' | 'lower_better';
export type Judge = '○' | '✕' | '-';

export interface Variance {
  actual: number;
  budget: number | null;
  diff: number | null;
  ratio: number | null;
  judge: Judge;
}

/**
 * 対目標比（%・小数1桁）。
 *
 * 目標が赤字（budget < 0）の行は `100 − (目標 − 実績) ÷ |目標| × 100`。
 * **9/4 の資料の式に揃える**（60.0% = 1 − 11,380 ÷ 28,454）— 素直に 実績 ÷ 目標 で割ると
 * −39,834 ÷ −28,454 = 140% になり、目標より悪いのに「達成」に見える。
 * 目標 0 は割れないので null（判定は diff で付く）。
 */
export function ratioOf(actual: number, budget: number | null): number | null {
  if (budget == null || budget === 0) return null;
  const raw = budget < 0
    ? 100 - ((budget - actual) / Math.abs(budget)) * 100
    : (actual / budget) * 100;
  return Math.round(raw * 10) / 10;
}

/**
 * 判定（要件書 §2.5・keep-report.md §5.3）:
 * 売上・利益系（higher_better）は 実績 ≧ 目標 → ○、費用系（lower_better）は 実績 ≦ 目標 → ○、
 * 目標が無ければ "-"。
 */
export function varianceOf(actual: number, budget: number | null, kind: VarianceKind): Variance {
  if (budget == null) return { actual, budget: null, diff: null, ratio: null, judge: '-' };
  const diff = actual - budget;
  const judge: Judge = kind === 'higher_better' ? (actual >= budget ? '○' : '✕') : (actual <= budget ? '○' : '✕');
  return { actual, budget, diff, ratio: ratioOf(actual, budget), judge };
}

// ── 主体の合計（全体の目標 ＝ 主体の合計・按分しない・§4）──────────────

export interface BudgetFields {
  revenue: number | null;
  cogs_fixed: number | null;
  cogs_variable: number | null;
  sga: number | null;
  operating_profit: number | null;
}
export const BUDGET_FIELD_KEYS: readonly (keyof BudgetFields)[] =
  ['revenue', 'cogs_fixed', 'cogs_variable', 'sga', 'operating_profit'];

/**
 * 主体ごとの予算を足して「全体」にする。行が無ければ null。
 * 項目ごとに、**どの主体にも無い項目は null のまま**（0 にしない — 「未登録」と「0 円」は別）。
 * 1つでも入っていれば入っている主体だけの合計（無い主体を 0 とみなす。按分はしない）。
 */
export function sumBudgetFields(rows: BudgetFields[]): BudgetFields | null {
  if (rows.length === 0) return null;
  const out: BudgetFields = { revenue: null, cogs_fixed: null, cogs_variable: null, sga: null, operating_profit: null };
  for (const key of BUDGET_FIELD_KEYS) {
    const present = rows.map((r) => r[key]).filter((v): v is number => v != null);
    out[key] = present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

// ── 稼働率の数え方（keep_settings.key = 'utilization'・§5.4）────────────

/** 数えられる予定の種別（studio_bookings.booking_type）。この外の値は設定に入れない */
export const UTILIZATION_BOOKING_TYPES: readonly string[] =
  ['performance', 'rehearsal', 'hold', 'tour', 'internal', 'consultation', 'maintenance', 'setup', 'other'];

export interface UtilizationSettings {
  counted_types: string[];
  count_saturday: boolean;
}

/**
 * 既定: メンテナンス以外を全部数える（仮押さえも数える。決めてほしいこと1）。
 * `shared/src/keepReport/types.ts` の DEFAULT_UTILIZATION_SETTINGS と同じ値
 * （server は shared を読めないので写し。テストが一致を固定する）。
 */
export const DEFAULT_UTILIZATION_SETTINGS: UtilizationSettings = {
  counted_types: ['performance', 'rehearsal', 'hold', 'tour', 'internal', 'consultation', 'setup', 'other'],
  count_saturday: false,
};

/** DB から読んだ値を整える（知らない種別は落とす・欠けた鍵は既定で埋める）。壊れた値で画面を止めない */
export function normalizeUtilizationSettings(raw: unknown): UtilizationSettings {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const types = Array.isArray(r.counted_types)
    ? r.counted_types.filter((t): t is string => typeof t === 'string' && UTILIZATION_BOOKING_TYPES.includes(t))
    : null;
  return {
    counted_types: types ? Array.from(new Set(types)) : [...DEFAULT_UTILIZATION_SETTINGS.counted_types],
    count_saturday: typeof r.count_saturday === 'boolean' ? r.count_saturday : DEFAULT_UTILIZATION_SETTINGS.count_saturday,
  };
}

/**
 * 人が送ってきた設定を検査して、今の設定に重ねる（渡した鍵だけ更新）。
 * 知らない種別・真偽値でない `count_saturday` は**黙って落とさず**理由を返す（呼ぶ側が 400 にする）。
 */
export function mergeUtilizationSettings(
  current: UtilizationSettings,
  patch: unknown,
): { ok: true; value: UtilizationSettings } | { ok: false; reason: string } {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, reason: '設定はオブジェクトで送ってください' };
  }
  const p = patch as Record<string, unknown>;
  const next: UtilizationSettings = { counted_types: [...current.counted_types], count_saturday: current.count_saturday };
  if (p.counted_types !== undefined) {
    if (!Array.isArray(p.counted_types)) return { ok: false, reason: 'counted_types は予定の種別の配列' };
    const bad = p.counted_types.filter((t) => typeof t !== 'string' || !UTILIZATION_BOOKING_TYPES.includes(t));
    if (bad.length > 0) {
      return { ok: false, reason: `counted_types に知らない種別があります: ${bad.map(String).join(', ')}（${UTILIZATION_BOOKING_TYPES.join(' / ')}）` };
    }
    next.counted_types = Array.from(new Set(p.counted_types as string[]));
  }
  if (p.count_saturday !== undefined) {
    if (typeof p.count_saturday !== 'boolean') return { ok: false, reason: 'count_saturday は true / false' };
    next.count_saturday = p.count_saturday;
  }
  return { ok: true, value: next };
}

/** 計上会社別の月次予算・補正値の行が持つ共通の鍵 */
export interface EntityKeyed { year_month: string; entity_code: LegalEntityCode }
