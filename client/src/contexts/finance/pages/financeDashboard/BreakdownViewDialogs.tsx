/**
 * 内訳（仕入・販管費）の行を押したときに開く、閲覧専用の詳細モーダル (① 財務ダッシュボード)
 *
 * `BudgetDashboardPage.tsx` から切り出した（1ファイル400行の上限）。
 * この画面のまま開くだけで台帳へは遷移しない（仕入・販管費は「押す＝この画面のまま
 * 詳細モーダル」— `BudgetDashboardPage.tsx` 冒頭コメント「9/4 仕様変更」参照）。
 */
import type { Dispatch, SetStateAction } from 'react';
import type { SgaExpense } from '@/types';
import { PurchaseDialog } from '../ledger/PurchaseDialog';
import SgaDialog, { type SgaFormData } from '../../components/SgaDialog';
import type { PurchaseRow } from '../ledger/types';

export function BreakdownViewDialogs({
  viewingPurchase, onClosePurchase,
  viewingSga, viewingSgaForm, setViewingSgaForm, onCloseSga,
}: {
  viewingPurchase: PurchaseRow | null;
  onClosePurchase: () => void;
  viewingSga: SgaExpense | null;
  viewingSgaForm: SgaFormData;
  setViewingSgaForm: Dispatch<SetStateAction<SgaFormData>>;
  onCloseSga: () => void;
}) {
  return (
    <>
      {/* 仕入の内訳を押したときの閲覧専用の詳細。この画面のまま開き、台帳へは遷移しない */}
      {viewingPurchase && (
        <PurchaseDialog
          readOnly
          editing={viewingPurchase}
          defaultProjectId={viewingPurchase.project_id ?? ''}
          onClose={onClosePurchase}
        />
      )}

      {/* 販管費の内訳を押したときの閲覧専用の詳細。同上 */}
      {viewingSga && (
        <SgaDialog
          readOnly
          open
          onOpenChange={(v) => { if (!v) onCloseSga(); }}
          form={viewingSgaForm}
          setForm={setViewingSgaForm}
          vendors={[]}
          users={[]}
          editingId={viewingSga.id}
          isSaving={false}
          onSubmit={() => {}}
          onClose={onCloseSga}
        />
      )}
    </>
  );
}
