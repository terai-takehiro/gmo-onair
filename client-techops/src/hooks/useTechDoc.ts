// 技術資料1件（②映像パッチ・③技術スタッフ）の取得・保存・ロック。
// 契約: `spec/impl-contract.md`「部品の契約」— 関数名はここで固定する
// （`TechDocPage.tsx`・`PatchTable.tsx`・`StaffTable.tsx` がこの名前で読む）。
//
// 手元を先に書き換えてからサーバーへ送り、**失敗したら必ず読み直す**
// （`useVenueAutosave.ts` が「送れなかった分を黙って捨てない」ために取った作法と同じ理屈。
// ここは行ごとの更新なので、積み直しではなく読み直しで揃える）。
import { useCallback, useEffect, useRef, useState } from "react";
import type { TechDocDetail, TechPatchRow, TechStaffRow } from "@gmo-onair/shared/src/tech/types";
import * as techApi from "@/lib/techApi";
import { notifyError } from "@/lib/notify";

/** 並べ替えの配列順に `sort_order` を振り直した手元の行（送る前の見た目を先に合わせる） */
function reorderLocal<T extends { id: string; sort_order: number }>(rows: T[], order: string[]): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return rows
    .map((r) => (rank.has(r.id) ? { ...r, sort_order: rank.get(r.id) as number } : r))
    .sort((a, b) => a.sort_order - b.sort_order);
}

export interface UseTechDocResult {
  detail: TechDocDetail | undefined;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
  updateDoc: (patch: techApi.UpdateTechDocPayload) => Promise<void>;
  createPatchRow: (payload: techApi.PatchRowPayload) => Promise<void>;
  updatePatchRow: (rowId: string, patch: techApi.PatchRowPayload) => Promise<void>;
  deletePatchRow: (rowId: string) => Promise<void>;
  reorderPatchRows: (ids: string[]) => Promise<void>;
  createStaffRow: (payload: techApi.StaffRowPayload) => Promise<void>;
  updateStaffRow: (rowId: string, patch: techApi.StaffRowPayload) => Promise<void>;
  deleteStaffRow: (rowId: string) => Promise<void>;
  reorderStaffRows: (ids: string[]) => Promise<void>;
  lock: () => Promise<void>;
  unlock: () => Promise<void>;
  requestLock: () => Promise<void>;
  takeoverLock: () => Promise<void>;
  fix: () => Promise<void>;
  unfix: () => Promise<void>;
}

