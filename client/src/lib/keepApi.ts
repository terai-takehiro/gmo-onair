/**
 * 隔週キープ（業績報告）の設定と印 — 案件管理アプリが叩く口をここに集める
 *
 * ── 何のためにあるか ────────────────────────────────────────
 *
 * 隔週キープの数字（`client-daily` の「隔週キープの数字」タブ）は
 * **サーバーが1本の定例報告パックに集めて計算する**（`docs/design/v4/keep-report.md`）。
 * 案件管理アプリ側で人が決めるのは次の3つだけで、どれもここを通る:
 *
 *   1. **月次予算**（計上会社ごと・円）と **経理の補正値** … 設定「お金のルール」の会社タブ
 *   2. **稼働率の数え方**（数える予定の種別・土曜を営業日に含めるか） … 同上（全社共通）
 *   3. **隔週キープに載せる印**（`projects.keep_pick`） … 案件詳細のふりかえりタブ
 *
 * ── 会社（計上会社）は `entity_code` ────────────────────────
 *
 * 2026年10月の事業再編（`docs/reorg-2026-10-plan.md` §4.5・§6 P2 Round 1）で
 * `monthly_budgets` / `monthly_actual_overrides` は `(entity_code, year_month)` が主キーになった
 * （migration 288）。値は `legal_entities.code`（SCS / GSS / GMO）で、型は shared の
 * `BusinessEntity`（サーバーの `LegalEntityCode`・`reorg/types.ts` の同名の型と同じ3文字。
 * `shared/tests/keepReportEntity.test.ts` が揃っていることを固定している）。
 * **どの会社の分かは呼び出し側（お金のルールの会社タブ）が決めて必ず渡す。** ここでは既定を
 * 持たない — `entity_code` を省くとサーバーは今の会社（GSS）に倒すので、省いたまま保存すると
 * 別のタブで見ていた会社の予算が GSS に書かれる。
 *
 * ── 鍵の決めごと ────────────────────────────────────────────
 *
 * 予算・設定の鍵はすべて `['keep', …]` で始める。パックを読む画面（別バンドル）とは
 * キャッシュを共有しないが、同じアプリの中で予算を直したあとに別の年を開いたとき
 * 古い値が出ないよう、書いたら `['keep', 'monthly-budgets']` を前方一致で落とす
 * （会社タブを切り替えても取り直さない — 1回の `GET /keep/monthly-budgets` が全会社ぶんを返す）。
 * 印（`keep_pick`）は案件そのものの列なので `invalidateProjectQueries` を通す
 * （案件を書き換えたら鍵を並べずにあれを呼ぶ、が案件管理の決めごと）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { invalidateProjectQueries } from '@/contexts/sales/projectQueries';
import type {
  BusinessEntity, MonthlyBudget, UtilizationSettings,
} from '@gmo-onair/shared/src/keepReport/types';

/** 経理の補正値（`monthly_actual_overrides`）の1行。計上会社ごと */
export interface MonthlyOverride {
  year_month: string;
  entity_code: BusinessEntity;
  cogs_fixed_actual: number | null;
  sga_actual: number | null;
  note: string | null;
}

/** `GET /keep/monthly-budgets?from&to`。期間内の**全会社ぶん**（会社で絞るのは画面側） */
export interface MonthlyBudgetsResponse {
  budgets: MonthlyBudget[];
  overrides: MonthlyOverride[];
}

export const keepKeys = {
  all: ['keep'] as const,
  budgetsAll: ['keep', 'monthly-budgets'] as const,
  budgets: (from: string, to: string) => ['keep', 'monthly-budgets', from, to] as const,
  utilization: ['keep', 'utilization-settings'] as const,
};

/** 期間（`YYYY-MM`〜`YYYY-MM`）の計上会社別の月次予算と経理の補正値 */
export function useMonthlyBudgets(from: string, to: string) {
  return useQuery<MonthlyBudgetsResponse>({
    queryKey: keepKeys.budgets(from, to),
    queryFn: async () => (await api.get('/keep/monthly-budgets', { params: { from, to } })).data.data,
  });
}

/**
 * 月次予算の保存の中身（円・`PUT /keep/monthly-budget/:ym`）。
 * **空欄は `null`（未登録）で送る** — 0 は「0 円と決めた」。サーバーは `null` でそのマスを消し、
 * 送らなかった鍵は今の値を保つので、4つとも毎回そろえて送る
 */
export interface MonthlyBudgetInput {
  entity_code: BusinessEntity;
  revenue: number | null;
  cogs_fixed: number | null;
  cogs_variable: number | null;
  sga: number | null;
  operating_profit: number | null;
}

export function useSaveMonthlyBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ym, ...body }: MonthlyBudgetInput & { ym: string }) =>
      (await api.put(`/keep/monthly-budget/${ym}`, body)).data.data as { budget: MonthlyBudget },
    onSuccess: () => { qc.invalidateQueries({ queryKey: keepKeys.budgetsAll }); },
  });
}

/** 経理の補正値の保存の中身（`PUT /keep/monthly-override/:ym`） */
export interface MonthlyOverrideInput {
  entity_code: BusinessEntity;
  cogs_fixed_actual: number | null;
  sga_actual: number | null;
  note: string | null;
}

export function useSaveMonthlyOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ym, ...body }: MonthlyOverrideInput & { ym: string }) =>
      (await api.put(`/keep/monthly-override/${ym}`, body)).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: keepKeys.budgetsAll }); },
  });
}

/** 稼働率の数え方（`keep_settings.key = 'utilization'`・全社共通） */
export function useUtilizationSettings() {
  return useQuery<UtilizationSettings>({
    queryKey: keepKeys.utilization,
    queryFn: async () => (await api.get('/keep/utilization-settings')).data.data,
  });
}

export function useSaveUtilizationSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: UtilizationSettings) =>
      (await api.put('/keep/utilization-settings', body)).data.data as UtilizationSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: keepKeys.utilization }); },
  });
}

/**
 * 「隔週キープに載せる」の印（`PUT /projects/:id/keep-pick`）。
 * 案件の列なので、案件詳細（`['project', id]`）と一覧の鍵をまとめて落とす。
 */
export function useSetKeepPick(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keep_pick: boolean) =>
      (await api.put(`/projects/${projectId}/keep-pick`, { keep_pick })).data.data,
    onSuccess: () => {
      invalidateProjectQueries(qc, projectId);
      qc.invalidateQueries({ queryKey: keepKeys.all });
    },
  });
}
