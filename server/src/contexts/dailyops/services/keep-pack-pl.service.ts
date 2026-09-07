/**
 * 定例報告パック — ①数値報告の表（当月 着地／翌月 着地見込）を計上会社別＋全体で組む
 *
 * 正は docs/design/v4/keep-report.md §5.2（出どころ）・§5.3（計算列）。
 * 「主体」＝ main の**計上会社 `entity_code`**（GJV／GSS／GMO・docs/reorg-2026-10-plan.md §4.5）。
 * 財務と同じく**案件ではなく行（revenues / purchases / sga_expenses）の `entity_code`** で切る
 * — 案件を改番・移管しても過去の行は書いた時の会社に残る（`pipeline-forecast.service.ts` と同じ判断）。
 *
 * ── 着地（landing）────────────────────────────────────────────
 * `keepReportService.getMonthlyPl(ym, 会社)` そのもの（確定売上 `status='confirmed'`・仕入・販管費・
 * 経理の補正値・会社別の予算）。**未確定の売上は数えない**。
 *
 * ── 着地見込（forecast）＝ 着地 ＋ 受注前案件の確度加味 ─────────────
 *   売上 … 着地（確定）＋ Σ（`status='estimate'` の売上 × ステージの受注確度）
 *   仕入 … 着地の仕入は案件のステージを問わず 100% で入っている（`getMonthlySummary`）ので、
 *          **受注前（neta / d_hold / c_proposal / b_verbal）の案件の仕入だけ 100% → 確度 に置き換える**
 *          （そのまま足すと二重に数える。失注の案件はどちらにも足さない）
 *   粗利・営業利益はそこから引き直す。確度は `project_stage_probabilities`（v4.5.25）。
 *
 * ── unconfirmed[] / unregistered[]（資料の注記の材料）───────────────
 *   unconfirmed … その月の `status='estimate'` の売上（案件ごとの合計）。**見込の表に確度加味で入っている**
 *   unregistered … その月に本番があるのに売上（確定・見積）が 1件も無い案件（金額は最新の見積 → 想定金額 → 0）。
 *   **表の数字には足していない**（売上の行が無い案件は確度加味の対象にならない。注記で人が気づけるようにするだけ）。
 *   2つを混ぜると「見込に含めた」と書いた注記に含めていない金額が並び、資料の説明と表が合わなくなる。
 *
 * ── 表の行 ──────────────────────────────────────────────────
 * 9/4 版の 6 行。「粗利」は 売上 − 変動原価（＝限界利益）、「営業利益」は 粗利 − 販管費 − 償却相当額。
 * 粗利の目標は 売上目標 − 変動原価目標（どちらか無ければ null）。
 * 比率・判定は `keep-report-rules.ts` の `varianceOf`（赤字の目標の式もそこ）。
 */
import { queryAll } from '../../../shared/db/connection';
import { keepReportService } from '../../sales/services/keep-report.service';
import { getStageProbabilityMap } from '../../sales/services/stage-probability.service';
import { ESTIMATE_AMOUNT_LATERAL } from '../../sales/services/project.service';
import { varianceOf } from '../../sales/services/keep-report-rules';
import {
  BUSINESS_ENTITIES, isBusinessEntity, type BudgetLine, type BusinessEntity, type EntityScope, type MonthlyPlTable, type PlByEntity,
} from './keep-pack.types';

const FIXED_COGS_CODE = 'FIXED-COGS';
/** 受注前のステージ（見込みで確度を掛ける側）。失注はどちらにも数えない */
const PRE_WON_STAGES = ['neta', 'd_hold', 'c_proposal', 'b_verbal'];
const SCOPES: readonly EntityScope[] = ['all', ...BUSINESS_ENTITIES];

type MonthlyPl = Awaited<ReturnType<typeof keepReportService.getMonthlyPl>>;
type PlActual = MonthlyPl['actual'];
type PlBudget = MonthlyPl['budget'];

/** `recognition_date` は TEXT（YYYY-MM-DD）なので `-31` の文字列比較で月末まで包含する（`getMonthlySummary` と同じ） */
const monthRange = (ym: string): [string, string] => [`${ym}-01`, `${ym}-31`];

const n = (v: unknown): number => Number(v) || 0;

