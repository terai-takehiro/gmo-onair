/**
 * 案件を直すフォームの中身 (v4)
 *
 * 画面（`ProjectFormPage.tsx` と `projectForm/*Section.tsx`）から
 * **読み込み・検証・保存**をぜんぶ引き取ります。分割の目的は行数ではなく、
 * 「保存すると日程が消える」のような事故が**1か所を読めば分かる**ようにすることです。
 *
 * ── 入力欄は案件作成のものをそのまま呼ぶ ──────────────────────
 *
 * `fields`（`ProjectFieldsState`）が `projectNew/RequiredFields` と
 * `projectNew/MoreFields` に渡す値です。react-hook-form の値を**写して**
 * 作りますが、写しているのは**入れ物の形だけ**で、欄そのものは1つも
 * こちらに書きません。書くと、作る画面に足した項目が直す画面に出ない
 * （そして誰も気づかない）状態に戻ります。
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { createInitialBookings } from './createInitialBookings';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { getProjectCategory, type ProjectStage } from '@/types';
import {
  missingOf,
  type CustomerOption, type NewProjectValues, type ProjectFieldsState, type UserOption,
} from '../projectNew/fields';
import { canIssueNewGlsAt } from '../../glsIssue';
import { invalidateProjectQueries } from '../../projectQueries';
import { projectToFormValues, mergeSavedFormValues } from './toFormValues';
import { EMPTY_FORM, addOneDayStr, type FormValues, type StudioLocation } from './types';
import { useProjectSchedule, saveLocationNote } from './useProjectSchedule';
import { useProjectSimulation } from './useProjectSimulation';
import { useProjectActions } from './useProjectActions';
import { useSelectedCustomer } from './useSelectedCustomer';

export function useProjectForm(id: string | undefined) {
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const form = useForm<FormValues>({ defaultValues: EMPTY_FORM });
  const { setValue, watch, reset, getValues } = form;
  /**
   * 保存が通った直後かどうか（S4）。次に案件を読み直したときに
   * **一度だけ全欄をサーバー値へ戻す**ために立てる。詳しい理由は下の reset の注記。
   */
  const justSavedRef = useRef(false);
  /** 保存に出した時点の欄の控え。**保存中に人が触った欄を踏み潰さない**ために使う */
  const submittedRef = useRef<FormValues | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: async () => (await api.get(`/projects/${id}`)).data.data,
    enabled: isEdit,
    retry: 1,
    // **開くたびに必ず読み直す**（共通の `staleTime: 60_000` だと MCP・別タブで直した値が
    // リロードまで出なかった — 実ブラウザで再現）。裏で取り直し、触っていない欄だけ差し替える
    staleTime: 0,
    refetchOnMount: 'always',
    // **タブに戻ってきたときも読み直す**（共通既定は `refetchOnWindowFocus: false`）。
    // `refetchOnMount` は開き直したときしか効かないので、この画面を**開いたまま**
    // MCP・別タブ・別の人が直した値はリロードするまで出なかった。
    // 触っている欄は上の reset が keepDirtyValues で守るので、書きかけは消えない
    refetchOnWindowFocus: true,
  });
  const project = projectQuery.data;

  const schedule = useProjectSchedule(project);

  const { data: customersData } = useQuery({
    queryKey: ['customers-select'],
    queryFn: async () => (await api.get('/customers', { params: { limit: 200 } })).data,
  });
  const customers: CustomerOption[] = customersData?.data ?? [];

  const { data: usersData } = useQuery({
    queryKey: ['users-by-module-sales'],
    queryFn: async () => (await api.get('/users/by-module/sales')).data.data,
  });
  const users: UserOption[] = usersData ?? [];

  const { data: studioLocationsData } = useQuery({
    queryKey: ['studio-locations'],
    queryFn: async () => (await api.get('/studios/locations')).data.data,
  });
  const studioLocations: StudioLocation[] = studioLocationsData ?? [];

  /* ── 見積シミュレーション（AI 下書きの検出と確定）は `useProjectSimulation.ts` ── */
  const { hasDraftSimulation, draftSimulationTotal, aiDraftCreatedAt, finalizeSim } =
    useProjectSimulation(id, isEdit, setValue);

  /* ── 読み込んだ案件を欄へ入れる ──────────────────────────────── */
  useEffect(() => {
    if (!project) return;
    // 同じ画面の GLS発番・分類切替・BOXフォルダ作成などが ['project', id] を invalidate
    // するため、再取得のたびに全欄を置き換えると入力中の値が消える —
    // 触った欄は keepDirtyValues で保ち、触っていない欄だけサーバー値で更新する。
    //
    // ⚠️ **保存に成功した直後だけは例外**（S4・「保存したのに次に開くと反映されない」）。
    // 保存しても欄が dirty のままだと、以後いくら読み直しても
    // **人が触った欄はサーバー値で置き換わりません**（`keepDirtyValues` の定義そのもの）。
    // サーバーは保存時に値を正規化します — GLS-B なら2段分類を NULL に、
    // 無観客なら来場人数を NULL に、グループ会社ならリード経路を group に固定 —
    // ので、保存直後の画面には**送った値のまま**が残り、リロードして dirty が
    // 消えたときに初めて本当の値が出る、という報告どおりの症状になります。
    // ここで1回だけ dirty を解いて、サーバーが決めた値を欄に出します。
    const serverValues = projectToFormValues(project);
    if (!justSavedRef.current) {
      reset(serverValues, { keepDirtyValues: true });
      return;
    }
    justSavedRef.current = false;
    // 保存を待っている間に人が触った欄だけは残す（消すと入力事故になる）
    const { merged, keptKeys } = mergeSavedFormValues(serverValues, getValues(), submittedRef.current);
    submittedRef.current = null;
    reset(merged);
    // 残した欄は dirty に付け直す — 付け直さないと、次の読み直しで
    // keepDirtyValues に守られず、書きかけの入力がサーバー値で消える
    for (const key of keptKeys) setValue(key, merged[key] as never, { shouldDirty: true });
  }, [project, reset, getValues, setValue]);

  /* ── 案件作成の入力欄に渡す形（`ProjectFieldsState`）─────────────────
   *
   * **欄はこちらに1つも書きません。** `projectNew/RequiredFields` と
   * `projectNew/MoreFields` をそのまま呼び、値の出し入れだけを繋ぎます。
   */
  const values = watch();
  // お客様がグループ会社か（`customers.is_gmo_group`）。リード経路と**グループ区分**
  // （migration 192）がここから決まるので、**候補 200 件の外は id で引き直す**
  const { customers: fieldCustomers, isGroup } =
    useSelectedCustomer(values.customer_id, customers, project?.customer_type);
  const groupType = isGroup ? 'internal' as const : 'external' as const;

  /**
   * **直す画面が出している欄だけ受ける。** 実施日・最初のタスク・メモ・ステージは
   * `MoreFields` / `RequiredFields` が `mode="edit"` で出さないので来ませんが、
   * 万一来ても `FormValues` に無い鍵を `setValue` に渡すと
   * **react-hook-form が黙って別の値を作り、保存で送られます**。ここで止めます。
   */
  const EDITABLE_KEYS = useMemo(() => new Set<keyof NewProjectValues>([
    'customer_id', 'contact_name', 'name', 'audience', 'project_category',
    'recurrence', 'attendee_count', 'goal', 'expected_amount',   // `customer_type` は入れない（読むだけ）
    'intake_channel', 'assigned_to',
    // レギュラー案件が案件全体で1つだけ持つ取り決め（migration 262・264）。
    // `RegularSeriesFields` が書く（`recording_per_day_count`/`episode_unit_price` は
    // 仕様変更 #16 で無くなった — `NewProjectValues` にも無い）
    'recording_cadence', 'fixed_studio_note',
    'billing_cycle', 'broadcast_offset_days',
  ]), []);

  const setField = useCallback(<K extends keyof NewProjectValues>(k: K, value: NewProjectValues[K]) => {
    if (!EDITABLE_KEYS.has(k)) return;
    // 金額だけ形が違う（画面は文字列・この控えは数値）
    if (k === 'expected_amount') {
      setValue('expected_amount', Number(value) || 0, { shouldDirty: true });
      return;
    }
    setValue(k as keyof FormValues, value as never, { shouldDirty: true });
  }, [EDITABLE_KEYS, setValue]);

  const fieldValues: NewProjectValues = {
    customer_id: values.customer_id,
    contact_name: values.contact_name,
    name: values.name,
    audience: values.audience,
    project_category: values.project_category,
    gls_category: values.gls_category === 'B' ? 'B' : 'A',
    customer_type: groupType,   // お客様から導く（保存値ではない。サーバーも同じ規則）
    recurrence: values.recurrence,
    recording_cadence: values.recording_cadence as NewProjectValues['recording_cadence'],
    fixed_studio_note: values.fixed_studio_note,
    billing_cycle: values.billing_cycle as NewProjectValues['billing_cycle'],
    broadcast_offset_days: values.broadcast_offset_days,
    stage: (project?.stage || 'neta') as ProjectStage,
    attendee_count: values.attendee_count,
    goal: values.goal,
    expected_amount: values.expected_amount ? String(values.expected_amount) : '',
    intake_channel: values.intake_channel,
    assigned_to: values.assigned_to,
    // 直す画面が出さない欄。`EDITABLE_KEYS` の外なので書き戻りません
    dates: [],
    first_task_title: '',
    first_task_due: '',
    notes: '',
  };

  const fields: ProjectFieldsState = { v: fieldValues, set: setField, customers: fieldCustomers, users, isGroup };

  /**
   * 足りない必須項目。**案件作成と同じ `missingOf`** を使います
   * （写すと「作れたのに保存できない案件」ができる）。
   * 読み込みが終わるまでは出しません — 空のフォームに一瞬だけ出ると、
   * 開いた瞬間に「何か足りない」と読まれます。
   *
   * **`'edit'` を渡すのが要点**（ご指示）。もともと分類が空の案件
   * （AI が起こしたネタ・決算取込・Excel/GLS 取込）は**空のままでも保存できます** —
   * 必須のままだと、案件名を直したいだけでも知らない分類を選ばされ、
   * しかも画面には「選ぶ」と出るので**画面が値を戻したように見えます**。
   * 片方だけ入れたときは今までどおり止めます（`fields.ts` の理由）。
   */
  const missing = project ? missingOf(fieldValues, 'edit') : [];

  const projectType = watch('project_type');
  const glsCategory = watch('gls_category');
  const hasGls = !!project?.gls_number;
  const isYomi = !hasGls;
  const currentStage = (project?.stage || 'neta') as ProjectStage;
  /**
   * **新しく番号を採れるのは見積提案（C）以降**（2026-09-02 に1段前倒し）。
   * 境界は `contexts/sales/glsIssue.ts` にだけ書く — サーバー（`issueGls`）も
   * 同じ境界で弾くので、ここに書き写すと「押せるのに 400 で失敗する」に戻る。
   * 「いまある案件に足す」（既存 GLS の回として付ける）はこの制限を受けない
   */
  const canIssueNewGls = canIssueNewGlsAt(currentStage);
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
      /**
       * **旧1段の案件種類は送らない。** この画面はもう欄を持っておらず、
       * `project_type` はサーバーが2段（客入れの有無 × 案件分類）から導きます。
       * 読み込んだ値をそのまま送り返すと、2段を直しても**古い種類が一緒に来て**
       * 分類と種類がずれた行ができます（`project-classification.ts`）。
       * 送らなければサーバーは今の値を保ちます（2段が揃っていればそちらが勝つ）。
       */
      delete body.project_type;
      /**
       * **2段が空なら送らない。** GLS-B（工事・構築）は2段を持たないので、
       * 空文字を送るとサーバーが「分類を消したい」と受け取ります。
       */
      if (!values.audience) delete body.audience;
      if (!values.project_category) delete body.project_category;
      /**
       * グループ会社のときはリード経路を固定で送る（案件作成と同じ）。
       * 画面が「グループ案件」と出している以上、保存される値も同じでなければ
       * あとから数えたときに食い違います。
       */
      if (isGroup) body.intake_channel = 'group';
      // **グループ区分は送らない**（migration 192）— 決めるのはサーバー（お客様から導く）
      delete body.customer_type;
      if (isEdit) return (await api.put(`/projects/${id}`, body)).data.data;

      /**
       * **新しく作るときだけ「入口」を送る** (migration 165)。
       * ダッシュボードの受付カードから「電話・打合せを取り込む」で来ると
       * `?intake=phone` が付いているので、それを引き継ぐ。
       * **確信 (`intake_confidence`) は送らない** — 人が入れた案件に
       * AI の見立てを付けると、受付の読む順が狂う
       */
      const intake = new URLSearchParams(window.location.search).get('intake');
      if (intake) body.intake_channel = intake;
      return (await api.post('/projects', body)).data.data;
    },
    onError: (err) => notifyApiError('案件を保存できませんでした', err),
    onSuccess: (result) => {
      /**
       * **次の読み直しで欄をサーバー値に戻す目印**（上の reset の注記）。
       * 保存が通ってからでないと立ててはいけない — 失敗した保存で立てると、
       * 書きかけの入力が古いサーバー値で消える。
       */
      justSavedRef.current = true;
      /**
       * **同じ案件を別の鍵で持つ画面が10以上ある**（案件台帳 `project-ledger`・
       * 整合性チェック `project-integrity`・仕入の案件候補 `won-projects-for-purchase`
       * など）。ここで鍵を並べていたころは足し忘れが必ず出て、「直して保存したのに
       * 台帳・一覧・ダッシュボードは古いまま＝リロードすると反映される」という
       * 同じ不具合が場所を変えて何度も出ていた。**鍵の一覧は
       * `contexts/sales/projectQueries.ts` 1か所に置き、ここでは並べない。**
       */
      invalidateProjectQueries(qc, isEdit ? id : (result as { id?: string })?.id);
      if (isEdit) notifySuccess('保存しました');
      else navigate(`/sales/projects/${result.id}`);
    },
  });

  const onSubmit = async (values: FormValues) => {
    /**
     * 検証は**案件作成と同じ5項目だけ**（`missingOf`）。
     * 足りないものは帯で名指ししてあり、保存ボタンも押せません。
     * ここは Enter で送られたときのための最後の砦です。
     */
    if (missing.length > 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

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

    // **出した時点の欄を控える。** 保存が通ったあと全欄をサーバー値へ戻すときに、
    // 「保存を待っている間に人が触った欄」だけを見分けて残すために使う
    submittedRef.current = { ...getValues() };

    saveMutation.mutate(values, {
      onSuccess: async (res) => {
        const savedProjectId = (res as { id?: string })?.id || id;
        // 新規案件作成時のみ、入力されたスケジュールから予約を一度だけ作成する。
        // 編集時はこのフォームから作成しない（登録済みの予約 ＋ StudioBookingDialog で CRUD）
        const wantsBooking = schedule.roomIds.length > 0 || schedule.locationNote.trim();
        if (isEdit || !wantsBooking || !schedule.productionStart) return;
        if (schedule.locationNote.trim()) saveLocationNote(schedule.locationNote.trim());
        // 作ったあと**案件側も読み直す**（実施日が予約から引き直されるため）
        await createInitialBookings(qc, values.name, savedProjectId as string, {
          ...schedule, productionLastDay: prodEnd || schedule.productionStart,
        });
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
    fields, missing, isGroup,
    onSubmit, saveMutation,
    simOpen, setSimOpen, customerDialogOpen, setCustomerDialogOpen,
    hasDraftSimulation, draftSimulationTotal, aiDraftCreatedAt, finalizeSim,
    hasGls, isYomi, isCategoryA, currentStage, canIssueNewGls, projectType, glsCategory,
    buildPresetDate,
  };
}

export type ProjectFormState = ReturnType<typeof useProjectForm>;
