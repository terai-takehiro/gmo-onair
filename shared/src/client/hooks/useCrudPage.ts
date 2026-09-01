/**
 * shared/src/client/hooks/useCrudPage.ts — CRUD ページ共通ロジック (Phase 2A)
 *
 * 「検索 + ページネーション + 一覧取得 + Create/Update Dialog + Delete」という
 * パターンが 8+ ページで重複していたのを単一フックに集約する。
 *
 * 想定 API レスポンス (pagination response envelope):
 *   GET <endpoint>?page=1&limit=20&search=foo
 *     → { data: T[], pagination: { total, totalPages, page, limit } }
 *   POST <endpoint>            → { data: T }
 *   PUT  <endpoint>/<id>       → { data: T }
 *   DELETE <endpoint>/<id>     → 204 / { success: true }
 *
 * 使い方:
 *   // 各アプリで一度だけバインドする
 *   // client/src/hooks/useCrudPage.ts
 *   export const useCrudPage = createUseCrudPage(api);
 *
 *   // ページ側
 *   const crud = useCrudPage<Vendor>({
 *     endpoint: '/vendors',
 *     queryKey: ['vendors'],
 *   });
 *   <Input value={crud.search} onChange={e => crud.setSearch(e.target.value)} />
 *   <DataTable data={crud.items} ... />
 *   <Pagination page={crud.page} totalPages={crud.pagination?.totalPages ?? 1}
 *               total={crud.pagination?.total ?? 0} onChange={crud.setPage} />
 *   <Dialog open={crud.dialogOpen} onOpenChange={crud.setDialogOpen}>
 *     {crud.isEditing ? '編集' : '追加'}
 *     <Button onClick={() => crud.save.mutate(formValues)} />
 *   </Dialog>
 *   <Button onClick={crud.openAdd} />
 *   <Button onClick={() => crud.openEdit(item)} />
 *   <Button onClick={() => crud.remove.mutate(item.id)} />
 */
