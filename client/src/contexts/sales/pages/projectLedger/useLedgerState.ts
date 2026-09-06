/**
 * 案件台帳の状態（引く・絞る・選ぶ・まとめて直す）
 *
 * **画面の部品は状態を持ちません。** ここが1つ持ちます — 表・ツールバー・
 * ダイアログが別々に持つと、絞り込みを変えたのに選択が残る（＝見えていない行を
 * 書き換える）事故が起きます。
 *
 * ── 引くのは案件一覧と同じ口 ────────────────────────────────
 *
 * `GET /projects` をそのまま使います。**別の口を作らないこと** — 一覧とこの画面で
 * 違う数が出ると、どちらが正しいのか誰にも分かりません（v4 でボードを
 * 「見え方」にしたのと同じ理由）。
 *
 * ⚠️ **1ページ 100 件はサーバーの上限**です（`extractPagination` が
 * `Math.min(100, …)`）。100 を超える指定は黙って 100 に落とされるので、
 * **件数とページ送りを必ず画面に出します**（出さないと「これで全部だ」と読まれる）。
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { invalidateProjectQueries } from '../../projectQueries';
import type { LedgerResponse, LedgerRow } from './types';
import type { IntegrityCheck } from './IntegrityPanel';
import { DEFAULT_SORT, nextSort, type SortState } from './display';
import { EMPTY_FILTERS, nextFiltersForIssue, nextFiltersForCategorySelect, type LedgerFilters } from './filters';

interface IntegrityResponse { total: number; checks: IntegrityCheck[] }

/** サーバーが返す上限。**ここで 200 と書いても 100 しか返りません** */
export const PAGE_SIZE = 100;

/**
 * 絞り込みの型と決め方は `filters.ts`（**画面の物を import しない純粋な module**）。
 * ここは状態として持つだけです。
 */
export { type LedgerFilters, EMPTY_FILTERS, nextFiltersForIssue } from './filters';

