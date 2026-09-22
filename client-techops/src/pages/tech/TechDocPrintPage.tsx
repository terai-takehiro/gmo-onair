// 技術資料 ④書き出し（`/techops/tech-docs/:id/print`・PC専用・段D）。
// 設計: docs/design/v4/tech-docs.md §8、モック `mockups/native/tech-docs/Print.dc.html`。
// 用紙（A4 横で固定）・出す内容を選びながら紙面（`TechDocPrintSheet`）の縮小プレビューを見て、
// 「PDF で書き出す」か「運営マニュアルに差し込む」へ進む。
//
// 会場図面の `VenuePreviewPage.tsx` と同じ作りにしてある（プレビューの縮小は
// `transform: scale()`・PDF は新しいウィンドウの `print()`）。新しい書き方を作らない。
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Download, LayoutTemplate, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@gmo-onair/shared/src/client/ui/badge";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";
import { Delayed, ErrorPanel, SkeletonRows } from "@gmo-onair/shared/src/client/states";
import { notifyError, notifyInfo } from "@/lib/notify";
import { useTechDoc } from "@/hooks/useTechDoc";
import * as manualApi from "@/lib/manualApi";
import * as programsApi from "@/lib/programsApi";
import * as scheduleApi from "@/lib/scheduleApi";
import TechDocPrintSheet, { buildStaffPrintDays, techDayLabel, type TechDocPrintSheetProps } from "./TechDocPrintSheet";
import { exportTechDocToPdf } from "./techDocPrintExport";
import { revLabel } from "./techStatus";

/** CSS の mm は 96px/inch 換算（`VenuePreviewPage.tsx` と同じ） */
const MM_TO_PX = 96 / 25.4;
const PAPER = { label: "A4 横（297 × 210 mm）", widthMm: 297, heightMm: 210 };
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

