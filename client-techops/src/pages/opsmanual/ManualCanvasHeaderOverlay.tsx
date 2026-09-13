// 編集画面（②）のキャンバスに、実際に刷られるヘッダーをそのまま重ねて出す（利用者指摘:
// 「ヘッダー・フッターが編集画面では見えない」）。中身は `ManualPrintDocument.tsx` が
// 印刷・PDFで使うのと同じ関数（`manualPrintStatusLabel`・`manualHasRevealedSecret`）で
// 作るので、編集中に見えるものと刷ったものがずれない。**フッターという別の帯は無い**
// （設計 §6⑤・§8-3。ページ番号はヘッダー帯の右端に出る一項目——本文書には別枠のフッターの
// 決めごとが無い）。「時点」は書き出しの瞬間に決まる値なので編集中は出さない（`asOfLabel: null`）。
// ページ番号は編集中のキャンバスページだけを数えた値（表紙・目次を足す最終ページ数とは
// 一致しないことがある——それは書き出し設定で決まるため、ここでは踏み込まない）。
import type { ManualDetail } from "@gmo-onair/shared/src/opsmanual/types";
import { pagesSorted } from "@/components/opsmanual/pageOrder";
import ManualPrintHeader from "./ManualPrintHeader";
import { manualHasRevealedSecret, manualPrintStatusLabel } from "./ManualPrintDocument";

interface Props {
  manual: Pick<ManualDetail, "doc_no" | "status" | "rev" | "pages">;
  pageId: string;
}

export default function ManualCanvasHeaderOverlay({ manual, pageId }: Props) {
  const sorted = pagesSorted(manual.pages);
  const index = sorted.findIndex((p) => p.id === pageId);
  if (index < 0) return null;
  return (
    // pointer-events-none: あくまで見た目のガイド。クリック・ドラッグはブロック側へ
    // そのまま通す（版面の余白ガイドと同じ扱い）
    <div className="pointer-events-none absolute inset-x-0 top-0" aria-hidden="true">
      <ManualPrintHeader
        docNo={manual.doc_no}
        statusLabel={manualPrintStatusLabel(manual)}
        asOfLabel={null}
        pageLabel={`${index + 1} / ${sorted.length}`}
        hasSecrets={manualHasRevealedSecret(manual.pages)}
      />
    </div>
  );
}
