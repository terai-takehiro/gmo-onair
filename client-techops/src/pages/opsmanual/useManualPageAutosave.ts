// 選択中ページの紙面（blocks）をローカルに持ち、打つ/動かすのを止めて1.5秒で
// サーバーへ自動保存する（production-manual.md §6②「保存は打つのを止めて1.5秒」）。
// 新しい変更が来るたびにデバウンスをリセットする。ページを切り替えるときは
// `flush()` を先に呼んで、切替前の未保存分を即座に送ってから離れる。
import { useCallback, useEffect, useRef, useState } from "react";
import * as manualApi from "@/lib/manualApi";
import { isConflict, isLockError } from "@/lib/manualApi";
import { notifyError } from "@/lib/notify";
import type { ManualBlock, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";

const SAVE_DEBOUNCE_MS = 1500;

interface Pending {
  manualId: string;
  pageId: string;
  next: ManualBlock[];
}

export interface UseManualPageAutosaveResult {
  blocks: ManualBlock[];
  /** ManualCanvas の onCommit にそのまま渡す */
  commitBlocks: (next: ManualBlock[]) => void;
  saving: boolean;
  /** ページを切り替える直前に呼ぶ（未保存分があれば即座に送る） */
  flush: () => void;
}

/**
 * @param page 紙面を表示中のページ（未選択なら undefined）
 * @param onSaved 保存が成功するたびに、サーバーが返した最新行を渡す（呼び出し側はキャッシュを差し替える）
 * @param onConflict 楽観ロック衝突（409）のとき（呼び出し側は再取得する）
 */
export function useManualPageAutosave(
  page: ManualPage | undefined,
  onSaved: (row: ManualPage) => void,
  onConflict: () => void,
): UseManualPageAutosaveResult {
  const [blocks, setBlocks] = useState<ManualBlock[]>(page?.blocks ?? []);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  // ⚠️ レビュー指摘（P1）: 以前は commitBlocks 呼び出し時点の `page.updated_at`（props。
  // 自分自身の保存成功では resync しないため、送信中に来たもう1回の編集はこれが
  // 古いまま）を expected_updated_at として使っていた——1回目の PUT が「デバウンス中に」
  // 応答して updated_at が進んでも、すでに積んである2回目の PUT はその進んだ値を
  // 知らないまま古い値で送られ、サーバーの checkOptimisticLock に本物ではない衝突と
  // 判定される（isConflict → invalidate() で、まだサーバーに届いていない2回目の
  // 編集内容を無音で失う）。「いま確実に正しい updated_at」を持つのはこの ref だけにし、
  // 送信の**直前**（デバウンス発火時 or 保存直後の再送時）に読む——commit した時点の
  // 値を Pending に固定して持ち越さない。
  const lastKnownUpdatedAtRef = useRef<string | undefined>(page?.updated_at);
  const savingRef = useRef(false);
  const onSavedRef = useRef(onSaved);
  const onConflictRef = useRef(onConflict);
  onSavedRef.current = onSaved;
  onConflictRef.current = onConflict;

  // ページ切替・楽観ロック衝突からの再取得のときだけローカルを同期する。
  // 自分自身の自動保存の成功では page.updated_at が変わっても resync しない
  // （呼び出し側が setQueryData で同じ内容を積むだけなので resync しても実害は無いが、
  // ManualCanvas 側の undo 履歴を不要に揺らさないため id だけを見る）。
  useEffect(() => {
    setBlocks(page?.blocks ?? []);
    lastKnownUpdatedAtRef.current = page?.updated_at;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page?.id]);

  const runSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // 送信中に新しい編集が来てタイマーが再セットされ、通信より先に発火した場合は
    // ここで引き返す（pendingRef は消さずに残す）。いま進行中の保存が finally で
    // 拾って続けて送る——2本を同時に送って両方に古い expected_updated_at を
    // 持たせない（送信の直列化）。
    if (savingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    savingRef.current = true;
    if (mountedRef.current) setSaving(true);
    manualApi
      .updatePage(pending.manualId, pending.pageId, {
        blocks: pending.next,
        expected_updated_at: lastKnownUpdatedAtRef.current,
      })
      .then((row) => {
        lastKnownUpdatedAtRef.current = row.updated_at;
        if (mountedRef.current) onSavedRef.current(row);
      })
      .catch((err: unknown) => {
        if (isLockError(err)) {
          notifyError("編集ロックが他の人に移っているか、確定されました。", { description: "最新の内容を読み込み直します。" });
          if (mountedRef.current) onConflictRef.current();
          return;
        }
        if (isConflict(err)) {
          notifyError("ほかの人が先に保存していました。", { description: "最新の内容を読み込み直します。" });
          if (mountedRef.current) onConflictRef.current();
          return;
        }
        notifyError("紙面を保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      })
      .finally(() => {
        savingRef.current = false;
        if (mountedRef.current) setSaving(false);
        // 送信中に積まれた新しい編集があれば、いま確定した expected_updated_at で続けて送る
        if (pendingRef.current) runSave();
      });
  }, []);

  const commitBlocks = useCallback(
    (next: ManualBlock[]) => {
      setBlocks(next);
      if (!page) return;
      pendingRef.current = { manualId: page.manual_id, pageId: page.id, next };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runSave, SAVE_DEBOUNCE_MS);
    },
    [page, runSave],
  );

  // アンマウント時: タイマーは止め、未送信分があれば best-effort で1回だけ送る
  // （結果を state に反映する相手がもう居ないので、成功/失敗のハンドリングはしない）。
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) {
        manualApi
          .updatePage(pending.manualId, pending.pageId, {
            blocks: pending.next,
            expected_updated_at: lastKnownUpdatedAtRef.current,
          })
          .catch(() => {});
      }
    },
    [],
  );

  return { blocks, commitBlocks, saving, flush: runSave };
}