import { useState } from 'react';
import { useDebounced } from './useDebounced';
import { useQuery, useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';

export interface PaginationInfo {
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface UseCrudPageOptions<T> {
  /** REST resource path (without trailing slash). 例: '/vendors' */
  endpoint: string;
  /** React Query key prefix. 例: ['vendors'] */
  queryKey: readonly unknown[];
  /** 1ページあたり件数 (default: 20) */
  pageSize?: number;
  /** 検索クエリパラメータ名 (default: 'search') */
  searchParam?: string;
  /** 検索を問い合わせに反映するまでの待ち時間（ミリ秒・既定 300） */
  searchDebounceMs?: number;
  /** タブフィルタ用の追加パラメータ。値が変わると再フェッチ + page=1 にリセットされる */
  extraParams?: Record<string, string | number | undefined>;
  /** create/update 成功時のコールバック (closeDialog より前に呼ばれる) */
  onSaveSuccess?: (data: T) => void;
  /** delete 成功時のコールバック */
  onDeleteSuccess?: (id: string) => void;
  /** save / delete エラー時のコールバック */
  onError?: (action: 'save' | 'delete', error: unknown) => void;
}

export interface CrudPageResult<T extends { id: string }> {
  // ── 検索 / ページ状態 ───────────────────────────
  search: string;
  /**
   * 実際に問い合わせに使っている検索語（遅らせたもの）。
   * ⚠️ **「0件でした」の判定はこちらを使うこと**（`search` だと、まだ
   * 問い合わせていない言葉で「該当なし」が一瞬出る）。入力欄は `search` のまま。
   */
  appliedSearch: string;
  /** 打鍵が落ち着くのを待っている最中か */
  isSearchPending: boolean;
  /** 裏で読み直している最中か（前の一覧は出したまま） */
  isFetching: boolean;
  setSearch: (v: string) => void;
  page: number;
  setPage: (n: number) => void;
  pageSize: number;

  // ── ダイアログ / 編集対象 ───────────────────────
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  editingItem: T | null;
  isEditing: boolean;

  // ── データ ────────────────────────────────────
  items: T[];
  pagination: PaginationInfo | undefined;
  /**
   * 応答そのもの。`data` と `pagination` 以外を返すルート
   * (合計金額・絞り込みチップの件数など) を読むために出しています。
   * 項目ごとにフックへ足していくと、使うアプリだけ増えて型が肥ります。
   */
  raw: Record<string, unknown> | undefined;
  isLoading: boolean;
  isError: boolean;
  /** 失敗した理由。`ErrorPanel` にそのまま渡せる */
  error: unknown;
  refetch: () => void;

  // ── ミューテーション ────────────────────────────
  /** create/update — values は payload, 戻り値は保存後の T */
  save: UseMutationResult<T, unknown, unknown, unknown>;
  /** delete — id を渡す */
  remove: UseMutationResult<string, unknown, string, unknown>;

  // ── アクション ─────────────────────────────────
  openAdd: () => void;
  openEdit: (item: T) => void;
  closeDialog: () => void;
}

/**
 * `useCrudPage` フックを `api` インスタンスにバインドして生成するファクトリ。
 * 各アプリで一度バインドし、その結果をページから利用する。
 */
export function createUseCrudPage(api: AxiosInstance) {
  return function useCrudPage<T extends { id: string }>(
    options: UseCrudPageOptions<T>,
  ): CrudPageResult<T> {
    const qc = useQueryClient();
    const [search, setSearchState] = useState('');
    const [page, setPage] = useState(1);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<T | null>(null);

    const pageSize = options.pageSize ?? 20;
    const searchParam = options.searchParam ?? 'search';

    // 検索を変えたらページをリセット。**入力欄が読む `search` は即時のまま**
    // （ここを遅らせると打鍵が1テンポ遅れて見える）
    const setSearch = (v: string) => {
      setSearchState(v);
      setPage(1);
    };

    /*
     * ⚠️ **問い合わせの鍵に渡す値だけを遅らせる。**
     * 検索欄は1文字ごとに `setSearch` を呼び、サーバー側の一覧は1リクエストで
     * 4〜5本の SQL を走らせるので、**遅らせないと10文字打つだけで 40〜50 本**になる。
     */
    const appliedSearch = useDebounced(search.trim(), options.searchDebounceMs ?? 300);

    const list = useQuery<{ data: T[]; pagination?: PaginationInfo }>({
      queryKey: [...options.queryKey, 'list', { page, search: appliedSearch, pageSize, extra: options.extraParams ?? {} }],
      /*
       * ⚠️ **`signal` を必ず axios に渡す。** 渡さないと、鍵が変わっても前の通信が
       * 走り続け、**押した回数ぶんサーバーの接続を掴む**。
       * ⚠️ **`AbortController` を自分で作らないこと** — react-query が渡してくる
       * これだけを使う（自前で作ると中断が「失敗」として扱われる。`isCanceled` 参照）。
       */
      queryFn: async ({ signal }) => {
        const params: Record<string, string | number> = { page, limit: pageSize };
        if (appliedSearch) params[searchParam] = appliedSearch;
        if (options.extraParams) {
          for (const [k, v] of Object.entries(options.extraParams)) {
            if (v != null && v !== '') params[k] = v;
          }
        }
        const res = await api.get(options.endpoint, { params, signal });
        return res.data as { data: T[]; pagination?: PaginationInfo };
      },
      /*
       * ⚠️ **前の一覧を消さない。** 鍵が変わると別の入れ物になるので、これが無いと
       * `isLoading` が立って**打鍵のたびに一覧が骨組みへ戻ってちらつく**
       * （`states/Skeleton.tsx` の決めごと「前の内容を消さない」）。
       */
      placeholderData: (prev) => prev,
    });

    // **`onError` はここで作るのではなく、渡されたときだけ付ける。**
    // `useMutation({ onError: () => {...} })` を**キーごと**省略しないと、
    // `queryClient.ts` の共通の受け皿（`MutationCache`）が
    // `mutation.options.onError` の**有無だけ**を見て「画面が自分で
    // 知らせている」と判断してしまう。呼び出し元が `options.onError` を
    // 渡していなくても、このフックが常に転送用の関数を渡していたせいで
    // **判定が常に「画面が知らせている」側になり、渡していないページでは
    // 保存・削除の失敗が画面のどこにも出ていなかった**（実際に踏んだ・
    // `CompanyListPage`/`PurchaseListPage`/`SgaListPage`/`CounterpartyPage`
    // の4画面が該当。個別に `onError` を渡している画面は今までどおり）。
    const save = useMutation<T, unknown, unknown, unknown>({
      mutationFn: async (values) => {
        if (editingItem) {
          const res = await api.put(`${options.endpoint}/${editingItem.id}`, values);
          return res.data?.data as T;
        }
        const res = await api.post(options.endpoint, values);
        return res.data?.data as T;
      },
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: options.queryKey });
        options.onSaveSuccess?.(data);
        closeDialog();
      },
      ...(options.onError ? { onError: (err: unknown) => options.onError!('save', err) } : {}),
    });

    const remove = useMutation<string, unknown, string, unknown>({
      mutationFn: async (id) => {
        await api.delete(`${options.endpoint}/${id}`);
        return id;
      },
      onSuccess: (id) => {
        qc.invalidateQueries({ queryKey: options.queryKey });
        options.onDeleteSuccess?.(id);
      },
      ...(options.onError ? { onError: (err: unknown) => options.onError!('delete', err) } : {}),
    });

    const openAdd = () => {
      setEditingItem(null);
      setDialogOpen(true);
    };

    const openEdit = (item: T) => {
      setEditingItem(item);
      setDialogOpen(true);
    };

    const closeDialog = () => {
      setDialogOpen(false);
      setEditingItem(null);
    };

    return {
      search,
      /**
       * 実際に問い合わせに使っている検索語（遅らせたもの）。
       * ⚠️ **「0件でした」の判定はこちらで行うこと。** `search`（即時）で判定すると、
       * **まだ問い合わせていない言葉で「該当なし」**が一瞬出る。
       */
      appliedSearch,
      /** 打鍵が落ち着くのを待っている最中か（ページ送りを止めるのに使う） */
      isSearchPending: search.trim() !== appliedSearch,
      /** 裏で読み直している最中か（前の一覧は出したまま） */
      isFetching: list.isFetching,
      setSearch,
      page,
      setPage,
      pageSize,

      dialogOpen,
      setDialogOpen,
      editingItem,
      isEditing: editingItem !== null,

      items: (list.data?.data ?? []) as T[],
      pagination: list.data?.pagination,
      /**
       * 応答そのもの。`data` と `pagination` 以外を返すルート
       * (合計金額・絞り込みチップの件数など) を読むために出しています。
       * **項目ごとにフックへ足していくと、使うアプリだけ増えて型が肥る**ので、
       * 一覧の付随情報はここから取ってください。
       */
      raw: list.data as Record<string, unknown> | undefined,
      isLoading: list.isLoading,
      isError: list.isError,
      /** 失敗した理由。`ErrorPanel` にそのまま渡せる */
      error: list.error,
      refetch: list.refetch,

      save,
      remove,

      openAdd,
      openEdit,
      closeDialog,
    };
  };
}
