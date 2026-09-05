import { useState, useRef } from "react";
import { X, Upload, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseCsv, mapCsvColumns, buildSectionsFromCsv, type CsvColumnMap, type CsvImportResult } from "@/lib/csvImport";

interface CsvImportDialogProps {
  blocks: { id: string; type: string; label: string }[];
  onImport: (result: CsvImportResult, mode: "replace" | "append") => void;
  onClose: () => void;
}

// CSV インポートダイアログ: ファイル選択 → 解析プレビュー → 置き換え / 末尾に追加 を選んで実行
export default function CsvImportDialog({ blocks, onImport, onClose }: CsvImportDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [colMap, setColMap] = useState<CsvColumnMap | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const [mode, setMode] = useState<"replace" | "append">("append");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setColMap(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setError("データ行がありません。ヘッダー行 + 1 行以上のデータが必要です。");
        return;
      }
      const map = mapCsvColumns(rows[0], blocks);
      if ("error" in map) {
        setError(map.error);
        return;
      }
      if (map.blockCols.length === 0) {
        setError("ブロックに対応する列が 1 つも見つかりません。ヘッダー名がこの進行台本のブロック名 (例: 台本, 映像, 音声) と一致している必要があります。");
        return;
      }
      const res = buildSectionsFromCsv(rows, map);
      if (res.sectionCount === 0) {
        setError("取り込めるロールがありません。");
        return;
      }
      setColMap(map);
      setResult(res);
    } catch {
      // ⚠️ 例外のメッセージは画面に出さない（docs/wording.md ルール5）
      setError("CSV を読み込めませんでした。ファイルの中身と1行目の見出しを確かめて、もう一度選び直してください。");
    }
  };

  const handleExecute = () => {
    if (!result) return;
    if (mode === "replace" && !confirm("現在のロール・行をすべて置き換えます。よろしいですか？\n（置き換え前の内容は元に戻せません。必要なら先に CSV を書き出してください）")) return;
    onImport(result, mode);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full sm:max-w-lg bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Upload size={16} className="text-primary" aria-hidden />
            CSVインポート
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground transition-colors" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 形式の説明 */}
          <div className="text-xs text-muted-foreground leading-relaxed">
            CSVエクスポートと同じ形式 (1 行目: <code className="px-1 bg-muted rounded">#, セクション, 尺, ブロック名…</code>) を読み込みます。
            同じセクション名が連続する行は 1 つのロールにまとまります。
            セクション名が「CM」で始まる行はCM行、「VTR」または「VTR: タイトル」はVTR行になり、尺列の値がそのまま反映されます (全角ＣＭ/ＶＴＲも可)。
            ロールの先頭にブロック内容が空の行を置くと、その尺が<strong>ロール尺</strong>になります (無ければ各行の尺の合計を自動設定)。
          </div>

          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <FileText size={18} aria-hidden />
              {fileName ? fileName : "CSVファイルを選ぶ…"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden />
              <span>{error}</span>
            </div>
          )}

          {/* Preview summary */}
          {result && colMap && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-success/10 text-success text-xs">
                <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" aria-hidden />
                <span>
                  <strong>{result.sectionCount} ロール / {result.rowCount} 行</strong> を読み込みました。
                  {result.speakerNames.length > 0 && <> 出演者 {result.speakerNames.length} 名を検出。</>}
                </span>
              </div>

              {/* 列マッピング */}
              <div className="text-xs space-y-1.5">
                <div className="font-semibold text-foreground">列の対応</div>
                <div className="flex flex-wrap gap-1.5">
                  {colMap.blockCols.map(({ block }) => (
                    <span key={block.id} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{block.label} ✓</span>
                  ))}
                  {colMap.missingBlocks.map((label) => (
                    <span key={label} className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground" title="CSV に列がないため空になります">{label} —</span>
                  ))}
                </div>
                {colMap.unmatchedHeaders.length > 0 && (
                  <div className="text-muted-foreground">
                    無視される列: {colMap.unmatchedHeaders.join(", ")}
                  </div>
                )}
              </div>

              {/* Mode */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-foreground">取り込み方法</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "append"}
                    onClick={() => setMode("append")}
                    className={`flex-1 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${mode === "append" ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground hover:bg-accent"}`}
                  >
                    末尾に追加
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={mode === "replace"}
                    onClick={() => setMode("replace")}
                    className={`flex-1 px-3 py-2.5 text-xs font-medium rounded-lg border transition-colors ${mode === "replace" ? "bg-destructive/10 border-destructive text-destructive" : "border-border text-muted-foreground hover:bg-accent"}`}
                  >
                    すべて置き換え
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:bg-accent transition-colors">
            キャンセル
          </button>
          <button
            onClick={handleExecute}
            disabled={!result}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={14} aria-hidden />
            インポート実行
          </button>
        </div>
      </div>
    </div>
  );
}
