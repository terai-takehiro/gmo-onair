/**
 * 見積シミュレーション（AI 下書きの検出と確定）（v4）
 *
 * 案件を直す画面の上部に出る「AI が見積の下書きを作った」帯と、
 * その「確定」ボタンの中身。`useProjectForm.ts` から**そのまま**切り出したもので、
 * 問い合わせ・確定の振る舞いは1つも変えていません。
 *
 * 確定すると合計を**想定金額（`expected_amount`）へ書き戻す**ので、
 * フォームの `setValue` を受け取ります（`shouldDirty: true` を付けるのは、
 * 書き戻した金額を「人が触った欄」と同じ扱いで保存に載せるため）。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseFormSetValue } from 'react-hook-form';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { FormValues } from './types';

export function useProjectSimulation(
  id: string | undefined,
  isEdit: boolean,
  setValue: UseFormSetValue<FormValues>,
) {
  const qc = useQueryClient();

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

  return { hasDraftSimulation, draftSimulationTotal, aiDraftCreatedAt, finalizeSim };
}