function toLines(actual: PlActual, budget: PlBudget): BudgetLine[] {
  const grossBudget = budget && budget.revenue != null && budget.cogs_variable != null
    ? budget.revenue - budget.cogs_variable
    : null;
  const opBudget = budget
    ? (budget.operating_profit
      ?? (budget.revenue != null && budget.cogs_fixed != null && budget.cogs_variable != null && budget.sga != null
        ? budget.revenue - budget.cogs_fixed - budget.cogs_variable - budget.sga
        : null))
    : null;
  const line = (
    key: BudgetLine['key'], label: string, kind: BudgetLine['kind'], act: number, bud: number | null,
  ): BudgetLine => {
    const v = varianceOf(act, bud, kind);
    return { key, label, budget: v.budget, actual: v.actual, diff: v.diff, ratio: v.ratio, judge: v.judge, kind };
  };
  return [
    line('revenue', '売上高', 'higher_better', actual.revenue, budget?.revenue ?? null),
    line('cogs_variable', '原価（案件仕入）', 'lower_better', actual.cogs_variable, budget?.cogs_variable ?? null),
    line('gross_profit', '粗利', 'higher_better', actual.marginal_profit, grossBudget),
    line('sga', '販管費', 'lower_better', actual.sga, budget?.sga ?? null),
    line('cogs_fixed', '償却相当額', 'lower_better', actual.cogs_fixed, budget?.cogs_fixed ?? null),
    line('operating_profit', '営業利益', 'higher_better', actual.operating_profit, opBudget),
  ];
}

// ── 見込みの上乗せ（受注前案件 × 確度）──────────────────────────

interface Addition { revenue: number; cogs_variable: number }

const emptyAdditions = (): Record<EntityScope, Addition> => ({
  all: { revenue: 0, cogs_variable: 0 },
  GJV: { revenue: 0, cogs_variable: 0 },
  GSS: { revenue: 0, cogs_variable: 0 },
  GMO: { revenue: 0, cogs_variable: 0 },
});

/**
 * 帳簿の行を**案件ごと**に割った形にする SQL（売上／仕入で同じ形）。
 *
 * グループ請求（`group_id`）の行は `project_id` が先頭の案件しか指さず、内訳は
 * `revenue_allocations` / `purchase_allocations` にある（migration 005/006・`monthly-summary.service.ts` と同じ読み方）。
 * 確度加味は**案件のステージ**で掛けるので、按分のある行は allocation の額を各案件へ、
 * 按分の無い行はそのまま。代表案件のステージを行全体に掛けると按分先の確度が無視される。
 * 列: entity_code（行の会社）, project_id, amount。占位子は (from, to, from, to) の順。
 */
function perProjectRowsSql(table: 'revenues' | 'purchases', statusWhere: string): string {
  const alloc = table === 'revenues' ? 'revenue_allocations' : 'purchase_allocations';
  const fk = table === 'revenues' ? 'revenue_id' : 'purchase_id';
  return `
    SELECT t.entity_code, t.project_id, t.amount
      FROM ${table} t
     WHERE t.deleted_at IS NULL ${statusWhere}
       AND t.recognition_date >= ? AND t.recognition_date <= ?
       AND NOT EXISTS (SELECT 1 FROM ${alloc} a0 WHERE a0.${fk} = t.id)
    UNION ALL
    SELECT t.entity_code, a.project_id, a.allocated_amount
      FROM ${table} t JOIN ${alloc} a ON a.${fk} = t.id
     WHERE t.deleted_at IS NULL ${statusWhere}
       AND t.recognition_date >= ? AND t.recognition_date <= ?`;
}

