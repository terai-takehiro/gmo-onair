/**
 * 回（エピソード）を直すダイアログ
 * （`EpisodesPanel.tsx` から分けてある — 1ファイル400行上限のため）
 *
 * ── 何を直せるか ────────────────────────────────────────
 *
 * タイトル・利用日（収録日）・放送日・1日あたりの本数・ステージ。
 *
 * 本数は仕様変更 #16（migration 269）で回ごとに持つようにしたもの。
 * **利用日・放送日・タイトルは 9/2 の仕様変更（調査項目 S5）で足した** —
 * サーバーの `PUT /projects/:id/episodes/:id` は前からこの3つを部分更新できたのに
 * **呼ぶ画面がどこにも無く**、いったん作った回の日付を後から直せなかった
 * （「話数で指定」で作った回は日付を持たないまま残る）。
 * **ステージ（`stage`）は 2026-09 の依頼で足した**（migration 274）——
 * 回があるものは、各回（ひとまとまり）ごとに案件と同じ受注ステージの語彙で
 * ステージを設定できるようにする、という依頼。
 *
 * ⚠️ 「回の単価」（`episode_unit_price`）は同じ依頼で廃止した——1日で複数本撮ると
 * 回あたりの単価が下がるため固定値は成立せず、この画面からは欄ごと削除した。
 * 金額はひとまとまり（見積・確定売上）単位で持つ。
 *
 * ── なぜ回ごとに本数を持つように変えたか ──────────────────────
 *
 * 案件（projects）に1つだけ持つ「取り決め」（migration 262）だと、収録日によって
 * 本数がズレたときに記録する場所が無かった。**回（episodes）が実際の値を持ち、
 * 回ごとに入力・編集できる**ようにした。
 *
 * ── 空欄で保存 = 「決めていない」に戻す（0本と混同しない） ──────────
 *
 * 本数の欄を空欄のまま保存すると `null` を送る（NULL＝決めていない。
 * `RegularSeriesFields.tsx` が案件側で守っていたのと同じ規則）。ステージは
 * 「未設定」を選ぶと同じく `null` を送る。
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';
import type { ProjectStage } from '@/types';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';

/** Radix の `Select.Item` は空文字を value にできないため、「決めていない」はこの値で表す */
const STAGE_UNSET = '__unset';

/** 案件一覧と表記を揃える（`STAGE_BADGE_LABEL` そのまま。並びは受注に近い順） */
const STAGE_ORDER: ProjectStage[] = [
  'neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won', 'r_delivered', 's_completed', 'e_lost',
];

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
  const [stage, setStage] = useState<string>(episode.stage ?? STAGE_UNSET);

  const save = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}/episodes/${episode.id}`, {
      // ここに出している欄だけを明示で送る。空欄は「決めていない」に戻す意図的な解除。
      // 状態・備考はこの画面に無いので**送らない**（送らなければ今の値が保たれる）
      title: title.trim() || null,
      recording_date: recordingDate || null,
      broadcast_date: broadcastDate || null,
      recording_per_day_count: perDayCount.trim() ? Number(perDayCount) : null,
      stage: stage === STAGE_UNSET ? null : stage,
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
      title={`#${episode.episode_number} ${episode.title || episode.episode_code} を編集`}
      sub="利用日・放送日・タイトルと、この回で実際に撮った本数・ステージを入れます。空欄／未設定にすると「決めていない」に戻ります。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>キャンセル</Button>
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
            <Label htmlFor="ep-edit-stage">ステージ</Label>
            <Select value={stage} onValueChange={setStage}>
              {/* Radix の SelectTrigger は button — htmlFor/id を結ぶとラベルのタップで開く */}
              <SelectTrigger id="ep-edit-stage" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={STAGE_UNSET}>未設定</SelectItem>
                {STAGE_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_BADGE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
