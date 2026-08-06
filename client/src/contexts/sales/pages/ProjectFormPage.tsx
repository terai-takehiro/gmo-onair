/**
 * 案件を作る／直す画面 (v4)
 *
 * ── ここは「直す画面」です ──────────────────────────────────
 *
 * 読むのは案件詳細（`/sales/projects/:id`）。この画面は**入力欄だけ**を持ちます。
 * 分割前はここに詳細と同じものが**別の実装で**載っていました:
 * ステージの帯・ステージの案内文・AI 起票の帯・売上／仕入／粗利・
 * 「今すべきこと」・「お客様とのやり取り」・概算見積カード・GLS 発番済みの帯。
 * 詳細ができた今は二重なので外しました（約 620 行）。
 *
 * **外したものの行き先**（消したのではありません）:
 *
 *   AI 起票の「確認した」 → `projectDetail/AiReviewBanner.tsx`（概要タブ）
 *   ステージを変える     → `projectDetail/DetailHeader.tsx`（完了・失注も足した）
 *   失注の理由入力       → `projectDetail/LostDialog.tsx`
 *   やり取り・次の一手   → 概要タブ ／ やり取りタブ
 *   売上・仕入・粗利     → 概要タブ ／ 見積・請求タブ
 *
 * **見出しに案件詳細へ戻る導線を必ず置くこと。** `/edit` を直接ブックマークして
 * いる人（受付の「ここを直す」から来る人を含む）が、やり取り・次のアクションに
 * 辿り着けなくなります。
 *
 * ── GLS 発番はまだこの画面に置いてあります ──────────────────────
 *
 * モックは「受注が決まったら自動で採る」形ですが、**番号を採る時期を変えるのは
 * 業務の決めごと**なので、画面の作り直しと同じ回では動かしません。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Link2, Loader2, Save, Trophy } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import StudioBookingDialog from '@/contexts/production/components/studio/StudioBookingDialog';
import { ProjectStageLabels } from '@/types';
import SimulationDialog from '../components/SimulationDialog';
import CustomerDialog from '../components/CustomerDialog';
import { useProjectForm } from './projectForm/useProjectForm';
import { BasicSection } from './projectForm/BasicSection';
import { AmountSection } from './projectForm/AmountSection';
import { MembersSection } from './projectForm/MembersSection';
import { BookingListSection } from './projectForm/BookingListSection';
import { ScheduleSection } from './projectForm/ScheduleSection';
import { BroadcastSection } from './projectForm/BroadcastSection';
import { BoxSection } from './projectForm/BoxSection';
import { DocsSection } from './projectForm/DocsSection';
import { GlsDialog, GlsResultDialog } from './projectForm/dialogs/GlsDialog';
import { RelinkDialog } from './projectForm/dialogs/RelinkDialog';
import { CategorySwitchDialog } from './projectForm/dialogs/CategorySwitchDialog';
import type { ProjectBooking } from './projectForm/types';

export default function ProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const f = useProjectForm(id);
  const { form, isEdit, project, schedule, actions } = f;

  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<ProjectBooking | null>(null);

  if (f.isLoading) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;
  }
  if (f.isLoadError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorPanel title="案件を読み込めませんでした" onRetry={() => navigate(0)} />
        <Button variant="outline" className="mt-3" onClick={() => navigate('/sales/projects')}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          案件一覧に戻る
        </Button>
      </div>
    );
  }

  const backTo = isEdit ? `/sales/projects/${id}` : '/sales/projects';
  const backLabel = isEdit ? '案件の中身に戻る' : '案件一覧に戻る';
  const openCalendar = () => navigate('/studio/calendar', {
    state: {
      presetRoomIds: schedule.roomIds,
      presetDate: f.buildPresetDate(),
      presetProjectId: id,
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 lg:space-y-5 lg:p-6">
      <PageHeader
        title={isEdit ? '案件を直す' : '案件をつくる'}
        sub={isEdit
          ? [project?.name, project?.gls_number || project?.code].filter(Boolean).join(' ・ ')
          : '案件名・お客様・案件分類の3つが決まれば登録できます'}
        icon={(
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
            title={backLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          </button>
        )}
      >
        {isEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{ProjectStageLabels[f.currentStage] || f.currentStage}</Badge>
            {/*
              **詳細へ戻る道を必ず置く。** `/edit` を直接開いた人は、ここが無いと
              やり取り・次のアクション・見積にたどり着けません。
            */}
            <Button variant="outline" size="sm" onClick={() => navigate(`/sales/projects/${id}`)}>
              案件の中身を見る
            </Button>
            {f.isYomi && (
              <Button
                size="sm"
                onClick={() => actions.setGlsDialog((s) => ({ ...s, open: true }))}
                disabled={actions.glsMutation.isPending}
              >
                <Trophy className="mr-1 h-4 w-4" aria-hidden="true" />
                GLS 発番
              </Button>
            )}
            {f.hasGls && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.setRelinkDialog({ open: true, target_project_id: '' })}
              >
                <Link2 className="mr-1 h-4 w-4" aria-hidden="true" />
                別の GLS へ付け替える
              </Button>
            )}
            {id && (
              <ProjectQuickLinks
                projectId={id}
                projectName={form.watch('name') || project?.name}
                currentPage="project"
              />
            )}
          </div>
        )}
      </PageHeader>

      {/* 入れ忘れ。**欄のすぐ上に出す** — 帯に出すと画面外で気づかれない */}
      {f.submitErrors.length > 0 && (
        <div className="rounded-card border border-destructive-border bg-destructive-surface p-3">
          <p className="text-list text-destructive">つぎの項目を確かめてください</p>
          <ul className="text-sub mt-1 list-inside list-disc space-y-0.5 text-destructive">
            {f.submitErrors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      <form onSubmit={form.handleSubmit(f.onSubmit)} className="space-y-4 lg:space-y-5">
        <BasicSection
          form={form}
          customers={f.customers}
          hasGls={f.hasGls}
          onNewCustomer={() => f.setCustomerDialogOpen(true)}
          onSwitchCategory={(target) => actions.setCategorySwitchDialog({ open: true, target })}
        />

        <AmountSection
          form={form}
          users={f.users}
          isEdit={isEdit}
          isCategoryA={f.isCategoryA}
          hasDraftSimulation={f.hasDraftSimulation}
          draftSimulationTotal={f.draftSimulationTotal}
          aiDraftCreatedAt={f.aiDraftCreatedAt}
          finalizeSim={f.finalizeSim}
          onOpenSimulation={() => f.setSimOpen(true)}
        />

        <MembersSection projectId={isEdit ? id : undefined} />

        {isEdit && (
          <BookingListSection
            bookings={actions.bookings}
            onAdd={() => { setEditingBooking(null); setBookingDialogOpen(true); }}
            onEdit={(b) => { setEditingBooking(b); setBookingDialogOpen(true); }}
            onDelete={actions.deleteBooking}
          />
        )}

        <ScheduleSection
          s={schedule}
          studioLocations={f.studioLocations}
          isEdit={isEdit}
          hasBookings={actions.bookings.length > 0}
          onOpenCalendar={isEdit && f.isCategoryA ? openCalendar : undefined}
        />

        {f.hasGls && f.isCategoryA && <BroadcastSection form={form} />}

        <BoxSection
          form={form}
          isEdit={isEdit}
          onCreate={actions.handleCreateBoxFolder}
          creating={actions.createBoxFolderMutation.isPending}
        />

        <DocsSection form={form} />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(backTo)}>やめる</Button>
          <Button type="submit" disabled={f.saveMutation.isPending}>
            {f.saveMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            保存
          </Button>
        </div>
      </form>

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
    </div>
  );
}