async function weightedAdditions(ym: string): Promise<Record<EntityScope, Addition>> {
  const [from, to] = monthRange(ym);
  const [revRows, purRows, probability] = await Promise.all([
    queryAll(
      // 会社は行の entity_code（書いた時の会社。`getMonthlySummary` が着地を切るのと同じ列）。
      // ステージは**按分先の案件**のもの（perProjectRowsSql）
      `SELECT x.entity_code, p.stage, COALESCE(SUM(x.amount), 0)::bigint AS amount
         FROM (${perProjectRowsSql('revenues', "AND t.status = 'estimate'")}) x
         JOIN projects p ON p.id = x.project_id AND p.deleted_at IS NULL
        WHERE p.stage <> 'e_lost' AND COALESCE(p.code, '') <> ?
        GROUP BY x.entity_code, p.stage`,
      [from, to, from, to, FIXED_COGS_CODE],
    ) as Promise<{ entity_code: string; stage: string; amount: unknown }[]>,
    queryAll(
      `SELECT x.entity_code, p.stage, COALESCE(SUM(x.amount), 0)::bigint AS amount
         FROM (${perProjectRowsSql('purchases', '')}) x
         JOIN projects p ON p.id = x.project_id AND p.deleted_at IS NULL
        WHERE p.stage = ANY(?) AND COALESCE(p.code, '') <> ?
        GROUP BY x.entity_code, p.stage`,
      [from, to, from, to, PRE_WON_STAGES, FIXED_COGS_CODE],
    ) as Promise<{ entity_code: string; stage: string; amount: unknown }[]>,
    getStageProbabilityMap(),
  ]);
  const out = emptyAdditions();
  const add = (entityCode: string, field: keyof Addition, delta: number) => {
    out.all[field] += delta;
    if (isBusinessEntity(entityCode)) out[entityCode][field] += delta;
  };
  for (const r of revRows) {
    const p = probability.get(r.stage as never) ?? 0;
    add(r.entity_code, 'revenue', Math.round(n(r.amount) * (p / 100)));
  }
  for (const r of purRows) {
    // 100% で入っているぶんを確度に置き換える（差分は 0 以下）
    const p = probability.get(r.stage as never) ?? 0;
    const amount = n(r.amount);
    add(r.entity_code, 'cogs_variable', Math.round(amount * (p / 100)) - amount);
  }
  return out;
}

// ── 未確定の売上・売上未登録の案件（注記の材料）──────────────────────

interface Unconfirmed { project_id: string; project_name: string; amount: number; entity_code: BusinessEntity }
interface PlNotes { unconfirmed: Unconfirmed[]; unregistered: Unconfirmed[] }

async function listUnconfirmed(ym: string): Promise<PlNotes> {
  const [from, to] = monthRange(ym);
  const [estimateRows, eventRows] = await Promise.all([
    queryAll(
      // 会社は**売上の行の entity_code**（weightedAdditions が見込に足すのと同じ列）。案件の今の会社で見ると、
      // 会社を移した案件や行が2社に分かれた案件で「この会社の表に含めた」と書いた注記が別の会社の表の金額を指す。
      // 按分（グループ請求）は allocation の額を各案件へ（weightedAdditions と同じ perProjectRowsSql）
      `SELECT p.id, p.name, x.entity_code, COALESCE(SUM(x.amount), 0)::bigint AS amount
         FROM (${perProjectRowsSql('revenues', "AND t.status = 'estimate'")}) x
         JOIN projects p ON p.id = x.project_id AND p.deleted_at IS NULL
        WHERE p.stage <> 'e_lost' AND COALESCE(p.code, '') <> ?
        GROUP BY p.id, p.name, x.entity_code
        ORDER BY amount DESC, p.name`,
      [from, to, from, to, FIXED_COGS_CODE],
    ) as Promise<{ id: string; name: string; entity_code: string; amount: unknown }[]>,
    // その月に本番があるのに、**その月の**確定売上が1件も無い案件（直接の行も按分先としても）。
    // 金額は 最新の見積 → 想定金額 → 0（売上の行が無いので会社は案件の entity_code で見るしかない）。
    // 月で絞らないと、前の月に確定売上のある案件の「この月の売上が無い」を見落とす
    queryAll(
      `SELECT p.id, p.name, p.entity_code, COALESCE(est.amount, p.expected_amount, 0)::bigint AS amount
         FROM projects p
         ${ESTIMATE_AMOUNT_LATERAL}
        WHERE p.deleted_at IS NULL AND p.stage <> 'e_lost' AND COALESCE(p.code, '') <> ?
          AND NULLIF(p.event_start, '') IS NOT NULL
          AND p.event_start <= ? AND COALESCE(NULLIF(p.event_end, ''), p.event_start) >= ?
          AND NOT EXISTS (
            SELECT 1 FROM revenues r
             WHERE r.deleted_at IS NULL AND r.status = 'confirmed'
               AND r.recognition_date >= ? AND r.recognition_date <= ?
               AND (r.project_id = p.id
                    OR EXISTS (SELECT 1 FROM revenue_allocations ra WHERE ra.revenue_id = r.id AND ra.project_id = p.id))
          )
        ORDER BY p.event_start, p.name`,
      [FIXED_COGS_CODE, to, from, from, to],
    ) as Promise<{ id: string; name: string; entity_code: string; amount: unknown }[]>,
  ]);
  const toNote = (r: { id: string; name: string; entity_code: string; amount: unknown }): Unconfirmed =>
    ({ project_id: r.id, project_name: r.name, amount: n(r.amount), entity_code: r.entity_code as BusinessEntity });
  const unconfirmed = estimateRows.map(toNote);
  // 見積の売上がある案件は上に入っている（見込に含めた側）。残りが「売上の行が 1 件も無い」案件
  const inForecast = new Set(unconfirmed.map((u) => u.project_id));
  const unregistered = eventRows.filter((r) => !inForecast.has(r.id)).map(toNote);
  return { unconfirmed, unregistered };
}

