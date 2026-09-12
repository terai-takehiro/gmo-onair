// 運営マニュアル — 仕上がりと PDF（段D・`/techops/manuals/:id/preview`・PC専用）。
// production-manual.md §6⑤「仕上がりと PDF」のとおり、書き出し設定・インクの目安・
// 出す前の検査（4種）を見せたうえで PDF を書き出す画面。**止めない**——検査に何件
// 引っかかっても「PDFで書き出す」は常に押せる（§6⑤「止めはしない」）。
//
// 紙面のプレビューは新しく静止画/HTML変換を書かず、印刷にも使う `ManualPrintDocument`
// （print-document 担当が作った本体。中では既に段Cで完成している `renderManualBlockContent`
// を selected:false で呼び出し、編集画面と印刷結果が常に一致するようにしてある）をそのまま
// 画面にも表示する。縮小は `zoom` ではなく `transform: scale()`（`ManualCanvas.tsx` と同じ
// パターン）。「範囲」（`settings.range`）の絞り込みは `ManualPrintDocument.tsx` が export する
// `selectPagesInRange` の1つに寄せてあり、ここ（検査・インクの目安）と実際に刷る本体が
// 同じページの並びを見る。
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Download, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@gmo-onair/shared/src/client/ui/badge";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Delayed, SkeletonRows, ErrorPanel } from "@gmo-onair/shared/src/client/states";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "@gmo-onair/shared/src/opsmanual/types";
import { estimatePageInkCoverage } from "@gmo-onair/shared/src/opsmanual/inkEstimate";
import * as manualApi from "@/lib/manualApi";
import { getManualResolve, type ManualResolveEntry } from "@/lib/manualResolveApi";
import { notifyError } from "@/lib/notify";
import { MANUAL_STATUS_LABEL, MANUAL_STATUS_BADGE_VARIANT } from "@/components/opsmanual/manualStatus";
import { pagesSorted } from "@/components/opsmanual/pageOrder";
import { runManualPreExportChecks } from "./manualPreExportChecks";
import ManualPreExportChecksPanel from "./ManualPreExportChecksPanel";
import ManualExportSettingsPanel, {
  defaultManualExportSettings,
  selectPagesInRange,
  type ManualExportSettings,
} from "./ManualExportSettingsPanel";
// 印刷にも使う紙面ツリー本体・PDF書き出し本体（print-document 担当が作った実装）
import ManualPrintDocument from "./ManualPrintDocument";
import { exportManualToPdf } from "./manualPrintExport";

const MM_TO_PX = 96 / 25.4; // CSS の mm は 96px/inch 換算（production-manual.md §8-3）
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;
const INK_WARN_THRESHOLD = 0.4; // 40%（§6-6・§8-3）

