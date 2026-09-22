/**
 * `treeMove.ts` が立てた計画をサーバーに流すところ
 *
 * ドラッグ・「上へ／下へ」・「別のページの下へ」の3つが同じここを通ります。
 *
 * ⚠️ **1件ずつ順番に送ります。** 並べ替えを同時に投げると、サーバー側は
 * それぞれ別の更新なので、届いた順によっては途中の並びが残ります。
 * 数は多くて十数件（同じ親の子の数）なので、順番に待って構いません。
 */
import { useCallback, useState } from 'react';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { moveWikiPage, useWikiRefresh, type MoveWikiPageInput } from './pageOpsApi';
import type { WikiMoveOp } from './treeMove';

export interface UseWikiTreeMoveResult {
  /** 計画を流す。空の計画なら何もしない（押しても動かない場所に落としたとき） */
  run: (ops: WikiMoveOp[], what: string) => Promise<void>;
  moving: boolean;
}

export function useWikiTreeMove(spaceKey: string | null | undefined): UseWikiTreeMoveResult {
  const refresh = useWikiRefresh();
  const [moving, setMoving] = useState(false);

  const run = useCallback(
    async (ops: WikiMoveOp[], what: string) => {
      if (ops.length === 0) return;
      setMoving(true);
      try {
        for (const op of ops) {
          const input: MoveWikiPageInput = { parent_id: op.parent_id, sort_order: op.sort_order };
          // 1件ずつ順番に（この文書の冒頭の注記）
          await moveWikiPage(op.id, input);
        }
        refresh.tree(spaceKey);
        notifySuccess(`${what}を動かしました`);
      } catch (err) {
        notifyApiError(`${what}を動かせませんでした`, err);
        // 途中まで通っている場合があるので、必ず読み直す
        refresh.tree(spaceKey);
      } finally {
        setMoving(false);
      }
    },
    [refresh, spaceKey],
  );

  return { run, moving };
}
