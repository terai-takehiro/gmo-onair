/**
 * 仕入ダイアログに渡すデータ（受注確定済みの案件候補・仕入先）と、
 * `?edit={id}` で来たときに編集ダイアログを直接開く効果をまとめる。
 * `PurchaseListPage.tsx` を 400 行以内に収めるための切り出し（`SgaListPage.tsx` にも
 * 同じ形があるが、今回はこちらだけを切り出した — 共通化は別途）。
 */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { Vendor } from '@/types';
import type { PurchaseRow } from './types';
import type { PurchaseProjectOption } from './PurchaseDialog';

/**
 * 担当者の候補一覧を**全ページぶん**取る。`GET /users` は共通の `extractPagination`
 * が `limit` を無条件に100件へ切るため、`?limit=200` を渡しても最初の100人しか
 * 返らず、五十音で101人目以降のユーザーが担当者に選べなかった（レビュー指摘）。
 * 1ページ目で総ページ数を見て、残りを並行して取りに行く。
 * `RevenueBillingPane.tsx`（案件詳細からの仕入追加）も同じ形を使う。
 */
export async function fetchAllUsers(): Promise<{ id: string; name: string }[]> {
  const first = (await api.get('/users?limit=100')).data;
  const totalPages: number = first?.pagination?.totalPages ?? 1;
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => api.get(`/users?limit=100&page=${i + 2}`)),
  );
  return [...(first?.data ?? []), ...rest.flatMap((r) => r.data?.data ?? [])];
}

export function usePurchaseDialogData(params: {
  dialogOpen: boolean;
  editParam: string | null;
  canEdit: boolean;
  openEdit: (row: PurchaseRow) => void;
}) {
  const { dialogOpen, editParam, canEdit, openEdit } = params;

  // 失注(e_lost)以外の案件から選べる（2026-09 依頼）。「フェーズに関係なく
  // 売上・仕入は各案件に対して登録が出来るようにする」——ネタ・仮押さえの
  // 段階でも仕入を記録できてよい。失注だけは除く（ユーザー判断）
  const { data: wonProjectsData } = useQuery({
    queryKey: ['registerable-projects-for-purchase'],
    queryFn: async () => (await api.get('/projects/registerable-projects')).data,
    enabled: dialogOpen,
  });
  const glsProjects: PurchaseProjectOption[] = wonProjectsData?.data ?? [];

  const { data: vendorsData } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => (await api.get('/vendors?limit=200')).data,
    enabled: dialogOpen,
  });
  const vendors: Vendor[] = vendorsData?.data ?? [];

  // 担当者の候補一覧
  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: fetchAllUsers,
    enabled: dialogOpen,
  });

  // 財務ダッシュボード等から ?edit={id} で来たら、その仕入の編集ダイアログを直接開く
  // （`SgaListPage.tsx` と同じ形。一覧のページには乗っていない行でも開けるよう、
  // 一覧とは別に単体で取得する）
  useQuery({
    queryKey: ['purchase-open-edit', editParam],
    queryFn: async () => {
      const row = (await api.get(`/purchases/${editParam}`)).data?.data as PurchaseRow | undefined;
      if (row && canEdit) openEdit(row);
      return row ?? null;
    },
    enabled: !!editParam,
    staleTime: Infinity,
  });

  return { glsProjects, vendors, users };
}
