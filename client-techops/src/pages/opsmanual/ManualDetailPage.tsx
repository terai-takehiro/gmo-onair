// マニュアル1件の画面（`/techops/manuals/:id`・段A＋段B＋段C＋段E）。ページの一覧・追加・削除・
// 並べ替え・章名/タイトルの編集（段A）、選択中ページのキャンバス（自由ブロック5種）の編集・自動保存
// （段B）に加え、他ミニアプリの情報を置く「差し込みブロック」の追加（`insertTab`/`InsertPanel`）・
// 解決結果の表示（`getManualResolve`/`renderBlockContent`）・秘密の伏せ字解除
// （`LinkedBlockInspector` 経由）を持つ（段C）。マニュアルまるごとの編集ロック（`useManualEditLock`・
// §6-2-1）と確定済み（status==='fixed'）のときの読み取り専用化を段Eで追加。テンプレートは今回も
// 実装しない。PDF書き出し・仕上がり画面は段D（`/techops/manuals/:id/preview`・
// `ManualPreviewPage.tsx`）で、ここからは見出し脇の「仕上がり」で遷移するだけ。
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import type { ManualBlock, ManualDetail, ManualPage } from "@gmo-onair/shared/src/opsmanual/types";
import * as manualApi from "@/lib/manualApi";
import { useAuth } from "@/hooks/useAuth";
import { MANUAL_STATUS_LABEL, MANUAL_STATUS_BADGE_VARIANT } from "@/components/opsmanual/manualStatus";
import { movePage, pagesSorted } from "@/components/opsmanual/pageOrder";
import PageRail from "./PageRail";
import BlockToolbar from "./BlockToolbar";
import BlockInspector from "./BlockInspector";
import InsertPanel from "./InsertPanel";
import ManualCanvas, { type ManualCanvasHandle } from "./ManualCanvas";
import ManualCanvasHeaderOverlay from "./ManualCanvasHeaderOverlay";
import renderManualBlockContent from "./ManualBlockContent";
import { useManualPageAutosave } from "./useManualPageAutosave";
import { useManualDetailMutations } from "./useManualDetailMutations";
import { useManualEditLock } from "./useManualEditLock";
import ManualLockBanner from "./ManualLockBanner";
import ManualServiceDateField from "./ManualServiceDateField";
import DeleteManualDialog from "./DeleteManualDialog";
import { getManualResolve } from "@/lib/manualResolveApi";

