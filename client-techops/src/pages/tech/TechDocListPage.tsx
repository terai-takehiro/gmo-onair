// 技術資料の一覧（`/techops/tech-docs`・①）。`VenueListPage.tsx` と同じ作法
// （react-query・`?project=`/`?program=` の絞り込み・PageShell/PageHeader・状態チップ）。
// 設計: docs/design/v4/tech-docs.md §6①・モック `mockups/native/tech-docs/Main.dc.html`。
//
// モックにある「次の資料番号 TD-… ・ 自動で採番されます」は**出さない**。
// 次の番号を返す口が無く（採番は作成時にサーバーが行う）、当てずっぽうの番号を
// 出すと実際に付く番号とずれるため。
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Cable, Copy, FileText, Settings2, Trash2, Users, X, Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { FilterChips } from "@gmo-onair/shared/src/client/ui/filterChips";
import { confirmAction } from "@gmo-onair/shared/src/client/ui/confirm";
import type { TechDocListItem, TechDocStatus } from "@gmo-onair/shared/src/tech/types";
import * as techApi from "@/lib/techApi";
import * as programsApi from "@/lib/programsApi";
import * as scheduleApi from "@/lib/scheduleApi";
import { useAuth } from "@/hooks/useAuth";
import { notifyError, notifySuccess } from "@/lib/notify";
import { TECH_STATUS_LABEL, TECH_STATUS_BADGE_VARIANT, revLabel } from "./techStatus";
import CreateTechDocDialog from "./CreateTechDocDialog";

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** 「映像パッチ 10 行 ・ 技術スタッフ 17 人（2 日） ・ 増設機材 3」（モックの1行目） */
function countsLine(doc: TechDocListItem): string {
  const parts = [
    `映像パッチ ${doc.patch_row_count} 行`,
    `技術スタッフ ${doc.staff_row_count} 人（${doc.staff_day_count} 日）`,
  ];
  if (doc.extra_device_count > 0) parts.push(`増設機材 ${doc.extra_device_count}`);
  return parts.join(" ・ ");
}

type StatusFilter = "all" | TechDocStatus;

