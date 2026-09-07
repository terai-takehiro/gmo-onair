/**
 * ① 財務ダッシュボードのデータ取得（`BudgetDashboardPage` から分離）
 *
 * 画面（並べ方）と取得（どこから何本引くか）を分けてある。**この画面は1回の
 * 絞り込みで6本の API を同時に叩く**ので、取得の決めごと（中断・件数・
 * 案件で絞ったら取りに行かないもの）が1か所に集まっていないと数えられない。
 *
 * ⚠️ **すべてのクエリで `signal` を axios に渡すこと。** 渡さないと、絞り込みを
 * 変えるたびに前の重いクエリがサーバーで走り続け、押した回数ぶん DB の接続を
 * 掴む。ユーザー報告「絞り込みを行っていると『サーバー側で処理が止まりました』が
 * 頻繁に出る」の一因だった。
 *
 * ⚠️ **期間が決まっていないときは1本も叩かない**（`period.valid`）。
 * `!!period.from` で判定すると、`'-01'` のような壊れた日付を truthy と見て
 * 通してしまう（それが 400 の元だった）。
 *
 * ── 会社（`entityCode`）の絞り込み（2026年10月の事業再編 P2 Round 1）─────
 *
 * `/monthly-summary`・内訳4本（`/revenues`/`/purchases`（変動・固定原価の2回）/`/sga`）
 * とも、サーバー側の絞り込みビルダー（`list-query.ts`）が対応済み（省略時は
 * 全社合算のまま）。合計と内訳の行が同じ会社で揃う。
 *
 * ── 「総額」/「確度加味」（`forecastMode`）は `/monthly-summary` だけに渡す ─────
 *
 * サーバー（`monthly-summary.service.ts`）が合計を確度加味で計算し直す。
 * 内訳4本には渡さない — 行ごとの重みづけは `p.stage`（このクエリが返す行に
 * 既に乗っている）を使って `breakdownItems.ts` が表示直前に掛けるだけなので、
 * 取得するデータ自体は `forecastMode` によって変わらない。
 */
import { useMemo } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { ProjectOption } from './PeriodBar';
import type { ForecastMode } from './ForecastModeToggle';
import { summaryPeriodParams, ledgerPeriodParams as ledgerPeriodParamsOf, type Period } from './period';
import type { PurchaseRow } from '../ledger/types';

export interface MonthlySummary {
  month: string;
  revenue_total: number;
  purchase_total: number;
  fixed_cost_total: number;
  variable_cost_total: number;
  marginal_profit: number;
  gross_profit: number;
  sga_total: number;
  operating_profit: number;
}

export const EMPTY_SUMMARY: MonthlySummary = {
  month: '', revenue_total: 0, purchase_total: 0, fixed_cost_total: 0,
  variable_cost_total: 0, marginal_profit: 0, gross_profit: 0, sga_total: 0, operating_profit: 0,
};

