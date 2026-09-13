// 運営マニュアル — 段D「出す」の PDF 書き出し。
// production-manual.md §8「PDF の出し方」・このタスクの SHARED_CONTEXT「設計判断1」のとおり、
// client-techops の唯一の先例 `components/editor/previewExport.ts` の手口をそのまま踏襲する
// （新しい書き方を作らない）:
//   window.open("", "_blank") → null なら案内 → document.write() で <head> を組む →
//   document.close() → 中身は ReactDOM (react-dom/client) で描く → 少し待って print()。
//
// ⚠️ previewExport.ts はプレーンな読み取り専用 HTML の文字列組み立て（DOM を素通しで
// コピーするだけ）で足りたが、運営マニュアルの紙面は本物の React ツリー
// （`ManualPrintDocument` → `renderManualBlockContent`）を描く。この中身コンポーネント
// （TextBlockContent 等）は Tailwind のユーティリティクラス（h-full/w-full/overflow-hidden
// 等）に依存しているため、フォントの <link> だけでは「編集画面と印刷結果が常に一致する」
// という設計判断1の前提を満たせない——このアプリ（開いている側のウィンドウ）がすでに
// 読み込んでいる <link rel="stylesheet"> と <style>（dev は Vite が挿した style タグ、
// 本番はビルド済み CSS への link タグ）をそのまま印刷ウィンドウへ複製し、同じ CSS を効かせる。
// 印刷ウィンドウに <script> は一切書き込まない（ここでの複製は開いている側からの DOM 操作＝
// ノードを足すだけなので、previewExport.ts のコメントにある「本番は CSP script-src 'self' で
// 印刷ウィンドウ内の inline script が動かない」制約には掛からない・§8-2）。
// ManualPrintDocument.tsx・ManualPrintHeader.tsx・ManualPrintCover.tsx・
// ManualPrintToc.tsx はこの複製に依存しない素の style で組んであるので、
// 万一複製が効かない環境でも柱・表紙・目次だけは崩れない。
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import lineSeedFontsCssUrl from "@gmo-onair/shared/src/client/fonts/lineseedjp.css?url"; // previewExport.ts と同じ書き方（?url インポート）
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM, type ManualDetail } from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualResolveEntry } from "@/lib/manualResolveApi";
import ManualPrintDocument, { MANUAL_PRINT_SHEET_CLASS, type ManualExportSettings } from "./ManualPrintDocument";

// 印刷は別ドキュメント (about:blank) なので絶対URLで書き込む（previewExport.ts と同じ理由）
const PRINT_FONTS_HREF = new URL(lineSeedFontsCssUrl, window.location.origin).toString();
const PRINT_FONT_STACK = "'LINE Seed JP', 'Noto Sans JP', -apple-system, 'Hiragino Sans', 'BIZ UDPGothic', 'Meiryo', sans-serif";

// 印刷ウィンドウへ document.write する HTML に埋めるユーザー入力（冊子のタイトル）用。
// 素通しすると </title> でタグを閉じてマークアップを注入できてしまう（previewExport.ts と同じ関数）
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export interface ExportManualToPdfArgs {
  manual: ManualDetail;
  resolved: Record<string, ManualResolveEntry>;
  settings: ManualExportSettings;
}

/** 「PDF で書き出す」ボタンの実処理。冊子1件を新しいウィンドウへ印刷用に描き、印刷ダイアログを開く */
export function exportManualToPdf({ manual, resolved, settings }: ExportManualToPdfArgs): void {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    // previewExport.ts と同じ理由（同ファイル104行目）で ui-tokens-ok: ポップアップブロック時の
    // 案内で、この時点ではまだ何も描画していない（notify帯を出す React ツリーの文脈が無い）
    alert("別ウィンドウを開けませんでした。ブラウザでこのサイトのポップアップを許可してから、もう一度お試しください。"); // ui-tokens-ok
    return;
  }

  // 書き出した瞬間の日時を1回だけ捕まえる（柱の「時点」表示。§6⑤・設計判断3。
  // 描画中に何度参照しても同じ値になるよう、ここで確定させて ManualPrintDocument へ渡す）
  const exportedAt = new Date();
  const docTitle = manual.title || "運営マニュアル";

  printWindow.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"><title>${escapeHtml(docTitle)}</title>
    <link rel="stylesheet" href="${PRINT_FONTS_HREF}">
    <style>
      @page { size: ${PAGE_WIDTH_MM}mm ${PAGE_HEIGHT_MM}mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      body { font-family: ${PRINT_FONT_STACK}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      /* 改ページはスタイルシート側で指定（inline style だと :last-child の打ち消しが
         効かないため——previewExport.ts と同じ理由・§8-2） */
      .${MANUAL_PRINT_SHEET_CLASS} { page-break-after: always; break-after: page; }
      .${MANUAL_PRINT_SHEET_CLASS}:last-child { page-break-after: auto; break-after: auto; }
      nav, aside, .no-print { display: none !important; }
    </style>
  </head><body><div id="manual-print-root"></div></body></html>`);
  printWindow.document.close();

  // 編集画面がすでに読み込んでいる CSS をそのまま複製する（上のファイル冒頭コメント参照）
  const styleNodes = document.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style');
  styleNodes.forEach((node) => printWindow.document.head.appendChild(node.cloneNode(true)));

  const rootEl = printWindow.document.getElementById("manual-print-root");
  if (!rootEl) {
    printWindow.close();
    return;
  }
  const root = createRoot(rootEl);
  root.render(createElement(ManualPrintDocument, { manual, resolved, settings, exportedAt }));

  // QR コード（qrcode ライブラリ）の非同期生成など、描画が落ち着くのを少し待ってから印刷する
  // （previewExport.ts の setTimeout(...,500〜700) と同じ考え方。requestAnimationFrame を
  // 2回はさんでレイアウト後の描画を確実に1回待ってから、さらに余裕を持たせる）
  printWindow.requestAnimationFrame(() => {
    printWindow.requestAnimationFrame(() => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 700);
    });
  });
}