function TechDocCard({
  doc,
  onOpen,
  onDuplicate,
  onDelete,
  busy,
}: {
  doc: TechDocListItem;
  onOpen: (id: string) => void;
  onDuplicate: (doc: TechDocListItem) => void;
  onDelete: (doc: TechDocListItem) => void;
  busy: boolean;
}) {
  return (
    <section className="flex flex-col rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {doc.doc_no && <span className="font-number text-sub-sm text-muted-foreground">{doc.doc_no}</span>}
        <Badge variant={TECH_STATUS_BADGE_VARIANT[doc.status]}>{TECH_STATUS_LABEL[doc.status]}</Badge>
        {revLabel(doc) && <span className="font-number ml-auto text-sub-sm text-muted-foreground">{revLabel(doc)}</span>}
      </div>

      <button
        type="button"
        onClick={() => onOpen(doc.id)}
        className="mt-1.5 flex min-h-tap min-w-0 flex-col items-start gap-1 text-left"
      >
        <span className="text-cardtitle text-foreground">{doc.title || "（無題）"}</span>
        <span className="font-number text-sub-sm text-muted-foreground">{countsLine(doc)}</span>
      </button>

      <div className="font-number mt-2 text-sub-sm text-muted-foreground">
        {[revLabel(doc), formatUpdatedAt(doc.updated_at)].filter(Boolean).join(" ・ ")}
        {doc.updated_by_name ? ` ・ ${doc.updated_by_name}` : ""}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" variant="outline" className="min-h-tap flex-1" onClick={() => onOpen(doc.id)}>
          開く
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-tap"
          onClick={() => onDuplicate(doc)}
          disabled={busy}
        >
          <Copy className="mr-1 h-4 w-4" aria-hidden="true" />複製する
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="min-h-tap min-w-tap shrink-0"
          onClick={() => onDelete(doc)}
          disabled={busy || doc.status === "fixed"}
          title={doc.status === "fixed" ? "確定した資料は削除できません" : "削除"}
          aria-label="削除"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

/** 右の列・上「作成の手順」（モックの3段） */
function HowToCard() {
  const steps = [
    { title: "名前を付ける", body: "「本番用 映像プラン」のように、何のための資料かが分かる名前" },
    { title: "新規作成か前の資料の複製", body: "複製すると映像パッチの行と技術スタッフをそのまま引き継ぐ" },
    { title: "映像パッチ・技術スタッフを入力する", body: "機材を選ぶとパッチ番号の候補が絞られる。人は技術人員から選ぶ" },
  ];
  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-cardtitle">作成の手順</span>
      </div>
      <ol className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-2.5">
            <span className="font-number mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-badge text-primary-foreground">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sub font-bold">{s.title}</span>
              <span className="mt-0.5 block text-sub-sm text-muted-foreground">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 border-t border-dashed border-border pt-2.5 text-sub-sm text-muted-foreground">
        資料番号は作成したときに採番されます。番号は後から変わりません。
      </p>
    </section>
  );
}

/** 右の列・下「管理」（manager だけに出す。中身は⑤⑥への入口） */
function AdminCard() {
  const links = [
    { to: "/techops/tech-panels", label: "パッチ盤", sub: "パッチ番号ごとの機材と名称", icon: Cable },
    { to: "/techops/tech-persons", label: "技術人員", sub: "会社ごとの人と役職", icon: Users },
  ];
  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-cardtitle">管理</span>
      </div>
      <div className="mt-3 space-y-2">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="flex min-h-tap items-center gap-2.5 rounded-control border border-border bg-card p-2.5 hover:bg-accent"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-primary-surface-weak text-primary">
              <l.icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sub font-bold">{l.label}</span>
              <span className="block text-sub-sm text-muted-foreground">{l.sub}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}

export default function TechDocListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("qsheet", "manager");
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const projectFilter = searchParams.get("project");
  const programFilter = searchParams.get("program");
  const hasOwnerFilter = !!(projectFilter || programFilter);

  const listQuery = useQuery({
    queryKey: ["tech-docs", "list", projectFilter, programFilter],
    queryFn: () => techApi.listTechDocs({
      project: projectFilter || undefined,
      program: programFilter || undefined,
    }),
    placeholderData: keepPreviousData,
  });
  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: rows.length, draft: 0, fixed: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  const filteredRows = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    next.delete("program");
    setSearchParams(next);
  };

  // 名前の表示だけに使う（`VenueListPage.tsx` と同じ `/lookup` 系）
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

  const duplicateMutation = useMutation({
    mutationFn: (doc: TechDocListItem) => techApi.createTechDoc({
      title: `${doc.title}（複製）`,
      project_id: doc.project_id,
      program_id: doc.program_id,
      copy_from: doc.id,
    }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["tech-docs", "list"] });
      notifySuccess(`${row.doc_no ?? row.title} を作成しました`, { description: "複製した資料を開けます。" });
    },
    onError: () => notifyError("複製できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (doc: TechDocListItem) => techApi.deleteTechDoc(doc.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tech-docs", "list"] });
      notifySuccess("技術資料を削除しました");
    },
    onError: () => notifyError("削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const askDelete = async (doc: TechDocListItem) => {
    const ok = await confirmAction({
      title: "技術資料を削除しますか",
      description: `${doc.doc_no ? `${doc.doc_no} ` : ""}${doc.title || "（無題）"} の映像パッチと技術スタッフも一緒に消えます。`,
      confirmLabel: "削除",
      tone: "danger",
    });
    if (ok) deleteMutation.mutate(doc);
  };

  const busy = duplicateMutation.isPending || deleteMutation.isPending;

  return (
    <PageShell>
      <PageHeader
        title="技術資料"
        sub="映像パッチと技術スタッフを案件ごとにまとめ、書き出して配布する"
        primaryAction={
          <Button className="min-h-tap" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />技術資料を作成
          </Button>
        }
      />

      {hasOwnerFilter && (
        <div className="flex items-center gap-2 rounded-note border border-border bg-primary/5 px-4 py-2.5" role="status">
          <span className="text-sub">
            <span>{ownerName ?? "…"}</span>
            の技術資料
          </span>
          <Button variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={clearFilter} aria-label="絞り込み解除">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      <FilterChips
        label="状態で絞り込む"
        value={statusFilter}
        onChange={setStatusFilter}
        items={[
          { key: "all", label: "すべて", count: counts.all },
          { key: "draft", label: "下書き", count: counts.draft },
          { key: "fixed", label: "確定", count: counts.fixed },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {listQuery.isLoading && (
            <Delayed>
              <SkeletonRows rows={3} />
            </Delayed>
          )}

          {listQuery.isError && (
            <ErrorPanel title="技術資料を読み込めませんでした" error={listQuery.error} onRetry={() => listQuery.refetch()} />
          )}

          {!listQuery.isLoading && !listQuery.isError && filteredRows.length === 0 && (
            <EmptyState
              icon={<Cable />}
              title="この条件に合う技術資料はありません"
              description="「技術資料を作成」から最初の1件を作成できます。"
            />
          )}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filteredRows.map((doc) => (
              <TechDocCard
                key={doc.id}
                doc={doc}
                busy={busy}
                onOpen={(id) => navigate(`/techops/tech-docs/${id}`)}
                onDuplicate={(d) => duplicateMutation.mutate(d)}
                onDelete={(d) => void askDelete(d)}
              />
            ))}
          </div>
        </div>

        <aside className="space-y-3">
          <HowToCard />
          {canManage && <AdminCard />}
        </aside>
      </div>

      <CreateTechDocDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        lockedOwner={hasOwnerFilter ? { projectId: projectFilter, programId: programFilter, label: ownerName ?? "" } : undefined}
        onCreated={(row) => {
          queryClient.invalidateQueries({ queryKey: ["tech-docs", "list"] });
          navigate(`/techops/tech-docs/${row.id}`);
        }}
      />
    </PageShell>
  );
}
