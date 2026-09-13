// 運営マニュアル — ヘッダー（ランニングヘッダー・段D）。
// production-manual.md §6⑤「ヘッダーには `OM-0007 rev.2 ・ 2026/08/22 14:00 時点 ・ 5 / 12` と出る」
// のとおり、全ての物理ページ（表紙・目次・キャンバス。ManualPrintDocument.tsx が呼ぶ）の最上部に
// 重ねて出す。OFF にできないのは「資料番号・状態・取扱注意」の3つで、「時点」（showAsOf）と
// 「ページ番号」（pageNumbers）だけ書き出し設定で OFF にできる（§6⑤の6項目のうち2つ）。
// 中身の文言（下書き/rev.N の出し分け・時点の文字列）は ManualPrintDocument.tsx 側で作り、
// ここは受け取った文字列をそのまま並べるだけの見た目専用コンポーネントにする。
//
// ⚠️ 印刷専用の別ウィンドウ（別 document）に描かれるため、Tailwind のユーティリティクラスは
// 使わず素の `style` で組む（`manualPrintExport.ts` がアプリの <link>/<style> を複製するので
// 実際には動くが、この複製に依存しない書き方にしておく——複製が万一失敗してもヘッダーだけは崩れない）。
import type { CSSProperties } from "react";

export interface ManualPrintHeaderProps {
  docNo: string | null;
  /** 「下書き」または「rev.N」（段E後に到達）。文言は ManualPrintDocument.tsx の
   *  `manualPrintStatusLabel` が決める */
  statusLabel: string;
  /** 「9月12日 15:32 時点」。settings.showAsOf が false のときは null（欄ごと出さない） */
  asOfLabel: string | null;
  /** 「5 / 12」。settings.pageNumbers が false のときは null（欄ごと出さない） */
  pageLabel: string | null;
  /** true なら「取扱注意 ── 配信の鍵あり」を消せない形で出す（§7-2） */
  hasSecrets: boolean;
}

// 数字（資料番号・ページ番号）は等幅で揃える（§6-5-1「数字が縦に並ぶところだけ等幅」）
const TABULAR: CSSProperties = { fontFeatureSettings: "'palt' 0, 'tnum' 1" };

const BAR_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  height: "9mm",
  padding: "0 15mm", // 版面の左右余白（PAGE_MARGIN_MM.left/right）に揃える
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "4mm",
  background: "#fff", // 地は白（§6-6）。下にキャンバスのブロックがあってもヘッダーの帯が覆う
  borderBottom: "0.25mm solid #1f2937", // 罫は0.25mm以上（§6-6）。帯を塗らず線で示す
  fontSize: "8pt", // ヘッダーは8pt（§8-3）
  lineHeight: 1,
  color: "#1f2937",
  zIndex: 1000, // キャンバスのどのブロックより必ず手前
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const CAUTION_STYLE: CSSProperties = {
  flexShrink: 0,
  border: "0.25mm solid #b91c1c", // 塗りつぶさず枠線で組む（§6-6「バッジは塗りつぶさず枠線で組む」）
  color: "#b91c1c",
  fontWeight: 700,
  padding: "0.5mm 2mm",
  borderRadius: "1mm",
};

export default function ManualPrintHeader({ docNo, statusLabel, asOfLabel, pageLabel, hasSecrets }: ManualPrintHeaderProps) {
  return (
    <div style={BAR_STYLE}>
      <div style={{ display: "flex", alignItems: "center", gap: "3mm", overflow: "hidden", textOverflow: "ellipsis" }}>
        {docNo && <span style={TABULAR}>{docNo}</span>}
        <span>{statusLabel}</span>
        {asOfLabel && <span>・{asOfLabel}</span>}
        {hasSecrets && <span style={CAUTION_STYLE}>取扱注意 ── 配信の鍵あり</span>}
      </div>
      {pageLabel && <span style={{ ...TABULAR, flexShrink: 0 }}>{pageLabel}</span>}
    </div>
  );
}
