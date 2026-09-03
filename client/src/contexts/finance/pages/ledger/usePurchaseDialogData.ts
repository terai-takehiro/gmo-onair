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

  return { glsProjects, vendors };
}