export default function TechDocPrintPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const doc = useTechDoc(id);
  const detail = doc.detail;

  const [showPatch, setShowPatch] = useState(true);
  const [showStaff, setShowStaff] = useState(true);
  const [inserting, setInserting] = useState(false);

  const projectId = detail?.doc.project_id ?? null;
  const programId = detail?.doc.program_id ?? null;

  // 名前の表示だけに使う（`TechDocListPage.tsx` と同じ `/lookup` 系）
  const projectCtxQuery = useQuery({
    queryKey: ["lookup", "project-context", projectId],
    queryFn: () => scheduleApi.getProjectContext(projectId as string),
    enabled: !!projectId,
  });
  const programQuery = useQuery({
    queryKey: ["techops", "program", programId],
    queryFn: () => programsApi.getProgram(programId as string),
    enabled: !!programId,
  });

  // ── プレビューの縮小表示（`VenuePreviewPage.tsx` と同じ作法） ──
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitScaleRef = useRef(0.6);
  const [zoom, setZoom] = useState(0.6);
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const fitToWidth = () => {
      const available = el.clientWidth - 32;
      if (available <= 0) return;
      const fit = Math.max(ZOOM_MIN, Math.min(1, available / (PAPER.widthMm * MM_TO_PX)));
      fitScaleRef.current = fit;
      setZoom(fit);
    };
    fitToWidth();
    const ro = new ResizeObserver(fitToWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const zoomBy = (delta: number) => setZoom((s) => Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s + delta)) * 100) / 100);

  if (doc.loading && !detail) {
    return <PageShell><Delayed><SkeletonRows rows={5} /></Delayed></PageShell>;
  }
  if (doc.error || !detail) {
    return (
      <PageShell>
        <ErrorPanel title="技術資料を読み込めませんでした" error={doc.error} onRetry={() => void doc.reload()} />
      </PageShell>
    );
  }

  const d = detail.doc;
  const ownerName = projectCtxQuery.data?.name ?? programQuery.data?.name ?? "";
  const ownerNo = projectCtxQuery.data?.glsNumber ?? null;
  const serviceDate = projectCtxQuery.data?.performanceDates[0] ?? projectCtxQuery.data?.eventStart ?? null;
  const ownerSub = [serviceDate ? techDayLabel(serviceDate.slice(0, 10)) : "", projectCtxQuery.data?.venue ?? ""]
    .filter(Boolean)
    .join(" ・ ") || null;
  const days = buildStaffPrintDays(detail.staff_rows);
  const staffCount = days.reduce((n, day) => n + day.count, 0);

  const sheetProps: TechDocPrintSheetProps = {
    paperWidthMm: PAPER.widthMm,
    paperHeightMm: PAPER.heightMm,
    docNo: d.doc_no,
    rev: d.rev,
    status: d.status,
    title: d.title,
    ownerName,
    ownerNo,
    ownerSub,
    dateLabel: new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" }),
    patchRows: detail.patch_rows,
    staffRows: detail.staff_rows,
    showPatch,
    showStaff,
  };

  /** 「運営マニュアルに差し込む」— この案件／番組の冊子の一覧へ移る（無ければ知らせる） */
  const handleInsert = async () => {
    setInserting(true);
    try {
      const manuals = await manualApi.listManuals({
        project_id: projectId || undefined,
        program_id: programId || undefined,
      });
      if (manuals.length === 0) {
        notifyInfo("差し込む先の運営マニュアルがありません。", {
          description: "先に運営マニュアルを作ってから、キャンバスの「差し込む」＞技術資料を選んでください。",
        });
        return;
      }
      const query = projectId ? `?project=${encodeURIComponent(projectId)}` : programId ? `?program=${encodeURIComponent(programId)}` : "";
      notifyInfo("差し込む先の運営マニュアルを選んでください。", {
        description: "開いた冊子の右の「差し込む」＞技術資料から、映像パッチ・技術スタッフを置けます。",
      });
      navigate(`/techops/manuals${query}`);
    } catch {
      notifyError("運営マニュアルを確認できませんでした。", { description: "少し待ってから、もう一度お試しください。" });
    } finally {
      setInserting(false);
    }
  };

  return (
    <PageShell>
      <button
        type="button"
        onClick={() => navigate(`/techops/tech-docs/${id}`)}
        className="inline-flex min-h-tap w-fit items-center gap-1.5 text-sub text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        技術資料の編集に戻る
      </button>

      <PageHeader
        title="書き出し"
        sub={
          <span className="num flex flex-wrap items-center gap-2">
            {d.doc_no && <span>{d.doc_no}</span>}
            {/* ⚠️ `PageHeader` の `sub` は `<p>` の中。`<Badge>` は `<div>` なので入れられない
                （React が「div cannot appear as a descendant of p」と警告する）。
                見た目は同じまま、要素だけ `<span>` にする */}
            <span className={badgeVariants({ variant: d.status === "fixed" ? "success" : "warning" })}>
              {d.status === "fixed" ? "確定" : "下書き"}
            </span>
            <span>{d.title}</span>
          </span>
        }
        primaryAction={
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-10" onClick={() => void handleInsert()} disabled={inserting}>
              <LayoutTemplate className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {inserting ? "確認中…" : "運営マニュアルに差し込む"}
            </Button>
            <Button className="h-10" onClick={() => exportTechDocToPdf(sheetProps)}>
              <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />PDF で書き出す
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
        <label className="flex items-center gap-2 text-sub text-muted-foreground" htmlFor="tech-print-paper">用紙</label>
        {/* 用紙はいま A4 横だけ（§8-1 の紙面は A4 横 1枚が前提）。選べる用紙が増えたら外す */}
        <select
          id="tech-print-paper"
          disabled
          value="a4l"
          onChange={() => undefined}
          className="num h-10 rounded-control border border-border bg-card px-2 text-sub text-foreground disabled:opacity-80"
        >
          <option value="a4l">{PAPER.label}</option>
        </select>
        <span className="num text-sub-sm text-muted-foreground">文字が入る範囲は 267 × 186 mm ・ 30行までは1枚に収まります</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sub-sm text-muted-foreground">用紙のプレビュー（{PAPER.label}）</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => zoomBy(-ZOOM_STEP)} aria-label="縮小">
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <span className="num w-10 text-center text-sub-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => zoomBy(ZOOM_STEP)} aria-label="拡大">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setZoom(fitScaleRef.current)}>幅に合わせる</Button>
            </div>
          </div>

          <div ref={viewportRef} className="max-h-[75vh] min-h-[420px] overflow-auto rounded-card border border-border bg-muted/10 p-4">
            <div style={{ width: `${PAPER.widthMm * zoom}mm`, minHeight: `${PAPER.heightMm * zoom}mm` }} className="relative mx-auto">
              <div
                style={{ width: `${PAPER.widthMm}mm`, transform: `scale(${zoom})`, transformOrigin: "top left" }}
                className="bg-white text-foreground shadow"
              >
                <TechDocPrintSheet {...sheetProps} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sub font-medium text-foreground">出す内容</span>
              <span className="text-sub-sm text-muted-foreground">チェックを外すと PDF から外れます</span>
            </div>
            <ToggleRow label="映像パッチ" note={`${detail.patch_rows.length}行`} checked={showPatch} onChange={setShowPatch} />
            <ToggleRow label="技術スタッフ" note={`${staffCount}人 ・ ${days.length}日`} checked={showStaff} onChange={setShowStaff} />
          </section>

          <section className="flex flex-col gap-1 rounded-card border border-border bg-card p-3">
            <span className="text-sub font-medium text-foreground">PDF に出る内容</span>
            <SummaryRow k="資料番号" v={d.doc_no ?? "—"} />
            <SummaryRow k="版" v={revLabel(d) || "—"} />
            <SummaryRow k="映像パッチ" v={`${detail.patch_rows.length}行`} />
            <SummaryRow k="技術スタッフ" v={`${staffCount}人`} />
            <SummaryRow k="作業日" v={`${days.length}日`} />
          </section>

          <section className="flex flex-col gap-1 rounded-card border border-border bg-card p-3">
            <span className="text-sub font-medium text-foreground">書き出しのルール</span>
            <p className="text-sub-sm leading-relaxed text-muted-foreground">
              映像パッチは現場のパッチ表と同じ「送り → 受け」の書式で出します。技術スタッフはメンバー表と同じ、作業日ごとに役職の見出しと名前を並べた形です。
            </p>
          </section>
        </div>
      </div>
    </PageShell>
  );
}

function ToggleRow({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-tap cursor-pointer items-center gap-2 rounded-control border border-border px-2.5 py-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      <span className="min-w-0 flex-1 truncate text-sub text-foreground">{label}</span>
      <span className="num shrink-0 text-sub-sm text-muted-foreground">{note}</span>
    </label>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1 last:border-b-0">
      <span className="text-sub-sm text-muted-foreground">{k}</span>
      <span className="num shrink-0 text-sub-sm font-medium text-foreground">{v}</span>
    </div>
  );
}
