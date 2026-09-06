// スケジュール表の詳細。PC はグリッド・スマホは縦積みカード。
// 実装設計: 04-schedule-impl.md §5-3・§5-4・§4-2（項目単位の楽観ロック）
// 第2版（列の管理・空状態の 3 択・見出しの整理）: 14-schedule-v2-plan.md §3 段A・§4-2 (b)(c)(d)
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, LayoutTemplate, Download, Plus, Sparkles, Columns3, Settings } from "lucide-react";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import EventPlanDialog from "@/components/ai/EventPlanDialog";
import { Button } from "@/components/ui/button";
import { notifyError } from "@/lib/notify";
import api from "@/lib/api";
import * as scheduleApi from "@/lib/scheduleApi";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuth } from "@/hooks/useAuth";
import { setProductionNavContext } from "@/lib/productionNavContext";
import type { ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import type { ScheduleColumn, ScheduleItem } from "@gmo-onair/shared/src/schedule/types";
import ScheduleGrid from "@/components/schedule/ScheduleGrid";
import MobileTimeline from "@/components/schedule/MobileTimeline";
import ScheduleItemDialog, { type ItemDraft } from "@/components/schedule/ScheduleItemDialog";
import ApplyTemplateDialog from "@/components/schedule/ApplyTemplateDialog";
import ColumnDialog from "@/components/schedule/ColumnDialog";
import VenueColumnsDialog from "@/components/schedule/VenueColumnsDialog";
import ScheduleEmptyState from "@/components/schedule/ScheduleEmptyState";
import ScheduleSettingsDialog from "@/components/schedule/ScheduleSettingsDialog";
import ScheduleSiblingDays from "@/components/schedule/ScheduleSiblingDays";
import MoreMenu from "@/components/schedule/MoreMenu";
import useItemCommitQueue from "@/components/schedule/useItemCommitQueue";
import useScheduleItemActions from "./useScheduleItemActions";
import { SCHEDULE_STATUS_LABEL, SCHEDULE_STATUS_BADGE_VARIANT } from "@/components/schedule/scheduleStatus";

const POLL_MS = 15000;

export default function SchedulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { currentUser } = useAuth();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ScheduleItem | null>(null);
  const [newDraft, setNewDraft] = useState<Partial<ItemDraft> | null>(null);
  const [applyOpen, setApplyOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [venueOpen, setVenueOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // スマホの列チップの絞り込み。「項目を追加」の既定列に使うため親に持ち上げてある（§3 A6）
  const [mobileFilterColumnId, setMobileFilterColumnId] = useState<string | null>(null);
  // 列を足す／直す（ColumnDialog）。`column` が無ければ新規作成
  const [columnDialog, setColumnDialog] = useState<{ open: boolean; column: ScheduleColumn | null; group: ColGroup }>({ open: false, column: null, group: "venue" });
  // ドラッグ移動・下端リサイズの最中かどうか（`ScheduleGrid` から。§3 B1・§4-3）
  const [isDragging, setIsDragging] = useState(false);

  const queue = useItemCommitQueue();
  // 列・表の設定・ドラッグ中もポーリングを止める（書きかけを上書きしないため・§4-3）
  const anySheetOpen = dialogOpen || columnDialog.open || venueOpen || settingsOpen || isDragging;

  const detailQuery = useQuery({
    queryKey: ["schedule", id],
    queryFn: () => scheduleApi.getSchedule(id!),
    enabled: !!id,
    // 打鍵中・in-flight の項目はポーリングの取り込みから除く（§4-2 (d)）。
    // 編集はシート（ダイアログ）経由でのみ行うため、シートが開いている間はポーリングを止める。
    refetchInterval: anySheetOpen ? false : POLL_MS,
  });

  const breakdownQuery = useQuery({
    queryKey: ["schedule-breakdown", id],
    queryFn: () => scheduleApi.getBreakdown(id!),
    enabled: !!id,
    refetchInterval: POLL_MS,
  });

  const closeDialog = () => setDialogOpen(false);
  // 項目の保存・削除・ドラッグ確定・台本連携と関連する invalidate 群（1ファイル400行の上限で分割）
  const {
    refetchDetail, refetchAfterColumns, refetchAfterSettings, handleDeleted,
    handleSave, handleDragCommit, handleDelete, handleCreateScript, handleOpenScript,
  } = useScheduleItemActions({ scheduleId: id ?? "", schedule: detailQuery.data, queue, selectedItem, closeDialog });

  // いまの案件/番組をサイドバー・スマホ下タブに教える（buildQsheetNav が参照）
  useEffect(() => {
    const data = detailQuery.data;
    if (!data) return;
    if (data.project_id) {
      setProductionNavContext({ scope: "project", id: data.project_id, label: null });
    } else if (data.program_id) {
      setProductionNavContext({ scope: "program", id: data.program_id, label: null });
    }
  }, [detailQuery.data]);

  // 列を削除したら絞り込みを外す（消えた列 id のまま残ると、
  // フィルタチップが「すべて」に戻らず一覧が空のまま固まって見える）
  useEffect(() => {
    const cols = detailQuery.data?.columns;
    if (!cols) return;
    setMobileFilterColumnId((prev) => (prev && cols.some((c) => c.id === prev) ? prev : null));
  }, [detailQuery.data?.columns]);

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
  const openAddColumn = (group: ColGroup) => setColumnDialog({ open: true, column: null, group });
  const openEditColumn = (column: ScheduleColumn) => setColumnDialog({ open: true, column, group: column.col_group });

  const handleExport = async () => {
    try {
      const res = await api.get(`/techops/schedules/${id}/export-xlsx`, { responseType: "blob" });
      const disposition = res.headers["content-disposition"] as string | undefined;
      const match = disposition?.match(/filename\*=UTF-8''([^;]+)/);
      const filename = match ? decodeURIComponent(match[1]) : "schedule.xlsx";
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch {
      notifyError("書き出せませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  if (detailQuery.isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (detailQuery.isError || !detailQuery.data) {
    return <div className="p-6 text-sm text-muted-foreground">スケジュール表が見つかりません。</div>;
  }
  const schedule = detailQuery.data;
  const hasColumns = schedule.columns.length > 0;
  const itemCountOf = (columnId: string) => schedule.items.filter((it) => it.column_id === columnId).length;
  const subParts = [
    schedule.location_name,
    schedule.project_name ? `${schedule.gls_number ? `${schedule.gls_number} ` : ""}${schedule.project_name}` : null,
    schedule.program_name ? `番組: ${schedule.program_name}` : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <Button variant="ghost" size="sm" className="mb-2 min-h-[44px] -ml-2" onClick={() => navigate("/techops/schedules")}>
        <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />一覧へ
      </Button>

      {/* 「同じイベントの他の日」（§3-3）。1 日しか無いイベントでは何も描かない */}
      <ScheduleSiblingDays projectId={schedule.project_id} programId={schedule.program_id} currentId={schedule.id} />

      {/* 主＝項目を追加（PC は右上・スマホは下端）。設定は副ボタン、作る系（ひな形・AI）・
          Excel・列は「…」へ（§4-2 (b)） */}
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {schedule.service_date} {schedule.title}
            <Badge variant={SCHEDULE_STATUS_BADGE_VARIANT[schedule.status]}>
              {SCHEDULE_STATUS_LABEL[schedule.status]}
            </Badge>
          </span>
        }
        sub={subParts.length > 0 ? subParts.join(" ・ ") : undefined}
        primaryAction={
          <Button
            className="min-h-[44px]"
            onClick={() => openCreate(mobileFilterColumnId ?? schedule.columns[0]?.id ?? "", schedule.view_start_min)}
            disabled={!hasColumns}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />項目を追加
          </Button>
        }
      >
        <Button variant="outline" size="sm" className="min-h-[44px]" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-1 h-4 w-4" aria-hidden="true" />表の設定
        </Button>
        <MoreMenu
          items={[
            { label: "列を足す", icon: <Columns3 />, onSelect: () => openAddColumn(schedule.columns[schedule.columns.length - 1]?.col_group ?? "venue") },
            { label: "ひな形を適用", icon: <LayoutTemplate />, onSelect: () => setApplyOpen(true) },
            { label: "AI で下書き", icon: <Sparkles />, onSelect: () => setAiOpen(true) },
            { label: "Excel に書き出す", icon: <Download />, onSelect: () => void handleExport(), disabled: !hasColumns },
          ]}
        />
      </PageHeader>

      {breakdownQuery.data && breakdownQuery.data.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {breakdownQuery.data.map((b) => `${b.title || "（無題）"}: ロール ${b.section_count} ／ 行 ${b.row_count} ／ 枠 ${b.frame_min}分`
            + (b.doc_total_sec != null ? `・台本 ${Math.ceil(b.doc_total_sec / 60)}分` : "")).join(" ｜ ")}
        </p>
      )}

      <div className="mt-4">
        {!hasColumns ? (
          <ScheduleEmptyState
            locationSet={!!schedule.location_id}
            onTemplate={() => setApplyOpen(true)}
            onVenue={() => setVenueOpen(true)}
            onAi={() => setAiOpen(true)}
          />
        ) : isMobile ? (
          <MobileTimeline
            columns={schedule.columns}
            items={schedule.items}
            conflictedIds={queue.conflictedIds}
            onSelect={openEdit}
            filterColumnId={mobileFilterColumnId}
            onFilterChange={setMobileFilterColumnId}
          />
        ) : (
          <ScheduleGrid
            schedule={schedule}
            columns={schedule.columns}
            items={schedule.items}
            conflictedIds={queue.conflictedIds}
            onSelect={openEdit}
            onAddAt={openCreate}
            onEditColumn={openEditColumn}
            onAddColumn={openAddColumn}
            onCommitDrag={handleDragCommit}
            onDragStateChange={setIsDragging}
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
        scheduleFixed={schedule.status === "fixed"}
      />

      <ColumnDialog
        open={columnDialog.open}
        onOpenChange={(o) => setColumnDialog((s) => ({ ...s, open: o }))}
        scheduleId={id}
        columns={schedule.columns}
        column={columnDialog.column}
        initialGroup={columnDialog.group}
        itemCount={columnDialog.column ? itemCountOf(columnDialog.column.id) : 0}
        onChanged={refetchAfterColumns}
      />

      <ScheduleSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        schedule={schedule}
        currentUserId={currentUser?.id ?? null}
        isAdmin={currentUser?.role === "system_admin"}
        onSaved={refetchAfterSettings}
        onDeleted={handleDeleted}
      />

      <VenueColumnsDialog
        open={venueOpen}
        onOpenChange={setVenueOpen}
        scheduleId={id}
        scheduleLocationId={schedule.location_id}
        columns={schedule.columns}
        onCreated={refetchAfterColumns}
      />

      <ApplyTemplateDialog
        open={applyOpen}
        onOpenChange={setApplyOpen}
        scheduleId={id}
        locationId={schedule.location_id}
        onApplied={refetchAfterColumns}
      />

      {/* AI 生成（段8・①イベント設計）。`qsheet_schedule_items` への REST 書き込みなので
          取り込みは applyEventPlanOps を使う（②③の Yjs 経由とは別の入口） */}
      <EventPlanDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        scheduleId={id!}
        existingColumnIds={schedule.columns.map((c) => c.id)}
        onApplied={refetchAfterColumns}
      />
    </div>
  );
}