/** 同じ案件の行（会社違い）を1行に足す。並びは最初に出た順のまま */
function mergeByProject(rows: Unconfirmed[]): Unconfirmed[] {
  const out = new Map<string, Unconfirmed>();
  for (const r of rows) {
    const cur = out.get(r.project_id);
    if (cur) cur.amount += r.amount;
    else out.set(r.project_id, { ...r });
  }
  return [...out.values()];
}

// ── 表を組む ────────────────────────────────────────────────

function toTable(
  ym: string, mode: MonthlyPlTable['mode'], pl: MonthlyPl, addition: Addition | null, notes: PlNotes,
): MonthlyPlTable {
  const actual: PlActual = { ...pl.actual };
  if (addition) {
    actual.revenue += addition.revenue;
    actual.cogs_variable += addition.cogs_variable;
    actual.marginal_profit = actual.revenue - actual.cogs_variable;
    actual.gross_profit = actual.marginal_profit - actual.cogs_fixed;
    actual.operating_profit = actual.gross_profit - actual.sga;
  }
  return {
    year_month: ym,
    mode,
    lines: toLines(actual, pl.budget),
    unconfirmed: notes.unconfirmed.map(({ project_id, project_name, amount }) => ({ project_id, project_name, amount })),
    unregistered: notes.unregistered.map(({ project_id, project_name, amount }) => ({ project_id, project_name, amount })),
    has_override: pl.has_override,
    override_note: pl.override_note,
  };
}

/** `GMO`（コストセンター）は数字があるときだけ出す（実績が 1 円でもある・目標が入っている） */
function hasAnyNumber(table: MonthlyPlTable): boolean {
  return table.lines.some((l) => l.actual !== 0 || l.budget != null)
    || table.unconfirmed.length > 0 || table.unregistered.length > 0;
}

/**
 * 計上会社ごとの表＋全体（統合）。`GMO` は数字があるときだけ。
 * `mode: 'forecast'` は着地に受注前案件の確度加味を上乗せする。
 */
export async function buildPlByEntity(ym: string, mode: MonthlyPlTable['mode']): Promise<PlByEntity> {
  const [pls, additions, notes] = await Promise.all([
    Promise.all(SCOPES.map((scope) => keepReportService.getMonthlyPl(ym, scope))),
    mode === 'forecast' ? weightedAdditions(ym) : Promise.resolve(null),
    listUnconfirmed(ym),
  ]);
  const tables = new Map<EntityScope, MonthlyPlTable>();
  SCOPES.forEach((scope, i) => {
    // 全体（統合）は案件ごとに1行（2社に分かれた見積の売上は足す）。会社の表はその会社の行だけ
    const pick = (rows: Unconfirmed[]) => (scope === 'all' ? mergeByProject(rows) : rows.filter((u) => u.entity_code === scope));
    const forScope: PlNotes = { unconfirmed: pick(notes.unconfirmed), unregistered: pick(notes.unregistered) };
    tables.set(scope, toTable(ym, mode, pls[i], additions ? additions[scope] : null, forScope));
  });
  const out: PlByEntity = { all: tables.get('all')!, GJV: tables.get('GJV')!, GSS: tables.get('GSS')! };
  const gmo = tables.get('GMO')!;
  if (hasAnyNumber(gmo)) out.GMO = gmo;
  return out;
}
