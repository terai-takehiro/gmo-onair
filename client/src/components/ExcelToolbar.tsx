// 共通 Excelインポート/エクスポートツールバー
// 使い方:
//   <ExcelToolbar resource="/customers" name="顧客" queryKey={["customers"]} />
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Upload, Download, AlertCircle, CheckCircle2 } from "lucide-react";

interface DryRunRow {
  rowNumber: number;
  name: string;
  uniqueKey: string | null;
  action: "insert" | "update" | "skip";
  errors: string[];
}
interface DryRunResult {
  mode: "dry_run";
  summary: { total: number; insert: number; update: number; skip: number; error: number };
  warnings: string[];
  rows: DryRunRow[];
}
interface CommitResult {
  mode: "commit";
  summary: DryRunResult["summary"];
  inserted: { uniqueKey: string | null; name: string }[];
  updated: { uniqueKey: string | null; name: string }[];
}

interface Props {
  /** APIパス。例: "/customers" → /customers/excel/{template,export-xlsx,import} */
  resource: string;
  /** 表示名 (日本語) — ファイル名やラベルに使う */
  name: string;
  /** インポート完了時に invalidateQueries するクエリキー */
  queryKey?: unknown[];
  /** 重複検出キーが利用可能か (skip/update/error の選択肢を出すか) */
  hasDuplicateKey?: boolean;
  /** Excel出力時に付与するクエリパラメータ (一覧の絞り込み/並び替えを反映) */
  exportParams?: Record<string, string | number | undefined>;
}

export default function ExcelToolbar({ resource, name, queryKey, hasDuplicateKey = true, exportParams }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update" | "error">("skip");
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null); setDryRun(null); setCommitted(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const handleClose = (next: boolean) => { if (!next) reset(); setOpen(next); };

  const downloadFile = async (
    url: string,
    filename: string,
    params?: Record<string, string | number | undefined>,
  ) => {
    const res = await api.get(url, { responseType: "blob", params });
    const blobUrl = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = blobUrl; a.download = filename; a.click();
    URL.revokeObjectURL(blobUrl);
  };

  const downloadTemplate = () => downloadFile(`${resource}/excel/template`, `${name}_テンプレート.xlsx`);
  const downloadExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    // undefined / 空文字のパラメータは除外
    const params = exportParams
      ? Object.fromEntries(
          Object.entries(exportParams).filter(([, v]) => v != null && v !== ""),
        )
      : undefined;
    return downloadFile(`${resource}/excel/export-xlsx`, `${name}_${today}.xlsx`, params);
  };

  const validateMutation = useMutation<DryRunResult, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error("ファイルが選択されていません");
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`${resource}/excel/import`, fd, {
        params: { mode: "dry_run", duplicate: duplicateMode },
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data;
    },
    onSuccess: (d) => { setDryRun(d); setCommitted(null); },
  });

  const commitMutation = useMutation<CommitResult, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error("ファイルが選択されていません");
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post(`${resource}/excel/import`, fd, {
        params: { mode: "commit", duplicate: duplicateMode },
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data.data;
    },
    onSuccess: (d) => {
      setCommitted(d); setDryRun(null);
      if (queryKey) qc.invalidateQueries({ queryKey });
    },
  });

  // `dryRun?.summary.error` と書くと summary が欠けた応答で throw する (?. は dryRun で止まる)
  const errorCount = dryRun?.summary?.error ?? 0;
  const canCommit = dryRun && errorCount === 0 && ((dryRun.summary?.insert ?? 0) + (dryRun.summary?.update ?? 0) > 0);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4 mr-1" />
        Excelインポート
      </Button>
      <Button size="sm" variant="outline" onClick={downloadExport}>
        <Download className="h-4 w-4 mr-1" />
        Excel出力
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{name} Excelインポート</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                  <span>初めての方は<strong>テンプレート</strong>をDLして編集してください</span>
                </div>
                <Button size="sm" variant="outline" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-1" />
                  テンプレDL
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <label className="block text-sm font-medium">Excelファイル (.xlsx)</label>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => { setFile(e.target.files?.[0] || null); setDryRun(null); setCommitted(null); }}
                  className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:bg-muted file:text-foreground hover:file:bg-muted/70"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {hasDuplicateKey && (
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">重複時の動作</label>
                      <Select value={duplicateMode} onValueChange={(v) => setDuplicateMode(v as "skip" | "update" | "error")}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">スキップ (既存はそのまま)</SelectItem>
                          <SelectItem value="update">上書き更新</SelectItem>
                          <SelectItem value="error">エラーにする</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className={`flex items-end ${hasDuplicateKey ? '' : 'sm:col-span-2'}`}>
                    <Button onClick={() => validateMutation.mutate()} disabled={!file || validateMutation.isPending} className="w-full">
                      <Upload className="h-4 w-4 mr-1" />
                      {validateMutation.isPending ? "検証中..." : "検証する"}
                    </Button>
                  </div>
                </div>

                {validateMutation.error && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {(validateMutation.error as Error).message}
                  </p>
                )}
              </CardContent>
            </Card>

            {dryRun && !committed && (
              <Card className={errorCount > 0 ? "border-destructive/40" : "border-green-500/40"}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-semibold">検証結果</h3>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">新規 {dryRun.summary.insert}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">更新 {dryRun.summary.update}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">スキップ {dryRun.summary.skip}</span>
                      {errorCount > 0 && <span className="px-2 py-0.5 rounded bg-red-100 text-red-800">エラー {errorCount}</span>}
                    </div>
                  </div>

                  {dryRun.warnings.length > 0 && (
                    <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                      {dryRun.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                    </div>
                  )}

                  <div className="border rounded max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="px-2 py-1 text-left">行</th>
                          <th className="px-2 py-1 text-left">識別子</th>
                          <th className="px-2 py-1 text-left">名称</th>
                          <th className="px-2 py-1 text-left">動作</th>
                          <th className="px-2 py-1 text-left">エラー</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dryRun.rows.map((r) => (
                          <tr key={r.rowNumber} className={r.errors.length > 0 ? "bg-red-50" : ""}>
                            <td className="px-2 py-1 tabular-nums">{r.rowNumber}</td>
                            <td className="px-2 py-1 ">{r.uniqueKey || "-"}</td>
                            <td className="px-2 py-1">{r.name}</td>
                            <td className="px-2 py-1">
                              <span className={
                                r.errors.length > 0 ? "text-red-600" :
                                r.action === "insert" ? "text-blue-600" :
                                r.action === "update" ? "text-amber-600" : "text-zinc-500"
                              }>
                                {r.errors.length > 0 ? "✗" : r.action === "insert" ? "＋新規" : r.action === "update" ? "◯更新" : "スキップ"}
                              </span>
                            </td>
                            <td className="px-2 py-1 text-red-600">{r.errors.join(" / ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={reset}>キャンセル</Button>
                    <Button onClick={() => commitMutation.mutate()} disabled={!canCommit || commitMutation.isPending}>
                      {commitMutation.isPending ? "実行中..." : `実行する (${dryRun.summary.insert + dryRun.summary.update}件)`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {committed && (
              <Card className="border-green-500/40 bg-green-50/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-semibold">インポート完了</span>
                  </div>
                  <p className="text-sm">
                    新規追加: <strong>{committed.inserted.length}</strong>件 / 更新: <strong>{committed.updated.length}</strong>件
                  </p>
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => handleClose(false)}>閉じる</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
