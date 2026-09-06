/**
 * 隔週キープ（業績報告）の設定と印 — 案件管理アプリが叩く口をここに集める
 *
 * ── 何のためにあるか ────────────────────────────────────────
 *
 * 隔週キープの数字（`client-daily` の「隔週キープの数字」タブ）は
 * **サーバーが1本の定例報告パックに集めて計算する**（`docs/design/v4/keep-report.md`）。
 * 案件管理アプリ側で人が決めるのは次の3つだけで、どれもここを通る:
 *
 *   1. **月次予算**（主体ごと・円）と **経理の補正値** … 設定「お金のルール」
 *   2. **稼働率の数え方**（数える予定の種別・土曜を営業日に含めるか） … 同上
 *   3. **隔週キープに載せる印**（`projects.keep_pick`） … 案件詳細のふりかえりタブ
 *
 * ── 鍵の決めごと ────────────────────────────────────────────
 *
 * 予算・設定の鍵はすべて `['keep', …]` で始める。パックを読む画面（別バンドル）とは
 * キャッシュを共有しないが、同じアプリの中で予算を直したあとに別の年を開いたとき
 * 古い値が出ないよう、書いたら `['keep', 'monthly-budgets']` を前方一致で落とす。
 * 印（`keep_pick`）は案件そのものの列なので `invalidateProjectQueries` を通す
 * （案件を書き換えたら鍵を並べずにあれを呼ぶ、が案件管理の決めごと）。
 *
 * ── 事業主体の自動の決まり ────────────────────────────────
 *
 * 正はサーバー（`server/src/contexts/sales/services/project-entity.ts`・migration 282）。
 * ここにある `autoEntity` は**画面が「自動ならこうなる」と案内するためだけ**の写しで、
 * 保存される値はサーバーが決める（`customer_type` と同じ扱い）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { invalidateProjectQueries } from '@/contexts/sales/projectQueries';
import type {
  BusinessEntity, MonthlyBudget, UtilizationSettings,
} from '@gmo-onair/shared/src/keepReport/types';

/** 主体の並び（画面の札・選択肢の順）。**型の値の一覧はここだけ**に持つ */
export const BUSINESS_ENTITIES: readonly BusinessEntity[] = ['gss', 'gscs', 'gig'];

export function isBusinessEntity(v: unknown): v is BusinessEntity {
  return typeof v === 'string' && (BUSINESS_ENTITIES as readonly string[]).includes(v);
}

/**
 * お客様の区分から自動で決まる主体（案内用）。
 * グループ内（`internal`）→ GMOサムライスタジオ、それ以外 → GMOサムライコンテンツスタジオ。
 * `gig` は自動では付かない（人が案件で上書きしたときだけ）。
 */
export function autoEntity(customerType: unknown): BusinessEntity {
  return customerType === 'internal' ? 'gss' : 'gscs';
}

/** 経理の補正値（`monthly_actual_overrides`）の1行。主体ごと */
export interface MonthlyOverride {
  year_month: string;
  entity: BusinessEntity;
  cogs_fixed_actual: number | null;
  sga_actual: number | null;
  note: string | null;
}

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

/** 期間（`YYYY-MM`〜`YYYY-MM`）の主体別の月次予算と経理の補正値 */
export function useMonthlyBudgets(from: string, to: string) {
  return useQuery<MonthlyBudgetsResponse>({
    queryKey: keepKeys.budgets(from, to),
    queryFn: async () => (await api.get('/keep/monthly-budgets', { params: { from, to } })).data.data,
  });
}

/** 月次予算の保存の中身（円）。**空欄は `null`（未登録）で送る** — 0 は「0 円と決めた」 */
export interface MonthlyBudgetInput {
  entity: BusinessEntity;
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

export interface MonthlyOverrideInput {
  entity: BusinessEntity;
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

/** 稼働率の数え方（`keep_settings.key = 'utilization'`） */
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
