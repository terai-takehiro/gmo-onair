/**
 * 請求書 Excel（業務推進への監査提出用）を発行するボタン
 *
 * `DocPdfButton.tsx` と同じ場所（案件詳細の見積タブ・同 売上・請求ペイン・
 * ⑤ 見積・請求（全案件）・② 締め処理）に、既存の請求書・検収書 PDF ボタンと
 * 並べて置きます。**BOX には保存しません**（`lib/docPdf.ts` の
 * `downloadRevenueExcel` 参照）——PDF ボタンと見た目をそろえると
 * 「同じように BOX に入る」と誤解されるので、`title`/`aria-label` に
 * BOX の言葉は入れません。
 *
 * 決めごとは `DocPdfButton.tsx` と同じ: アイコンだけ・44px/36px の当たり判定・
 * 行の中に置くので `stopPropagation`・押している間は連打を止める。
 */
import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { downloadRevenueExcel } from '@/lib/docPdf';

export interface DocExcelButtonProps {
  /** 対象の売上（revenue）ID */
  revenueId: string;
}

export function DocExcelButton({ revenueId }: DocExcelButtonProps) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      title="請求書Excelを発行（業務推進提出用）"
      aria-label="請求書Excelを発行（業務推進提出用）"
      onClick={async (e) => {
        // 行そのものが押せる一覧に置くので、行の動作へ伝えない
        e.stopPropagation();
        setBusy(true);
        try { await downloadRevenueExcel(revenueId); } finally { setBusy(false); }
      }}
      className="rounded-control flex min-h-tap w-11 shrink-0 items-center justify-center border border-border bg-card text-secondary-foreground hover:border-primary-border hover:text-primary disabled:opacity-50 lg:h-9 lg:min-h-0 lg:w-9"
    >
      {busy
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        : <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  );
}
