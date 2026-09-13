// 運営マニュアルの一覧（`/techops/manuals`・段A）。`ScheduleListPage.tsx` と同じ作法
// （react-query + keepPreviousData・`?project=`/`?program=` の絞り込み・PageShell/PageHeader）。
// 案件メンバー全員に自動で見える（サーバー側の権限解決に任せ、画面側では絞り込みしか行わない）。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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
import * as programsApi from "@/lib/programsApi";
import * as scheduleApi from "@/lib/scheduleApi";
import { notifyError } from "@/lib/notify";
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
      {/* テンプレートとして登録（段E・§10-5「組織共通」）。manager だけに出す */}
      {canManage && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="min-h-tap min-w-tap shrink-0"
          onClick={() => onRegisterTemplate(manual)}
          title="テンプレートとして登録"
          aria-label="テンプレートとして登録"
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

  // ── 作るのに要る事実は、案件／番組から引く（手で打たせない） ─────────────────
  //
  // マニュアルは必ず案件か番組にぶら下がるので、名前も本番の予定日も**作る前から分かっている**。
  // スケジュール表が先に同じ直しをしている（`CreateScheduleDialog.tsx`・codex 棚卸し #325
  // 「案件から引けるのに手入力」）ので、同じ `GET /lookup/:id/context` をそのまま使う。
  //
  // ⚠️ 名前を一覧の行から取ってはいけない。**まだ1件も無い案件では行が無く名前が分からない**
  // ——「作る」を押す直前がまさにその状態で、以前は案件を選び直させていた。
  const projectCtxQuery = useQuery({
    queryKey: ["lookup", "project-context", projectFilter],
    queryFn: () => scheduleApi.getProjectContext(projectFilter as string),
    enabled: !!projectFilter,
  });
  const programQuery = useQuery({
    queryKey: ["techops", "program", programFilter],
    queryFn: () => programsApi.getProgram(programFilter as string),
    enabled: !!programFilter,
  });

  const ownerName = projectCtxQuery.data?.name ?? programQuery.data?.name ?? null;
  const ownerKnown = !!(projectFilter || programFilter) && !!ownerName;
  // 本番日の候補 → 開催の初日。番組は `event_date` の1つだけ。無ければ空のままでよい（詳細画面で入れられる）
  const ownerServiceDate = projectCtxQuery.data
    ? projectCtxQuery.data.performanceDates[0] ?? projectCtxQuery.data.eventStart ?? null
    : programQuery.data?.event_date ?? null;

  const lockedOwner = ownerKnown
    ? { projectId: projectFilter, programId: programFilter, label: ownerName as string }
    : undefined;

  /** 案件／番組が決まっているときの「作る」。訊かずに作って、そのまま編集画面へ */
  const quickCreate = useMutation({
    mutationFn: () => manualApi.createManual({
      title: ownerName ?? "運営マニュアル",
      project_id: projectFilter || null,
      program_id: programFilter || null,
      service_date: ownerServiceDate,
    }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["manuals", "list"] });
      navigate(`/techops/manuals/${row.id}`);
    },
    onError: () => notifyError("運営マニュアルを作れませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  return (
    <PageShell>
      <PageHeader
        title="運営マニュアル"
        sub="当日の運営に要る情報をA4横のページに差し込んで、1冊のマニュアルにまとめます。"
        primaryAction={
          ownerKnown ? (
            // 案件／番組が決まっているなら1押しで作る。タイトルと予定日は案件から入るので訊かない
            <div className="flex items-center gap-2">
              <Button variant="outline" className="min-h-tap" onClick={() => setCreateOpen(true)}>
                前回・テンプレートから
              </Button>
              <Button className="min-h-tap" onClick={() => quickCreate.mutate()} disabled={quickCreate.isPending}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />マニュアルを作る
              </Button>
            </div>
          ) : (
            // どの案件のものか決まっていないときだけ訊く（一覧を絞り込まずに開いたとき）
            <Button className="min-h-tap" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />マニュアルを作る
            </Button>
          )
        }
      />

      {ownerKnown && (
        <div className="flex items-center gap-2 rounded-note border border-border bg-primary/5 px-4 py-2.5" role="status">
          <span className="text-sub">
            <span>{ownerName}</span>
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
          title="この条件に合うマニュアルはありません"
          description={debouncedSearch ? "絞り込みを変えるか、「マニュアルを作る」から最初の1冊を作れます。" : "「マニュアルを作る」から最初の1冊を作れます。"}
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
