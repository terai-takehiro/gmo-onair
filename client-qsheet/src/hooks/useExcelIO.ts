// 台本 Excel 入出力（実装設計 03-excel.md §8・§9）。EditorPage.tsx から状態とハンドラを切り出したもの
// （`scripts/check-file-size.mjs` のラチェットに引っかからないよう新規追加分をここに逃がす）。
import { useCallback, useState } from "react";
import api from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { exportQsheet, triggerDownload } from "@/lib/excel/excelApi";
import { applyOps, type PlanOp } from "@/lib/excel/applyPlan";

interface DocLike {
  id: string;
  title: string;
  status: string;
  broadcast_date: string | null;
  data: unknown;
}

export function useExcelIO(
  doc: DocLike | null,
  updateData: (updater: (prev: any) => any) => void,
  setDoc: (updater: (prev: any) => any) => void,
) {
  const [showExcelImport, setShowExcelImport] = useState(false);

  // Excel 出力（サイドバー「現在の台本をExcel出力」・§9-1）。列定義・生成はサーバー1箇所に寄せる。
  const handleExcelExport = useCallback(async () => {
    if (!doc) return;
    try {
      const { blob, filename } = await exportQsheet(doc.id, { format: "xlsx", content: "full", current: doc.data });
      triggerDownload(blob, filename);
    } catch {
      notifyError("Excel出力に失敗しました");
    }
  }, [doc]);

  // Excel 取込の適用（§8-1）。サーバーは data を直接書かず操作リスト (PlanOp[]) だけを返すので、
  // 既存の updateData 経由で applyOps(prev, ops) を通す（collab 有効時も安全に合流する）。
  const handleExcelApply = useCallback((ops: PlanOp[]) => {
    updateData((prev) => applyOps(prev, ops));
  }, [updateData]);

  // title/status/broadcast_date は data 列とは別経路 (PATCH /meta) で反映する（§7-1）。
  const handleExcelApplyMeta = useCallback(async (metaPatch: Record<string, string>) => {
    if (!doc) return;
    try {
      await api.patch(`/qsheet/documents/${doc.id}/meta`, metaPatch);
      setDoc((prev: any) => (prev ? {
        ...prev,
        title: metaPatch.title ?? prev.title,
        status: metaPatch.status ?? prev.status,
        broadcast_date: metaPatch.broadcast_date ?? prev.broadcast_date,
      } : prev));
    } catch {
      notifyError("台本情報（タイトル・状態・放送日）の反映に失敗しました", { description: "台本本体の取込は完了しています。" });
    }
  }, [doc, setDoc]);

  // 取込の取消 (undo)。before_data をそのまま反映する（§9-4）。
  // ⚠️ 既知の限度: applyOps と違い prev を無視した丸ごと置換になる。適用〜取消の間に
  // 他の人が加えた変更があれば、それも一緒に戻る（24時間以内・直近1件限定の非常口という位置づけ）。
  const handleExcelRestore = useCallback((data: unknown) => {
    updateData(() => data);
  }, [updateData]);

  return { showExcelImport, setShowExcelImport, handleExcelExport, handleExcelApply, handleExcelApplyMeta, handleExcelRestore };
}
