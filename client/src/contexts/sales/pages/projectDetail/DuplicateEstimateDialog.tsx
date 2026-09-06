/**
 * 「別の回の見積として複製する」ダイアログ（仕様変更 #18・#20）
 *
 * ── 「次の版をつくる」とは別の操作 ─────────────────────────────
 *
 * `EstimateActions.tsx` の「次の版をつくる」（`Copy` アイコン）は**同じ商談・
 * 同じ回（の組）の書き直し**（`group_id` を保ち、前の版を `superseded` にする）。
 * ここは**別の回（の組）向けの、独立した新しい見積**をつくる — レギュラー案件で
 * 「先に作った回の見積をベースに、次の回の見積を作る」ための操作（`EstimateTab.tsx`
 * から `canDuplicate`（`project.recurrence === 'regular'`）のときだけ呼べる）。
 * **複数の回を選べる**（1日で複数本撮った日をひとまとまりで複製したいとき・仕様変更 #20）。
 *
 * ── 入口は2つある（どちらもこのダイアログを開く） ────────────────
 *
 * ① 版の一覧の操作ボタン（`EstimateActions.tsx` の `Files`）— 複製元がその版に決まる
 * ② 見積タブの上の「別の回の見積をベースに作る」— **複製元もここで選ぶ**（`estimate` が
 *    `null` で開く）。①はアイコンだけで、版の右端に他のボタンと一緒に並ぶため見つけにくく、
 *    「実装したのに使われない」状態だった（ユーザー報告「修正されていない」の中身）。
 *
 * ── 明細はそのままコピーする（サーバー側の決めごとと同じ） ─────────────
 *
 * `item_date`/`item_date_end`（スタジオ利用日など）は複製元の回の日付のまま入る。
 * 収録形態によって「正しい日付」が変わるため自動では調整しない — 複製後、
 * 明細タブでユーザーが手直しする前提（`estimate.service.ts` の
 * `duplicateToEpisodes` と同じ判断）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';
import type { Estimate } from './EstimateTab';

export function DuplicateEstimateDialog({
  open, onOpenChange, projectId, base, estimate, sources, onDuplicated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** `/projects/:id/estimates` */
  base: string;
  /** 複製元（明細一式をコピーする）。**`null` なら複製元もこの画面で選ばせる** */
  estimate: Estimate | null;
  /** 複製元の候補（`estimate` が `null` のときだけ使う。見積タブが持っている一覧） */
  sources?: Estimate[];
  /** 複製できたら呼ばれる。新しい見積（明細つき）をそのまま渡す */
  onDuplicated: (created: Estimate) => void;
}) {
  const qc = useQueryClient();
  const [episodeIds, setEpisodeIds] = useState<string[]>([]);
  // 複製元を選ばせる形で開いたとき用。呼び手が複製元を決めているときはそちらが勝つ
  const [sourceId, setSourceId] = useState('');
  const source = estimate ?? (sources ?? []).find((e) => e.id === sourceId) ?? null;

  // **一覧（`EpisodeScopeToggle`・`EpisodesPanel`）と同じ鍵。** すでに読み込み
  // 済みならキャッシュがそのまま使える（1画面で2回引く必要が無い）
  const episodes = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
  });
  // **候補から機械的に除外するのはやめた**（仕様変更 #20）。複製元が複数回を
  // 持てるようになり、「一部だけ重複」は許可（サーバーが「まったく同じ組」だけを
  // 400 で弾く）。フロントは「まったく同じ組を選んだら送信を止める」親切さだけ残す
  const sourceEpisodeIds = source?.episode_ids ?? [];
  const sameSet = episodeIds.length > 0
    && episodeIds.length === sourceEpisodeIds.length
    && episodeIds.every((id) => sourceEpisodeIds.includes(id));

  const toggleEpisode = (id: string, checked: boolean) => {
    setEpisodeIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  /**
   * 複製元を選び直す。**複製先の選択はその場でリセットする**（仕様変更 #20 での簡略化）。
   * 複製元が複数回を持てるようになったことで「新しい複製元とまったく同じ組に
   * なったときだけ外す」ような部分一致の追跡は複雑になりすぎる割に価値が薄いと判断した
   * ——複製元を切り替えたら選び直してもらう、という単純な仕様にしている。
   */
  const pickSource = (id: string) => {
    setSourceId(id);
    setEpisodeIds([]);
  };

  const duplicate = useMutation({
    mutationFn: async () => (await api.post(`${base}/${source?.id}/duplicate-to-episodes`, { episode_ids: episodeIds })).data.data as Estimate,
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
      sub={source
        ? `v${source.version}（${source.title || '名前のない見積'}）の明細をコピーして、選んだ回向けの新しい見積（v1）を作成します。複製元はそのまま残ります。`
        : 'ベースにする見積と、その明細をコピーする先の回を選びます。複製元はそのまま残ります。'}
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={() => duplicate.mutate()} disabled={!source || episodeIds.length === 0 || sameSet || duplicate.isPending}>
            複製する
          </Button>
        </FormDialogFooter>
      }
    >
      {/* 複製元は、版の一覧のボタンから開いたときは決まっている（選ばせない）。
          見積タブの上のボタンから開いたときだけ、ここで選ぶ */}
      {!estimate && (
        <div className="mb-3">
          <Label htmlFor="dup-estimate-source">ベースにする見積 *</Label>
          <Select value={sourceId} onValueChange={pickSource}>
            <SelectTrigger id="dup-estimate-source" className="mt-1"><SelectValue placeholder="見積を選ぶ" /></SelectTrigger>
            <SelectContent>
              {(sources ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  v{e.version} {e.title || '名前のない見積'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(sources ?? []).length === 0 && (
            <p className="text-sub mt-1 text-muted-foreground">ベースにできる見積がまだありません。</p>
          )}
        </div>
      )}
      <div>
        <Label>複製先の回 *（複数選べます）</Label>
        <div className="mt-1 flex flex-col gap-1.5">
          {(episodes.data ?? []).map((e) => (
            <label
              key={e.id}
              className="text-sub flex min-h-tap items-center gap-2 rounded-control-sm px-1.5 hover:bg-muted"
            >
              <Checkbox
                checked={episodeIds.includes(e.id)}
                onCheckedChange={(v) => toggleEpisode(e.id, v === true)}
              />
              #{e.episode_number} {e.title || e.episode_code}
            </label>
          ))}
          {episodes.isSuccess && (episodes.data ?? []).length === 0 && (
            <p className="text-sub text-muted-foreground">複製できる回がありません。先に「回を追加」で回を増やしてください。</p>
          )}
        </div>
        {sameSet && (
          <p className="text-sub mt-1 text-amber-600 dark:text-amber-500">
            複製元とまったく同じ回の組です。同じ組には複製できません（書き直すなら「次の版をつくる」です）。
          </p>
        )}
      </div>
    </FormDialog>
  );
}
