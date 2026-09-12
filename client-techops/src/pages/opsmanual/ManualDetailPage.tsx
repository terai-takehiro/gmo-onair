// 冊子1件の画面（`/techops/manuals/:id`・段A）。ページの一覧・追加・削除・並べ替え・
// 章名/題の編集だけを持つ。紙面のブロック編集（キャンバス）はまだ無い（段Bで追加）。
// 確定・編集ロック・秘密の伏せ字解除・PDF書き出し・ひな形・AIは実装しない。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import type { ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import * as manualApi from "@/lib/manualApi";
import { isConflict } from "@/lib/manualApi";
import { notifyError } from "@/lib/notify";
import { MANUAL_STATUS_LABEL, MANUAL_STATUS_BADGE_VARIANT } from "@/components/opsmanual/manualStatus";
import { movePage } from "@/components/opsmanual/pageOrder";
import PageRail from "./PageRail";

export default function ManualDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ["manuals", "detail", id],
    queryFn: () => manualApi.getManual(id),
    enabled: !!id,
  });
  const manual = detailQuery.data;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["manuals", "detail", id] });

  const titleMutation = useMutation({
    mutationFn: (value: string) => manualApi.updateManual(id, { title: value, expected_updated_at: manual?.updated_at }),
    onSuccess: invalidate,
    onError: (err: unknown) => {
      if (isConflict(err)) {
        notifyError("ほかの人が先に保存していました。", { description: "最新の内容を読み込み直します。" });
        invalidate();
        return;
      }
      notifyError("題を保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  const addPageMutation = useMutation({
    mutationFn: () => manualApi.addPage(id, {}),
    onSuccess: invalidate,
    onError: () => notifyError("ページを追加できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const updatePageMutation = useMutation({
    mutationFn: ({ pageId, patch }: { pageId: string; patch: { title?: string; chapter?: string | null } }) =>
      manualApi.updatePage(id, pageId, patch),
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
    mutationFn: (order: { id: string; sort_order: number }[]) => manualApi.reorderPages(id, order),
    onSuccess: invalidate,
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
      notifyError("冊子を削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    },
  });

  const handleMove = (page: ManualPage, direction: -1 | 1) => {
    const order = movePage(manual?.pages ?? [], page, direction);
    if (order) reorderMutation.mutate(order);
  };

  return (
    <PageShell>
      <button
        type="button"
        onClick={() => navigate("/techops/manuals")}
        className="inline-flex min-h-tap w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        運営マニュアルの一覧に戻る
      </button>

      {detailQuery.isLoading && (
        <Delayed>
          <SkeletonRows rows={3} />
        </Delayed>
      )}

      {detailQuery.isError && (
        <ErrorPanel title="冊子を読み込めませんでした" error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      )}

      {manual && (
        <>
          <PageHeader
            title={
              <BufferedInput
                value={manual.title}
                onCommit={(v) => titleMutation.mutate(v)}
                className={cn(
                  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm",
                  "placeholder:text-muted-foreground",
                  "file:border-0 file:bg-transparent file:text-sm file:font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
                  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
                  "h-11 max-w-xl border-transparent bg-transparent px-0 text-h1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-3"
                )}
                aria-label="冊子の題"
              />
            }
            sub={
              <span className="flex flex-wrap items-center gap-2">
                {manual.doc_no && <span className="font-number">{manual.doc_no}</span>}
                <Badge variant={MANUAL_STATUS_BADGE_VARIANT[manual.status]}>{MANUAL_STATUS_LABEL[manual.status]}</Badge>
                {manual.project_name && <span>{manual.gls_number ? `${manual.gls_number} ・ ` : ""}{manual.project_name}</span>}
                {manual.program_name && <span>{manual.program_name}</span>}
              </span>
            }
            primaryAction={
              <Button variant="outline" className="min-h-tap text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />冊子を削除
              </Button>
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
            <PageRail
              pages={manual.pages}
              onAdd={() => addPageMutation.mutate()}
              onMove={handleMove}
              onUpdate={(pageId, patch) => updatePageMutation.mutate({ pageId, patch })}
              onDelete={(pageId) => deletePageMutation.mutate(pageId)}
              adding={addPageMutation.isPending}
              deletingId={deletingPageId}
            />

            <div className="flex min-h-[400px] flex-col items-center justify-center rounded-card border border-dashed border-border bg-muted/20 p-8 text-center">
              <p className="text-cardtitle text-foreground">紙面はまだありません</p>
              <p className="mt-1 max-w-sm text-sub text-muted-foreground">
                ページの中身（ブロック）を組む画面は、この先の作業で追加します。いまはページの構成（章・題・並び）だけを整えられます。
              </p>
            </div>
          </div>
        </>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>この冊子を削除しますか？</DialogTitle>
            <DialogDescription>この操作は取り消せません。冊子とすべてのページが削除されます。</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>キャンセル</Button>
            <Button variant="destructive" onClick={() => deleteManualMutation.mutate()} disabled={deleteManualMutation.isPending}>
              {deleteManualMutation.isPending ? "削除中…" : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
