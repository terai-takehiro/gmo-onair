/**
 * 案件を作る／直すフォームの中身 (v4)
 *
 * 画面（`ProjectFormPage.tsx` と `projectForm/*Section.tsx`）から
 * **読み込み・検証・保存**をぜんぶ引き取ります。分割の目的は行数ではなく、
 * 「保存すると日程が消える」のような事故が**1か所を読めば分かる**ようにすることです。
 *
 * ── 触ってはいけない3つ ────────────────────────────────────
 *
 *  1. `schedule.touched`（日程の欄に人が触ったか）。
 *     触っていないのに `dates` を送ると `project_dates` が全置換され、
 *     **拾えなかった日程が消えます**（`useProjectSchedule.ts` に経緯）
 *  2. **主担当が空なら送らない。** `projects.assigned_to` は NOT NULL の外部キーで、
 *     空文字を渡すと 500 になります（サーバーは未指定なら今の値を保つ）
 *  3. 新規登録のときだけスタジオ予約を作る。編集では作りません
 *     （編集は「登録済みの予約」から足す・直すのが唯一の道）
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { formatShortDate } from '@/lib/format';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { getProjectCategory, type ProjectStage } from '@/types';
import { EMPTY_FORM, addOneDayStr, type FormValues, type StudioLocation } from './types';
import { useProjectSchedule, saveLocationNote } from './useProjectSchedule';
import { useProjectActions } from './useProjectActions';

export function useProjectForm(id: string | undefined) {
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const form = useForm<FormValues>({ defaultValues: EMPTY_FORM });
  const { setValue, watch, reset } = form;
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const [simOpen, setSimOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
    enabled: isEdit,
    retry: 1,
  });
  const project = projectQuery.data;

  const schedule = useProjectSchedule(project);

  const { data: customersData } = useQuery({
    queryKey: ['customers-select'],
    queryFn: async () => (await api.get('/customers', { params: { limit: 200 } })).data,
  });
  const customers: { id: string; name: string; short_name?: string }[] = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-by-module-sales'],
    queryFn: async () => (await api.get('/users/by-module/sales')).data.data,
  });
  const users: { id: string; name: string }[] = usersData ?? [];

  const { data: studioLocationsData } = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data,
  });
  const studioLocations: StudioLocation[] = studioLocationsData ?? [];

  /* ── 見積シミュレーション（AI 下書きの検出と確定）────────────────── */
  const { data: simulationData } = useQuery({
    queryKey: ['simulation', id],
    queryFn: async () => (await api.get(`/projects/${id}/simulation`)).data,
    enabled: isEdit,
    refetchOnMount: 'always',
  });
  const simulationItems: Array<{ subtotal: number; status?: string }> = simulationData?.data ?? [];
  const hasDraftSimulation = simulationItems.length > 0 && simulationItems.some((s) => s.status === 'draft');
  const draftSimulationTotal = simulationItems.reduce((sum, s) => sum + (Number(s.subtotal) || 0), 0);
  /** AI 下書きがいつ作られたか。**誰の指示かは画面に出さない**（`docs/wording.md`） */
  const aiDraftCreatedAt: string | null = simulationData?.ai_draft_origin?.created_at ?? null;

  const finalizeSim = useMutation({
    mutationFn: async () => (await api.post(`/projects/${id}/simulation/finalize`)).data,
    onSuccess: (res) => {
      const rows: Array<{ subtotal: number }> = res?.data ?? [];
      const total = rows.reduce((sum, r) => sum + (Number(r.subtotal) || 0), 0);
      if (total > 0) setValue('expected_amount', total, { shouldDirty: true });
      qc.invalidateQueries({ queryKey: ['simulation', id] });
      qc.invalidateQueries({ queryKey: ['project', id] });
      notifySuccess('見積を確定し、想定金額に入れました');
    },
    onError: (err) => notifyApiError('見積を確定できませんでした', err),
  });

  /* ── 読み込んだ案件を欄へ入れる ──────────────────────────────── */
  useEffect(() => {
    if (!project) return;
    reset({
      name: project.name || '',
      customer_id: project.customer_id || '',
      customer_type: project.customer_type || 'external',
      project_type: project.project_type || 'other',
      project_type_other: project.project_type_other || '',
      gls_category: (project.gls_category === 'A' || project.gls_category === 'B') ? project.gls_category : '',
      event_start: project.event_start || '',
      event_end: project.event_end || '',
      expected_amount: project.expected_amount || 0,
      assigned_to: project.assigned_to || '',
      broadcast_type: project.broadcast_type || '',
      media_platform: project.media_platform || '',
      tags: project.tags || '',
      notes: project.notes || '',
      box_url_internal: project.box_url_internal || '',
      box_url_external: project.box_url_external || '',
      application_form: !!project.application_form,
      logo_permission: !!project.logo_permission,
    });
  }, [project, reset]);

  const projectType = watch('project_type');
  const glsCategory = watch('gls_category');
  const hasGls = !!project?.gls_number;
  const isYomi = !hasGls;
  const currentStage = (project?.stage || 'neta') as ProjectStage;
  // 分類はユーザー選択値を優先。未選択時のフォールバックとして project_type からの推奨値を使う
  const isCategoryA = glsCategory ? glsCategory === 'A' : getProjectCategory(projectType) === 'A';
  const isCategoryARef = useRef(isCategoryA);
  isCategoryARef.current = isCategoryA;

  // project_type を変更したら gls_category をまだ未選択のときだけデフォルト推奨を当てる
  useEffect(() => {
    if (!projectType) return;
    if (glsCategory) return; // 既に選択済みなら触らない
    setValue('gls_category', getProjectCategory(projectType));
  }, [projectType, glsCategory, setValue]);

  const actions = useProjectActions({
    id, isEdit, isCategoryA,
    onBoxFolderCreated: ({ internal, external }) => {
      if (internal) setValue('box_url_internal', internal, { shouldDirty: false });
      if (external) setValue('box_url_external', external, { shouldDirty: false });
    },
  });

  /* ── 保存 ──────────────────────────────────────────────────── */
  const saveMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // **主担当を空にしたら送らない。** `projects.assigned_to` は NOT NULL の外部キーで、
      // 空文字を渡すと FK 違反で 500 になる（`SearchableSelect` の × を押すと空になる）。
      // 送らなければサーバーは既存の値を保つ
      const body: Record<string, unknown> = { ...values };
      if (!values.assigned_to) delete body.assigned_to;
      if (isEdit) return (await api.put(`/projects/${id}`, body)).data.data;
      return (await api.post('/projects', body)).data.data;
    },
    onError: (err) => notifyApiError('案件を保存できませんでした', err),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'alerts'] });
      if (isEdit) {
        qc.invalidateQueries({ queryKey: ['project', id] });
        notifySuccess('保存しました');
      } else {
        navigate(`/sales/projects/${result.id}`);
      }
    },
  });

  const onSubmit = async (values: FormValues) => {
    const errs: string[] = [];
    if (!values.customer_id) errs.push('顧客を選択してください');
    if (!values.project_type) errs.push('案件種類を選択してください');
    if (!values.gls_category) errs.push('案件分類（スタジオ / ビジネス）を選択してください');
    if (errs.length > 0) {
      setSubmitErrors(errs);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitErrors([]);

    // event_start/event_end をスタジオ日程から自動設定
    const prodEnd = schedule.productionLastDay;
    if (schedule.productionStart) {
      values.event_start = (schedule.hasRehearsal && schedule.rehearsalStart)
        ? schedule.rehearsalStart
        : schedule.productionStart;
      values.event_end = prodEnd || schedule.productionStart;
    }

    // **編集で日程に触っていないときは `dates` を送らない。**
    // 送るとサーバーが project_dates を全置換し、拾えなかった日程が消える
    const allDates = schedule.buildDates();
    if (allDates.length > 0 && (!isEdit || schedule.touched)) {
      // 重複日を排除（同じ日付があった場合は最初のラベル優先）
      const uniqueMap = new Map<string, { date: string; label: string | null }>();
      for (const d of allDates) if (!uniqueMap.has(d.date)) uniqueMap.set(d.date, d);
      (values as FormValues & { dates?: unknown }).dates =
        Array.from(uniqueMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    }
    // 日程に触っていないなら期間も動かさない（サーバーは受け取った値で上書きする）
    if (isEdit && !schedule.touched) {
      values.event_start = project?.event_start || values.event_start;
      values.event_end = project?.event_end || values.event_end;
    }

    saveMutation.mutate(values, {
      onSuccess: async (res) => {
        const savedProjectId = (res as { id?: string })?.id || id;
        // 新規案件作成時のみ、入力されたスケジュールから予約を一度だけ作成する。
        // 編集時はこのフォームから作成しない（登録済みの予約 ＋ StudioBookingDialog で CRUD）
        const wantsBooking = schedule.roomIds.length > 0 || schedule.locationNote.trim();
        if (isEdit || !wantsBooking || !schedule.productionStart) return;
        if (schedule.locationNote.trim()) saveLocationNote(schedule.locationNote.trim());
        try {
          await api.post('/studios/bookings', {
            title: `${values.name} (${formatShortDate(schedule.productionStart)})`,
            booking_type: 'performance',
            project_id: savedProjectId,
            all_day: true,
            start_time: schedule.productionStart,
            end_time: prodEnd || schedule.productionStart,
            room_ids: schedule.roomIds,
            location_note: schedule.locationNote.trim() || null,
          });
          if (schedule.hasRehearsal && schedule.rehearsalStart) {
            const rehEnd = schedule.rehearsalMultiDay ? schedule.rehearsalEnd : schedule.rehearsalStart;
            await api.post('/studios/bookings', {
              title: `${values.name} (${formatShortDate(schedule.rehearsalStart)})`,
              booking_type: 'rehearsal',
              project_id: savedProjectId,
              all_day: true,
              start_time: schedule.rehearsalStart,
              end_time: rehEnd || schedule.rehearsalStart,
              room_ids: schedule.roomIds,
              location_note: schedule.locationNote.trim() || null,
            });
          }
        } catch { /* 予約に失敗しても案件の保存は成功している */ }
      },
    });
  };

  /**
   * 「スタジオ予約」へ渡す日付。案件の event 日付は inclusive のため、
   * ダイアログが期待する exclusive-end に `addOneDayStr` で揃える
   * (揃えないと -1 で終了日が開始日より前になり、複数日が誤って ON になる)。
   */
  const buildPresetDate = (): { start: string; end: string; allDay: boolean } | null => {
    const start = schedule.productionStart || project?.event_start;
    if (!start) return null;
    const inclusiveEnd = schedule.productionEnd || schedule.productionStart
      || project?.event_end || project?.event_start || start;
    return { start, end: addOneDayStr(inclusiveEnd), allDay: true };
  };

  return {
    form, isEdit, project,
    isLoading: isEdit && projectQuery.isLoading,
    isLoadError: isEdit && projectQuery.isError,
    customers, users, studioLocations,
    schedule, actions,
    submitErrors, onSubmit, saveMutation,
    simOpen, setSimOpen, customerDialogOpen, setCustomerDialogOpen,
    hasDraftSimulation, draftSimulationTotal, aiDraftCreatedAt, finalizeSim,
    hasGls, isYomi, isCategoryA, currentStage, projectType, glsCategory,
    buildPresetDate,
  };
}

export type ProjectFormState = ReturnType<typeof useProjectForm>;
