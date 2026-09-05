/**
 * 見積タブのミューテーション定義（`EstimateTab.tsx` から分離・400行の是正）
 *
 * `EstimateTab.tsx` に残すのは絞り込み・表示の state と、それらを組み立てる JSX だけ。
 * サーバーとやり取りする操作（作る・版を上げる・状態を変える・明細を保存する・
 * 消す・アーカイブする・売上へ変換する）はここに集めた。挙動は一切変えていない
 * （`EstimateVersionList`／`useEstimateEpisodeFilter` と同じ切り出しの理由）。
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { EstimateStatus as Status } from './EstimateActions';
import type { EstimateItemRow as Item } from './EstimateItems';

export function useEstimateMutations({
  base, projectId, episodeId, openId, setOpenId,
}: {
  base: string;
  projectId: string;
  /** いま絞り込んでいる回。`create` が「その回だけの見積」を作るときに使う */
  episodeId: string | null;
  openId: string | null;
  /** 作った／版を上げた／消した見積を開閉状態に反映する（state は `EstimateTab.tsx` が持つ） */
  setOpenId: (id: string | null) => void;
}) {
  const qc = useQueryClient();

  // **`showArchived` は鍵に含めない。** `invalidateQueries({ queryKey: ['estimates', projectId] })`
  // は前方一致で両方の鍵（表示あり／なし）を落とすので、鍵を分けても取りこぼしは無い
  const invalidate = () => qc.invalidateQueries({ queryKey: ['estimates', projectId] });

  const create = useMutation({
    // **いま絞り込んでいる回があれば、その回だけの見積として作る**（仕様変更 #18）。
    // 「全体」（絞り込みなし）のときは今までどおり案件全体の見積になる。
    // 複数の回をまとめて選ぶ入口は別（`MultiEpisodeEstimateDialog`）
    mutationFn: () => api.post(base, { title: '', tax_category: 'tax10', customer_id: null, episode_ids: episodeId ? [episodeId] : [] }),
    onSuccess: (r) => { invalidate(); setOpenId(r.data.data.id); notifySuccess('見積をつくりました'); },
    onError: (e) => notifyApiError('見積をつくれませんでした', e),
  });

  const nextVersion = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/next-version`),
    onSuccess: (r) => {
      invalidate(); setOpenId(r.data.data.id);
      notifySuccess(`v${r.data.data.version} をつくりました（前の版はそのまま残ります）`);
    },
    onError: (e) => notifyApiError('次の版をつくれませんでした', e),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) => api.put(`${base}/${id}`, { status }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] }); },
    onError: (e) => notifyApiError('状態を変更できませんでした', e),
  });

  const saveItems = useMutation({
    mutationFn: ({ id, items }: { id: string; items: Item[] }) => api.put(`${base}/${id}/items`, { items }),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('明細を保存しました');
    },
    onError: (e) => notifyApiError('明細を保存できませんでした', e),
  });

  /** タイトル・見積全体の備考。**明細と同じ「下書きだけ直せる」規則**（サーバー側で強制） */
  const saveMeta = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ title: string; notes: string | null }> }) =>
      api.put(`${base}/${id}`, patch),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] }); },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => { invalidate(); setOpenId(null); notifySuccess('見積を削除しました'); },
    onError: (e) => notifyApiError('見積を削除できませんでした', e),
  });

  /** 一覧から隠すだけ。`status` は変えない（消すのとは別。migration 236） */
  const archive = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/archive`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('一覧から隠しました（削除はしていません）');
    },
    onError: (e) => notifyApiError('見積を一覧から隠せませんでした', e, '時間をおいて、もう一度お試しください。'),
  });

  const unarchive = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/unarchive`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('一覧に戻しました');
    },
    onError: (e) => notifyApiError('見積を一覧に戻せませんでした', e, '時間をおいて、もう一度お試しください。'),
  });

  /**
   * 受注した見積を売上・請求 (`revenues`) に登録する。
   * migration 138 が予告していたまま行き先が無かった変換（`estimate.service.ts` 参照）。
   */
  const convertToRevenue = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/convert-to-revenue`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      // `['revenues']` は案件詳細（`RevenueBillingPane` の `['revenues','project',projectId]`）
      // には前方一致で当たるが、財務③ 売上台帳（`['revenues-all',…]`）と
      // 締め処理（`['billing',…]`）には当たらない。3つとも落とす（`MobileCollect.tsx` と同じ対）
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      qc.invalidateQueries({ queryKey: ['billing'] });
      notifySuccess('売上・請求に登録しました（「売上・請求」の切り替えから見られます）');
    },
    onError: (e) => notifyApiError('売上・請求に登録できませんでした', e),
  });

  /**
   * `convertToRevenue` の取り消し（9/4 ご依頼）。①誤って売上に登録してしまった
   * ものを見積に戻す ②見積を更新して売上を登録し直すため、いまの売上を
   * いったん見積に戻す ── どちらもこの1つの操作。
   *
   * ⚠️ **`convertToRevenue` と同じ4つの鍵を必ず一緒に落とす。** 片方だけだと
   * 「取り消したのに売上一覧にまだ残っている」ように見える
   * （`client/CLAUDE.md`「react-query の鍵」）。
   */
  const revertToEstimate = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/revert-to-estimate`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      qc.invalidateQueries({ queryKey: ['revenues'] });
      qc.invalidateQueries({ queryKey: ['revenues-all'] });
      qc.invalidateQueries({ queryKey: ['billing'] });
      notifySuccess('売上・請求への登録を取り消し、見積に戻しました');
    },
    onError: (e) => notifyApiError('取り消せませんでした', e),
  });

  return {
    invalidate, create, nextVersion, setStatus, saveItems, saveMeta, remove, archive, unarchive,
    convertToRevenue, revertToEstimate,
  };
}
