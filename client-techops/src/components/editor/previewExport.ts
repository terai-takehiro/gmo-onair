// PreviewModal の出力ロジック (CSV ダウンロード / PDF 印刷)。
// 表示側 (PreviewModal.tsx) が 400 行基準を大きく超えていたため、役割 (プレビュー表示 / 出力) で分けた。
// 中身は PreviewModal.tsx からの移動そのままで、挙動は変えていない。
import lineSeedFontsCssUrl from "@gmo-onair/shared/src/client/fonts/lineseedjp.css?url"; // 同梱済みフォント。印刷は別ドキュメント(about:blank)なので絶対URLで書き込む
const PRINT_FONTS_HREF = new URL(lineSeedFontsCssUrl, window.location.origin).toString(), PRINT_FONT_STACK = "'LINE Seed JP', 'Noto Sans JP', -apple-system, 'Hiragino Sans', 'BIZ UDPGothic', 'Meiryo', sans-serif";

// 印刷ウィンドウへ document.write する HTML に埋めるユーザー入力 (台本タイトル等) 用。
// 素通しすると </title> でタグを閉じてマークアップを注入できてしまう
const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// PreviewModal が受け取る state のうち、出力で使う部分
interface PreviewState {
  meta?: any;
  blocks: any[];
  sections: any[];
}

// CSV ダウンロード (PreviewModal の CSV ボタン)
export function downloadPreviewCsv(state: PreviewState, docTitle?: string) {
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
      // ロール尺 (sec.duration) があれば「ロール見出し行」(ブロック空) として先頭に出力し、
      // 再インポート時にロール尺として復元できるようにする
      if (sec.duration) {
        rows.push([String(num++), String(sec.label || ""), String(sec.duration), ...blocks.map(() => "")]);
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
}

// PDF / 印刷 (PreviewModal の PDF ボタン)。pageEl はプレビュー DOM のルート (pageRef.current)
export function printPreview({ pageEl, paperSize, margin, mono, pageMode, meta }: {
  pageEl: HTMLElement;
  paperSize: string;
  margin: number;
  mono: boolean;
  pageMode: "flow" | "role";
  meta: PreviewState["meta"];
}) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { alert("別ウィンドウを開けませんでした。ブラウザでこのサイトのポップアップを許可してから、もう一度お試しください。"); return; }
    const sizes: Record<string, [string, string]> = {
      A4P: ["210mm", "297mm"],
      A4L: ["297mm", "210mm"],
      A3P: ["297mm", "420mm"],
      A3L: ["420mm", "297mm"],
    };
    const [pageW, pageH] = sizes[paperSize] || sizes.A4P;
    const dl = meta?.draftType === "準備稿" ? "準備稿" : meta?.draftType === "決定稿" ? "決定稿" : `第${meta?.draftNumber || 1}稿`;
    const docTitle = `【${dl}】${meta?.title || "進行台本"}`;
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
        <meta charset="UTF-8"><title>${escapeHtml(docTitle)}</title>
        <link rel="stylesheet" href="${PRINT_FONTS_HREF}">
        <style>
          @page { size: ${pageW} ${pageH}; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: ${PRINT_FONT_STACK}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
      <meta charset="UTF-8"><title>${escapeHtml(docTitle)}</title>
      <link rel="stylesheet" href="${PRINT_FONTS_HREF}">
      <style>
        @page { size: ${pageW} ${pageH}; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: ${PRINT_FONT_STACK}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
    </head><body>${pageEl.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}
