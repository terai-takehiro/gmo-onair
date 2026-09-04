/**
 * フェーズごとの受注確度 — お金のルール ⑤ の下（値引きの上限のすぐ下）
 *
 * ── 何に効くか ────────────────────────────────────────────
 *
 * ここで決めた確度は、財務ダッシュボードの「営業見通し（パイプライン）」の
 * **確度加味見込み**（各案件の見込み金額 × 自分が今いるフェーズの確度、を
 * 積み上げた額）に使われる。現場の肌感と数字がずれたまま放っておくと
 * 見通しそのものが信用されなくなるので、決め打ちにせずここで直せるようにする。
 *
 * ── 5フェーズしか出さない ──────────────────────────────────
 *
 * サーバーは8ステージぶんの確度を持つが、`r_delivered`（実施済）・
 * `s_completed`（完了）・`e_lost`（失注）は受注確定後・失注が確定した後の
 * 固定値（100 / 100 / 0）で、業務上ユーザーが手で調整する対象ではない。
 * 表に出すと「何でも触れる」と誤解されるので、調整しうる
 * `neta`/`d_hold`/`c_proposal`/`b_verbal`/`a_won` の5つだけを行にする。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { ProjectStageLabels, type ProjectStage } from '@/types/stages';
import type { StageProbabilityRow } from './rules';

// 業務上ユーザーが調整する対象になる5フェーズだけ・この並び順で出す。
// r_delivered・s_completed・e_lost は固定値なので出さない（ファイル冒頭の説明）
const EDITABLE_STAGES: ProjectStage[] = ['neta', 'd_hold', 'c_proposal', 'b_verbal', 'a_won'];

export function StageProbabilities({ rows, canEdit }: { rows: StageProbabilityRow[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProjectStage | null>(null);
  const [probability, setProbability] = useState('');

  const save = useMutation({
    mutationFn: async (stage: ProjectStage) => api.put(`/stage-probabilities/${stage}`, {
      probability: Number(probability),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stage-probabilities'] });
      setEditing(null);
      notifySuccess('受注確度を保存しました');
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  const open = (stage: ProjectStage, current: number) => {
    setEditing(stage);
    setProbability(String(current));
  };

  const byStage = new Map(rows.map((r) => [r.stage, r]));

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-primary-surface">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">フェーズごとの受注確度</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          財務ダッシュボードの営業見通し（パイプライン）の見込み額に使われます
        </span>
      </div>

      <RowHeader className="hidden sm:flex">
        <RowMain>フェーズ</RowMain>
        <RowSlot w={96} align="right">受注確度</RowSlot>
        {canEdit && <RowSlot w={72} align="right"> </RowSlot>}
      </RowHeader>

      {EDITABLE_STAGES.map((stage) => {
        const row = byStage.get(stage);
        return (
          <div key={stage}>
            <Row density="table" divider stackOnMobile>
              <RowMain>
                <span className="text-list block truncate">{ProjectStageLabels[stage]}</span>
              </RowMain>
              <RowSlot w={96} align="right">
                <span className="text-sub font-number">
                  {row ? `${row.probability} ％` : '—'}
                </span>
              </RowSlot>
              {canEdit && (
                <RowSlot w={72} align="right">
                  <Button
                    variant="outline" size="sm" disabled={!row}
                    onClick={() => row && open(stage, row.probability)}
                  >
                    直す
                  </Button>
                </RowSlot>
              )}
            </Row>

            {editing === stage && (
              <div className="flex flex-wrap items-end gap-3 border-b border-border-faint bg-surface-subtle px-4 py-3">
                <label className="text-note flex flex-col gap-1">
                  受注確度（％）
                  <Input
                    className="w-32" inputMode="numeric" value={probability}
                    onChange={(e) => setProbability(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </label>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={() => setEditing(null)}>やめる</Button>
                  <Button disabled={save.isPending} onClick={() => save.mutate(stage)}>
                    {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                    保存する
                  </Button>
                </div>
                <p className="text-note w-full text-muted-foreground">
                  0〜100 の整数で入力してください。
                </p>
              </div>
            )}
          </div>
        );
      })}

      <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-3 text-muted-foreground">
        受注確定後（実施済・完了）は 100 ％、失注は 0 ％で固定です。ここでは変更できません。
      </p>
    </div>
  );
}
