/**
 * 「回（エピソード）」の簡易一覧（v4・タスクタブへ移設）
 *
 * ── なぜここにあるのか ──────────────────────────────────────
 *
 * 旧「エピソード」タブは最新モック（`v4-live-sales.dc.html`）の見えるタブバーに
 * 無い（概要／やり取り／タスク／見積／書類／当日／ふりかえりの7つだけ）。
 * モックの中には「回（エピソード）」の絵（回・名前・実施日・タスク進捗・状態の
 * 5列の表 ＋「回を足す」ボタン）自体は残っているが、どのタブにも紐づいていない
 * 死んだコードだった（`docs/v4-mock-deviations.md` 参照）。
 *
 * タブごと外すと、**回を新しく作る手段が無くなる**。`EpisodeScopeToggle`
 * （このすぐ下に出る絞り込み）もスタジオ予約ダイアログも「既存の回から選ぶ」
 * だけで、作る口を持たない。レギュラー（GLS-A）案件は今日も回を増やしながら
 * 運用しているので、モックの簡易表と「回を足す」ボタンだけをこの絞り込みの
 * すぐ隣に残した（ご判断）。
 *
 * ── 中身は自分で作った（レガシー `BusinessProjectView` は使わない） ─────
 *
 * 見積・売上・仕入は見積・請求タブの持ち物なのでここには出さない。
 * 列は `GET /projects/:id/episodes` が返す集計値（タスク件数・完了件数）
 * だけで組める。
 *
 * ── 状態は自動で決める ─────────────────────────────────────
 *
 * `episodes.status` は自由文で運用されておらず、誰も書いていない。
 * 旧モックの「各回の状態は工程の進み方で自動で決まります」という決めごとを
 * そのまま踏襲し、**タスクの完了件数から導出する**（未着手／進行中／完了）。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { Episode } from '@gmo-onair/shared/src/types';

type EpisodeState = 'todo' | 'doing' | 'done';

function stateOf(e: Episode): EpisodeState {
  const total = e.task_count ?? 0;
  const done = e.task_done_count ?? 0;
  if (total === 0 || done === 0) return 'todo';
  if (done >= total) return 'done';
  return 'doing';
}

const STATE_LABEL: Record<EpisodeState, string> = { todo: '未着手', doing: '進行中', done: '完了' };
const STATE_TONE: Record<EpisodeState, string> = {
  todo: 'border-transparent bg-muted text-muted-foreground',
  doing: 'border-transparent bg-primary-surface text-primary',
  done: 'border-transparent bg-success-surface text-success',
};

/** 実施日。収録日が無ければ放送日にフォールバックする（生放送は収録＝放送のため） */
function dateOf(e: Episode): string | null {
  return e.recording_date || e.broadcast_date || null;
}

function AddEpisodesDialog({
  open, onOpenChange, projectId,
}: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string }) {
  const [count, setCount] = useState('1');
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/episodes/batch`, { count: Number(count) || 1 }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['episodes', projectId] });
      const n = Array.isArray(r.data?.data) ? r.data.data.length : Number(count) || 1;
      notifySuccess(`回を${n}件足しました`);
      onOpenChange(false);
      setCount('1');
    },
    onError: (e) => notifyApiError('回を足せませんでした', e),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="回を足す"
      sub="次の話数から連番で作ります。あとから実施日・タスクを回ごとに入れられます。"
      footer={
        <FormDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>やめる</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || Number(count) < 1}>
            足す
          </Button>
        </FormDialogFooter>
      }
    >
      <div>
        <Label htmlFor="ep-count">追加する数</Label>
        <Input
          id="ep-count" type="number" min={1} max={100} className="mt-1"
          value={count} onChange={(e) => setCount(e.target.value)}
        />
      </div>
    </FormDialog>
  );
}

export function EpisodesPanel({ projectId }: { projectId: string }) {
  const [addOpen, setAddOpen] = useState(false);

  const list = useQuery<Episode[]>({
    queryKey: ['episodes', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/episodes`, { params: { limit: 200 } })).data.data,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-cardtitle">回（エピソード）</p>
        <p className="text-sub text-muted-foreground">回ごとにタスクと予約を持ちます</p>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />回を足す
        </Button>
      </div>

      {list.isLoading ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState
          title="回はまだありません"
          description="「回を足す」で最初の回をつくります。"
          action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />回を足す</Button>}
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <RowHeader className="hidden sm:flex">
            <RowSlot w={56}>回</RowSlot>
            <RowMain>名前</RowMain>
            <RowSlot w={96}>実施日</RowSlot>
            <RowSlot w={128}>タスク</RowSlot>
            <RowSlot w={96}>状態</RowSlot>
          </RowHeader>
          {(list.data ?? []).map((e) => {
            const total = e.task_count ?? 0;
            const done = e.task_done_count ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const st = stateOf(e);
            return (
              <Row key={e.id} divider stackOnMobile align="center">
                <RowSlot w={56}>
                  <span className="text-list font-number font-bold">{e.episode_number}</span>
                </RowSlot>
                <RowMain>
                  <span className="text-list block truncate">{e.title || e.episode_code}</span>
                </RowMain>
                <RowSlot w={96}>
                  <span className="text-sub font-number">{dateOf(e)?.replace(/-/g, '/') ?? '—'}</span>
                </RowSlot>
                <RowSlot w={128}>
                  {total > 0 ? (
                    <span className="flex w-full items-center gap-2">
                      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="font-number text-sub-sm w-8 shrink-0 text-right text-muted-foreground">{pct}%</span>
                    </span>
                  ) : (
                    <span className="text-sub-sm text-muted-foreground">—</span>
                  )}
                </RowSlot>
                <TableBadge w={96} label={STATE_LABEL[st]} className={STATE_TONE[st]} />
              </Row>
            );
          })}
        </div>
      )}

      <AddEpisodesDialog open={addOpen} onOpenChange={setAddOpen} projectId={projectId} />
    </div>
  );
}
