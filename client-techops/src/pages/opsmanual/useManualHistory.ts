// キャンバス（ManualCanvas）の「元に戻す・やり直す」— ページ単位で直近50手（段Bのスコープ）。
//
// `blocks` は親（呼び出し側）が真実の源として持つ配列。undo/redo もその配列を
// 差し替える形で行うため、`commit`/`undo`/`redo` はいずれも最終的に親の `onCommit`
// を呼び、親のステート更新 → props の `blocks` 更新という経路を通す（＝undo した
// 内容も自動保存の対象になる。§6-2-1 の楽観ロック運用でも「戻した」は保存すべき変更）。
import { useEffect, useRef } from "react";
import type { ManualBlock } from "@gmo-onair/shared/src/opsmanual/types";

const HISTORY_LIMIT = 50;

interface UseManualHistoryOptions {
  blocks: ManualBlock[];
  onCommit: (next: ManualBlock[]) => void;
  limit?: number;
}

export interface ManualHistory {
  commit: (next: ManualBlock[]) => void;
  undo: () => void;
  redo: () => void;
}

export function useManualHistory({ blocks, onCommit, limit = HISTORY_LIMIT }: UseManualHistoryOptions): ManualHistory {
  const pastRef = useRef<ManualBlock[][]>([]);
  const futureRef = useRef<ManualBlock[][]>([]);
  const currentRef = useRef<ManualBlock[]>(blocks);

  // 親から来た `blocks` が変わるたび（自分の commit/undo/redo による更新も含む）に
  // 「いまの状態」を同期する。ページ切り替え等で親が別の配列を渡してきたときも
  // これで追随する（そのときは undo 履歴を作り直さない — 単に基準点がずれるだけ）。
  useEffect(() => {
    currentRef.current = blocks;
  }, [blocks]);

  function commit(next: ManualBlock[]) {
    pastRef.current = [...pastRef.current, currentRef.current].slice(-limit);
    futureRef.current = [];
    currentRef.current = next;
    onCommit(next);
  }

  function undo() {
    const past = pastRef.current;
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [currentRef.current, ...futureRef.current].slice(0, limit);
    currentRef.current = prev;
    onCommit(prev);
  }

  function redo() {
    const future = futureRef.current;
    if (future.length === 0) return;
    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, currentRef.current].slice(-limit);
    currentRef.current = next;
    onCommit(next);
  }

  return { commit, undo, redo };
}