export default function ManualDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  // どのページをキャンバス（ManualCanvas）に表示するか（段B）。既定は先頭ページ
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

  // マニュアルまるごとの編集ロック（段E・§6-2-1）。qsheet editor 権限が無い（reader）・
  // 確定済み（status==='fixed'）のときはそもそも取りに行かない——読み取り専用の理由が
  // 別にあるので、ロックの取り合いに参加させる必要が無い。`manual` を読み込むまでは
  // status が分からないので `!!manual` も条件に入れる。
  const { currentUser, hasPermission } = useAuth();
  const canEdit = hasPermission("qsheet", "editor");
  const canManage = hasPermission("qsheet", "manager");
  const isFixed = manual?.status === "fixed";
  const lockEnabled = !!manual && canEdit && !isFixed;
  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["manuals", "detail", id] }),
    [queryClient, id],
  );
  // `onFixed`: 保持者がハートビートで初めて確定に気づいたとき（外部レビュー再指摘・
  // P1）に呼ぶ——マニュアルの詳細を引き直してstatus='fixed'を画面に反映する
  // （`lockEnabled`/`isFixed`は次のレンダーで自動的に読み取り専用側へ倒れる）。
  const lock = useManualEditLock(id, currentUser?.id, lockEnabled, invalidate);
  // 実際に書き込んでよいか。この1つの値だけを見て、キャンバス・ページ操作・タイトルの編集を
  // まとめて読み取り専用に切り替える（`guardedCommitBlocks`・`<fieldset disabled>`・
  // タイトルの `disabled` の3か所がこれを参照する）。
  const editable = lockEnabled && lock.held;

  // 差し込みブロック（段C）の解決結果。差し込み元は他の利用者の操作でも変わりうるが、
  // 開くたびに毎回引き直すほどではないため staleTime を持たせる（常識的な設定でよい・§5-4）
  const resolveQuery = useQuery({
    queryKey: ["manuals", "resolve", id],
    queryFn: () => getManualResolve(id),
    enabled: !!id,
    staleTime: 30_000,
  });
  const resolveResults = resolveQuery.data;

  // 選択中ページが無い・削除された・マニュアルを開いた直後は先頭ページを選ぶ
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

  // キャンバスの自動保存が成功したら、キャッシュ側の該当ページも差し替える（"detail" は
  // invalidate せず setQueryData で差し替える — 再取得するとローカルの編集途中を
  // 巻き戻してしまうため）。⚠️ レビュー指摘: 差し込みブロックの追加・秘密の解除も
  // ここを通るが "resolve"（別クエリ・staleTime 30秒）は触れておらず、新しいブロックが
  // 「読み込み中…」のまま進まなかった。"resolve" は再取得してもローカル編集を
  // 巻き戻さないので invalidate してよい。
  const handleBlocksSaved = useCallback((row: ManualPage) => {
    queryClient.setQueryData<ManualDetail | undefined>(["manuals", "detail", id], (prev) => {
      if (!prev) return prev;
      return { ...prev, pages: prev.pages.map((p) => (p.id === row.id ? { ...p, ...row } : p)) };
    });
    queryClient.invalidateQueries({ queryKey: ["manuals", "resolve", id] });
  }, [queryClient, id]);

  const { blocks, commitBlocks, saving: blocksSaving, flush: flushBlocks, syncPageRevision, commitMetadata, waitForCurrentPageSave } = useManualPageAutosave(
    currentPage,
    handleBlocksSaved,
    invalidate,
  );

  // 保存系の操作（onCommit系）の唯一の関所——`ManualCanvas`・`commitViaHistory`
  // （右パネル・追加ツールバー）ともここを通る。読み取り専用の間は黙って何もしない
  // （`blocks` state が動かないだけで、保存されないことだけを保証する）。
  const guardedCommitBlocks = useCallback(
    (next: ManualBlock[]) => {
      if (!editable) return;
      commitBlocks(next);
    },
    [editable, commitBlocks],
  );

  const handleSelectPage = (pageId: string) => {
    if (pageId === selectedPageId) return;
    flushBlocks(); // 切替前の未保存分を即座に送る
    setSelectedPageId(pageId);
    setSelectedBlockId(null);
  };

  // キャンバスの undo 履歴（ManualCanvas 側の useManualHistory）にも1手として積む。
  // 未マウント（ページ未選択）のときだけ commitBlocks に直接フォールバックする
  const commitViaHistory = useCallback(
    (next: ManualBlock[]) => {
      if (canvasRef.current) canvasRef.current.commit(next);
      else guardedCommitBlocks(next);
    },
    [guardedCommitBlocks],
  );

  // 置いた直後に選択状態にする（Ctrl+D の複製と同じ扱い。空の文字ブロックは枠も背景も持たず、選択しないと置けているのに気づけない・利用者指摘）
  const handleAddBlock = (block: ManualBlock) => { commitViaHistory([...blocks, block]); canvasRef.current?.select(block.id); };

  // `ManualCanvas` は `resolve` の結果を知らない（段Bのスコープのまま）ので、
  // ここで renderManualBlockContent をクロージャで包んで、いま引いている resolve 結果を渡す
  const renderBlockContent = useCallback(
    (block: ManualBlock, ctx: Parameters<typeof renderManualBlockContent>[1]) =>
      renderManualBlockContent(block, ctx, resolveResults?.[block.id]),
    [resolveResults],
  );

  // タイトル・ページ追加/更新/削除/並べ替え・マニュアル削除の通信処理は1つの hook にまとめてある
  // （役割で分ける・400行の壁。中身は `useManualDetailMutations.ts`）
  const {
    titleMutation, addPageMutation, updatePageMutation, deletePageMutation, reorderMutation, deleteManualMutation,
  } = useManualDetailMutations({
    id, manualUpdatedAt: manual?.updated_at, queryClient, invalidate, commitMetadata, waitForCurrentPageSave,
    syncPageRevision, navigate, setDeleteOpen, setDeletingPageId,
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
        <ErrorPanel title="マニュアルを読み込めませんでした" error={detailQuery.error} onRetry={() => detailQuery.refetch()} />
      )}

      {manual && (
        <>
          <PageHeader
            title={
              <BufferedInput
                value={manual.title}
                onCommit={(v) => titleMutation.mutate(v)}
                disabled={!editable}
                className={cn(
                  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base sm:text-sm",
                  "placeholder:text-muted-foreground",
                  "file:border-0 file:bg-transparent file:text-sm file:font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
                  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
                  "h-11 max-w-xl border-transparent bg-transparent px-0 text-h1 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-3"
                )}
                aria-label="マニュアルのタイトル"
              />
            }
            sub={
              <span className="flex flex-wrap items-center gap-2">
                {manual.doc_no && <span className="font-number">{manual.doc_no}</span>}
                <Badge variant={MANUAL_STATUS_BADGE_VARIANT[manual.status]}>{MANUAL_STATUS_LABEL[manual.status]}</Badge>
                {manual.project_name && <span>{manual.gls_number ? `${manual.gls_number} ・ ` : ""}{manual.project_name}</span>}
                {manual.program_name && <span>{manual.program_name}</span>}
                <ManualServiceDateField
                  manualId={id}
                  serviceDate={manual.service_date}
                  updatedAt={manual.updated_at}
                  editable={editable}
                  onInvalidate={invalidate}
                />
              </span>
            }
            primaryAction={
              <div className="flex items-center gap-2">
                <Button variant="outline" className="min-h-tap" onClick={() => navigate(`/techops/manuals/${id}/preview`)}>
                  <Printer className="mr-1 h-4 w-4" aria-hidden="true" />仕上がり
                </Button>
                <Button
                  variant="outline"
                  className="min-h-tap text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={!editable}
                  title={!editable ? "編集ロックを持っている間だけ削除できます" : undefined}
                >
                  <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />マニュアルを削除
                </Button>
              </div>
            }
          />

          <ManualLockBanner isFixed={isFixed} canEdit={canEdit} canManage={canManage} lock={lock} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_260px]">
            {/* 読み取り専用の間は中の入力欄・ボタンがまとめて disabled になる
                （`className="contents"` なのでグリッドの列組みは変わらない。
                `client-techops` 既存の `RecordingPage.tsx` 等と同じ手当て）。
                キャンバスのドラッグ等（フォーム部品を経由しない操作）は `guardedCommitBlocks` 側で止める */}
            <fieldset disabled={!editable} className="contents">
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
                    onCommit={guardedCommitBlocks}
                    onSelectionChange={setSelectedBlockId}
                    renderBlockContent={renderBlockContent}
                    headerOverlay={<ManualCanvasHeaderOverlay manual={manual} pageId={currentPage.id} />}
                  />
                ) : (
                  <div className="flex min-h-[400px] items-center justify-center rounded-card border border-dashed border-border bg-muted/20 p-8 text-center text-sub text-muted-foreground">
                    ページを選んでください。
                  </div>
                )}
              </div>

              <BlockInspector manualId={id} blocks={blocks} selectedBlockId={selectedBlockId} onCommit={commitViaHistory} />
            </fieldset>
          </div>
        </>
      )}

      <DeleteManualDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => deleteManualMutation.mutate()}
        pending={deleteManualMutation.isPending}
      />
    </PageShell>
  );
}
