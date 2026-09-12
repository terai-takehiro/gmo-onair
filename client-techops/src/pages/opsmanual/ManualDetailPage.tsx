// 冊子1件の画面（`/techops/manuals/:id`・段A＋段B＋段C）。ページの一覧・追加・削除・並べ替え・
// 章名/題の編集（段A）、選択中ページの紙面（自由ブロック5種）の編集・自動保存（段B）に加え、
// 他ミニアプリの情報を置く「差し込みブロック」の追加（`insertTab`/`InsertPanel`）・解決結果の
// 表示（`getManualResolve`/`renderBlockContent`）・秘密の伏せ字解除（`LinkedBlockInspector`
// 経由）を持つ（段C）。確定・編集ロック・ひな形は段E、PDF書き出し・仕上がり画面は段Dで、
// いずれも今回は実装しない。
import { useCallback, useEffect, useRef, useState } from "react";
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
import type { ManualBlock, ManualDetail, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import * as manualApi from "@/lib/manualApi";
import { isConflict } from "@/lib/manualApi";
import { notifyError } from "@/lib/notify";
import { MANUAL_STATUS_LABEL, MANUAL_STATUS_BADGE_VARIANT } from "@/components/opsmanual/manualStatus";
import { movePage, pagesSorted } from "@/components/opsmanual/pageOrder";
import PageRail from "./PageRail";
import BlockToolbar from "./BlockToolbar";
import BlockInspector from "./BlockInspector";
import InsertPanel from "./InsertPanel";
import ManualCanvas, { type ManualCanvasHandle } from "./ManualCanvas";
import renderManualBlockContent from "./ManualBlockContent";
import { useManualPageAutosave } from "./useManualPageAutosave";
import { getManualResolve } from "@/lib/manualResolveApi";

export default function ManualDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  // どのページを紙面（ManualCanvas）に表示するか（段B）。既定は先頭ページ
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  // ManualCanvas の undo 履歴（ページ単位）に、右パネル・追加ツールバーからの変更も
  // 1手として積むための入口（`ManualCanvas` に `key={ページID}` を渡して切替のたびに
  // 再マウントしているので、ページを切り替えると ref も新しいインスタンスに差し替わる）
  const canvasRef = useRef<ManualCanvasHandle>(null);
  // 左上の「追加」「差し込む」の2つの入口をタブで切り替える（段C・§6③「別画面にしない」）
  const [insertTab, setInsertTab] = useState<"add" | "link">("add");

  const detailQuery = useQuery({
    queryKey: ["manuals", "detail", id],
    queryFn: () => manualApi.getManual(id),
    enabled: !!id,
  });
  const manual = detailQuery.data;

  // 差し込みブロック（段C）の解決結果。差し込み元は他の利用者の操作でも変わりうるが、
  // 開くたびに毎回引き直すほどではないため staleTime を持たせる（常識的な設定でよい・§5-4）
  const resolveQuery = useQuery({
    queryKey: ["manuals", "resolve", id],
    queryFn: () => getManualResolve(id),
    enabled: !!id,
    staleTime: 30_000,
  });
  const resolveResults = resolveQuery.data;

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["manuals", "detail", id] }),
    [queryClient, id],
  );

  // 選択中ページが無い・削除された・冊子を開いた直後は先頭ページを選ぶ
  useEffect(() => {
    if (!manual) return;
    const sorted = pagesSorted(manual.pages);
    if (sorted.length === 0) return;
    if (!selectedPageId || !sorted.some((p) => p.id === selectedPageId)) {
      setSelectedPageId(sorted[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual?.id, manual?.pages]);

  const currentPage = manual?.pages.find((p) => p.id === selectedPageId);

  // 紙面の自動保存が成功したら、キャッシュ側の該当ページも差し替える
  // （invalidate はしない — 再取得すると自分がいま持っているローカルの編集途中を
  // 巻き戻してしまう。次にこのページへ戻ってきたときのため updated_at/blocks だけ進める）。
  const handleBlocksSaved = useCallback((row: ManualPage) => {
    queryClient.setQueryData<ManualDetail | undefined>(["manuals", "detail", id], (prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) => (p.id === row.id ? { ...p, ...row } : p)) };
    });
  }, [queryClient, id]);

  const handleBlocksConflict = useCallback(() => { invalidate(); }, [invalidate]);

  const { blocks, commitBlocks, saving: blocksSaving, flush: flushBlocks } = useManualPageAutosave(
    currentPage,
    handleBlocksSaved,
    handleBlocksConflict,
  );

  const handleSelectPage = (pageId: string) => {
    if (pageId === selectedPageId) return;
    flushBlocks(); // 切替前の未保存分を即座に送る
    setSelectedPageId(pageId);
    setSelectedBlockId(null);
  };

  // 紙面の undo 履歴（ManualCanvas 側の useManualHistory）にも1手として積む。
  // 未マウント（ページ未選択）のときだけ commitBlocks に直接フォールバックする
  const commitViaHistory = useCallback(
    (next: ManualBlock[]) => {
      if (canvasRef.current) canvasRef.current.commit(next);
      else commitBlocks(next);
    },
    [commitBlocks],
  );

  const handleAddBlock = (block: ManualBlock) => commitViaHistory([...blocks, block]);

  // `ManualCanvas` は `resolve` の結果を知らない（段Bのスコープのまま）ので、
  // ここで renderManualBlockContent をクロージャで包んで、いま引いている resolve 結果を渡す
  const renderBlockContent = useCallback(
    (block: ManualBlock, ctx: Parameters<typeof renderManualBlockContent>[1]) =>
      renderManualBlockContent(block, ctx, resolveResults?.[block.id]),
    [resolveResults],
  );

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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_260px]">
            <PageRail
              pages={manual.pages}
              selectedId={selectedPageId}
              onSelect={handleSelectPage}
              onAdd={() => addPageMutation.mutate()}
              onMove={handleMove}
              onUpdate={(pageId, patch) => updatePageMutation.mutate({ pageId, patch })}
              onDelete={(pageId) => deletePageMutation.mutate(pageId)}
              adding={addPageMutation.isPending}
              deletingId={deletingPageId}
            />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 rounded-control border border-border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setInsertTab("add")}
                    className={cn(
                      "min-h-tap rounded-control px-3 py-1 text-sub-sm font-medium transition-colors",
                      insertTab === "add" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    追加
                  </button>
                  <button
                    type="button"
                    onClick={() => setInsertTab("link")}
                    className={cn(
                      "min-h-tap rounded-control px-3 py-1 text-sub-sm font-medium transition-colors",
                      insertTab === "link" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    差し込む
                  </button>
                </div>
                {blocksSaving && <span className="shrink-0 text-sub-sm text-muted-foreground">保存中…</span>}
              </div>

              {insertTab === "add" ? (
                <BlockToolbar blocks={blocks} onAdd={handleAddBlock} />
              ) : (
                <InsertPanel manualId={id} blocks={blocks} onAdd={handleAddBlock} isProgram={!!manual.program_id} />
              )}

              {currentPage ? (
                <ManualCanvas
                  // ページ切替のたびに再マウントし、前のページの undo 履歴（pastRef/futureRef）
                  // を持ち越さない（段Bのバグ修正: 切替後の Ctrl+Z が別ページを上書きしていた）
                  key={currentPage.id}
                  ref={canvasRef}
                  blocks={blocks}
                  onCommit={commitBlocks}
                  onSelectionChange={setSelectedBlockId}
                  renderBlockContent={renderBlockContent}
                />
              ) : (
                <div className="flex min-h-[400px] items-center justify-center rounded-card border border-dashed border-border bg-muted/20 p-8 text-center text-sub text-muted-foreground">
                  ページを選んでください。
                </div>
              )}
            </div>

            <BlockInspector blocks={blocks} selectedBlockId={selectedBlockId} onCommit={commitViaHistory} />
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
