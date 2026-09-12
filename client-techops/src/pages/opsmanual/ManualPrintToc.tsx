// 運営マニュアル — 目次（段D）。production-manual.md §6⑤「目次は章から自動で作る（人が
// 打ち直さない）」のとおり、`page.chapter` が入っているページ（＝章の先頭）を拾って
// 「章名 → 先頭ページ番号」の一覧を並べるだけ。エントリの算出（どのページが何番か）は
// ManualPrintDocument.tsx が持つ（表紙・目次自体もページ番号に数えるため、算出はそちら1箇所に
// 集約する——このファイルは受け取った一覧をそのまま出す見た目専用コンポーネント）。
//
// ⚠️ 印刷専用ウィンドウに描かれるため Tailwind クラスは使わず素の style で組む
// （ManualPrintHeader.tsx と同じ理由）。
import type { CSSProperties } from "react";

export interface ManualPrintTocEntry {
  chapter: string;
  /** その章の先頭ページの通し番号（表紙・目次を含めて数えた番号。ManualPrintHeader の
   *  ページ番号と同じ基準） */
  pageNumber: number;
}

export interface ManualPrintTocProps {
  entries: ManualPrintTocEntry[];
}

const TABULAR: CSSProperties = { fontFeatureSettings: "'palt' 0, 'tnum' 1" };

export default function ManualPrintToc({ entries }: ManualPrintTocProps) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "24mm 20mm 15mm 20mm" }}>
      <h2 style={{ margin: "0 0 8mm 0", fontSize: "16pt", fontWeight: 800 }}>目次</h2>

      {entries.length === 0 ? (
        <p style={{ margin: 0, fontSize: "9.5pt", color: "#6b7280" }}>章が設定されたページがありません。</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "10.5pt" }}>
          {entries.map((entry, i) => (
            <li
              key={`${entry.pageNumber}-${i}`}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "3mm",
                padding: "2mm 0",
                borderBottom: "0.25mm solid #d1d5db", // 帯ではなく罫で示す（§6-6）
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.chapter}</span>
              <span style={{ ...TABULAR, flexShrink: 0 }}>{entry.pageNumber}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
