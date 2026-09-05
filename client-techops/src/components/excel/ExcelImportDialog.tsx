import { useRef, useState } from "react";
import { X, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Undo2, Loader2 } from "lucide-react";
import { importPlan, markBatchApplied, undoBatch, type ImportPlanResult } from "@/lib/excel/excelApi";

interface ExcelImportDialogProps {
  docId: string;
  currentData: unknown;
  /** ops を実データへ適用する（EditorPage の updateData(prev => applyOps(prev, ops)) を渡す）。 */
  onApply: (ops: ImportPlanResult["ops"]) => void;
  /** メタ列（title/status/broadcast_date）の反映。§7-1: data とは別経路で PATCH する。 */
  onApplyMeta: (metaPatch: Record<string, string>) => void;
  /** undo で返ってきた完全な data を反映する（updateData(() => data)）。 */
  onRestore: (data: unknown) => void;
  onClose: () => void;
}

type Mode = "merge" | "append";
type Stage = "pick" | "loading" | "review" | "applied" | "error";

// 台本 Excel の取込ダイアログ: ファイル選択 → 解析（差分の下見）→ 確認 → 取込実行 → 取消可
// 実装設計 03-excel.md §8。既定は「差分マージ」（他人が足した行を消さない）。
export default function ExcelImportDialog({ docId, currentData, onApply, onApplyMeta, onRestore, onClose }: ExcelImportDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("merge");
  const [stage, setStage] = useState<Stage>("pick");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportPlanResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFile = useRef<File | null>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    pendingFile.current = file;
    setError(null);
    setResult(null);
    setStage("pick");
  };

  const handleAnalyze = async () => {
    if (!pendingFile.current) return;
    setStage("loading");
    setError(null);
    try {
      const res = await importPlan(docId, pendingFile.current, mode, currentData);
      setResult(res);
      setStage("review");
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || "ファイルを読み取れませんでした。中身を確かめて、もう一度選び直してください。";
      setError(msg);
      setStage("error");
    }
  };

  const handleImport = async () => {
    if (!result) return;
    onApply(result.ops);
    if (Object.keys(result.metaPatch).length > 0) onApplyMeta(result.metaPatch);
    try {
      await markBatchApplied(docId, result.batchId, currentData);
    } catch {
      // 記録に失敗してもデータ適用自体は完了している。取消だけ使えなくなる。
    }
    setStage("applied");
  };

  const handleUndo = async () => {
    if (!result) return;
    try {
      const before = await undoBatch(docId, result.batchId);
      onRestore(before);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || "取り消せませんでした。少し待ってから、もう一度お試しください。");
    }
  };

  const s = result?.summary;

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-xl bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-primary" aria-hidden />
            Excelから読み込み
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {stage !== "applied" && (
            <div className="text-xs text-muted-foreground leading-relaxed">
              「現在の台本をExcel出力」で出したファイルを編集して読み込みます。既定は<strong>差分マージ</strong>
              （ID が一致する行は更新・無い行はそのまま残す）。ファイルに無い既存の行が消えることはありません。
            </div>
          )}

          {(stage === "pick" || stage === "error") && (
            <>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Upload size={18} aria-hidden />
                  {fileName ? fileName : ".xlsx ファイルを選ぶ…"}
                </button>
              </div>

              {fileName && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-foreground">取り込み方法</div>
                  <div className="flex gap-2">
                    <button
                      type="button" role="radio" aria-checked={mode === "merge"} onClick={() => setMode("merge")}
                      className={`flex-1 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${mode === "merge" ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
                    >
                      差分マージ（既定）
                    </button>
                    <button
                      type="button" role="radio" aria-checked={mode === "append"} onClick={() => setMode("append")}
                      className={`flex-1 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${mode === "append" ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
                    >
                      末尾に追加（ID を無視）
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden />
                  <span>{error}</span>
                </div>
              )}
            </>
          )}

          {stage === "loading" && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" aria-hidden /> 解析しています…
            </div>
          )}

          {stage === "review" && s && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 text-success text-xs">
                <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" aria-hidden />
                <span>
                  ロール 追加{s.sections.add}/更新{s.sections.update}・行 追加{s.rows.add}/更新{s.rows.update}
                  {s.ledScenes.add > 0 && <>・LEDシーン新規{s.ledScenes.add}</>}
                  {(s.masters.video + s.masters.audio + s.masters.telop + s.masters.persons) > 0 && <>・登録した名前の追加あり</>}
                </span>
              </div>
              {result!.warnings.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto p-3 rounded-lg bg-warning/10 text-warning text-xs">
                  {result!.warnings.slice(0, 30).map((w, i) => <div key={i}>{w}</div>)}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                「取り込む」を押すと、上の内容がこの台本に反映されます（取消は24時間以内・直近1件のみ可能）。
              </div>
            </div>
          )}

          {stage === "applied" && s && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 text-success text-xs">
                <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" aria-hidden />
                取り込みました（ロール 追加{s.sections.add}/更新{s.sections.update}・行 追加{s.rows.add}/更新{s.rows.update}）。
              </div>
              <button
                onClick={handleUndo}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                <Undo2 size={14} aria-hidden /> この取込を元に戻す
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors">
            {stage === "applied" ? "閉じる" : "キャンセル"}
          </button>
          {(stage === "pick" || stage === "error") && (
            <button
              onClick={handleAnalyze}
              disabled={!fileName}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              解析する
            </button>
          )}
          {stage === "review" && (
            <button
              onClick={handleImport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Upload size={14} aria-hidden /> 取り込む
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
