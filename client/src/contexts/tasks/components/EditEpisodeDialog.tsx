/**
 * 回（エピソード）ごとの「1日あたりの本数」「回の単価」を直すダイアログ
 * （仕様変更 #16・migration 269・`EpisodesPanel.tsx` から分けてある — 1ファイル400行上限のため）。
 *
 * ── なぜ回ごとに持つように変えたか ──────────────────────────────
 *
 * 案件（projects）に1つだけ持つ「取り決め」（migration 262）だと、収録日によって
 * 本数・単価がズレたときに記録する場所が無かった。この2つは
 * **回（episodes）が実際の値を持ち、回ごとに入力・編集できる**ようにした。
 *
 * ── 空欄で保存 = 「決めていない」に戻す（0本・¥0と混同しない） ──────
 *
 * どちらも空欄のまま保存すると `null` を送る（NULL＝決めていない。
 * `RegularSeriesFields.tsx` が案件側で守っていたのと同じ規則）。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';

export function EditEpisodeDialog({
  open, onOpenChange, projectId, episode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  episode: Episode;
}) {
  const qc = useQueryClient();
  const [perDayCount, setPerDayCount] = useState(
    episode.recording_per_day_count != null ? String(episode.recording_per_day_count) : '',
  );
  const [unitPrice, setUnitPrice] = useState(
    episode.episode_unit_price != null ? String(episode.episode_unit_price) : '',
  );

  const save = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}/episodes/${episode.id}`, {
      // 既存の他項目 (title/recording_date 等) はこの画面から触らないので送らない
      // ('渡さなければ今の値を保つ' — ただしこの2つは常に明示で送る。
      // 空欄は「決めていない」に戻す意図的な解除)
      recording_per_day_count: perDayCount.trim() ? Number(perDayCount) : null,
      episode_unit_price: unitPrice.trim() ? Number(unitPrice) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      notifySuccess('回を更新しました');
      onOpenChange(false);
    },
    onError: (e) => notifyApiError('回を更新できませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`#${episode.episode_number} ${episode.title || episode.episode_code} を直す`}
      sub="この回で実際に撮った本数・単価を入れます。空欄にすると「決めていない」に戻ります。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>保存する</Button>
        </FormDialogFooter>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ep-edit-per-day">1日あたりの本数</Label>
          <Input
            id="ep-edit-per-day" type="number" min="1" inputMode="numeric" className="mt-1"
            value={perDayCount} onChange={(e) => setPerDayCount(e.target.value)}
            placeholder="1"
          />
        </div>
        <div>
          <Label htmlFor="ep-edit-price">回の単価</Label>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sub shrink-0 text-muted-foreground">¥</span>
            <Input
              id="ep-edit-price" type="number" min="0" inputMode="numeric"
              value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="84000"
            />
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
