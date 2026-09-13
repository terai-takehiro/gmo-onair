// 運営マニュアル — スマホの閲覧専用画面（段E・production-manual.md §6⑥
// 「閲覧（スマホ・同じURL）」）。"/techops/manuals/:id" はスマホのときだけこの画面に
// 入れ替わる（薄い親 `ManualDetailRouter.tsx`）。
//
// 1画面1目的:「いまのページを見る」に絞る——章の帯 → いまのページのキャンバス → 前後にめくる、
// だけ。編集操作は一切出さない。キャンバスは `ManualPrintDocument`（段D・print-document 担当の
// 実装）を「範囲＝いまの1ページだけ・ヘッダーの時点/ページ番号/表紙/目次は出さない」設定で
// 呼び出すだけで、中身コンポーネント（`renderManualBlockContent` の selected:false 経路）を
// 作り直さない——編集画面と閲覧画面がここで食い違うことがない。
//
// 下端の「PDFを開く」は `<PageHeader primaryAction>` の差し込み口（共通シェルがスマホでは
// 画面下端に固定して置く。ここで `position: fixed` を自分で書かない——`pageShell.tsx` の
// 「`env(safe-area-inset-bottom)` をここで持たない理由」と同じ話）。
//
// 「一覧に戻る」の行き先は /techops/manuals（マニュアルの文脈を保つ。/techops/top へは逃がさない・§6⑥）。
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { BookOpenText, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "@gmo-onair/shared/src/opsmanual/types";
import * as manualApi from "@/lib/manualApi";
import { getManualResolve } from "@/lib/manualResolveApi";
import { notifyError } from "@/lib/notify";
import { MANUAL_STATUS_LABEL, MANUAL_STATUS_BADGE_VARIANT } from "@/components/opsmanual/manualStatus";
import { pagesSorted } from "@/components/opsmanual/pageOrder";
import ManualPrintDocument, { type ManualExportSettings } from "./ManualPrintDocument";
import { defaultManualExportSettings } from "./ManualExportSettingsPanel";
import { exportManualToPdf } from "./manualPrintExport";

const MM_TO_PX = 96 / 25.4; // ManualPreviewPage.tsx と同じ換算（§8-3）

/** いまのページの章。`page.chapter` が入っているページ＝章の先頭（`ManualPrintToc.tsx` と
 *  同じ規則）なので、いまのページから遡って最初に見つかった章名を「いまの章」として出す。
 *  1件も無ければ null（章の帯そのものを出さない）。 */
function currentChapterLabel(sorted: { chapter: string | null }[], index: number): string | null {
  for (let i = Math.min(index, sorted.length - 1); i >= 0; i--) {
    const chapter = sorted[i]?.chapter;
    if (chapter && chapter.trim() !== "") return chapter;
  }
  return null;
}

export default function ManualMobileViewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);

  const detailQuery = useQuery({
    queryKey: ["manuals", "detail", id],
    queryFn: () => manualApi.getManual(id),
    enabled: !!id,
  });
  const manual = detailQuery.data;

  // PC編集画面と同じキー・同じ staleTime（段C）——タブを行き来しても引き直さない
  const resolveQuery = useQuery({
    queryKey: ["manuals", "resolve", id],
    queryFn: () => getManualResolve(id),
    enabled: !!id,
    staleTime: 30_000,
  });
  const resolved = resolveQuery.data ?? {};

  const sortedPages = useMemo(() => (manual ? pagesSorted(manual.pages) : []), [manual]);

  // マニュアルを開き直したら先頭ページへ（編集画面の既定と同じ・段B）
  useEffect(() => setIndex(0), [manual?.id]);

  const safeIndex = Math.min(index, Math.max(0, sortedPages.length - 1));
  const currentPage = sortedPages[safeIndex];

  // ManualPrintDocument を「いまの1ページだけ」の範囲に絞って呼ぶ。表紙・目次・ヘッダーの
  // 時点/ページ番号はここでは出さない——一覧に戻れば章立て全体（TOC）は仕上がり画面・
  // PDF側で分かるので、この画面は「いま」だけに絞る
  const pageSettings: ManualExportSettings = {
    range: { mode: "range", from: safeIndex + 1, to: safeIndex + 1 },
    cover: false,
    toc: false,
    pageNumbers: false,
    showAsOf: false,
    grayscale: false,
  };

  // キャンバスの縮小表示（`transform: scale()`。ManualPreviewPage.tsx と同じ手口——ズーム操作は
  // 持たない。1画面1目的のため常に幅に合わせる）
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const fitToWidth = () => {
      const available = el.clientWidth;
      if (available <= 0) return;
      setScale(Math.max(0.1, Math.min(1, available / (PAGE_WIDTH_MM * MM_TO_PX))));
    };
    fitToWidth();
    const ro = new ResizeObserver(fitToWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ⚠️⚠️ 外部レビュー再指摘（P1）: `ManualPreviewPage.tsx`（PC の仕上がり画面）は
  // 差し込みブロックが1つでもある下書きで `/resolve` が届く前に書き出しボタンを
  // disabled にする `resolveReady` ガードを持つが、この画面（スマホの閲覧＝別の
  // 書き出し経路）には同じガードが無かった——`detailQuery` が `/resolve` より先に
  // 届く競合が起きると、ボタンはページの有無だけで押せてしまい、その瞬間の空の
  // `resolved`（`{}`）を1回限りの印刷用windowへ渡してしまうため、あとから
  // `/resolve` が届いても反映されず「読み込み中…」のままのPDFが出来ていた。
  // 判定はPC側と同じにする（確定済みは`link.frozen`を使うため無関係）。
  const hasLinkedBlocks = useMemo(
    () => sortedPages.some((page) => page.blocks.some((b) => b.kind === "linked")),
    [sortedPages],
  );
  const resolveReady = manual?.status !== "draft" || !hasLinkedBlocks || resolveQuery.isSuccess;

  const handleExport = () => {
    if (!manual) return;
    try {
      exportManualToPdf({ manual, resolved, settings: defaultManualExportSettings(sortedPages.length) });
    } catch {
      notifyError("PDFを書き出せませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  const chapterLabel = currentChapterLabel(sortedPages, safeIndex);

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
            title={manual.title || "（無題）"}
            sub={
              <span className="flex flex-wrap items-center gap-2">
                {manual.doc_no && <span className="font-number">{manual.doc_no}</span>}
                <Badge variant={MANUAL_STATUS_BADGE_VARIANT[manual.status]}>{MANUAL_STATUS_LABEL[manual.status]}</Badge>
                {manual.project_name && <span>{manual.gls_number ? `${manual.gls_number} ・ ` : ""}{manual.project_name}</span>}
                {manual.program_name && <span>{manual.program_name}</span>}
              </span>
            }
            primaryAction={
              <Button
                onClick={handleExport}
                disabled={sortedPages.length === 0 || !resolveReady}
                title={!resolveReady ? "差し込みブロックの内容を読み込み中です" : undefined}
              >
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {resolveReady ? "PDFを開く" : "読み込み中…"}
              </Button>
            }
          />

          {currentPage ? (
            <>
              {chapterLabel && (
                <div className="flex min-h-tap items-center gap-2 rounded-note border border-border bg-muted/40 px-3 py-2">
                  <BookOpenText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate text-sub-sm font-medium text-foreground">{chapterLabel}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 text-sub text-muted-foreground">
                <span className="min-w-0 truncate">{currentPage.title || "（無題）"}</span>
                <span className="font-number shrink-0">{safeIndex + 1} / {sortedPages.length}</span>
              </div>

              <div ref={viewportRef} className="w-full overflow-hidden rounded-card border border-border bg-muted/10 p-2">
                <div
                  style={{ width: `${PAGE_WIDTH_MM * scale}mm`, height: `${PAGE_HEIGHT_MM * scale}mm` }}
                  className="relative mx-auto overflow-hidden"
                >
                  <div
                    style={{ width: `${PAGE_WIDTH_MM}mm`, transform: `scale(${scale})`, transformOrigin: "top left" }}
                    className="bg-white text-foreground shadow"
                  >
                    <ManualPrintDocument manual={manual} resolved={resolved} settings={pageSettings} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-tap"
                  onClick={() => setIndex((v) => Math.max(0, v - 1))}
                  disabled={safeIndex <= 0}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />前へ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-tap"
                  onClick={() => setIndex((v) => Math.min(sortedPages.length - 1, v + 1))}
                  disabled={safeIndex >= sortedPages.length - 1}
                >
                  次へ<ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex min-h-[200px] items-center justify-center rounded-card border border-dashed border-border bg-muted/20 p-8 text-center text-sub text-muted-foreground">
              ページがありません。
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