export function useTechDoc(id: string | undefined): UseTechDocResult {
  const [detail, setDetail] = useState<TechDocDetail | undefined>(undefined);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<unknown>(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const reload = useCallback(async () => {
    if (!id) {
      setDetail(undefined);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await techApi.getTechDoc(id);
      if (!mountedRef.current) return;
      setDetail(next);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * 手元を先に書き換えてから送る共通の形。
   * @param optimistic 送る前に当てる手元の変更（省略可）
   * @param send サーバーへの送信。返った値で手元をもう一度整える
   * @param message 失敗したときに出す一言
   */
  const run = useCallback(
    async (
      optimistic: ((prev: TechDocDetail) => TechDocDetail) | null,
      send: (docId: string) => Promise<((prev: TechDocDetail) => TechDocDetail) | null>,
      message: string,
    ): Promise<void> => {
      if (!id) return;
      if (optimistic) setDetail((prev) => (prev ? optimistic(prev) : prev));
      try {
        const settle = await send(id);
        if (!mountedRef.current) return;
        if (settle) setDetail((prev) => (prev ? settle(prev) : prev));
      } catch (err) {
        notifyError(message, {
          description: techApi.isLockError(err)
            ? "編集は他の人が開いています。最新の内容を読み込み直します。"
            : "少し待ってから、もう一度お試しください。最新の内容を読み込み直します。",
        });
        await reload();
      }
    },
    [id, reload],
  );

  const updateDoc = useCallback(
    (patch: techApi.UpdateTechDocPayload) =>
      run(
        patch.title === undefined ? null : (prev) => ({ ...prev, doc: { ...prev.doc, title: patch.title as string } }),
        async (docId) => {
          const doc = await techApi.updateTechDoc(docId, patch);
          return (prev) => ({ ...prev, doc });
        },
        "技術資料を保存できませんでした。",
      ),
    [run],
  );

  // ── 映像パッチの行 ──────────────────────────────────────

  const createPatchRow = useCallback(
    (payload: techApi.PatchRowPayload) =>
      run(
        null,
        async (docId) => {
          const row = await techApi.createPatchRow(docId, payload);
          return (prev) => ({ ...prev, patch_rows: [...prev.patch_rows, row] });
        },
        "行を追加できませんでした。",
      ),
    [run],
  );

  const updatePatchRow = useCallback(
    (rowId: string, patch: techApi.PatchRowPayload) =>
      run(
        (prev) => ({
          ...prev,
          patch_rows: prev.patch_rows.map((r) => (r.id === rowId ? { ...r, ...patch } as TechPatchRow : r)),
        }),
        async (docId) => {
          const row = await techApi.updatePatchRow(docId, rowId, patch);
          return (prev) => ({ ...prev, patch_rows: prev.patch_rows.map((r) => (r.id === rowId ? row : r)) });
        },
        "行を保存できませんでした。",
      ),
    [run],
  );

  const deletePatchRow = useCallback(
    (rowId: string) =>
      run(
        (prev) => ({ ...prev, patch_rows: prev.patch_rows.filter((r) => r.id !== rowId) }),
        async (docId) => {
          await techApi.deletePatchRow(docId, rowId);
          return null;
        },
        "行を削除できませんでした。",
      ),
    [run],
  );

  const reorderPatchRows = useCallback(
    (ids: string[]) =>
      run(
        (prev) => ({ ...prev, patch_rows: reorderLocal(prev.patch_rows, ids) }),
        async (docId) => {
          const rows = await techApi.reorderPatchRows(docId, ids);
          return (prev) => ({ ...prev, patch_rows: rows });
        },
        "並べ替えを保存できませんでした。",
      ),
    [run],
  );

  // ── 技術スタッフの行 ────────────────────────────────────

  const createStaffRow = useCallback(
    (payload: techApi.StaffRowPayload) =>
      run(
        null,
        async (docId) => {
          const row = await techApi.createStaffRow(docId, payload);
          return (prev) => ({ ...prev, staff_rows: [...prev.staff_rows, row] });
        },
        "行を追加できませんでした。",
      ),
    [run],
  );

  const updateStaffRow = useCallback(
    (rowId: string, patch: techApi.StaffRowPayload) =>
      run(
        (prev) => ({
          ...prev,
          staff_rows: prev.staff_rows.map((r) => (r.id === rowId ? { ...r, ...patch } as TechStaffRow : r)),
        }),
        async (docId) => {
          const row = await techApi.updateStaffRow(docId, rowId, patch);
          return (prev) => ({ ...prev, staff_rows: prev.staff_rows.map((r) => (r.id === rowId ? row : r)) });
        },
        "行を保存できませんでした。",
      ),
    [run],
  );

  const deleteStaffRow = useCallback(
    (rowId: string) =>
      run(
        (prev) => ({ ...prev, staff_rows: prev.staff_rows.filter((r) => r.id !== rowId) }),
        async (docId) => {
          await techApi.deleteStaffRow(docId, rowId);
          return null;
        },
        "行を削除できませんでした。",
      ),
    [run],
  );

  const reorderStaffRows = useCallback(
    (ids: string[]) =>
      run(
        (prev) => ({ ...prev, staff_rows: reorderLocal(prev.staff_rows, ids) }),
        async (docId) => {
          const rows = await techApi.reorderStaffRows(docId, ids);
          return (prev) => ({ ...prev, staff_rows: rows });
        },
        "並べ替えを保存できませんでした。",
      ),
    [run],
  );

  // ── 確定・編集ロック ────────────────────────────────────
  // どれも資料の状態そのものが変わる（ロックの持ち主・名前も付いて返る）ので、
  // 手元だけで組み立てず読み直して揃える。

  const doThenReload = useCallback(
    (send: (docId: string) => Promise<unknown>, message: string) =>
      run(
        null,
        async (docId) => {
          await send(docId);
          await reload();
          return null;
        },
        message,
      ),
    [run, reload],
  );

  const lock = useCallback(
    () => doThenReload((docId) => techApi.lockTechDoc(docId), "編集を始められませんでした。"),
    [doThenReload],
  );
  const unlock = useCallback(
    () => doThenReload((docId) => techApi.unlockTechDoc(docId), "編集を終われませんでした。"),
    [doThenReload],
  );
  const requestLock = useCallback(
    () => doThenReload((docId) => techApi.requestTechDocLock(docId), "編集の引き継ぎを要求できませんでした。"),
    [doThenReload],
  );
  const takeoverLock = useCallback(
    () => doThenReload((docId) => techApi.takeoverTechDocLock(docId), "編集を引き継げませんでした。"),
    [doThenReload],
  );
  const fix = useCallback(
    () => doThenReload((docId) => techApi.fixTechDoc(docId), "確定できませんでした。"),
    [doThenReload],
  );
  const unfix = useCallback(
    () => doThenReload((docId) => techApi.unfixTechDoc(docId), "確定を解けませんでした。"),
    [doThenReload],
  );

  return {
    detail,
    loading,
    error,
    reload,
    updateDoc,
    createPatchRow,
    updatePatchRow,
    deletePatchRow,
    reorderPatchRows,
    createStaffRow,
    updateStaffRow,
    deleteStaffRow,
    reorderStaffRows,
    lock,
    unlock,
    requestLock,
    takeoverLock,
    fix,
    unfix,
  };
}

export default useTechDoc;
