/**
 * 進行台本の一覧（`/techops/sheets`）。
 *
 * 実装設計: docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md §8 PR G。
 * 旧 `DashboardPage.tsx`（832行）を分割したもの — カード（`sheets/DocCard.tsx`）・
 * 共有ダイアログ（`sheets/ShareDialog.tsx`）・新規作成ダイアログ（`sheets/CreateSheetDialog.tsx`）・
 * 型とヘルパー（`sheets/types.ts`）に切り出し、このファイルは一覧そのものの状態管理だけを持つ。
 *
 * ⚠️ `canManage`（共有・削除ボタンの出し分け）は**クライアント側で計算する**。
 * サーバーに移すのは機能追加であって「今あるものを保つ」ではない、と設計書 §11 #6・§8 PR G の
 * 注記にある。ここでは今までどおり `isAdmin || doc.created_by === currentUser.id` で計算する。
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardHeader, EmptyState } from "@gmo-onair/shared/src/client/dashboard";
import { useDebounced } from "@gmo-onair/shared/src/client/hooks/useDebounced";
import { useAuth } from "@/hooks/useAuth";
import { notifySuccess, notifyError } from "@/lib/notify";
import { FileText, Plus, Search, Loader2, FolderKanban, X } from "lucide-react";
import { DocCard } from "./sheets/DocCard";
import { ShareDialog } from "./sheets/ShareDialog";
import { CreateSheetDialog } from "./sheets/CreateSheetDialog";
import { type QsheetDocument, type SheetScope, SHEET_SCOPE_LABEL } from "./sheets/types";

export default function SheetListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === "system_admin";
  const [shareDoc, setShareDoc] = useState<QsheetDocument | null>(null);
  const [search, setSearch] = useState("");
  // 一覧APIは全ドキュメントの台本JSONBごと返す重い口なので、打鍵ごとに問い合わせない。
  // 遅らせるのは問い合わせの鍵だけで、入力欄は `search`（即時）のまま
  const debouncedSearch = useDebounced(search, 300);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const projectFilter = searchParams.get("project");
  const programFilter = searchParams.get("program");
  const dateFilter = searchParams.get("date") || "";
  const scopeFilter = (searchParams.get("scope") as SheetScope | null) || "all";

  const setQueryParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const { data: documents, isLoading, isError } = useQuery({
    queryKey: ["qsheet-documents", debouncedSearch, projectFilter, programFilter, dateFilter, scopeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (projectFilter) params.set("project_id", projectFilter);
      if (programFilter) params.set("program_id", programFilter);
      if (dateFilter) params.set("date", dateFilter);
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      const res = await api.get(`/techops/documents?${params}`);
      return res.data.data as QsheetDocument[];
    },
    retry: false,
    // 遅らせた値が切り替わる瞬間に一覧を骨組みへ戻さない（`RentalSearchPage` と同じ形）
    placeholderData: keepPreviousData,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/techops/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
      notifySuccess("進行台本を削除しました");
    },
    onError: () => {
      notifyError("進行台本を削除できませんでした。少し待ってから、もう一度お試しください。");
    },
  });

  const handleDelete = (id: string) => setDeleteTargetId(id);
  const confirmDelete = () => {
    if (deleteTargetId) {
      deleteMutation.mutate(deleteTargetId);
      setDeleteTargetId(null);
    }
  };

  const clearProjectFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("project");
    setSearchParams(next);
  };

  const clearProgramFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("program");
    setSearchParams(next);
  };

  return (
    <div className="min-h-full bg-background text-foreground">
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 sm:py-8 space-y-5">
        <DashboardHeader
          title="進行台本"
          description={`${documents?.length || 0} 件の進行台本。日付・自分が作った／共有された、で絞り込めます。`}
          lastUpdated={
            documents && documents.length > 0
              ? `最終更新 ${new Date(Math.max(...documents.map((d) => new Date(d.updated_at).getTime())))
                  .toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
              : undefined
          }
          controls={
            <Button className="min-h-[44px]" onClick={() => setShowCreate(true)} data-create-btn>
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              新規作成
            </Button>
          }
        />

        {/* Project filter banner */}
        {projectFilter && documents && documents.length > 0 && documents[0].project_name && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-primary/5 px-4 py-2.5" role="status">
            <FolderKanban className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">
              <span className="font-medium">{documents[0].gls_number}</span>
              <span className="text-muted-foreground ml-1">{documents[0].project_name}</span>
              の進行台本
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              onClick={clearProjectFilter}
              aria-label="案件フィルタ解除"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {/* Program (manual) filter banner */}
        {programFilter && documents && documents.length > 0 && documents[0].program_name && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-primary/5 px-4 py-2.5" role="status">
            <FolderKanban className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-sm">
              <span className="font-medium">{documents[0].program_name}</span>
              の進行台本
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              onClick={clearProgramFilter}
              aria-label="番組フィルタ解除"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {/* Search / date / scope filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative max-w-sm sm:max-w-md flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="タイトルで検索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 min-h-[44px]"
              aria-label="進行台本検索"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setQueryParam("date", e.target.value)}
              className="min-h-[44px] sm:w-44"
              aria-label="放送日で絞り込み"
            />
            {dateFilter && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setQueryParam("date", "")}
                aria-label="日付フィルタ解除"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
          <Select value={scopeFilter} onValueChange={(v) => setQueryParam("scope", v === "all" ? "" : v)}>
            <SelectTrigger className="min-h-[44px] sm:w-44" aria-label="作成者で絞り込み">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SHEET_SCOPE_LABEL) as SheetScope[]).map((s) => (
                <SelectItem key={s} value={s}>{SHEET_SCOPE_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Document list — single column */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="読み込み中" />
          </div>
        ) : isError ? (
          <EmptyState
            title="データを取得できませんでした"
            description="サーバー接続を確認してから再試行してください。"
          />
        ) : documents && documents.length > 0 ? (
          <div className="grid gap-3">
            {documents.map((doc) => (
              <DocCard
                key={doc.id}
                doc={doc}
                canManage={isAdmin || (!!currentUser && doc.created_by === currentUser.id)}
                onNavigate={(id) => navigate(`/techops/editor/${id}`)}
                onOnAir={(id) => navigate(`/techops/onair/${id}`)}
                onDelete={handleDelete}
                onShare={setShareDoc}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FileText />}
            title="まだ進行台本がありません"
            description="「新規作成」から最初の進行台本を作りましょう。"
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                最初の進行台本を作る
              </Button>
            }
          />
        )}
      </main>

      <CreateSheetDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        defaultProjectId={projectFilter}
        defaultProgramId={programFilter}
        onCreated={(doc) => navigate(`/techops/editor/${doc.id}`)}
      />

      {/* 共有設定ダイアログ */}
      <ShareDialog
        doc={shareDoc}
        onClose={() => setShareDoc(null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["qsheet-documents"] });
          if (shareDoc) queryClient.invalidateQueries({ queryKey: ["qsheet-shares", shareDoc.id] });
        }}
      />

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteTargetId !== null} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>この進行台本を削除しますか？</DialogTitle>
            <DialogDescription>
              この操作は取り消せません。進行台本が完全に削除されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "削除中…" : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
