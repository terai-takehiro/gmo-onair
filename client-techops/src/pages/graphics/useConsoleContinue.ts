// テロップCG — 送出コンソールの「続き」ボタンの実処理。GraphicsConsolePage.tsx 専用の
// 切り出し（400行の目安を超えないため。ロジック自体はこのファイルだけで完結する）。
//
// 対応部品は2種類あり、進行の仕組みが違う（詳細は outputParts.tsx の `pageSupportsReveal`・
// voteParts.tsx の `VoteResult` コメント）:
//   - `list`（一覧表）・`score`（スコアボード）: cue の `reveal_phase`（段6-1の汎用機構。
//     TAKE のたびに0へリセットされる）を+1する
//   - `vote`（投票・クイズ）: `fields.voteState` を直接進める（`PUT /pages/:id`・
//     ScoreQuickAdjust と同じ「fields をその場で書き換えて `cg:sync` で同報」の経路。
//     `reveal_phase` に乗せると、既に開票済みで運用中の既存ページまで TAKE 1回で
//     「出題中」へ巻き戻ってしまい後方互換が壊れるため、意図的に別経路にしている）
import type { MutableRefObject } from 'react';
import type { Socket } from 'socket.io-client';
import {
  continueGraphicsCue, updateGraphicsPage,
  type GraphicsCueRow, type GraphicsPageRow, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { emitCgContinue } from '@/lib/graphicsSocket';
import { notifyError } from '@/lib/notify';
import { pageSupportsReveal } from './outputParts';
import { withVoteStateAdvanced, withVoteStateReset } from './voteState';

export function useConsoleContinue({
  projectId, livePages, socketRef, setCuesFromRows,
}: {
  projectId: string;
  livePages: GraphicsPageRow[];
  socketRef: MutableRefObject<Socket | null>;
  /** REST フォールバック経由で返った cue 一覧（配列）を画面の cues state に反映する */
  setCuesFromRows: (rows: GraphicsCueRow[]) => void;
}) {
  // 対象は PVW ではなく PGM（`livePages`）——複数対象があっても最初の1枚だけを送る
  // （実運用ではフルスクリーンは1枠しかないため通常は高々1枚）
  const continueTarget = livePages.find(pageSupportsReveal) ?? null;

  const sendContinue = async (page: GraphicsPageRow) => {
    if (page.partKey === 'vote') {
      try {
        await updateGraphicsPage(page.id, { fields: withVoteStateAdvanced(page.fields) });
      } catch {
        notifyError('投票の進行状態を進められませんでした', { description: 'サーバーとの接続を確認してください。' });
      }
      return;
    }
    const socket = socketRef.current;
    if (socket?.connected) {
      emitCgContinue(socket, page.slot);
      return;
    }
    try {
      const next = await continueGraphicsCue(projectId, page.slot as GraphicsSlot);
      setCuesFromRows(next);
    } catch {
      notifyError('「続き」の指示を送れませんでした', { description: 'サーバーとの接続を確認してください。' });
    }
  };

  /**
   * TAKE で投票・クイズを「出題中」へ戻す（背景メモ§3「新しいTAKEで状態がopenにリセット
   * されること」）。`fields.voteState` はページ側の値なので放っておくと引き継がれてしまう
   * ため、TAKE 時に明示的に書き戻す。ページが乗る**前**に fields を直すので、オンエアの
   * 一瞬だけ前回の開票結果が見えることは無い（失敗しても TAKE 自体は続ける——進行状態は
   * 「続き」ボタンで手動でも直せるので、catch は無視でよい）。
   */
  const resetVoteStateForTake = async (page: GraphicsPageRow) => {
    if (page.partKey !== 'vote') return;
    try {
      await updateGraphicsPage(page.id, { fields: withVoteStateReset(page.fields) });
    } catch {
      // 無視 — 上のコメント参照
    }
  };

  return { continueTarget, sendContinue, resetVoteStateForTake };
}
