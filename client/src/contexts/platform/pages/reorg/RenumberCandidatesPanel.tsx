/**
 * 改番の対象一覧（会社と切替 ⑧・移行センター・`docs/reorg-2026-10-plan.md` §4.8点2・3・5）
 *
 * データは `ReorgPage` が1本 `GET /org-transition/renumber-candidates` を読み、
 * ここへ渡す。**進捗（残件数）もこの同じ配列の `.length` を表題の帯に出すだけ**
 * （§4.8「進捗：残件数・完了件数をこの画面とダッシュボードの帯に出す。数字は同じ
 * API を使い回す」の原則。別の集計 API は作らない）。`TransitionPanel` の
 * `done` ゲートも同じ配列の長さを見る（`ReorgPage` が両方へ渡す）。
 *
 * ダイアログは1つだけ（`target` に選ばれた1件のときだけ開く）。行ごとに
 * ダイアログを持たせない理由は `RenumberRow.tsx` の頭のコメントを参照。
 */
import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import {
  Delayed, SkeletonRows, EmptyState, ErrorPanel,
} from '@gmo-onair/shared/src/client/states';
import { RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { RenumberRow } from './RenumberRow';
import { RenumberDialog } from './RenumberDialog';
import type { RenumberCandidate } from './types';

export function RenumberCandidatesPanel({
  candidates, isLoading, isError, error, onRetry, canEdit,
}: {
  candidates: RenumberCandidate[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  canEdit: boolean;
}) {
  const [target, setTarget] = useState<RenumberCandidate | null>(null);

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-faint px-4 py-3">
        <span className="rounded-note inline-flex h-7 w-7 shrink-0 items-center justify-center bg-warning-surface">
          <ListChecks className="h-4 w-4 text-warning" aria-hidden="true" />
        </span>
        <span className="text-cardtitle shrink-0">改番の対象</span>
        <span className="text-note min-w-0 flex-1 truncate text-muted-foreground">
          発番済みで、現行番号がまだ旧方式（GLS）のままの案件
        </span>
        {candidates && (
          <span className="rounded-note text-note shrink-0 bg-surface-subtle px-2.5 py-1 font-bold text-muted-foreground">
            残り {candidates.length} 件
          </span>
        )}
      </div>

      {isError ? (
        <ErrorPanel
          className="m-4"
          title="対象一覧を読み込めませんでした"
          error={error}
          onRetry={onRetry}
        />
      ) : isLoading || !candidates ? (
        <Delayed><SkeletonRows rows={4} /></Delayed>
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6" aria-hidden="true" />}
          title="対象案件はありません"
          description="発番済みで改番が必要な案件がいまはありません。状態が「準備中」以降に進むと、対象になった案件がここに出ます。"
        />
      ) : (
        <div className="overflow-x-auto">
          <RowHeader>
            <RowMain>案件名</RowMain>
            <RowSlot w={96}>現在の番号</RowSlot>
            <RowSlot w={96}>実施日</RowSlot>
            <RowSlot w={160}>お客様</RowSlot>
            <RowSlot w={96}>グループ内外</RowSlot>
            <RowSlot w={72}>計上会社</RowSlot>
            <RowSlot w={200}>止める理由</RowSlot>
            <RowSlot w={128} align="right"> </RowSlot>
          </RowHeader>
          {candidates.map((c) => (
            <RenumberRow
              key={c.project_id}
              candidate={c}
              canEdit={canEdit}
              onRenumber={() => setTarget(c)}
            />
          ))}
        </div>
      )}

      {target && (
        <RenumberDialog
          candidate={target}
          open={!!target}
          onOpenChange={(v) => { if (!v) setTarget(null); }}
        />
      )}
    </div>
  );
}
