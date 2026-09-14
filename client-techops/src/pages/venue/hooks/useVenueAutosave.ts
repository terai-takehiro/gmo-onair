// 会場図面 — 打つ/動かすのを止めて1.5秒でサーバーへ自動保存する
// （設計: docs/design/v4/venue-layout.md §5-6「保存は打つのを止めて1.5秒」）。
// `client-techops/src/pages/opsmanual/useManualPageAutosave.ts` の写しだが、
// 会場図面は「ページ」を持たず図面1件がそのまま単位なので、複数ページ分の
// 送信待ちを持つ Map ではなく単一スロットで足りる。
import { useCallback, useEffect, useRef, useState } from "react";
import { updateVenueItems, isConflict, isLockError } from "@/lib/venueApi";
import { notifyError } from "@/lib/notify";
import type { VenueItem, VenueLayoutDetail } from "@gmo-onair/shared/src/venue/types";

const SAVE_DEBOUNCE_MS = 1500;

export interface UseVenueAutosaveResult {
  items: VenueItem[];
  /** VenueBoard・追加／並べ方／右パネルの commit の唯一の入口 */
  commitItems: (next: VenueItem[]) => void;
  saving: boolean;
  /** 画面を離れる・仕上がりへ移る直前に呼ぶ（未保存分があれば即座に送る） */
  flush: () => void;
}

/**
 * @param layout いま開いている図面（読み込み中は undefined）
 * @param onSaved 保存が成功するたびに、サーバーが返した最新行を渡す
 * @param onConflict 楽観ロック衝突（409・CONFLICT）のとき
 */
export function useVenueAutosave(
  layout: VenueLayoutDetail | undefined,
  onSaved: (row: VenueLayoutDetail) => void,
  onConflict: () => void,
): UseVenueAutosaveResult {
  const [items, setItems] = useState<VenueItem[]>(layout?.items ?? []);
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<VenueItem[] | null>(null);
  const revisionRef = useRef<string | undefined>(layout?.updatedAt);
  const savingRef = useRef(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const onSavedRef = useRef(onSaved);
  const onConflictRef = useRef(onConflict);
  onSavedRef.current = onSaved;
  onConflictRef.current = onConflict;
  const layoutIdRef = useRef<string | undefined>(layout?.id);
  const layoutId = layout?.id;

  // 図面を切り替えた（または最初に読み込めた）ときだけローカルを同期する。
  // 自分自身の自動保存の成功では resync しない（余計な再描画・undo履歴の揺れを避ける）。
  useEffect(() => {
    layoutIdRef.current = layoutId;
    setItems(layout?.items ?? []);
    revisionRef.current = layout?.updatedAt;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutId]);

  const runSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savingRef.current) return; // 送信中に積まれた分は finally が続けて拾う（送信の直列化）
    const pending = pendingRef.current;
    const id = layoutIdRef.current;
    if (!pending || !id) return;
    pendingRef.current = null;
    savingRef.current = true;
    if (mountedRef.current) setSaving(true);
    // レビュー指摘（P1）: 通信エラー・5xx など「取り合い（ロック／楽観ロック）ではない」
    // 失敗のとき、以前はここで `pendingRef` を空にしたまま戻していた。次に手を動かせば
    // 上書きされて気づけないが、動かさず離れる／固まると、その分は二度と送られない
    // （画面には反映済みに見えるのに保存されていない）。取り合いで正しく discard する
    // 2ケース（ロック・楽観ロック衝突）以外は、まだ誰も上書きしていなければ `pending` を
    // 差し戻し、通常の1.5秒デバウンスで再送する。
    let retryScheduled = false;
    savingPromiseRef.current = updateVenueItems(id, pending, revisionRef.current ?? "")
      .then((row) => {
        revisionRef.current = row.updatedAt;
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
        notifyError("図面を保存できませんでした。", { description: "少し待ってからもう一度お試しください。自動でもう一度送ります。" });
        if (!pendingRef.current) {
          // まだ新しい編集で上書きされていなければ、失敗した分をそのまま積み直す
          pendingRef.current = pending;
          retryScheduled = true;
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(runSave, SAVE_DEBOUNCE_MS);
        }
      })
      .finally(() => {
        savingRef.current = false;
        savingPromiseRef.current = null;
        if (mountedRef.current) setSaving(false);
        // `retryScheduled` のときは上でタイマーを立てた分だけに任せる
        // （ここでも runSave すると同じ pending を二重に送ってしまう）。
        if (pendingRef.current && !retryScheduled) runSave();
      });
  }, []);

  const commitItems = useCallback(
    (next: VenueItem[]) => {
      setItems(next);
      if (!layoutIdRef.current) return;
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runSave, SAVE_DEBOUNCE_MS);
    },
    [runSave],
  );

  // アンマウント時: タイマーは止め、未送信分があれば best-effort で1回だけ送る。
  // 進行中の保存があれば、それが revision を更新し終えるのを待ってから送る
  // （同時に送ると片方が偽の衝突になるため。§5-6と同じ理由）。
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      const id = layoutIdRef.current;
      if (!pending || !id) return;
      const sendFinal = () => {
        updateVenueItems(id, pending, revisionRef.current ?? "").catch(() => {});
      };
      const inFlight = savingPromiseRef.current;
      if (inFlight) inFlight.then(sendFinal, sendFinal);
      else sendFinal();
    },
    [],
  );

  return { items, commitItems, saving, flush: runSave };
}
