// スケジュール表の詳細。PC はグリッド・スマホは縦積みカード。
// 実装設計: 04-schedule-impl.md §5-3・§5-4・§4-2（項目単位の楽観ロック）
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, LayoutTemplate, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/notify";
import api from "@/lib/api";
import * as scheduleApi from "@/lib/scheduleApi";
import { isConflict } from "@/lib/scheduleApi";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import ScheduleGrid from "@/components/schedule/ScheduleGrid";
import MobileTimeline from "@/components/schedule/MobileTimeline";
import ScheduleItemDialog, { type ItemDraft } from "@/components/schedule/ScheduleItemDialog";
import ApplyTemplateDialog from "@/components/schedule/ApplyTemplateDialog";
import useItemCommitQueue from "@/components/schedule/useItemCommitQueue";

const POLL_MS = 15000;

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useMediaQuery("(max-width: 1023px)");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [newDraft, setNewDraft] = useState<Partial<ItemDraft> | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);

  const queue = useItemCommitQueue();

  const detailQuery = useQuery({
    queryKey: ["schedule", id],
    queryFn: () => scheduleApi.getSchedule(id!),
    enabled: !!id,
    // 打鍵中・in-flight の項目はポーリングの取り込みから除く（§4-2 (d)）。
    // 編集はシート（ダイアログ）経由でのみ行うため、シートが開いている間はポーリングを止める。
    refetchInterval: dialogOpen ? false : POLL_MS,
  });

  const breakdownQuery = useQuery({
    queryKey: ["schedule-breakdown", id],
    queryFn: () => scheduleApi.getBreakdown(id!),
    enabled: !!id,
    refetchInterval: POLL_MS,
  });

  if (!id) return null;

  const openEdit = (item: ScheduleItem) => {
    setSelectedItem(item);
    setNewDraft(null);
    setDialogOpen(true);
  };
  const openCreate = (columnId: string, startMin: number) => {
    setSelectedItem(null);
    setNewDraft({ columnId, startMin, endMin: startMin + 30 });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
  };

  const refetchDetail = () => queryClient.invalidateQueries({ queryKey: ["schedule", id] });
  const refetchBreakdown = () => queryClient.invalidateQueries({ queryKey: ["schedule-breakdown", id] });

  const handleSave = async (draft: ItemDraft) => {
    const body = {
      column_id: draft.columnId,
      title: draft.title,
      kind: draft.kind,
      start_min: draft.startMin,
      end_min: draft.endMin,
      assignee: draft.assignee || null,
      note: draft.note || null,
    };
    try {
      if (selectedItem) {
        await queue.commit(selectedItem.id, selectedItem.updated_at, (expectedUpdatedAt) =>
          scheduleApi.updateItem(id, selectedItem.id, { ...body, expected_updated_at: expectedUpdatedAt }));
      } else {
        await scheduleApi.createItem(id, body);
      }
      notifySuccess("保存しました");
      closeDialog();
      refetchDetail();
      refetchBreakdown();
    } catch (err) {
      if (isConflict(err)) {
        notifyError("この項目は別のタブ/端末で更新されています");
        refetchDetail();
      } else {
        notifyError("保存に失敗しました");
      }
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    // client-qsheet は凍結アプリ（ConfirmHost 未設置）。confirmAction は器が無いと黙って false を返す
    if (!window.confirm("この項目を削除しますか？")) return; // ui-tokens-ok
    try {
      await scheduleApi.deleteItem(id, selectedItem.id);
      notifySuccess("削除しました");
      closeDialog();
      refetchDetail();
      refetchBreakdown();
    } catch {
      notifyError("削除に失敗しました");
    }
  };

  const handleCreateScript = async () => {
    if (!selectedItem) return;
    try {
      const { document } = await scheduleApi.createAndLinkDocument(id, selectedItem.id);
      notifySuccess("進行台本を作りました");
      closeDialog();
      refetchDetail();
      navigate(`/qsheet/editor/${document.id}`);
    } catch (err) {
      if (isConflict(err)) notifyError("すでに台本が結ばれています");
      else notifyError("台本を作れませんでした");
    }
  };

  const handleOpenScript = () => {
    if (selectedItem?.qsheet_document_id) navigate(`/qsheet/editor/${selectedItem.qsheet_document_id}`);
  };

  const handleExport = async () => {
    try {
      const res = await api.get(`/qsheet/schedules/${id}/export-xlsx`, { responseType: "blob" });
      const disposition = res.headers["content-disposition"] as string | undefined;
      const match = disposition?.match(/filename\*=UTF-8''([^;]+)/);
      const filename = match ? decodeURIComponent(match[1]) : "schedule.xlsx";
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      notifyError("書き出しに失敗しました");
    }
  };

  if (detailQuery.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <div className="p-6 text-sm text-muted-foreground">スケジュール表が見つかりません。</div>;
  }
  const schedule = detailQuery.data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => navigate("/qsheet/schedules")}>
          <ArrowLeft className="mr-1 h-4 w-4" />一覧へ
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{schedule.service_date} {schedule.title}</h1>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setApplyOpen(true)}>
            <LayoutTemplate className="mr-1 h-4 w-4" />ひな形を適用
          </Button>
          <Button variant="outline" size="sm" className="min-h-[44px]" onClick={handleExport}>
            <Download className="mr-1 h-4 w-4" />Excel
          </Button>
          <Button size="sm" className="min-h-[44px]" onClick={() => openCreate(schedule.columns[0]?.id ?? "", schedule.view_start_min)} disabled={schedule.columns.length === 0}>
            <Plus className="mr-1 h-4 w-4" />項目を足す
          </Button>
        </div>
      </div>

      {breakdownQuery.data && breakdownQuery.data.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {breakdownQuery.data.map((b) => `${b.title || "（無題）"}: ロール ${b.section_count} ／ 行 ${b.row_count} ／ 枠 ${b.frame_min}分`
            + (b.doc_total_sec != null ? `・台本 ${Math.ceil(b.doc_total_sec / 60)}分` : "")).join(" ｜ ")}
        </p>
      )}

      <div className="mt-4">
        {isMobile ? (
          <MobileTimeline
            columns={schedule.columns}
            items={schedule.items}
            conflictedIds={queue.conflictedIds}
            onSelect={openEdit}
          />
        ) : (
          <ScheduleGrid
            schedule={schedule}
            columns={schedule.columns}
            items={schedule.items}
            conflictedIds={queue.conflictedIds}
            onSelect={openEdit}
            onAddAt={openCreate}
          />
        )}
      </div>

      <ScheduleItemDialog
        open={dialogOpen}
        onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}
        columns={schedule.columns}
        item={selectedItem}
        initial={newDraft ?? undefined}
        conflicted={!!selectedItem && queue.conflictedIds.has(selectedItem.id)}
        onReloadLatest={() => { if (selectedItem) queue.clearConflict(selectedItem.id); refetchDetail(); }}
        onSave={handleSave}
        onDelete={selectedItem ? handleDelete : undefined}
        onCreateScript={handleCreateScript}
        onOpenScript={handleOpenScript}
      />

      <ApplyTemplateDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        scheduleId={id}
        locationId={schedule.location_id}
        onApplied={refetchDetail}
      />
    </div>
  );
}
