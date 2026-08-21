// ページ単位の項目コミットキュー。実装設計: 04-schedule-impl.md §4-2 (b)
//
// ⚠️ このキューは行コンポーネントの中に置かない。`BufferedInput` はアンマウント時にも
// commit を flush するため、行が消えた・シートを閉じた直後に commit が飛ぶと、
// キューが行と一緒に消えて打鍵が失われる。→ `SchedulePage`（ページ）の `useRef` に置く。
//
// - 同じ項目への PUT は同時に1本だけ（in-flight は1本・後続は最新1件だけキュー）。
// - `expected_updated_at` は「画面が最後にサーバーから受け取った値」。ここで rotate する。
// - 409 になった項目だけを `conflictedIds` に入れる（他の項目は触れたまま）。
import { useCallback, useRef, useState } from "react";
import { isConflict } from "@/lib/scheduleApi";

interface QueueEntry {
  inFlight: boolean;
  updatedAt: string;
  queuedRun: (() => Promise<{ updated_at: string }>) | null;
}

export default function useItemCommitQueue() {
  const entries = useRef<Map<string, QueueEntry>>(new Map());
  const [conflictedIds, setConflictedIds] = useState<Set<string>>(new Set());

  const markConflict = useCallback((itemId: string) => {
    setConflictedIds((prev) => {
      if (prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.add(itemId);
      return next;
    });
  }, []);

  const clearConflict = useCallback((itemId: string) => {
    setConflictedIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const runOne = useCallback(async (itemId: string, entry: QueueEntry, run: () => Promise<{ updated_at: string }>) => {
    entry.inFlight = true;
    try {
      const result = await run();
      entry.updatedAt = result.updated_at;
      entry.inFlight = false;
      if (entry.queuedRun) {
        const next = entry.queuedRun;
        entry.queuedRun = null;
        await runOne(itemId, entry, next);
      }
    } catch (err) {
      entry.inFlight = false;
      entry.queuedRun = null;
      if (isConflict(err)) markConflict(itemId);
      throw err;
    }
  }, [markConflict]);

  /**
   * `run` は最新の `expected_updated_at` を使って PUT する関数。
   * 呼び出し側は `run` の中で `queue.updatedAtOf(itemId, fallback)` を使って埋めること。
   */
  const commit = useCallback(async (
    itemId: string,
    knownUpdatedAt: string,
    run: (expectedUpdatedAt: string) => Promise<{ updated_at: string }>,
  ): Promise<void> => {
    let entry = entries.current.get(itemId);
    if (!entry) {
      entry = { inFlight: false, updatedAt: knownUpdatedAt, queuedRun: null };
      entries.current.set(itemId, entry);
    }
    const bound = () => run(entry!.updatedAt);
    if (entry.inFlight) {
      // 飛んでいる間に来た commit は上書き保存（キューは長さ1）
      entry.queuedRun = bound;
      return;
    }
    await runOne(itemId, entry, bound);
  }, [runOne]);

  return { commit, conflictedIds, clearConflict };
}
