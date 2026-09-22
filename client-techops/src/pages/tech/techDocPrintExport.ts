// 技術資料 ④「PDF で書き出す」。設計: docs/design/v4/tech-docs.md §8。
//
// 会場図面の `venuePreviewExport.ts`（さらにその元は運営マニュアルの `manualPrintExport.ts`）
// と**同じ手口**をそのまま使う: 新しいウィンドウを開く → 開いている側の <link>/<style> を
// 複製 → `createRoot` で紙面を描く → 少し待って `print()`。新しい書き方を作らない。
//
// 用紙は A4 横（297×210mm）固定。`@page` の `size` に実寸を書き、余白は 0 にして
// 紙面（`TechDocPrintSheet`）側の 15mm/12mm の余白だけを使う。行が増えた分は
// 2枚目に流れる（紙面の高さを固定していないため）。
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import lineSeedFontsCssUrl from "@gmo-onair/shared/src/client/fonts/lineseedjp.css?url";
import TechDocPrintSheet, { type TechDocPrintSheetProps } from "./TechDocPrintSheet";

const PRINT_FONTS_HREF = new URL(lineSeedFontsCssUrl, window.location.origin).toString();
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** 「PDF で書き出す」— 新しいウィンドウに紙面を描いて印刷ダイアログを開く */
export function exportTechDocToPdf(props: TechDocPrintSheetProps): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // `venuePreviewExport.ts` と同じ理由（この時点ではまだ何も描画していない）
    alert("別ウィンドウを開けませんでした。ブラウザでこのサイトのポップアップを許可してから、もう一度お試しください。"); // ui-tokens-ok
    return;
  }
  const docTitle = props.docNo ?? props.title ?? "技術資料";
  printWindow.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>${escapeHtml(docTitle)}</title>
    <link rel="stylesheet" href="${PRINT_FONTS_HREF}">
    <style>
      @page { size: ${props.paperWidthMm}mm ${props.paperHeightMm}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      nav, aside, .no-print { display: none !important; }
    </style>
  </head><body><div id="tech-doc-print-root"></div></body></html>`);
  printWindow.document.close();

  const styleNodes = document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style');
  styleNodes.forEach((node) => printWindow.document.head.appendChild(node.cloneNode(true)));

  const rootEl = printWindow.document.getElementById("tech-doc-print-root");
  if (!rootEl) {
    printWindow.close();
    return;
  }
  const root = createRoot(rootEl);
  root.render(createElement(TechDocPrintSheet, props));

  printWindow.requestAnimationFrame(() => {
    printWindow.requestAnimationFrame(() => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    });
  });
}
