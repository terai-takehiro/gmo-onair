/**
 * 案件フォームの「保存以外の操作」(v4)
 *
 * GLS の発番・紐づけ直し・分類の切替・BOX フォルダ作成・予約の削除。
 * どれも押した結果が **DB の別のもの**（番号・フォルダ名・回のコード）を動かすので、
 * 失敗したときに何も出ないと「押しても変わらない」と見えて何度も押されます。
 * **結果は必ず帯（`notify*`）で出す**こと。
 *
 * 分割前は `window.alert` 4件・`window.confirm` 3件がここにありました。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { invalidateBookingQueries } from '@/lib/bookingQueries';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { invalidateProjectQueries } from '../../projectQueries';
import type { GlsDialogState, GlsProject, ProjectBooking } from './types';

export function useProjectActions({
  id, isEdit, isCategoryA, onBoxFolderCreated,
}: {
  id: string | undefined;
  isEdit: boolean;
  isCategoryA: boolean;
  /** 作成できた BOX の URL を入力欄へ書き戻す（保存時に消えないように） */
  onBoxFolderCreated: (urls: { internal?: string; external?: string }) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [glsDialog, setGlsDialog] = useState<GlsDialogState>({
    open: false, mode: 'new', broadcast_types: ['recording'], media_platforms: ['other'], target_project_id: '',
  });
  const [glsResult, setGlsResult] = useState<{ open: boolean; glsNumber: string } | null>(null);
  const [relinkDialog, setRelinkDialog] = useState<{ open: boolean; target_project_id: string }>({
    open: false, target_project_id: '',
  });
  const [categorySwitchDialog, setCategorySwitchDialog] = useState<{ open: boolean; target: 'A' | 'B' }>({
    open: false, target: 'A',
  });

  /**
   * **GLS発番・付け替え・分類切替は `gls_number` / `gls_category` を変える。**
   * 案件台帳・整合性チェック・仕入や請求の案件候補など、同じ案件を別の鍵で持つ
   * 画面が10以上あり、ここで鍵を並べていたころは必ず落とし忘れが出た
   * （台帳だけ古い番号のまま残る等）。**鍵の一覧は
   * `contexts/sales/projectQueries.ts` 1か所に置く。**
   */
  const invalidateProject = () => invalidateProjectQueries(qc, id);

  /** 紐づけ先を選ぶための一覧。ダイアログを開いたときだけ引く */
  const { data: glsProjectsData } = useQuery({
    queryKey: ['gls-projects'],
    queryFn: async () => (await api.get('/projects/gls-projects')).data,
    enabled: (glsDialog.open && glsDialog.mode === 'link') || relinkDialog.open,
  });
  const glsProjects: GlsProject[] = glsProjectsData?.data ?? [];

  const glsMutation = useMutation({
    mutationFn: async (params: { broadcast_type: string | null; media_platform: string | null }) =>
      (await api.post(`/projects/${id}/issue-gls`, params)).data,
    onSuccess: (data) => {
      invalidateProject();
      setGlsDialog((s) => ({ ...s, open: false }));
      setGlsResult({ open: true, glsNumber: data.data.gls_number });
    },
    onError: (err) => notifyApiError('GLS 番号を発番できませんでした', err),
  });

  const linkGlsMutation = useMutation({
    mutationFn: async (targetProjectId: string) =>
      (await api.post(`/projects/${id}/link-gls`, { target_project_id: targetProjectId })).data,
    onSuccess: (data) => {
      invalidateProject();
      setGlsDialog((s) => ({ ...s, open: false }));
      setGlsResult({ open: true, glsNumber: data.data.gls_number });
    },
    onError: (err) => notifyApiError('GLS 番号を割り当てられませんでした', err),
  });

  const relinkMutation = useMutation({
    mutationFn: async (targetProjectId: string) =>
      (await api.post(`/projects/${id}/relink-gls`, { target_project_id: targetProjectId })).data,
    onSuccess: (data) => {
      invalidateProject();
      setRelinkDialog({ open: false, target_project_id: '' });
      notifySuccess(`${data.data.gls_number} の回に付け替えました`, {
        description: '前の GLS 番号は履歴に残っています。',
      });
    },
    onError: (err) => notifyApiError('付け替えられませんでした', err),
  });

  const categorySwitchMutation = useMutation({
    mutationFn: async (target: 'A' | 'B') =>
      (await api.patch(`/projects/${id}/gls-category`, { gls_category: target })).data,
    onSuccess: () => {
      invalidateProject();
      setCategorySwitchDialog({ open: false, target: 'A' });
      notifySuccess('案件分類を変えました', { description: 'GLS 番号を採り直しました。' });
    },
    onError: (err) => notifyApiError('案件分類を変えられませんでした', err),
  });

  const createBoxFolderMutation = useMutation({
    mutationFn: async () => (await api.post(`/projects/${id}/create-box-folder`)).data,
    onSuccess: (data) => {
      const result = data?.data;
      onBoxFolderCreated({ internal: result?.urlInternal, external: result?.urlExternal });
      qc.invalidateQueries({ queryKey: ['project', id] });
      if (result?.already) {
        notifySuccess('BOX フォルダはすでに登録されています');
      } else {
        notifySuccess('BOX フォルダを作りました', { description: '社内限り / 社外共有可 の2つです。' });
      }
    },
    onError: (err) => {
      const code = (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
      const hint = code === 'BOX_NOT_CONFIGURED'
        ? 'BOX との連携がまだ設定されていません。管理者に設定を依頼してください。'
        : code === 'BOX_FOLDER_CREATE_FAILED'
          ? '置き場所のフォルダの設定を確かめてください。'
          : undefined;
      notifyApiError('BOX フォルダを作れませんでした', err, hint);
    },
  });

  const handleCreateBoxFolder = async () => {
    const ok = await confirmAction({
      title: 'BOX に案件フォルダを作りますか？',
      description: '「社内限り（機密情報）」と「社外共有可（顧客と共有）」の2つを作ります。',
      confirmLabel: '作る',
    });
    if (ok) createBoxFolderMutation.mutate();
  };

  const handleGlsConfirm = () => {
    if (glsDialog.mode === 'link') {
      linkGlsMutation.mutate(glsDialog.target_project_id);
      return;
    }
    // **番組種別・配信媒体は A（スタジオ）案件のときだけ送る。**
    // 入力欄は `mode==='new' && isCategoryA` のときしか描かれないのに、
    // 分類に関係なく初期値（recording / other）を送っていたので、
    // **ビジネス案件を発番すると番組種別が勝手に「収録」になっていた**。
    // 番組情報カードは A のときしか出ないので、画面から直すこともできなかった
    glsMutation.mutate(isCategoryA ? {
      broadcast_type: glsDialog.broadcast_types.length > 0 ? glsDialog.broadcast_types.join(',') : null,
      media_platform: glsDialog.media_platforms.length > 0 ? glsDialog.media_platforms.join(',') : null,
    } : { broadcast_type: null, media_platform: null });
  };

  const handleRelinkConfirm = async () => {
    const ok = await confirmAction({
      title: 'この案件を選んだ GLS の回に付け替えますか？',
      description: 'GLS 番号・回のコード・BOX フォルダ名がまとめて変わります。',
      confirmLabel: '付け替える',
      tone: 'danger',
    });
    if (ok) relinkMutation.mutate(relinkDialog.target_project_id);
  };

  /** この案件に紐づくスタジオ予約（唯一のもと） */
  const { data: bookingsData } = useQuery({
    queryKey: ['project-studio-bookings', id],
    queryFn: async () => (await api.get('/studios/bookings', { params: { project_id: id } })).data.data,
    enabled: isEdit && !!id,
  });
  const bookings: ProjectBooking[] = bookingsData ?? [];

  const deleteBooking = async (b: ProjectBooking) => {
    const ok = await confirmAction({
      title: 'この予約を消しますか？',
      description: 'カレンダーからも消えます。部屋の押さえも解けます。',
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/studios/bookings/${b.id}`);
      // **案件の実施日も残った予約から引き直される**ので案件側も落とす（`lib/bookingQueries.ts`）。
      // 鍵は前方一致なので `['project-studio-bookings']` はこの案件の分にも当たる
      invalidateBookingQueries(qc);
      notifySuccess('予約を消しました');
    } catch (e) {
      // 黙って失敗すると「消えていない = もう一度消す/入れ直す」ことになるので理由を出す
      notifyApiError('予約を消せませんでした', e, '時間をおいてもう一度お試しください。');
    }
  };

  /**
   * 案件の削除（`DELETE /projects/:id`）。サーバーは前からこの口を持っていたが、
   * **押せる場所がどこにも無かった**。論理削除（`deleted_at` を立てるだけ）で、
   * ひもづく見積・タスク・売上・仕入の行そのものは消えない — 財務の台帳は
   * `projects` を LEFT JOIN しているだけなので、削除後も金額・案件名は
   * 今までどおり出る。消えるのは「案件」として辿る経路だけ。
   */
  const deleteMutation = useMutation({
    mutationFn: async () => (await api.delete(`/projects/${id}`)).data,
    onSuccess: () => {
      invalidateProject();
      notifySuccess('案件を削除しました');
      navigate('/sales/projects');
    },
    onError: (err) => notifyApiError('案件を削除できませんでした', err),
  });

  const handleDeleteProject = async () => {
    // **記録は残ることを確認ダイアログに書く**（上の注記と同じ理由）。
    // 書かないと「記録が全部消える」と誤解して押すのをためらわれる
    const ok = await confirmAction({
      title: 'この案件を削除しますか？',
      description: 'この操作は取り消せません。案件一覧・案件台帳・この案件の詳細URLから見えなくなります。'
        + 'ひもづく見積・タスク・売上・仕入の記録そのものは消えず、財務の台帳などでは今までどおり参照できます。',
      confirmLabel: '削除する',
      tone: 'danger',
    });
    if (ok) deleteMutation.mutate();
  };

  return {
    glsDialog, setGlsDialog, glsResult, setGlsResult,
    relinkDialog, setRelinkDialog,
    categorySwitchDialog, setCategorySwitchDialog,
    glsProjects,
    glsMutation, linkGlsMutation, relinkMutation, categorySwitchMutation, createBoxFolderMutation,
    handleGlsConfirm, handleRelinkConfirm, handleCreateBoxFolder,
    bookings, deleteBooking,
    deleteMutation, handleDeleteProject,
  };
}
