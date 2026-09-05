/**
 * 「複数の回をまとめて見積をつくる」ダイアログ（仕様変更 #18・#20）
 *
 * 依頼:「見積もりは回ごとというかひとまとまり毎にする（1日で複数本撮影したら、
 * それは回ごとではなく、その日毎で見積もりをだす）。回は1つだけでなく複数入る
 * 可能性がある」。`EstimateTab.tsx` の「見積をつくる」（絞り込みなしなら案件全体・
 * 絞り込みありならその回1つ）はどちらも単一の行き先しか選べないため、
 * レギュラー案件専用にこの入口を別に作った。チェックボックスで1件以上の回を選び、
 * `episode_ids` として渡す（1件だけ選べば「その回だけの見積」と同じ結果になる）。
 *
 * `EstimateTab.tsx` を400行の上限に収めるため新規ファイルに切り出した
 * （`DuplicateEstimateDialog.tsx` と同じ理由・同じ作り）。
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';
import type { Estimate } from './EstimateTab';

export function MultiEpisodeEstimateDialog({
  open, onOpenChange, projectId, base, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** `/projects/:id/estimates` */
  base: string;
  /** 作れたら呼ばれる。新しくできた見積をそのまま渡す */
  onCreated: (created: Estimate) => void;
}) {
  const qc = useQueryClient();
  const [episodeIds, setEpisodeIds] = useState<string[]>([]);

  // **一覧（`EpisodeScopeToggle`・`useEstimateEpisodeFilter`）と同じ鍵。** すでに
  // 読み込み済みならキャッシュがそのまま使える（1画面で2回引く必要が無い）
  const episodes = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
  });

  const toggle = (id: string, checked: boolean) => {
    setEpisodeIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const create = useMutation({
    mutationFn: async () => (await api.post(base, {
      title: '', tax_category: 'tax10', customer_id: null, episode_ids: episodeIds,
    })).data.data as Estimate,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['estimates', projectId] });
      notifySuccess('見積をつくりました');
      onCreated(created);
    },
    onError: (e) => notifyApiError('見積をつくれませんでした', e, '選んだ回を確かめて、もう一度お試しください。'),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="まとめて見積をつくる"
      sub="1日で複数本撮った日など、選んだ回をまとめて1本の見積にします。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
          <Button onClick={() => create.mutate()} disabled={episodeIds.length === 0 || create.isPending}>
            つくる
          </Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-1.5">
        {(episodes.data ?? []).map((ep) => (
          <label
            key={ep.id}
            className="text-sub flex min-h-tap items-center gap-2 rounded-control-sm px-1.5 hover:bg-muted"
          >
            <Checkbox
              checked={episodeIds.includes(ep.id)}
              onCheckedChange={(v) => toggle(ep.id, v === true)}
            />
            #{ep.episode_number} {ep.title || ep.episode_code}
          </label>
        ))}
        {episodes.isSuccess && (episodes.data ?? []).length === 0 && (
          <p className="text-sub text-muted-foreground">この案件にはまだ回がありません。先に「回を追加」で回を増やしてください。</p>
        )}
      </div>
    </FormDialog>
  );
}