export function useLedgerState() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<LedgerFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /** 絞り込みを変えたら**選択を捨てる**（見えていない行を書き換えない） */
  const setFilter = useCallback(<K extends keyof LedgerFilters>(k: K, v: LedgerFilters[K]) => {
    setFilters((f) => ({ ...f, [k]: v }));
    setPage(1);
    setSelected(new Set());
  }, []);

  /** 整合性チェックを選ぶ。決め方は `nextFiltersForIssue`（上）にある */
  const pickIssue = useCallback((key: string) => {
    setFilters((f) => nextFiltersForIssue(f, key));
    setPage(1);
    setSelected(new Set());
  }, []);

  /** 分類プルダウン（GLS-A / GLS-B / 旧GLS / どちらも）を選ぶ。決め方は `nextFiltersForCategorySelect` */
  const pickCategory = useCallback((value: 'A' | 'B' | 'kessan' | 'all') => {
    setFilters((f) => nextFiltersForCategorySelect(f, value));
    setPage(1);
    setSelected(new Set());
  }, []);

  const goPage = useCallback((p: number) => {
    setPage(p);
    setSelected(new Set());
  }, []);

  /**
   * 並べ替え。⚠️ **サーバーに渡します**（画面で並べ替えません）—
   * 出ているのは 100 件だけなので、画面で並べ替えると**そのページの中だけ**が
   * 並び替わり、「いちばん古いもの」を探しているのに 2 ページ目の行が出ません。
   * 空のときは渡さない＝サーバーの既定（おすすめ順）。
   */
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const onSort = useCallback((key: string) => {
    setSort((cur) => nextSort(cur, key));
    setPage(1);
    // 並びが変われば「見えている行」が変わる。**選択は捨てる**
    // （見ていない行をまとめて書き換えないための決めごと）
    setSelected(new Set());
  }, []);

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    search: filters.search || undefined,
    stage: filters.stage || undefined,
    gls_category: filters.glsCategory || undefined,
    source: filters.source || undefined,
    issue: filters.issue || undefined,
    sort_by: sort.by || undefined,
    sort_dir: sort.by ? sort.dir : undefined,
  }), [page, filters, sort]);

  const query = useQuery<LedgerResponse>({
    queryKey: ['project-ledger', params],
    queryFn: async () => (await api.get('/projects', { params })).data,
  });

  /**
   * ⚠️ **`?? []` をそのまま置かないこと。** 読み込み中は毎回**別の空配列**になり、
   * `toggleAll`（`rows` を見る）が描き直しのたびに作り直されます。
   * 表は行ごとにこの関数を渡すので、**全行が毎回描き直され**ます。
   */
  const rows: LedgerRow[] = useMemo(() => query.data?.data ?? [], [query.data]);

  /**
   * 整合性チェックの件数。**絞り込みとは別に、いつも全体を数えます** —
   * 絞ったあとに数えると「絞った結果の中の食い違い」になり、
   * **直すべき総数が画面から消えます**。
   */
  const integrity = useQuery<IntegrityResponse>({
    queryKey: ['project-integrity'],
    queryFn: async () => (await api.get('/projects/integrity')).data.data,
    staleTime: 30_000,
  });

  const pagination = query.data?.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 1;

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => (
      rows.length > 0 && rows.every((r) => prev.has(r.id))
        ? new Set<string>()
        : new Set(rows.map((r) => r.id))
    ));
  }, [rows]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const bulk = useMutation({
    mutationFn: async (set: Record<string, unknown>) =>
      (await api.patch('/projects/bulk', { ids: [...selected], set })).data,
    onSuccess: (_res, set) => {
      /**
       * **鍵を並べず `invalidateProjectQueries`（`../../projectQueries`）を呼ぶ。**
       * 以前はここで `project-ledger`・`project-integrity`・`projects`・
       * `dashboard,sales-overview`・`project,id` の5つだけを手書きしていた。
       * この一括編集で `audience`/`project_category`/`recurrence`（案件分類・
       * 継続区分）も直接書き換えられるが、`episodes`（回タブ）・`project-single`・
       * `project-summary`・`won-projects-for-*`・`dashboard` の `alerts` 枝
       * （前方一致は `sales-overview` にしか当たらない）などを落としていなかった
       * — `useCreateProject.ts` と同じ「鍵を並べていたころの足し忘れ」
       * （`projectQueries.ts` 冒頭の注記）そのもの。1件ずつの詳細鍵は
       * 選んだ案件ごとに呼ぶ。
       */
      for (const id of selected) invalidateProjectQueries(qc, id);
      if (selected.size === 0) invalidateProjectQueries(qc);
      const n = selected.size;
      clearSelection();
      notifySuccess(`${n} 件を更新しました`, {
        description: '案件分類' in set || 'audience' in set
          ? '旧「案件種類」もサーバーが追随させています。'
          : undefined,
      });
    },
    onError: (e) => notifyApiError('まとめて編集できませんでした', e),
  });

  /**
   * 1件削除（`DELETE /projects/:id`。「直す」画面の削除ボタンと同じ口・
   * 同じ `sales: manager` の絞り）。確認は `handleDeleteRow` が挟む —
   * `LedgerTable` はボタンを描くだけで、確認と送信はここに集める
   * （表の部品にダイアログを持たせると、ほかの一覧に使い回すときに
   * 確認の文面までコピーすることになる）。
   */
  const deleteOne = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/projects/${id}`)).data,
    onSuccess: (_res, id) => {
      // **落とす鍵は `bulk` と同じ**（`invalidateProjectQueries` を呼ぶ。上の注記参照）
      invalidateProjectQueries(qc, id);
      // 選んでいた行を消したら、選択からも外す（居ない行が選ばれたままにしない）
      setSelected((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      notifySuccess('案件を削除しました');
    },
    onError: (e) => notifyApiError('案件を削除できませんでした', e),
  });

  /** 「直す」画面の削除確認と同じ文面（`useProjectActions.ts` の `handleDeleteProject`） */
  const handleDeleteRow = useCallback(async (row: { id: string; name: string }) => {
    const ok = await confirmAction({
      title: `「${row.name}」を削除しますか？`,
      description: 'この操作は取り消せません。案件一覧・案件台帳・この案件の詳細URLから見えなくなります。'
        + 'ひもづく見積・タスク・売上・仕入の記録そのものは消えず、財務の台帳などでは今までどおり参照できます。',
      confirmLabel: '削除',
      tone: 'danger',
    });
    if (ok) deleteOne.mutate(row.id);
  }, [deleteOne]);

  return {
    filters, setFilter, pickIssue, pickCategory,
    /**
     * 引くときに渡しているもの。**書き出しが同じものを使う**ため外に出している —
     * 書き出し側で組み直すと、絞り込みを1つ足したときに
     * **表と書き出しで違う案件が出る**（しかも数が近いので気づけない）。
     */
    params,
    sort, onSort,
    rows, total, totalPages, page, goPage,
    integrity: integrity.data ?? { total: 0, checks: [] },
    integrityLoading: integrity.isLoading,
    isLoading: query.isLoading, isError: query.isError,
    selected, toggle, toggleAll, clearSelection,
    bulk, deleteOne, handleDeleteRow,
  };
}

export type LedgerState = ReturnType<typeof useLedgerState>;
