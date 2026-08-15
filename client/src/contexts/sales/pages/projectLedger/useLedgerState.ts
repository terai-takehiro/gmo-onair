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
import type { LedgerResponse, LedgerRow } from './types';

/** サーバーが返す上限。**ここで 200 と書いても 100 しか返りません** */
export const PAGE_SIZE = 100;

export interface LedgerFilters {
  search: string;
  stage: string;
  glsCategory: string;
  /** 分類が空の案件だけ（この画面の主目的の1つ。画面側で絞る） */
  onlyNoClass: boolean;
}

const EMPTY_FILTERS: LedgerFilters = {
  search: '', stage: '', glsCategory: 'A', onlyNoClass: false,
};

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

  const goPage = useCallback((p: number) => {
    setPage(p);
    setSelected(new Set());
  }, []);

  const params = useMemo(() => ({
    page,
    limit: PAGE_SIZE,
    search: filters.search || undefined,
    stage: filters.stage || undefined,
    gls_category: filters.glsCategory || undefined,
    sort_by: 'created_at',
    sort_dir: 'desc',
  }), [page, filters]);

  const query = useQuery<LedgerResponse>({
    queryKey: ['project-ledger', params],
    queryFn: async () => (await api.get('/projects', { params })).data,
  });

  const allRows: LedgerRow[] = query.data?.data ?? [];
  /**
   * **「分類が入っていない案件だけ」は画面側で絞ります。** サーバーに絞りを足すと
   * `GET /projects` を読んでいる他の画面（一覧・ダッシュボード・MCP・Excel）にも
   * 効く新しい引数が増えるので、**この画面だけの都合を口に足さない**。
   * そのぶん**件数はこのページの中だけ**になるので、画面にそう書きます。
   */
  const rows = filters.onlyNoClass
    ? allRows.filter((r) => !r.audience || !r.project_category)
    : allRows;

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
       * **落とす鍵を書き漏らさない。** 台帳・一覧・ダッシュボードは同じ案件を
       * 別の鍵で持っています。1つ落とし忘れると、その見え方だけ古いまま
       * ＝「直したのに変わらない」になります（v4.0.25 で踏んだのと同じ形）。
       * 1件ずつの `['project', id]` も落とします — 開いている別のタブが
       * 古い姿を出したままになるため。
       */
      qc.invalidateQueries({ queryKey: ['project-ledger'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
      for (const id of selected) qc.invalidateQueries({ queryKey: ['project', id] });
      const n = selected.size;
      clearSelection();
      notifySuccess(`${n} 件を直しました`, {
        description: '案件分類' in set || 'audience' in set
          ? '旧「案件種類」もサーバーが追随させています。'
          : undefined,
      });
    },
    onError: (e) => notifyApiError('まとめて直せませんでした', e),
  });

  return {
    filters, setFilter,
    rows, allRows, total, totalPages, page, goPage,
    isLoading: query.isLoading, isError: query.isError,
    selected, toggle, toggleAll, clearSelection,
    bulk,
  };
}

export type LedgerState = ReturnType<typeof useLedgerState>;
