import { useState, useMemo, useRef } from "react";
import { X, Download, Printer } from "lucide-react";
import { parseDur as parseDurShared, fmtAbs as fmtAbsShared, fmtMinSec as fmtMinSecShared } from "@/lib/time";

// ─── Constants ──────────────────────────────────────────
const SPEAKER_COLORS = ["#1e3a5f", "#0f766e", "#7e22ce", "#be185d", "#b45309", "#15803d", "#1d4ed8", "#9f1239", "#4338ca", "#a16207"];
const PILL_COLORS: Record<string, string> = { video: "#1e40af", telop: "#7e22ce", audio: "#b91c1c" };

// ─── Helpers ────────────────────────────────────────────
const parseDur = parseDurShared;
const fmtAbs = fmtAbsShared;
const fmtMinSec = fmtMinSecShared;

function fmtJpDate(str: string | undefined): string {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]}) ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtJpDateShort(str: string | undefined): string {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ─── Pill ───────────────────────────────────────────────
function Pill({ text, color, mono }: { text: string; color: string; mono: boolean }) {
  if (!text) return null;
  const c = mono ? "#111827" : color;
  const len = text.length;
  const scale = len <= 3 ? 1 : Math.max(0.5, 3 / len);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "2.6rem", height: "14px", borderRadius: "3px", border: `1.5px solid ${c}`, color: c, fontSize: "7.5px", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", flexShrink: 0, marginTop: "3px" }}>
      <span style={scale < 1 ? { transform: `scaleX(${scale})` } : undefined}>{text}</span>
    </span>
  );
}

// ─── Types ──────────────────────────────────────────────
interface PreviewModalProps {
  state: {
    meta?: any;
    blocks: any[];
    sections: any[];
    masters?: any;
    stageTemplates?: any[];
    ledScenes?: { id: string; name: string; wall: string; floor: string }[];
  };
  onClose: () => void;
  docUpdatedAt?: string;
  docCreatedAt?: string;
  docTitle?: string;
}

// LED/XR エントリを「【S1】壁:..., 床:..., ［卓DでF.I.］」形式にフォーマット
function formatLedEntry(
  entry: any,
  scenes?: { id: string; name: string; wall: string; floor: string }[],
): { sceneName: string; wall: string; floor: string; trigger: string } | null {
  if (!entry) return null;
  const scene = scenes?.find((s) => s.id === entry.sceneId);
  const cue = entry.cueType === "custom" ? (entry.cueCustom || "") : (entry.cueType || "");
  const trans = entry.transition === "custom" ? (entry.transitionCustom || "") : (entry.transition || "");
  let trigger = "";
  if (cue && trans) trigger = `${cue}で${trans}`;
  else if (cue) trigger = cue;
  else if (trans) trigger = trans;
  if (!scene && !trigger) return null;
  return {
    sceneName: scene?.name || "",
    wall: scene?.wall || "",
    floor: scene?.floor || "",
    trigger,
  };
}

