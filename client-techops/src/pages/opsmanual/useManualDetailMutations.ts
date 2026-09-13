// `ManualDetailPage.tsx` が使う書き込み系の `useMutation` をまとめて持つ（役割で分ける・
// 400行の壁）。ページ本体のレイアウトからタイトル・ページ追加/更新/削除/並べ替え・
// マニュアル削除の通信処理を切り離すだけで、挙動は一切変えていない。
import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { NavigateFunction } from "react-router-dom";
import * as manualApi from "@/lib/manualApi";
import { isConflict, isLockError } from "@/lib/manualApi";
import { notifyError } from "@/lib/notify";
import type { ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import type { UseManualPageAutosaveResult } from "./useManualPageAutosave";

interface Params {
  id: string;
  manualUpdatedAt: string | undefined;
  queryClient: QueryClient;
  invalidate: () => void;
  commitMetadata: UseManualPageAutosaveResult["commitMetadata"];
  waitForCurrentPageSave: UseManualPageAutosaveResult["waitForCurrentPageSave"];
  syncPageRevision: UseManualPageAutosaveResult["syncPageRevision"];
  navigate: NavigateFunction;
  setDeleteOpen: (open: boolean) => void;
  setDeletingPageId: (pageId: string | null) => void;
}

export function useManualDetailMutations({
  id, manualUpdatedAt, queryClient, invalidate, commitMetadata, waitForCurrentPageSave, syncPageRevision,
  navigate, setDeleteOpen, setDeletingPageId,
}: Params) {
  const titleMutation = useMutation({
    mutationFn: (value: string) => manualApi.updateManual(id, { title: value, expected_updated_at: manualUpdatedAt }),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      if (isLockError(err)) {
        notifyError("編集ロックが他の人に移っているか、確定されました。", { description: "画面を読み込み直します。" });
        invalidate();
        return;
      }
      if (isConflict(err)) {
        notifyError("ほかの人が先に保存していました。", { description: "最新の内容を読み込み直します。" });
        invalidate();
        return;
      }
      notifyError("タイトルを保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  const addPageMutation = useMutation({
    mutationFn: () => manualApi.addPage(id, {}),
    onSuccess: invalidate,
    onError: () => notifyError("ページを追加できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const updatePageMutation = useMutation({
    // 独立PUTだとキャンバスの自動保存と同時に飛び偽の衝突になりうるため`commitMetadata`に通す
    mutationFn: ({ pageId, patch }: { pageId: string; patch: { title?: string; chapter?: string | null } }) =>
      commitMetadata(pageId, id, patch),
    onSuccess: invalidate,
    onError: () => notifyError("ページを保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const deletePageMutation = useMutation({
    mutationFn: (pageId: string) => manualApi.deletePage(id, pageId),
    onMutate: (pageId: string) => setDeletingPageId(pageId),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      notifyError(message || "このページは削除できませんでした。", { description: message ? undefined : "少し待ってから、もう一度お試しください。" });
    },
    onSettled: () => setDeletingPageId(null),
  });

  const reorderMutation = useMutation({
    // 並べ替えは全ページのupdated_atを進めるため、開いているページの保留中/
    // 進行中の自動保存を先に終わらせてから送る（外部レビュー再指摘・P1）
    mutationFn: async (order: { id: string; sort_order: number }[]) => {
      await waitForCurrentPageSave();
      return manualApi.reorderPages(id, order);
    },
    onSuccess: (rows: ManualPage[]) => { rows.forEach((r) => syncPageRevision(r.id, r.updated_at)); invalidate(); },
    onError: () => notifyError("並べ替えを保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const deleteManualMutation = useMutation({
    mutationFn: () => manualApi.deleteManual(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manuals", "list"] });
      navigate("/techops/manuals");
    },
    onError: () => {
      setDeleteOpen(false);
      notifyError("マニュアルを削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  return { titleMutation, addPageMutation, updatePageMutation, deletePageMutation, reorderMutation, deleteManualMutation };
}
