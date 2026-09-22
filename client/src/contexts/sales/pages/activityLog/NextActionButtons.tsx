/**
 * 次のアクションの操作ボタン（完了 / 延期 / 編集） (v4)
 *
 * ── 言葉の決めごと（`docs/wording.md` ルール8・9）──────────────
 *
 * ✕「できた」「期限をずらす」「＋1週」「直す」 →
 * ○「完了」「延期」「1週間延期」「編集」。利用者から口語表現への明示のご指摘があった。
 *
 * ── なぜ2段階にするか ──────────────────────────────────────
 *
 * 延期は**先の日付を選んでから**実行します（`ActivityRows.tsx` の
 * `NextActionInline` と同じ形）。押した瞬間に1週間延びると、取り消す手段が
 * この画面に無いまま期限だけが動きます。**完了は1押し**で構いません
 * （もう一度「完了」を押しても状態は変わらない）。
 *
 * ── 編集を必ず置く ──────────────────────────────────────────
 *
 * 利用者のご指摘3「案件詳細に『見学日程打診』のような行が出るが編集できず、
 * 関係なくなっても残る」への対応。**完了でも延期でもない終わり方**（そもそも不要
 * だった）があるので、本文と期限を直せる導線を操作の並びに入れておく。
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { useNextActionActions } from './useNextActionActions';

const BTN = 'min-h-tap px-2 text-xs lg:min-h-0';

export function NextActionButtons({
  id, actions, onEdit,
}: {
  id: string;
  actions: ReturnType<typeof useNextActionActions>;
  /** 未指定なら「編集」を出さない（`sales` の editor 権限が無い人には押せない） */
  onEdit?: (id: string) => void;
}) {
  const [postponing, setPostponing] = useState(false);

  if (postponing) {
    return (
      <span className="inline-flex shrink-0 flex-wrap items-center gap-1">
        <Button
          size="sm" variant="outline" className={BTN} disabled={actions.isPending}
          onClick={() => { actions.postponeTomorrow(id); setPostponing(false); }}
        >
          明日
        </Button>
        <Button
          size="sm" variant="outline" className={BTN} disabled={actions.isPending}
          onClick={() => { actions.postponeWeek(id); setPostponing(false); }}
        >
          1週間
        </Button>
        <Button size="sm" variant="ghost" className={BTN} onClick={() => setPostponing(false)}>
          キャンセル
        </Button>
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 flex-wrap items-center gap-1">
      <Button
        size="sm" variant="outline" className={BTN} disabled={actions.isPending}
        onClick={() => actions.complete(id)}
      >
        完了
      </Button>
      <Button size="sm" variant="outline" className={BTN} onClick={() => setPostponing(true)}>
        延期
      </Button>
      {onEdit && (
        <Button size="sm" variant="ghost" className={BTN} onClick={() => onEdit(id)}>
          編集
        </Button>
      )}
    </span>
  );
}
