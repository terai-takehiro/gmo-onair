// 会場図面（新ミニアプリ）— 図面まるごとの元に戻す・やり直す（直近50手）。
// `client-techops/src/pages/opsmanual/useManualHistory.ts` の写し（設計:
// docs/design/v4/venue-layout.md §6②「Ctrl+Z／Ctrl+Shift+Z｜図面単位で50手」）。
//
// 運営マニュアルの版はページ単位で `<ManualCanvas key={pageId}>` として作り直す
// ことで履歴をリセットしていたが、会場図面には「ページ」の概念が無く図面1件が
// そのまま単位なので、ここは型引数化した上でそのまま `VenueEditorPage` に置く
// （キャンバス側に埋め込まない — 置く／並べる／右パネルからの commit も同じ
// 履歴に積みたいため）。
import { useEffect, useRef } from "react";

const HISTORY_LIMIT = 50;

interface UseVenueHistoryOptions<T> {
  items: T[];
  onCommit: (next: T[]) => void;
  limit?: number;
}

export interface VenueHistory<T> {
  commit: (next: T[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useVenueHistory<T>({ items, onCommit, limit = HISTORY_LIMIT }: UseVenueHistoryOptions<T>): VenueHistory<T> {
  const pastRef = useRef<T[][]>([]);
  const futureRef = useRef<T[][]>([]);
  const currentRef = useRef<T[]>(items);

  // 親から来た `items` が変わるたび（commit/undo/redo による更新も含む）に
  // 「いまの状態」を同期する。サーバーからの再取得で置き換わったときは
  // 単に基準点がずれるだけで、履歴自体は作り直さない。
  useEffect(() => {
    currentRef.current = items;
  }, [items]);

  function commit(next: T[]) {
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

  return { commit, undo, redo, canUndo: pastRef.current.length > 0, canRedo: futureRef.current.length > 0 };
}
