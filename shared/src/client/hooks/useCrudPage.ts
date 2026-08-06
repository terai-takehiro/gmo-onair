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

    // 検索を変えたらページをリセット
    const setSearch = (v: string) => {
      setSearchState(v);
      setPage(1);
    };

    const list = useQuery<{ data: T[]; pagination?: PaginationInfo }>({
      queryKey: [...options.queryKey, 'list', { page, search, pageSize, extra: options.extraParams ?? {} }],
      queryFn: async () => {
        const params: Record<string, string | number> = { page, limit: pageSize };
        if (search) params[searchParam] = search;
        if (options.extraParams) {
          for (const [k, v] of Object.entries(options.extraParams)) {
            if (v != null && v !== '') params[k] = v;
          }
        }
        const res = await api.get(options.endpoint, { params });
        return res.data as { data: T[]; pagination?: PaginationInfo };
      },
    });

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
      onError: (err) => options.onError?.('save', err),
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
      onError: (err) => options.onError?.('delete', err),
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
