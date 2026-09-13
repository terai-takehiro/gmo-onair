// 会場図面 — ③仕上がりの書き出し（PNG・PDF）。設計 §6③「書き出しはPNG（画面のSVGを
// そのまま）とPDF（window.print()）」。PDF は運営マニュアルの唯一の前例
// `client-techops/src/pages/opsmanual/manualPrintExport.ts` の手口
// （window.open → document.write → 開いている側の <link>/<style> を複製 → createRoot →
// 少し待って print()）をそのまま踏襲する。新しい書き方を作らない。
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import lineSeedFontsCssUrl from "@gmo-onair/shared/src/client/fonts/lineseedjp.css?url";
import VenuePrintSheet, { type VenuePrintSheetProps } from "./VenuePrintSheet";

const PRINT_FONTS_HREF = new URL(lineSeedFontsCssUrl, window.location.origin).toString();
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** 「PDFで書き出す」— 新しいウィンドウに紙面1枚を描いて印刷ダイアログを開く */
export function exportVenueToPdf(props: VenuePrintSheetProps): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // manualPrintExport.ts と同じ理由（この時点ではまだ何も描画していない）
    alert("別ウィンドウを開けませんでした。ブラウザでこのサイトのポップアップを許可してから、もう一度お試しください。"); // ui-tokens-ok
    return;
  }
  const docTitle = props.docNo ?? props.title ?? "会場図面";
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
  </head><body><div id="venue-print-root"></div></body></html>`);
  printWindow.document.close();

  const styleNodes = document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style');
  styleNodes.forEach((node) => printWindow.document.head.appendChild(node.cloneNode(true)));

  const rootEl = printWindow.document.getElementById("venue-print-root");
  if (!rootEl) {
    printWindow.close();
    return;
  }
  const root = createRoot(rootEl);
  root.render(createElement(VenuePrintSheet, props));

  printWindow.requestAnimationFrame(() => {
    printWindow.requestAnimationFrame(() => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    });
  });
}

/** 「PNGで書き出す」— 画面に出ている図面の `<svg>` をそのままラスタライズする */
export function exportVenuePlanToPng(svg: SVGSVGElement, filename: string, pixelWidth = 1600): void {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.style.fontFamily = "'LINE Seed JP','Noto Sans JP',sans-serif";
  const viewBox = clone.viewBox.baseVal;
  const ratio = viewBox && viewBox.width > 0 ? viewBox.height / viewBox.width : 9 / 16;
  const pixelHeight = Math.round(pixelWidth * ratio);
  clone.setAttribute("width", String(pixelWidth));
  clone.setAttribute("height", String(pixelHeight));

  const svgText = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { URL.revokeObjectURL(url); return; }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);
    URL.revokeObjectURL(url);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}
