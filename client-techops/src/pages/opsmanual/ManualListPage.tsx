// 運営マニュアルの一覧（`/techops/manuals`・段A）。`ScheduleListPage.tsx` と同じ作法
// （react-query + keepPreviousData・`?project=`/`?program=` の絞り込み・PageShell/PageHeader）。
// 案件メンバー全員に自動で見える（サーバー側の権限解決に任せ、画面側では絞り込みしか行わない）。
import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookmarkPlus, BookOpenText, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { Delayed, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { useDebounced } from "@gmo-onair/shared/src/client/hooks/useDebounced";
import type { ManualListItem } from "@gmo-onair/shared/src/opsmanual/types";
import * as manualApi from "@/lib/manualApi";
import { useAuth } from "@/hooks/useAuth";
import { MANUAL_STATUS_LABEL, MANUAL_STATUS_BADGE_VARIANT } from "@/components/opsmanual/manualStatus";
import CreateManualDialog from "./CreateManualDialog";
import RegisterManualTemplateDialog from "./RegisterManualTemplateDialog";

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ManualRow({
  manual,
  canManage,
  onOpen,
  onRegisterTemplate,
}: {
  manual: ManualListItem;
  canManage: boolean;
  onOpen: (id: string) => void;
  onRegisterTemplate: (manual: ManualListItem) => void;
}) {
  const ownerLabel = manual.project_name
    ? `${manual.gls_number ? `${manual.gls_number} ・ ` : ""}${manual.project_name}`
    : manual.program_name ?? "";
  return (
    <div className="flex w-full items-start gap-1 rounded-card border border-border bg-card p-4 hover:bg-accent">
      <button
        type="button"
        onClick={() => onOpen(manual.id)}
        className="flex min-h-tap min-w-0 flex-1 flex-col items-start gap-1 text-left"
      >
        <div className="flex w-full flex-wrap items-center gap-2">
          <BookOpenText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="text-cardtitle text-foreground">{manual.title || "（無題）"}</span>
          {manual.doc_no && <span className="font-number text-sub-sm text-muted-foreground">{manual.doc_no}</span>}
          <Badge variant={MANUAL_STATUS_BADGE_VARIANT[manual.status]} className="ml-auto">
            {MANUAL_STATUS_LABEL[manual.status]}
          </Badge>
        </div>
        {ownerLabel && <div className="text-sub text-muted-foreground">{ownerLabel}</div>}
        <div className="flex flex-wrap gap-x-3 text-sub-sm text-muted-foreground">
          <span>ページ {manual.page_count} 枚</span>
          <span>更新 {formatUpdatedAt(manual.updated_at)}</span>
        </div>
      </button>
      {/* ひな形として登録（段E・§10-5「組織共通」）。manager だけに出す */}
      {canManage && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="min-h-tap min-w-tap shrink-0"
          onClick={() => onRegisterTemplate(manual)}
          title="ひな形として登録"
          aria-label="ひな形として登録"
        >
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

export default function ManualListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("qsheet", "manager");
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [templateSource, setTemplateSource] = useState<ManualListItem | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);

  const projectFilter = searchParams.get("project");
  const programFilter = searchParams.get("program");

  const listQuery = useQuery({
    queryKey: ["manuals", "list", projectFilter, programFilter, debouncedSearch],
    queryFn: () => manualApi.listManuals({
      project_id: projectFilter || undefined,
      program_id: programFilter || undefined,
      search: debouncedSearch || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    next.delete("program");
    setSearchParams(next);
  };

  const rows = listQuery.data ?? [];
  const filterLabel = rows.find((m) => m.project_name || m.program_name);
  const lockedOwner = (projectFilter || programFilter) && filterLabel
    ? { projectId: projectFilter, programId: programFilter, label: filterLabel.project_name ?? filterLabel.program_name ?? "" }
    : undefined;

  return (
    <PageShell>
      <PageHeader
        title="運営マニュアル"
        sub="当日の運営に要る情報をA4横のページに差し込んで、1冊の冊子にまとめます。"
        primaryAction={
          <Button className="min-h-tap" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />冊子を作る
          </Button>
        }
      />

      {(projectFilter || programFilter) && filterLabel && (
        <div className="flex items-center gap-2 rounded-note border border-border bg-primary/5 px-4 py-2.5" role="status">
          <span className="text-sub">
            <span>{filterLabel.project_name ?? filterLabel.program_name}</span>
            の運営マニュアル
          </span>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={clearFilter} aria-label="絞り込み解除">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="relative max-w-sm sm:max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          placeholder="タイトルで検索…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-h-tap pl-10"
          aria-label="運営マニュアル検索"
        />
      </div>

      {listQuery.isLoading && (
        <Delayed>
          <SkeletonRows rows={4} />
        </Delayed>
      )}

      {!listQuery.isLoading && rows.length === 0 && (
        <EmptyState
          icon={<BookOpenText />}
          title="この条件に合う冊子はありません"
          description={debouncedSearch ? "絞り込みを変えるか、「冊子を作る」から最初の1冊を作れます。" : "「冊子を作る」から最初の1冊を作れます。"}
        />
      )}

      <div className="space-y-2">
        {rows.map((m) => (
          <ManualRow
            key={m.id}
            manual={m}
            canManage={canManage}
            onOpen={(id) => navigate(`/techops/manuals/${id}`)}
            onRegisterTemplate={setTemplateSource}
          />
        ))}
      </div>

      <CreateManualDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lockedOwner={lockedOwner}
        onCreated={(row) => {
          queryClient.invalidateQueries({ queryKey: ["manuals", "list"] });
          navigate(`/techops/manuals/${row.id}`);
        }}
      />

      <RegisterManualTemplateDialog
        open={!!templateSource}
        onOpenChange={(open) => { if (!open) setTemplateSource(null); }}
        sourceManualId={templateSource?.id ?? ""}
        defaultName={templateSource?.title || "無題の運営マニュアル"}
        onRegistered={() => queryClient.invalidateQueries({ queryKey: ["manual-templates"] })}
      />
    </PageShell>
  );
}
