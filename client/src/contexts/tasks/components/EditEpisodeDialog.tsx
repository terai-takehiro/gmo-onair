/**
 * 回（エピソード）を直すダイアログ
 * （`EpisodesPanel.tsx` から分けてある — 1ファイル400行上限のため）
 *
 * ── 何を直せるか ────────────────────────────────────────
 *
 * タイトル・利用日（収録日）・放送日・1日あたりの本数・回の単価。
 *
 * 本数と単価は仕様変更 #16（migration 269）で回ごとに持つようにしたもの。
 * **利用日・放送日・タイトルは 9/2 の仕様変更（調査項目 S5）で足した** —
 * サーバーの `PUT /projects/:id/episodes/:id` は前からこの3つを部分更新できたのに
 * **呼ぶ画面がどこにも無く**、いったん作った回の日付を後から直せなかった
 * （「話数で指定」で作った回は日付を持たないまま残る）。
 *
 * ── なぜ回ごとに本数・単価を持つように変えたか ──────────────────
 *
 * 案件（projects）に1つだけ持つ「取り決め」（migration 262）だと、収録日によって
 * 本数・単価がズレたときに記録する場所が無かった。この2つは
 * **回（episodes）が実際の値を持ち、回ごとに入力・編集できる**ようにした。
 *
 * ── 空欄で保存 = 「決めていない」に戻す（0本・¥0と混同しない） ──────
 *
 * どの欄も空欄のまま保存すると `null` を送る（NULL＝決めていない。
 * `RegularSeriesFields.tsx` が案件側で守っていたのと同じ規則）。
 * ⚠️ **送らない項目はサーバーが今の値を保つ**（部分更新の原則）。ここでは
 * 状態（`status`）・備考（`notes`）を持たないので、**送らない**
 * （送ると空で消える。v4.5.19 でこの API に実害バグがあった箇所）。
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
  const [title, setTitle] = useState(episode.title ?? '');
  const [recordingDate, setRecordingDate] = useState(episode.recording_date ?? '');
  const [broadcastDate, setBroadcastDate] = useState(episode.broadcast_date ?? '');
  const [perDayCount, setPerDayCount] = useState(
    episode.recording_per_day_count != null ? String(episode.recording_per_day_count) : '',
  );
  const [unitPrice, setUnitPrice] = useState(
    episode.episode_unit_price != null ? String(episode.episode_unit_price) : '',
  );

  const save = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}/episodes/${episode.id}`, {
      // ここに出している欄だけを明示で送る。空欄は「決めていない」に戻す意図的な解除。
      // 状態・備考はこの画面に無いので**送らない**（送らなければ今の値が保たれる）
      title: title.trim() || null,
      recording_date: recordingDate || null,
      broadcast_date: broadcastDate || null,
      recording_per_day_count: perDayCount.trim() ? Number(perDayCount) : null,
      episode_unit_price: unitPrice.trim() ? Number(unitPrice) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      // 収録日を直すと「収録日ごとの請求まとめ」の束ね方が変わる
      qc.invalidateQueries({ queryKey: ['invoice-groups', projectId] });
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
      sub="利用日・放送日・タイトルと、この回で実際に撮った本数・単価を入れます。空欄にすると「決めていない」に戻ります。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>保存する</Button>
        </FormDialogFooter>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="ep-edit-title">タイトル</Label>
          <Input
            id="ep-edit-title" type="text" className="mt-1"
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder={episode.episode_code}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ep-edit-recording">利用日（収録日）</Label>
            <Input
              id="ep-edit-recording" type="date" className="mt-1"
              value={recordingDate} onChange={(e) => setRecordingDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ep-edit-broadcast">放送日</Label>
            <Input
              id="ep-edit-broadcast" type="date" className="mt-1"
              value={broadcastDate} onChange={(e) => setBroadcastDate(e.target.value)}
            />
            {/* サーバーは生放送を含む案件で放送日を収録日に揃える（`PUT /:id` の規則）。
                入れた日と違う日で保存されると「直らなかった」と見えるので先に書く */}
            <p className="text-sub-sm mt-1 text-muted-foreground">
              生放送の案件では、保存すると収録日と同じ日になります。
            </p>
          </div>
        </div>

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
      </div>
    </FormDialog>
  );
}
