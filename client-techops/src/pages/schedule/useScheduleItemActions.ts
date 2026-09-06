// `SchedulePage.tsx` から切り出した、項目（枠）に対する保存・削除・ドラッグ確定・台本連携と
// 関連する react-query の invalidate 群。1ファイル400行の上限のための分割で、
// ロジックは移しただけで変えていない。
// 実装設計: 04-schedule-impl.md §4-2（項目単位の楽観ロック）・14-schedule-v2-plan.md §3 B1
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";
import { isConflict } from "@/lib/scheduleApi";
import type { ItemDraft } from "@/components/schedule/ScheduleItemDialog";
import type useItemCommitQueue from "@/components/schedule/useItemCommitQueue";
import type { ScheduleDetail, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";

export default function useScheduleItemActions({
  scheduleId, schedule, queue, selectedItem, closeDialog,
}: {
  scheduleId: string;
  /** 読み込み中はまだ無い。owner（案件/番組）の invalidate 先を決めるためだけに使う */
  schedule: ScheduleDetail | undefined;
  queue: ReturnType<typeof useItemCommitQueue>;
  selectedItem: ScheduleItem | null;
  closeDialog: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const refetchDetail = () => queryClient.invalidateQueries({ queryKey: ["schedule", scheduleId] });
  const refetchBreakdown = () => queryClient.invalidateQueries({ queryKey: ["schedule-breakdown", scheduleId] });
  // 項目（枠）を足す/直す/消す/台本化すると、一覧（`ScheduleListPage.tsx` の ["schedules","list",...]）と
  // ハブ画面（`JourneyPage.tsx` の ["qsheet-journey", scope, id]）が読む件数・提案が古いまま残る
  // （既定の staleTime=60秒。監査 2026-08-24）。この2つも合わせて invalidate する。
  const refetchListsAndHub = () => {
    queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
    if (schedule?.project_id) {
      queryClient.invalidateQueries({ queryKey: ["qsheet-journey", "project", schedule.project_id] });
    } else if (schedule?.program_id) {
      queryClient.invalidateQueries({ queryKey: ["qsheet-journey", "program", schedule.program_id] });
    } else {
      // owner がまだ分からない（読み込み中 等）ときは絞り込めないので全ジャーニーを対象にする
      queryClient.invalidateQueries({ queryKey: ["qsheet-journey"] });
    }
  };
  // 列を消すと中の項目も消える（件数が動く）ので、列の変更は一覧・ハブまで読み直す
  const refetchAfterColumns = () => { refetchDetail(); refetchBreakdown(); refetchListsAndHub(); };
  // 表の設定は案件/番組そのものを付け替えられる。旧・新どちらのハブが古くなるか
  // 事前には分からないので、ジャーニー全体を読み直す（表の設定はそう何度も開かない操作）
  const refetchAfterSettings = () => {
    refetchDetail();
    queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
    queryClient.invalidateQueries({ queryKey: ["qsheet-journey"] });
  };
  const handleDeleted = () => {
    queryClient.invalidateQueries({ queryKey: ["schedules", "list"] });
    navigate("/techops/schedules");
  };

  const handleSave = async (draft: ItemDraft) => {
    const body = {
      column_id: draft.columnId,
      title: draft.title,
      kind: draft.kind,
      start_min: draft.startMin,
      end_min: draft.endMin,
      span_cols: draft.spanCols,
      assignee: draft.assignee || null,
      note: draft.note || null,
    };
    try {
      if (selectedItem) {
        await queue.commit(selectedItem.id, selectedItem.updated_at, (expectedUpdatedAt) =>
          scheduleApi.updateItem(scheduleId, selectedItem.id, { ...body, expected_updated_at: expectedUpdatedAt }));
      } else {
        await scheduleApi.createItem(scheduleId, body);
      }
      notifySuccess("保存しました");
      closeDialog();
      refetchDetail();
      refetchBreakdown();
      refetchListsAndHub();
    } catch (err) {
      if (isConflict(err)) {
        notifyError("この項目は別のタブ/端末で更新されています");
        refetchDetail();
      } else {
        notifyError("保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      }
    }
  };

  /**
   * ドラッグ移動・下端リサイズの確定（14-schedule-v2-plan.md §3 B1）。単発の項目更新と
   * 同じ経路（`useItemCommitQueue`）に乗せる — `bulkUpdateItems` に要素1件だけ渡す薄いラップで、
   * `expected_updated_at` のローテーション・409 の `conflictedIds` への反映（赤枠）を
   * 単発編集とまったく同じにする（§4-3「既存の conflictedIds をそのまま使う」）。
   */
  const handleDragCommit = async (item: ScheduleItem, patch: { column_id: string; start_min: number; end_min: number }) => {
    try {
      await queue.commit(item.id, item.updated_at, async (expectedUpdatedAt) => {
        const rows = await scheduleApi.bulkUpdateItems(scheduleId, [{ id: item.id, ...patch, expected_updated_at: expectedUpdatedAt }]);
        const row = rows[0];
        if (!row) throw new Error("bulkUpdateItems: 応答に項目がありませんでした");
        return row;
      });
      refetchDetail();
      refetchBreakdown();
    } catch (err) {
      if (isConflict(err)) {
        // 元の位置に戻す（グリッドはサーバーの値に戻った schedule.items から作り直される）。
        // 赤枠は conflictedIds が既存の描画パスでそのまま出す
        notifyError("この項目は別のタブ/端末で更新されています", { description: "最新を読み込んでください。" });
        refetchDetail();
      } else {
        notifyError("移動できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    // 確認の器（ConfirmHost）は共通シェル（shared/src/client/shell/AppShell.tsx）が持っている
    const ok = await confirmAction({
      title: `「${selectedItem.title || "（無題）"}」を削除しますか？`,
      description: selectedItem.qsheet_document_id ? "結ばれている進行台本は残ります（枠だけが消えます）。" : undefined,
      confirmLabel: "削除する",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await scheduleApi.deleteItem(scheduleId, selectedItem.id);
      notifySuccess("削除しました");
      closeDialog();
      refetchDetail();
      refetchBreakdown();
      refetchListsAndHub();
    } catch {
      notifyError("削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  const handleCreateScript = async () => {
    if (!selectedItem) return;
    try {
      const { document } = await scheduleApi.createAndLinkDocument(scheduleId, selectedItem.id);
      notifySuccess("進行台本を作りました");
      closeDialog();
      refetchDetail();
      refetchListsAndHub();
      navigate(`/techops/editor/${document.id}`);
    } catch (err) {
      if (isConflict(err)) notifyError("すでに台本が結ばれています");
      else notifyError("台本を作れませんでした");
    }
  };

  const handleOpenScript = () => {
    if (selectedItem?.qsheet_document_id) navigate(`/techops/editor/${selectedItem.qsheet_document_id}`);
  };

  return {
    refetchDetail, refetchBreakdown, refetchAfterColumns, refetchAfterSettings, handleDeleted,
    handleSave, handleDragCommit, handleDelete, handleCreateScript, handleOpenScript,
  };
}