export interface PagedResponse<T> {
  data: T[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

/** サーバー共通の上限（`shared/services/pagination.ts` の `Math.min(100, …)`）に合わせたページサイズ */
const PAGE_SIZE = 100;

export function useDashboardData(period: Period, projectId: string, entityCode: string, forecastMode: ForecastMode) {
  const periodParams = useMemo(() => summaryPeriodParams(period), [period]);
  const ledgerPeriodParams = useMemo(() => ledgerPeriodParamsOf(period), [period]);
  /** 期間が決まっているか。**壊れた日付で読みに行かないための唯一のゲート** */
  const periodReady = period.valid;

  /*
   * ⚠️ **`/projects?limit=500` は実は 100 件しか返らない**（ご指摘の再現例
   * GLS-A004「GMOアワード2026」で発覚）。`limit` は共通の `extractPagination`
   * （`shared/services/pagination.ts`）が `Math.min(100, …)` で無条件に切るため、
   * `?limit=500` と書いても静かに 100 件へ落ちる。しかも既定の並び順
   * (`DEFAULT_SORT_SQL`) は「完了/失注は最後」なので、GMOアワード2026 のように
   * **開催済み（`s_completed`）の案件から真っ先に 100 件の外へ押し出される**。
   *
   * `client/CLAUDE.md`「受注確定した案件の絞り込みは stage が正」の節のとおり、
   * 受注確定済みの一覧は `project.service.ts` の `getWonProjects()`
   * （`stage IN ('a_won','r_delivered','s_completed')`・**上限なし**）を使うのが正しい形で、
   * 現に同関数のコメントは「予算詳細」もこの一覧の利用先として挙げている
   * （仕入・売上・精算PDF取込レビュー・書類引き渡しの案件プルダウンと同じ）。
   * ここが `/projects?limit=500` のままだったのが今回のズレの本体。
   */
  const { data: projectsData } = useQuery({
    queryKey: ['won-projects-for-budget-dashboard'],
    queryFn: async () => (await api.get('/projects/won-projects')).data,
    staleTime: 120_000,
  });
  /*
   * **`won-projects` だけでも足りない。** 受注確定（`a_won`/`r_delivered`/`s_completed`）より
   * 前のステージ・削除済みでも、按分や過去の入力で `revenues`/`purchases` に
   * 実績が残っていることがある。そちらを取りこぼさないよう、上限を持たない
   * `/projects-with-activity`（内訳＝`revenues`/`purchases` の LEFT JOIN と同じ集合）
   * を合わせて出す
   */
  const { data: activeProjectsData } = useQuery({
    queryKey: ['projects-with-activity', period.from, period.to, period.all],
    // ⚠️ **`signal` を必ず axios に渡す。** 渡さないと、絞り込みを変えるたびに前の重い
    // クエリがサーバーで走り続ける（押した回数ぶん DB の接続を掴む＝504 の元）
    queryFn: async ({ signal }) => (await api.get('/projects-with-activity', {
      params: period.all || !period.from ? {} : { from: period.from, to: period.to },
      signal,
    })).data,
    enabled: periodReady,
    staleTime: 60_000,
  });
  const projects: ProjectOption[] = useMemo(() => {
    const base: ProjectOption[] = projectsData?.data ?? [];
    const extra: ProjectOption[] = activeProjectsData?.data ?? [];
    const seen = new Set(base.map((p) => p.id));
    return [...base, ...extra.filter((p) => !seen.has(p.id))];
  }, [projectsData, activeProjectsData]);

  const summaryQuery = useQuery({
    queryKey: ['budget-monthly-summary', period.from, period.to, period.all, projectId, entityCode, forecastMode],
    queryFn: async ({ signal }) => {
      const params: Record<string, string> = { ...periodParams, mode: forecastMode };
      if (projectId) params.project_id = projectId;
      if (entityCode) params.entity_code = entityCode;
      return (await api.get('/monthly-summary', { params, timeout: 20_000, signal })).data;
    },
    enabled: periodReady,
    retry: 1,
  });

  const revenues = useInfiniteQuery({
    queryKey: ['budget-breakdown-revenues', period.from, period.to, period.all, projectId, entityCode],
    queryFn: async ({ pageParam, signal }) => {
      // 合計 (monthly-summary) は確定売上だけを数えているので内訳も confirmed に揃える
      const params: Record<string, string | number> = {
        ...ledgerPeriodParams, limit: PAGE_SIZE, page: pageParam, status: 'confirmed',
      };
      if (projectId) params.project_id = projectId;
      if (entityCode) params.entity_code = entityCode;
      return (await api.get('/revenues', { params, signal })).data as PagedResponse<any>; // 行の形は revItems 側で個別に絞る
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: periodReady,
    // ⚠️ **内訳は補助情報なので、早く失敗を見せる。** 既定（5xx で2回リトライ）だと
    // 504 のとき**エラーが出るまで最悪3回ぶん待たされ**、その間ずっと「0件」に見える
    retry: 1,
  });

  // 仕入(変動原価): 固定原価Pjを除く。固定原価は gls_number=NULL で既定ソートの末尾に来るため、
  // 同じクエリだと limit 内に入らず消える（旧実装のコメントのまま）
  const purchases = useInfiniteQuery({
    queryKey: ['budget-breakdown-purchases', period.from, period.to, period.all, projectId, entityCode],
    queryFn: async ({ pageParam, signal }) => {
      const params: Record<string, string | number> = {
        ...ledgerPeriodParams, limit: PAGE_SIZE, page: pageParam, fixed_cost: '0',
      };
      if (projectId) params.project_id = projectId;
      if (entityCode) params.entity_code = entityCode;
      return (await api.get('/purchases', { params, signal })).data as PagedResponse<PurchaseRow>;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: periodReady,
    // ⚠️ **内訳は補助情報なので、早く失敗を見せる。** 既定（5xx で2回リトライ）だと
    // 504 のとき**エラーが出るまで最悪3回ぶん待たされ**、その間ずっと「0件」に見える
    retry: 1,
  });

  // 固定原価は案件に紐づかない。案件で絞り込み中は「限界利益まで」しか出さないので取りに行かない。
  // 償却負担額など全社共通の少数の行しか無い想定のため、こちらは単発取得のまま（「もっと見る」を持たない）
  const fixed = useQuery({
    queryKey: ['budget-breakdown-fixed', period.from, period.to, period.all, entityCode],
    queryFn: async ({ signal }) => (await api.get('/purchases', {
      params: { ...ledgerPeriodParams, limit: PAGE_SIZE, fixed_cost: '1', ...(entityCode ? { entity_code: entityCode } : {}) },
      signal,
    })).data as PagedResponse<PurchaseRow>,
    enabled: periodReady && !projectId,
    // ⚠️ **内訳は補助情報なので、早く失敗を見せる。** 既定（5xx で2回リトライ）だと
    // 504 のとき**エラーが出るまで最悪3回ぶん待たされ**、その間ずっと「0件」に見える
    retry: 1,
  });

  // 販管費は案件に紐づかないので、案件で絞っているときは取りに行かない
  const sga = useInfiniteQuery({
    queryKey: ['budget-breakdown-sga', period.from, period.to, period.all, entityCode],
    queryFn: async ({ pageParam, signal }) => (await api.get('/sga', {
      params: { ...ledgerPeriodParams, limit: PAGE_SIZE, page: pageParam, ...(entityCode ? { entity_code: entityCode } : {}) },
      signal,
    })).data as PagedResponse<any>,
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
    enabled: periodReady && !projectId,
    // ⚠️ **内訳は補助情報なので、早く失敗を見せる。** 既定（5xx で2回リトライ）だと
    // 504 のとき**エラーが出るまで最悪3回ぶん待たされ**、その間ずっと「0件」に見える
    retry: 1,
  });

  return { projects, summaryQuery, revenues, purchases, fixed, sga, periodReady };
}
