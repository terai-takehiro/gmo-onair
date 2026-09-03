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
    onError: (e) => notifyApiError('状態を変えられませんでした', e),
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
    onSuccess: () => { invalidate(); setOpenId(null); notifySuccess('見積を消しました'); },
    onError: (e) => notifyApiError('見積を消せませんでした', e),
  });

  /** 一覧から隠すだけ。`status` は変えない（消すのとは別。migration 236） */
  const archive = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/archive`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('アーカイブしました（一覧から隠しただけです。消えていません）');
    },
    onError: (e) => notifyApiError('アーカイブできませんでした', e),
  });

  const unarchive = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/unarchive`),
    onSuccess: () => {
      invalidate(); qc.invalidateQueries({ queryKey: ['estimate', openId] });
      notifySuccess('アーカイブを解除しました');
    },
    onError: (e) => notifyApiError('アーカイブを解除できませんでした', e),
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

  return {
    invalidate, create, nextVersion, setStatus, saveItems, saveMeta, remove, archive, unarchive, convertToRevenue,
  };
}