// ─── PreviewModal ───────────────────────────────────────
export default function PreviewModal({ state, onClose, docUpdatedAt, docCreatedAt, docTitle }: PreviewModalProps) {
  const [paperSize, setPaperSize] = useState("A4P");
  const [fontSize, setFontSize] = useState(10.5);
  const [margin, setMargin] = useState(30);
  const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(() => new Set());
  const [mono, setMono] = useState(false);
  // 改ページ方式: "flow" = 連続 (ロールを物理ページなりに詰める / A4横向け) / "role" = ロールごとに改ページ
  const [pageMode, setPageMode] = useState<"flow" | "role">(() => {
    if (typeof localStorage === "undefined") return "flow";
    return localStorage.getItem("qs_print_pagemode") === "role" ? "role" : "flow";
  });
  const pageRef = useRef<HTMLDivElement>(null);

  const changePageMode = (m: "flow" | "role") => {
    setPageMode(m);
    try { localStorage.setItem("qs_print_pagemode", m); } catch { /* ignore */ }
  };

  const toggleBlock = (id: string) => {
    setSelectedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleBlocks = state.blocks.filter((b) => b.type === "scenario" || selectedBlocks.has(b.id));
  // 96 DPI 換算: A4=794×1123, A3=1123×1587
  const pxDims: Record<string, { w: number; h: number }> = {
    A4P: { w: 794, h: 1123 },
    A4L: { w: 1123, h: 794 },
    A3P: { w: 1123, h: 1587 },
    A3L: { w: 1587, h: 1123 },
  };
  const pageDims = pxDims[paperSize] || pxDims.A4P;

  const spkMap = useMemo(() => {
    const map: Record<string, string> = {};
    let idx = 0;
    state.sections.forEach((sec: any) => {
      if (sec._break) return;
      (sec.rows || []).forEach((row: any) => {
        state.blocks.filter((b: any) => b.type === "scenario").forEach((blk: any) => {
          (row.cells?.[blk.id]?.entries || []).forEach((en: any) => {
            if (en?.name && !map[en.name]) {
              map[en.name] = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
              idx++;
            }
          });
        });
      });
    });
    return map;
  }, [state]);

  const scenarioCount = visibleBlocks.filter((b) => b.type === "scenario").length;
  const otherCount = visibleBlocks.length - scenarioCount;
  const colWidths = useMemo(() => {
    if (scenarioCount === 0) return visibleBlocks.map(() => 100 / visibleBlocks.length);
    const scenarioPct = Math.max(45, 100 - otherCount * 15);
    const otherPct = otherCount > 0 ? (100 - scenarioPct) / otherCount : 0;
    return visibleBlocks.map((b) => (b.type === "scenario" ? scenarioPct / scenarioCount : otherPct));
  }, [visibleBlocks, scenarioCount, otherCount]);

  let absSec = 0;
  const startTime = state?.meta?.broadcastStartTime;
  if (startTime) {
    const m = startTime.match(/(\d+):(\d+):?(\d+)?/);
    if (m) absSec = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + (parseInt(m[3]) || 0);
  }
  let rowNum = 0;

  const handleCsvDownload = () => {
    const blocks = (state.blocks || []) as Array<{ id: string; label: string; type: string }>;
    const headers = ["#", "セクション", "尺", ...blocks.map((b) => b.label)];
    const rows: string[][] = [headers];
    let num = 1;
    (state.sections || []).forEach((sec: any) => {
      if (sec._pageBreak) return;
      if (sec._break) {
        rows.push([String(num++), String(sec.label || "CM"), String(sec.duration || ""), ...blocks.map(() => "")]);
        return;
      }
      if (sec._vtr) {
        rows.push([String(num++), `VTR: ${sec.label || ""}`.trim(), String(sec.duration || ""), ...blocks.map(() => "")]);
        return;
      }
      const secRows = Array.isArray(sec.rows) ? sec.rows : [];
      if (secRows.length === 0) {
        rows.push([String(num++), String(sec.label || ""), String(sec.duration || ""), ...blocks.map(() => "")]);
        return;
      }
      secRows.forEach((row: any) => {
        const cells = (row.cells || {}) as Record<string, any>;
        rows.push([
          String(num++),
          String(sec.label || ""),
          String(row.duration || ""),
          ...blocks.map((b) => {
            const cell = cells[b.id];
            if (typeof cell === "string") return cell;
            if (cell && typeof cell === "object") {
              if (b.type === "audio_mic" && Array.isArray(cell.assignments)) {
                return cell.assignments
                  .filter((a: any) => a.state && a.state !== "off")
                  .sort((a: any, b2: any) => (a.ch || 0) - (b2.ch || 0))
                  .map((a: any) => {
                    const tag = a.state === "on" ? "ON" : "STBY";
                    const name = a.person ? ` ${a.person}` : "";
                    const mic = a.micType ? `/${a.micType}` : "";
                    return `Ch${a.ch}:${tag}${name}${mic}`;
                  })
                  .join(" / ");
              }
              if (Array.isArray(cell.entries)) {
                return cell.entries
                  .map((e: any) => {
                    if (e.html) return String(e.html).replace(/<[^>]*>/g, "");
                    return `${e.label || ""}${e.memo ? " " + e.memo : ""}`;
                  })
                  .filter((s: string) => s.trim())
                  .join(" / ");
              }
              if ("value" in cell) return String(cell.value || "");
            }
            return "";
          }),
        ]);
      });
    });
    const bom = "﻿";
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${docTitle || state.meta?.title || "cuesheet"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePDF = () => {
    if (!pageRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) { alert("ポップアップがブロックされました。許可してください。"); return; }
    const sizes: Record<string, [string, string]> = {
      A4P: ["210mm", "297mm"],
      A4L: ["297mm", "210mm"],
      A3P: ["297mm", "420mm"],
      A3L: ["420mm", "297mm"],
    };
    const [pageW, pageH] = sizes[paperSize] || sizes.A4P;
    const dl = state.meta?.draftType === "準備稿" ? "準備稿" : state.meta?.draftType === "決定稿" ? "決定稿" : `第${state.meta?.draftNumber || 1}稿`;
    const docTitle = `【${dl}】${state.meta?.title || "進行台本"}`;
    const fc = mono ? "#374151" : "#6b7280";

    if (pageMode === "flow") {
      // ── 「ページごと」= 実際の物理ページサイズに合わせてコンテンツを詰め直し、各ページに通し番号 ──
      // Chrome は CSS の @page マージンボックス (counter(page)) を印刷しない。さらに本番は CSP
      // (script-src 'self') で印刷ウィンドウ内の inline script が実行できないため、
      // **親ウィンドウ側で**実レイアウトを測定して物理ページ単位に詰め直し、完成した HTML だけを
      // 印刷ウィンドウへ書き込む (印刷は親から printWindow.print() で実行)。
      // ロールが 1 ページに収まらない場合は行単位で次ページへ送り、列見出しを継続ページ先頭へ反復する。
      const pad = margin;
      const footerH = 26;
      const pageStyle = `position:relative;width:${pageW};height:${pageH};overflow:hidden;background:#fff;`;
      const contentStyle = `position:absolute;top:${pad}px;left:${pad}px;right:${pad}px;bottom:${pad + footerH}px;overflow:hidden;`;
      const footerStyle = `position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px;text-align:center;font-size:8.5pt;font-weight:600;color:${fc};`;
      const pageEl = pageRef.current;

      // 親ウィンドウに画面外の測定ホストを作り、そこでページ分割する
      const host = document.createElement("div");
      host.setAttribute("aria-hidden", "true");
      host.style.cssText = "position:absolute;left:-10000px;top:0;";
      document.body.appendChild(host);

      let bodyHtml = "";
      try {
        let content!: HTMLElement;
        const newPage = (): HTMLElement => {
          const pg = document.createElement("div");
          pg.className = "qs-print-page";
          pg.style.cssText = pageStyle;
          const ct = document.createElement("div");
          ct.className = "qs-print-content";
          ct.style.cssText = contentStyle;
          const ft = document.createElement("div");
          ft.className = "qs-print-footer";
          ft.style.cssText = footerStyle;
          pg.appendChild(ct);
          pg.appendChild(ft);
          host.appendChild(pg);
          return ct;
        };
        const over = () => content.scrollHeight > content.clientHeight + 1;
        const pushBlock = (node: Node) => {
          content.appendChild(node);
          if (over() && content.childNodes.length > 1) {
            content.removeChild(node);
            content = newPage();
            content.appendChild(node);
          }
        };
        const pushRole = (roleEl: Element) => {
          const table = roleEl.querySelector("table");
          if (!table) { pushBlock(roleEl.cloneNode(true)); return; }
          const head = roleEl.querySelector("[data-rolehead]");
          const colgroup = table.querySelector("colgroup");
          const thead = table.querySelector("thead");
          const rows = Array.from(table.querySelectorAll("tbody > tr"));
          let i = 0;
          do {
            const wrap = document.createElement("div");
            if (head) wrap.appendChild(head.cloneNode(true));
            const t = document.createElement("table");
            t.setAttribute("style", table.getAttribute("style") || "");
            if (colgroup) t.appendChild(colgroup.cloneNode(true));
            if (thead) t.appendChild(thead.cloneNode(true));
            const tb = document.createElement("tbody");
            t.appendChild(tb);
            wrap.appendChild(t);
            content.appendChild(wrap);
            if (over() && content.childNodes.length > 1) {
              content.removeChild(wrap);
              content = newPage();
              content.appendChild(wrap);
            }
            while (i < rows.length) {
              const r = rows[i].cloneNode(true);
              tb.appendChild(r);
              if (over()) {
                if (tb.childNodes.length === 1) { i++; break; } // 1 行が 1 ページより高い稀ケース
                tb.removeChild(r);
                break;
              }
              i++;
            }
            if (i < rows.length) { content = newPage(); } else { break; }
          } while (i < rows.length);
        };

        content = newPage();
        const pps = Array.from(pageEl.querySelectorAll(".preview-page"));
        let first = true;
        pps.forEach((pp) => {
          if (!first && content.childNodes.length > 0) content = newPage(); // 明示的な改ページ位置で新ページ
          first = false;
          const items = Array.from(pp.children).filter((c) => c.getAttribute("data-fl"));
          items.forEach((it) => {
            if (it.getAttribute("data-fl") === "role") pushRole(it);
            else pushBlock(it.cloneNode(true));
          });
        });
        const all = Array.from(host.querySelectorAll(".qs-print-page"));
        all.forEach((p, k) => {
          const ft = p.querySelector(".qs-print-footer");
          if (ft) ft.textContent = `${k + 1} / ${all.length} ページ`;
        });
        bodyHtml = host.innerHTML;
      } catch {
        // 失敗時は生プレビューをそのまま (連続) 印刷して PDF を必ず出す
        bodyHtml = pageEl.innerHTML;
      } finally {
        document.body.removeChild(host);
      }

      printWindow.document.write(`<!DOCTYPE html><html><head>
        <meta charset="UTF-8"><title>${docTitle}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Roboto+Condensed:wght@400;500;600;700&display=swap" rel="stylesheet">
        <style>
          @page { size: ${pageW} ${pageH}; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Noto Sans JP', -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* 改ページはスタイルシート側で指定 (inline style だと last-child 上書きが効かないため) */
          .qs-print-page { page-break-after: always; break-after: page; }
          .qs-print-page:last-child { page-break-after: auto; break-after: auto; }
          td.qs-other { font-size: 0.85em; }
          nav, aside, .no-print { display: none !important; }
        </style>
      </head><body>${bodyHtml}</body></html>`);
      printWindow.document.close();
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 700);
      return;
    }

    // ── 「ロールごと」= 各 .preview-page をちょうど 1 物理ページにし、DOM フッターを下端固定 ──
    printWindow.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8"><title>${docTitle}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Roboto+Condensed:wght@400;500;600;700&display=swap" rel="stylesheet">
      <style>
        @page { size: ${pageW} ${pageH}; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Noto Sans JP', -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        /* 1 ロール = 1 物理ページ。min-height をシート高に合わせ、flex 縦並びでフッターを下端へ */
        .preview-page {
          width: ${pageW} !important;
          min-height: calc(${pageH} - 2mm) !important;
          height: auto !important;
          padding: 11mm 10mm 10mm 10mm !important;
          margin: 0 !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          page-break-after: always;
          break-after: page;
        }
        .preview-page:last-child { page-break-after: auto; break-after: auto; }
        .preview-page-footer {
          display: block !important;
          position: static !important;
          left: auto !important; right: auto !important; bottom: auto !important;
          margin-top: auto !important;
          padding-top: 8px;
          text-align: center;
        }
        @media print { td.qs-other { font-size: 0.85em !important; } }
        .qsheet-section { page-break-inside: avoid; break-inside: avoid; }
        .qsheet-row, tr { page-break-inside: avoid; break-inside: avoid; }
        .qsheet-section-header, thead { page-break-after: avoid; break-after: avoid; }
        p, td, th { widows: 3; orphans: 3; }
        nav, aside, .no-print { display: none !important; }
      </style>
    </head><body>${pageRef.current.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  // ページ分割。2 方式:
  //  - "flow" (連続 / 既定): 明示的な改ページ (_pageBreak) でのみ分割し、
  //    あとはロールを物理ページなりに連続して詰める (A4横で紙が無駄にならない)。
  //    ブラウザの自然なページ分割に任せ、行/ロール途中での分断は CSS break-inside で抑制。
  //  - "role": 明示的な改ページ + ロールが変わるたびに必ず改ページ (1 ロール = 1 ページ)。
  //    CM / VTR は直前のロールと同じページに残し、次のロールで改ページする。
  const pages: any[][] = [];
  let currentPage: any[] = [];
  let pageHasRole = false;
  state.sections.forEach((sec: any) => {
    if (sec._pageBreak) {
      if (currentPage.length) pages.push(currentPage);
      currentPage = [];
      pageHasRole = false;
      return;
    }
    const isRole = !sec._break && !sec._vtr;
    if (pageMode === "role" && isRole && pageHasRole) {
      // 既にこのページにロールがある → ロールが変わったので改ページ
      pages.push(currentPage);
      currentPage = [];
      pageHasRole = false;
    }
    currentPage.push(sec);
    if (isRole) pageHasRole = true;
  });
  if (currentPage.length > 0) pages.push(currentPage);
  if (pages.length === 0) pages.push([]);
  const totalPages = pages.length;

  const borderColor = "#d1d5db";
  const lightBg = "#f9fafb";

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col bg-muted rounded-2xl shadow-2xl overflow-hidden" style={{ width: "min(92vw, 1280px)", height: "92vh" }}>
        {/* Toolbar */}
        <div className="flex-none flex items-center justify-between px-5 py-3 bg-white border-b border-zinc-200 shadow-sm gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              用紙
              <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)} className="px-2 py-1 text-xs border border-border rounded-lg bg-card text-foreground" aria-label="用紙サイズ">
                <option value="A4P">A4 タテ</option>
                <option value="A4L">A4 ヨコ</option>
                <option value="A3P">A3 タテ</option>
                <option value="A3L">A3 ヨコ</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              フォント
              <input type="range" min="7" max="12" value={fontSize} step="0.5" onChange={(e) => setFontSize(parseFloat(e.target.value))} className="w-16" />
              <span className=" text-xs">{fontSize}pt</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-500">
              余白
              <input type="range" min="10" max="50" value={margin} step="5" onChange={(e) => setMargin(parseInt(e.target.value))} className="w-16" />
              <span className=" text-xs">{margin}</span>
            </label>
            <span className="w-px h-4 bg-zinc-200" />
            <button
              type="button"
              role="switch"
              aria-checked={mono}
              onClick={() => setMono(!mono)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                mono ? "bg-zinc-700 border-zinc-700 text-white" : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              白黒
            </button>
            <span className="w-px h-4 bg-zinc-200" />
            <label className="flex items-center gap-1.5 text-xs text-zinc-500">
              改ページ
              <span className="inline-flex rounded-full border border-zinc-300 overflow-hidden" role="radiogroup" aria-label="改ページ方式">
                <button
                  type="button"
                  role="radio"
                  aria-checked={pageMode === "flow"}
                  onClick={() => changePageMode("flow")}
                  title="ロールを物理ページなりに連続して詰める (A4横などで紙が無駄になりません)"
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    pageMode === "flow" ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  ページごと
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={pageMode === "role"}
                  onClick={() => changePageMode("role")}
                  title="ロールが変わるたびに改ページ (1 ロール = 1 ページ)。ページ番号が物理ページと一致します"
                  className={`px-2.5 py-1 text-xs font-medium border-l border-zinc-300 transition-colors ${
                    pageMode === "role" ? "bg-blue-600 text-white" : "text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  ロールごと
                </button>
              </span>
            </label>
            <span className="w-px h-4 bg-zinc-200" />
            <span className="text-xs text-zinc-400">出力列:</span>
            {state.blocks.map((blk) => {
              const isScenario = blk.type === "scenario";
              const isOn = isScenario || selectedBlocks.has(blk.id);
              return (
                <button
                  key={blk.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isOn}
                  disabled={isScenario}
                  onClick={() => toggleBlock(blk.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors disabled:cursor-not-allowed ${
                    isScenario
                      ? "bg-zinc-100 border-zinc-200 text-zinc-400"
                      : isOn
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {blk.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleCsvDownload} title="CSVダウンロード" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-all">
              <Download size={14} />
              CSV
            </button>
            <button onClick={handlePDF} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm shadow-blue-600/25 transition-all">
              <Printer size={14} />
              PDF / 印刷
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
          <div ref={pageRef}>
            {pages.map((pageSections, pi) => {
              return (
                <div key={pi} className="preview-page bg-white shadow-lg rounded" style={{ width: pageDims.w, minHeight: pageDims.h, padding: margin, fontSize: fontSize + "pt", color: mono ? "#000" : "#1f2937", position: "relative", marginBottom: pi < totalPages - 1 ? 24 : 0 }}>
                  {/* Document Header (page 1 only) */}
                  {pi === 0 && (
                    <div data-fl="block" style={{ marginBottom: 16, borderBottom: `2px solid ${borderColor}`, paddingBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                        <div>
                          <div style={{ fontSize: fontSize + 7 + "pt", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.2, color: "#111827" }}>{state.meta?.title || "無題"}</div>
                          <div style={{ fontSize: fontSize - 0.5 + "pt", color: "#6b7280", marginTop: 6, lineHeight: 1.6 }}>
                            {state.meta?.location && <span>{state.meta.location}</span>}
                            {state.meta?.broadcastDate && <span>{"\u3000"}放送日：{fmtJpDateShort(state.meta.broadcastDate)}</span>}
                            {state.meta?.recordingDate && <span>{"\u3000"}収録日：{fmtJpDateShort(state.meta.recordingDate)}</span>}
                            {state.meta?.rehearsalDate && <span>{"\u3000"}リハ：{fmtJpDateShort(state.meta.rehearsalDate)}</span>}
                          </div>
                        </div>
                        {(() => {
                          const dl = state.meta?.draftType === "準備稿" ? "準備稿" : state.meta?.draftType === "決定稿" ? "決定稿" : `第${state.meta?.draftNumber || 1}稿`;
                          return (
                            <div style={{ border: "2px solid #374151", borderRadius: 4, padding: "6px 14px", fontSize: fontSize + 5 + "pt", fontWeight: 900, whiteSpace: "nowrap", lineHeight: 1 }}>{dl}</div>
                          );
                        })()}
                      </div>
                      <div style={{ textAlign: "right", fontSize: fontSize - 2 + "pt", color: "#9ca3af", marginTop: 4 }}>
                        更新：{fmtJpDate(state.meta?.updatedAt || docUpdatedAt || docCreatedAt)}
                      </div>
                    </div>
                  )}

                  {/* Sections */}
                  {pageSections.map((sec: any, si: number) => {
                    if (sec._break) {
                      const dur = parseDur(sec.duration);
                      const breakAbs = absSec;
                      absSec += dur;
                      return (
                        <div key={si} data-fl="block" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", margin: "4px 0", borderTop: mono ? "1px dashed #6b7280" : "1px dashed #9ca3af", borderBottom: mono ? "1px dashed #6b7280" : "1px dashed #9ca3af" }}>
                          <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: fontSize - 0.5 + "pt", color: mono ? "#4b5563" : "#9ca3af", whiteSpace: "nowrap", width: 70, textAlign: "right", flexShrink: 0 }}>{fmtAbs(breakAbs)}</span>
                          <span style={{ fontSize: fontSize + "pt", fontWeight: 700, color: mono ? "#000" : "#374151" }}>{sec.label || "CM"}</span>
                          <span style={{ fontSize: fontSize + "pt", fontWeight: 600, color: mono ? "#1f2937" : "#6b7280", marginLeft: "auto" }}>{dur > 0 ? fmtMinSec(dur) : ""}</span>
                        </div>
                      );
                    }
                    if (sec._vtr) {
                      const dur = parseDur(sec.duration);
                      const vtrAbs = absSec;
                      absSec += dur;
                      return (
                        <div key={si} data-fl="block" style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", margin: "4px 0", borderTop: mono ? "2px solid #374151" : "2px solid #4338ca", borderBottom: mono ? "2px solid #374151" : "2px solid #4338ca", background: mono ? "#f3f4f6" : "#eef2ff" }}>
                          <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: fontSize - 0.5 + "pt", color: mono ? "#1f2937" : "#4338ca", whiteSpace: "nowrap", width: 70, textAlign: "right", flexShrink: 0 }}>{fmtAbs(vtrAbs)}</span>
                          <span style={{ fontSize: fontSize - 0.5 + "pt", fontWeight: 800, color: mono ? "#fff" : "#4338ca", background: mono ? "#374151" : "#c7d2fe", padding: "0 6px", borderRadius: 3, letterSpacing: "0.05em" }}>VTR</span>
                          <span style={{ fontSize: fontSize + "pt", fontWeight: 700, color: mono ? "#000" : "#312e81" }}>{sec.label || ""}</span>
                          <span style={{ fontSize: fontSize + "pt", fontWeight: 600, color: mono ? "#1f2937" : "#4338ca", marginLeft: "auto" }}>{dur > 0 ? fmtMinSec(dur) : ""}</span>
                        </div>
                      );
                    }

                    const roleDur = parseDur(sec.duration);
                    const roleAbs = absSec;
                    absSec += roleDur;
                    rowNum++;
                    return (
                      <div key={si} data-fl="role" style={{ marginBottom: 6 }}>
                        <div data-rolehead="1" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderLeft: mono ? "4px solid #374151" : "4px solid #2563eb", background: lightBg, borderBottom: `1px solid ${borderColor}` }}>
                          <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: fontSize + 3 + "pt", color: mono ? "#6b7280" : "#d1d5db", width: 18, textAlign: "center", flexShrink: 0, fontWeight: 700 }}>{rowNum}</span>
                          <span style={{ fontFamily: "'Roboto Condensed',sans-serif", fontSize: fontSize + "pt", color: mono ? "#1f2937" : "#6b7280", whiteSpace: "nowrap" }}>{fmtAbs(roleAbs)}</span>
                          {roleDur > 0 && <span style={{ fontSize: fontSize - 0.5 + "pt", color: mono ? "#374151" : "#9ca3af", border: mono ? "1px solid #9ca3af" : "1px solid #d1d5db", padding: "0 6px", borderRadius: 3 }}>ロール尺 {fmtMinSec(roleDur)}</span>}
                          <span style={{ fontWeight: 700, fontSize: fontSize + 0.5 + "pt", color: "#111827", letterSpacing: "0.03em" }}>{sec.label}</span>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: fontSize + "pt" }}>
                          <colgroup>
                            {visibleBlocks.map((blk, bi) => <col key={blk.id} style={{ width: `${colWidths[bi].toFixed(1)}%` }} />)}
                          </colgroup>
                          <thead>
                            <tr>
                              {visibleBlocks.map((blk) => (
                                <th key={blk.id} style={{ padding: "2px 6px", textAlign: "left", fontWeight: 700, fontSize: fontSize - 1 + "pt", color: mono ? "#1f2937" : "#6b7280", borderBottom: `2px solid ${borderColor}`, background: "#fff" }}>{blk.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(sec.rows || []).map((row: any, ri: number) => {
                              const scenarioBlk = visibleBlocks.find((b) => b.type === "scenario");
                              const scenarioEntries = scenarioBlk ? (row.cells?.[scenarioBlk.id]?.entries || []) : [];
                              const entryCount = Math.max(scenarioEntries.length, 1);
                              return Array.from({ length: entryCount }).map((_, ei) => {
                                const highlight = scenarioEntries[ei]?.highlight as string | undefined;
                                const trStyle: React.CSSProperties = {
                                  borderBottom: ei === entryCount - 1 ? `1px solid ${borderColor}` : "none",
                                  ...(highlight && !mono ? { background: highlight } : {}),
                                };
                                return (
                                <tr key={`${ri}-${ei}`} style={trStyle}>
                                  {visibleBlocks.map((blk) => {
                                    const cell = row.cells?.[blk.id] || {};
                                    const tdStyle: React.CSSProperties = { padding: "3px 6px", verticalAlign: "top", borderRight: "1px solid #e5e7eb", lineHeight: 1.6, height: "1.8em", minHeight: "1.8em" };
                                    if (blk.type === "scenario") {
                                      const en = (cell.entries || [])[ei];
                                      const col = en?.name ? (spkMap[en.name] || SPEAKER_COLORS[0]) : "#94a3b8";
                                      return (
                                        <td key={blk.id} style={tdStyle}>
                                          <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                                            {en?.name && <Pill text={en.name} color={col} mono={mono} />}
                                            {en?.isQWord && <span style={{ color: mono ? "#000" : "#dc2626", fontWeight: 700, flexShrink: 0, fontSize: fontSize - 1 + "pt" }}>Q</span>}
                                            <span style={{ overflowWrap: "break-word", whiteSpace: "pre-wrap", flex: 1, fontWeight: en?.isQWord ? 700 : "normal" }}>{String(en?.html || "").replace(/<br\s*\/?>\s*/gi, "\n").replace(/<[^>]*>/g, "")}</span>
                                          </div>
                                          {en?.image && (
                                            <img src={en.image} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: 200, objectFit: "contain", marginTop: 4 }} />
                                          )}
                                        </td>
                                      );
                                    } else if (["video", "audio", "telop"].includes(blk.type)) {
                                      const en = (cell.entries || [])[ei];
                                      const col = PILL_COLORS[blk.type] || "#64748b";
                                      return (
                                        <td key={blk.id} className="qs-other" style={tdStyle}>
                                          {en?.label ? (
                                            <div style={{ display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
                                              <Pill text={en.label} color={col} mono={mono} />
                                              <span style={{ color: mono ? "#000" : "#4b5563", flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere", whiteSpace: "normal" }}>{en.memo || ""}</span>
                                            </div>
                                          ) : null}
                                          {en?.image && (
                                            <img src={en.image} alt="" style={{ display: "block", maxWidth: "100%", maxHeight: 200, objectFit: "contain", marginTop: 4 }} />
                                          )}
                                        </td>
                                      );
                                    } else if (blk.type === "audio_mic") {
                                      if (ei !== 0) {
                                        return <td key={blk.id} className="qs-other" style={tdStyle} />;
                                      }
                                      const assignments = (cell.assignments || [])
                                        .filter((a: any) => a.state && a.state !== "off")
                                        .sort((a: any, b2: any) => (a.ch || 0) - (b2.ch || 0));
                                      return (
                                        <td key={blk.id} className="qs-other" style={tdStyle}>
                                          {assignments.length > 0 && (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                              {assignments.map((a: any) => (
                                                <div key={a.ch} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: fontSize - 1 + "pt", lineHeight: 1.4 }}>
                                                  <span style={{ display: "inline-block", minWidth: 32, padding: "0 3px", borderRadius: 2, background: a.state === "on" ? (mono ? "#000" : "#dc2626") : (mono ? "#374151" : "#f59e0b"), color: "#fff", fontSize: fontSize - 2 + "pt", fontWeight: 700, textAlign: "center" }}>
                                                    {a.state === "on" ? "ON" : "STBY"}
                                                  </span>
                                                  <span style={{ fontWeight: 700, fontFamily: "'Roboto Condensed',sans-serif" }}>Ch{a.ch}</span>
                                                  <span>{a.person || ""}</span>
                                                  {a.micType && <span style={{ color: mono ? "#374151" : "#6b7280" }}>/ {a.micType}</span>}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </td>
                                      );
                                    } else if (blk.type === "slide") {
                                      return (
                                        <td key={blk.id} className="qs-other" style={tdStyle}>
                                          {ei === 0 && cell.image && <img src={cell.image} alt="" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain" }} />}
                                        </td>
                                      );
                                    } else if (blk.type === "led_xr") {
                                      const led = formatLedEntry((cell.entries || [])[ei], state.ledScenes);
                                      return (
                                        <td key={blk.id} className="qs-other" style={tdStyle}>
                                          {led && (
                                            <div style={{ lineHeight: 1.5, fontSize: fontSize - 0.5 + "pt" }}>
                                              {led.sceneName && (
                                                <div style={{ fontWeight: 700, color: mono ? "#000" : "#5b21b6" }}>【{led.sceneName}】</div>
                                              )}
                                              {led.wall && <div>壁：{led.wall}</div>}
                                              {led.floor && <div>床：{led.floor}</div>}
                                              {led.trigger && (
                                                <div style={{ color: mono ? "#1f2937" : "#6b7280", marginTop: 1 }}>［{led.trigger}］</div>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                      );
                                    } else if (blk.type === "stage_diagram") {
                                      const tmplIdx = cell.templateIndex ?? -1;
                                      const tmplElements = tmplIdx >= 0 && state.stageTemplates?.[tmplIdx] ? state.stageTemplates[tmplIdx].elements : null;
                                      return (
                                        <td key={blk.id} className="qs-other" style={tdStyle}>
                                          {ei === 0 && tmplElements && (
                                            <svg viewBox="0 0 800 600" style={{ width: "100%", maxHeight: 200, borderRadius: 2, border: `1px solid ${borderColor}` }}>
                                              <rect width="800" height="600" fill="#fafafa" />
                                              {tmplElements.map((el: any, idx: number) => {
                                                if (el.type === "person") {
                                                  const r = el.r || 40;
                                                  return (<g key={idx}><circle cx={el.x} cy={el.y} r={r} fill="none" stroke="#374151" strokeWidth={2} /><text x={el.x} y={el.y + r * 0.25} textAnchor="middle" fontSize={r * 0.5} fill="#374151" fontWeight="bold" fontFamily="sans-serif">{el.label}</text></g>);
                                                }
                                                if (el.type === "rect") {
                                                  const w = el.w || 160, h = el.h || 50;
                                                  return (<g key={idx}><rect x={el.x - w / 2} y={el.y - h / 2} width={w} height={h} fill="none" stroke="#9ca3af" strokeWidth={1.5} rx={3} /><text x={el.x} y={el.y + 5} textAnchor="middle" fontSize={14} fill="#6b7280" fontFamily="sans-serif">{el.label}</text></g>);
                                                }
                                                return null;
                                              })}
                                            </svg>
                                          )}
                                          {ei === 0 && cell.note && <div style={{ fontSize: fontSize - 1 + "pt", color: mono ? "#1f2937" : "#6b7280", marginTop: 2 }}>{cell.note}</div>}
                                        </td>
                                      );
                                    } else {
                                      return <td key={blk.id} className="qs-other" style={{ ...tdStyle, whiteSpace: "pre-line", color: mono ? "#000" : "#4b5563" }}>{ei === 0 ? (cell.value || "") : ""}</td>;
                                    }
                                  })}
                                </tr>
                                );
                              });
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}

                  {/* Footer (ページ番号) — 各 .preview-page = 1 物理ページの "role" モードでのみ
                      通し番号が物理ページと一致する。"flow" モードは 1 ブロックが複数物理ページに
                      跨るため通し番号を出さず、必要ならブラウザ印刷ダイアログの「ヘッダーとフッター」を ON */}
                  {pageMode === "role" && (
                    <div className="preview-page-footer" style={{ position: "absolute", bottom: margin, left: margin, right: margin, textAlign: "center", fontSize: "8.5pt", fontWeight: 600, color: mono ? "#374151" : "#6b7280" }}>
                      {pi + 1} / {totalPages} ページ
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
