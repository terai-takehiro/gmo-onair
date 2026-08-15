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
import type { IntegrityCheck } from './IntegrityPanel';

interface IntegrityResponse { total: number; checks: IntegrityCheck[] }

/** サーバーが返す上限。**ここで 200 と書いても 100 しか返りません** */
export const PAGE_SIZE = 100;

export interface LedgerFilters {
  search: string;
  stage: string;
  glsCategory: string;
  /**
   * 整合性チェックの鍵（`GET /projects/integrity` の `key`）。
   *
   * ⚠️ **サーバーで絞ります。** 以前この画面は「分類が入っていないものだけ」を
   * **画面側**で絞っていましたが、それでは**そのページの 100 件の中だけ**しか
   * 見られず、**全体で何件おかしいのかが分かりません** — 整合性を確かめるのが
   * この画面の目的の1つなので、数えるのも絞るのもサーバーの同じ式にしました
   * （`server/.../project-integrity.ts`）。
   */
  issue: string;
}

const EMPTY_FILTERS: LedgerFilters = {
  search: '', stage: '', glsCategory: 'A', issue: '',
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
    issue: filters.issue || undefined,
    sort_by: 'created_at',
    sort_dir: 'desc',
  }), [page, filters]);

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
       * **落とす鍵を書き漏らさない。** 台帳・一覧・ダッシュボードは同じ案件を
       * 別の鍵で持っています。1つ落とし忘れると、その見え方だけ古いまま
       * ＝「直したのに変わらない」になります（v4.0.25 で踏んだのと同じ形）。
       * 1件ずつの `['project', id]` も落とします — 開いている別のタブが
       * 古い姿を出したままになるため。
       */
      qc.invalidateQueries({ queryKey: ['project-ledger'] });
      // **整合性の件数も落とす。** 落とさないと、直したのに「12 件」のままで、
      // 押すと 9 行しか出ない（数字と中身が食い違って見える）
      qc.invalidateQueries({ queryKey: ['project-integrity'] });
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
    /**
     * 引くときに渡しているもの。**書き出しが同じものを使う**ため外に出している —
     * 書き出し側で組み直すと、絞り込みを1つ足したときに
     * **表と書き出しで違う案件が出る**（しかも数が近いので気づけない）。
     */
    params,
    rows, total, totalPages, page, goPage,
    integrity: integrity.data ?? { total: 0, checks: [] },
    integrityLoading: integrity.isLoading,
    isLoading: query.isLoading, isError: query.isError,
    selected, toggle, toggleAll, clearSelection,
    bulk,
  };
}

export type LedgerState = ReturnType<typeof useLedgerState>;