export default function ManualPreviewPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const detailQuery = useQuery({
    queryKey: ["manuals", "detail", id],
    queryFn: () => manualApi.getManual(id),
    enabled: !!id,
  });
  const manual = detailQuery.data;

  const resolveQuery = useQuery({
    queryKey: ["manuals", "resolve", id],
    queryFn: () => getManualResolve(id),
    enabled: !!id,
    staleTime: 30_000,
  });
  const resolved = useMemo(() => resolveQuery.data ?? {}, [resolveQuery.data]);

  const sortedPages = useMemo(() => (manual ? pagesSorted(manual.pages) : []), [manual]);

  const [settings, setSettings] = useState<ManualExportSettings | null>(null);
  useEffect(() => {
    if (manual && !settings) setSettings(defaultManualExportSettings(sortedPages.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual?.id]);

  // 範囲設定に従って、実際に書き出す紙面だけを取り出す。プレビュー・検査・インクの
  // 目安をこの並びに揃える（設計判断4「書き出し設定」・設計判断5・6の対象は常にこの範囲）
  const exportedPages = useMemo(
    () => (settings ? selectPagesInRange(sortedPages, settings.range) : sortedPages),
    [sortedPages, settings],
  );

  // 範囲外（書き出さない）ページの差し込みブロックぶんの `resolved`（伏せ字を解除した秘密を
  // 含みうる）を、印刷ツリー・PDF書き出しへ渡す前に絞り込む。実際に描画されるブロックの
  // 集合と同じなので新たな情報漏えいにはならないが（同じ利用者が `/resolve` から取得済み）、
  // 「範囲外のページの秘密は巻き込まない」という設計意図（§7-2）に沿わせる一段の防御
  const printedResolved = useMemo(() => {
    const ids = new Set<string>();
    for (const page of exportedPages) {
      for (const block of page.blocks) {
        if (block.kind === "linked") ids.add(block.id);
      }
    }
    const out: Record<string, ManualResolveEntry> = {};
    for (const id of ids) {
      const entry = resolved[id];
      if (entry) out[id] = entry;
    }
    return out;
  }, [exportedPages, resolved]);

  const checks = useMemo(() => runManualPreExportChecks(exportedPages, printedResolved), [exportedPages, printedResolved]);

  const pageInk = useMemo(
    () => exportedPages.map((page) => ({ page, ink: estimatePageInkCoverage(page.blocks) })),
    [exportedPages],
  );
  const inkAverage = pageInk.length ? pageInk.reduce((sum, p) => sum + p.ink, 0) / pageInk.length : 0;
  const heavyPages = pageInk.filter((p) => p.ink > INK_WARN_THRESHOLD);

  // ── プレビューの縮小表示（`zoom` ではなく `transform: scale()`。ManualCanvas.tsx と同じ） ──
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitScaleRef = useRef(0.35);
  const [scale, setScale] = useState(0.35);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const fitToWidth = () => {
      const available = el.clientWidth - 32; // p-4 の左右ぶん
      if (available <= 0) return;
      const fit = Math.max(ZOOM_MIN, Math.min(1, available / (PAGE_WIDTH_MM * MM_TO_PX)));
      fitScaleRef.current = fit;
      setScale(fit);
    };
    fitToWidth();
    const ro = new ResizeObserver(fitToWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = (delta: number) => setScale((s) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s + delta)) * 100) / 100);

  const handleExport = () => {
    if (!manual || !settings) return;
    try {
      exportManualToPdf({ manual, resolved: printedResolved, settings });
    } catch {
      notifyError("PDFを書き出せませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    }
  };

  const printPageCount = (settings ? (settings.cover ? 1 : 0) + (settings.toc ? 1 : 0) : 0) + exportedPages.length;
  const canExport = !!settings && printPageCount > 0;

  return (
    <PageShell>
      <button
        type="button"
        onClick={() => navigate(`/techops/manuals/${id}`)}
        className="inline-flex min-h-tap w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        冊子の編集に戻る
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
            title="仕上がりと書き出し"
            sub={
              <span className="flex flex-wrap items-center gap-2">
                {manual.doc_no && <span className="font-number">{manual.doc_no}</span>}
                <Badge variant={MANUAL_STATUS_BADGE_VARIANT[manual.status]}>{MANUAL_STATUS_LABEL[manual.status]}</Badge>
                <span>{manual.title}</span>
              </span>
            }
            primaryAction={
              <Button onClick={handleExport} disabled={!canExport}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                PDFで書き出す
              </Button>
            }
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sub-sm text-muted-foreground">紙面のプレビュー（実物大の縮小表示）</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => zoom(-ZOOM_STEP)} aria-label="縮小">
                    <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <span className="font-number w-10 text-center text-sub-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => zoom(ZOOM_STEP)} aria-label="拡大">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setScale(fitScaleRef.current)}>
                    幅に合わせる
                  </Button>
                </div>
              </div>

              <div
                ref={viewportRef}
                className="max-h-[75vh] min-h-[420px] overflow-auto rounded-card border border-border bg-muted/10 p-4"
              >
                {settings && printPageCount > 0 ? (
                  <div
                    style={{ width: `${PAGE_WIDTH_MM * scale}mm`, height: `${printPageCount * PAGE_HEIGHT_MM * scale}mm` }}
                    className="relative mx-auto"
                  >
                    <div
                      style={{
                        width: `${PAGE_WIDTH_MM}mm`,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                        filter: settings.grayscale ? "grayscale(1)" : undefined,
                      }}
                      className="bg-white text-foreground shadow"
                    >
                      <ManualPrintDocument manual={manual} resolved={printedResolved} settings={settings} highlightOverflow />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[380px] items-center justify-center text-sub text-muted-foreground">
                    {settings ? "書き出すページがありません。" : "読み込み中…"}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {settings && (
                <ManualExportSettingsPanel settings={settings} onChange={setSettings} pageCount={sortedPages.length} />
              )}

              <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sub-sm font-medium text-foreground">インクの目安</h2>
                  <span className="font-number text-sub-sm font-bold text-foreground">{Math.round(inkAverage * 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-chip bg-muted">
                  <div
                    className={cn("h-full", inkAverage > INK_WARN_THRESHOLD ? "bg-warning" : "bg-primary")}
                    style={{ width: `${Math.min(100, Math.round(inkAverage * 100))}%` }}
                  />
                </div>
                {inkAverage > INK_WARN_THRESHOLD ? (
                  <p className="text-sub-sm text-warning">
                    紙面の塗り面積が多めです。社内のプリンタでは時間とインクを多く使いますが、このまま書き出せます。
                  </p>
                ) : (
                  <p className="text-sub-sm text-muted-foreground">紙に刷る前提の目安です。{Math.round(INK_WARN_THRESHOLD * 100)}%を超えたときだけ知らせます。</p>
                )}
                {heavyPages.length > 0 && (
                  <ul className="text-sub-sm text-muted-foreground">
                    {heavyPages.map(({ page, ink }) => (
                      <li key={page.id}>
                        {page.title}: <span className="font-number">{Math.round(ink * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ManualPreExportChecksPanel pages={exportedPages} checks={checks} />
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
