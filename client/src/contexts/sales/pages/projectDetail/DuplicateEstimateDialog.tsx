/**
 * 「別の回の見積として複製する」ダイアログ（仕様変更 #18・回単位の見積）
 *
 * ── 「次の版をつくる」とは別の操作 ─────────────────────────────
 *
 * `EstimateActions.tsx` の「次の版をつくる」（`Copy` アイコン）は**同じ商談・
 * 同じ回の書き直し**（`group_id` を保ち、前の版を `superseded` にする）。
 * ここは**別の回向けの、独立した新しい見積**をつくる — レギュラー案件で
 * 「先に作った回の見積をベースに、次の回の見積を作る」ための操作（`EstimateTab.tsx`
 * から `canDuplicate`（`project.recurrence === 'regular'`）のときだけ呼べる）。
 *
 * ── 明細はそのままコピーする（サーバー側の決めごとと同じ） ─────────────
 *
 * `item_date`/`item_date_end`（スタジオ利用日など）は複製元の回の日付のまま入る。
 * 収録形態によって「正しい日付」が変わるため自動では調整しない — 複製後、
 * 明細タブでユーザーが手直しする前提（`estimate.service.ts` の
 * `duplicateToEpisode` と同じ判断）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';
import type { Estimate } from './EstimateTab';

export function DuplicateEstimateDialog({
  open, onOpenChange, projectId, base, estimate, onDuplicated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** `/projects/:id/estimates` */
  base: string;
  /** 複製元（明細一式をコピーする） */
  estimate: Estimate;
  /** 複製できたら呼ばれる。新しい見積（明細つき）をそのまま渡す */
  onDuplicated: (created: Estimate) => void;
}) {
  const qc = useQueryClient();
  const [episodeId, setEpisodeId] = useState('');

  // **一覧（`EpisodeScopeToggle`・`EpisodesPanel`）と同じ鍵。** すでに読み込み
  // 済みならキャッシュがそのまま使える（1画面で2回引く必要が無い）
  const episodes = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
  });
  // **複製元と同じ回は選ばせない。** 同じ回に複製したいだけなら「次の版をつくる」で足りる
  const candidates = (episodes.data ?? []).filter((e) => e.id !== estimate.episode_id);

  const duplicate = useMutation({
    mutationFn: async () => (await api.post(`${base}/${estimate.id}/duplicate-to-episode`, { episode_id: episodeId })).data.data as Estimate,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['estimates', projectId] });
      notifySuccess(
        '別の回の見積として複製しました',
        { description: '明細はそのままコピーしています。開始日・終了日などは、この回の実施日に合わせて直してください。' },
      );
      onDuplicated(created);
    },
    onError: (e) => notifyApiError('複製できませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="別の回の見積として複製する"
      sub={`v${estimate.version}（${estimate.title || '名前のない見積'}）の明細をコピーして、別の回向けの新しい見積（v1）をつくります。複製元はそのまま残ります。`}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button onClick={() => duplicate.mutate()} disabled={!episodeId || duplicate.isPending}>
            複製する
          </Button>
        </FormDialogFooter>
      }
    >
      <div>
        <Label htmlFor="dup-estimate-episode">複製先の回 *</Label>
        <Select value={episodeId} onValueChange={setEpisodeId}>
          <SelectTrigger id="dup-estimate-episode" className="mt-1"><SelectValue placeholder="回を選ぶ" /></SelectTrigger>
          <SelectContent>
            {candidates.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                #{e.episode_number} {e.title || e.episode_code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {episodes.isSuccess && candidates.length === 0 && (
          <p className="text-sub mt-1 text-muted-foreground">複製できる別の回がありません。先に「回を足す」で回を増やしてください。</p>
        )}
      </div>
    </FormDialog>
  );
}
