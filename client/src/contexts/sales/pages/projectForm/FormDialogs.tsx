/**
 * 案件を直す・案件を作る画面のダイアログ群
 * （見積シミュレーション・取引先の新規作成・GLS発番／付け替え／分類切替・スタジオ予約）
 *
 * PC / スマホで**同じものを1回だけ**描くための切り出し。`ProjectFormPage.tsx` の
 * 分岐（PC向けJSX / `MobileEditProject.tsx`）の両方から呼ぶ。分岐の中に複製すると、
 * 片方だけ直した日にもう片方が古いダイアログを開くことになる。
 */
import type { UseFormReturn } from 'react-hook-form';
import type { NavigateFunction } from 'react-router-dom';
import SimulationDialog from '../../components/SimulationDialog';
import CustomerDialog from '../../components/CustomerDialog';
import StudioBookingDialog from '@/contexts/production/components/studio/StudioBookingDialog';
import { GlsDialog, GlsResultDialog } from './dialogs/GlsDialog';
import { RelinkDialog } from './dialogs/RelinkDialog';
import { CategorySwitchDialog } from './dialogs/CategorySwitchDialog';
import type { useProjectForm } from './useProjectForm';
import type { ProjectBooking, FormValues } from './types';

export function FormDialogs({
  f, form, navigate, id, isEdit, project, actions,
  bookingDialogOpen, setBookingDialogOpen, editingBooking, setEditingBooking,
}: {
  f: ReturnType<typeof useProjectForm>;
  form: UseFormReturn<FormValues>;
  navigate: NavigateFunction;
  id: string | undefined;
  isEdit: boolean;
  project: { name?: string; gls_number?: string | null } | undefined;
  actions: ReturnType<typeof useProjectForm>['actions'];
  bookingDialogOpen: boolean;
  setBookingDialogOpen: (v: boolean) => void;
  editingBooking: ProjectBooking | null;
  setEditingBooking: (b: ProjectBooking | null) => void;
}) {
  return (
    <>
      <CustomerDialog
        open={f.customerDialogOpen}
        onOpenChange={f.setCustomerDialogOpen}
        onCreated={(customer) => form.setValue('customer_id', customer.id)}
      />

      <SimulationDialog
        open={f.simOpen}
        onOpenChange={(o) => f.setSimOpen(o)}
        projectId={isEdit ? id : undefined}
        onApply={(total) => form.setValue('expected_amount', total, { shouldDirty: true })}
      />

      <GlsDialog
        state={actions.glsDialog}
        setState={actions.setGlsDialog}
        projectName={project?.name || ''}
        isCategoryA={f.isCategoryA}
        canIssueNew={f.canIssueNewGls}
        glsProjects={actions.glsProjects}
        busy={actions.glsMutation.isPending || actions.linkGlsMutation.isPending}
        onConfirm={actions.handleGlsConfirm}
      />

      {actions.glsResult?.open && (
        <GlsResultDialog
          glsNumber={actions.glsResult.glsNumber}
          projectName={project?.name || ''}
          onClose={() => actions.setGlsResult(null)}
          onOpenBilling={() => {
            actions.setGlsResult(null);
            navigate(`/sales/projects/${id}/episodes`);
          }}
        />
      )}

      <RelinkDialog
        state={actions.relinkDialog}
        setState={actions.setRelinkDialog}
        projectId={id}
        currentGls={project?.gls_number}
        glsProjects={actions.glsProjects}
        busy={actions.relinkMutation.isPending}
        onConfirm={actions.handleRelinkConfirm}
      />

      <CategorySwitchDialog
        state={actions.categorySwitchDialog}
        setState={actions.setCategorySwitchDialog}
        currentCategory={f.glsCategory}
        currentGls={project?.gls_number}
        busy={actions.categorySwitchMutation.isPending}
        onConfirm={(target) => actions.categorySwitchMutation.mutate(target)}
      />

      {isEdit && id && (
        <StudioBookingDialog
          // **対象ごとに作り直す。** 予約Aの編集を閉じて予約Bの編集を開くと、
          // 内部の欄（title等）は前回の値のまま1フレーム描画されてから
          // `editingBooking` 変化を見る `useEffect` で更新される。`key` を
          // 対象IDにして毎回作り直せば、その中間状態自体が起きない
          key={editingBooking?.id ?? 'new'}
          open={bookingDialogOpen}
          onOpenChange={(v) => {
            setBookingDialogOpen(v);
            if (!v) setEditingBooking(null);
          }}
          locations={f.studioLocations as never}
          editingBooking={editingBooking}
          presetDate={null}
          presetProjectId={id}
        />
      )}
    </>
  );
}
