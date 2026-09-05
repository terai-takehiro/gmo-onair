import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileSpreadsheet, AlertCircle, CheckCircle2, Upload, Download } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DryRunRow {
  rowNumber: number;
  name: string;
  eq_code: string | null;
  action: 'insert' | 'update' | 'skip';
  errors: string[];
}

interface DryRunResult {
  mode: 'dry_run';
  summary: { total: number; insert: number; update: number; skip: number; error: number };
  warnings: string[];
  rows: DryRunRow[];
}

interface CommitResult {
  mode: 'commit';
  summary: { total: number; insert: number; update: number; skip: number; error: number };
  inserted: { eq_code: string; name: string }[];
  updated: { eq_code: string; name: string }[];
}

interface PreviewResult {
  detectedHeaders: string[];
  expectedColumns: { key: string; header: string }[];
  autoMapping: Record<string, string | null>;
  unmatchedKeys: string[];
}

const NONE_VALUE = '__none__';

export default function ExcelImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update' | 'error'>('skip');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [committed, setCommitted] = useState<CommitResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setDryRun(null);
    setCommitted(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const downloadTemplate = async () => {
    const res = await api.get('/equipment/items/template', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = '機材リスト_テンプレート.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const extractErrorMsg = (e: unknown): string => {
    const ae = e as any;
    return ae?.response?.data?.error?.message || ae?.message || String(e);
  };

  const previewMutation = useMutation<PreviewResult, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error('ファイルが選択されていません');
      const fd = new FormData();
      fd.append('file', file);
      try {
        const res = await api.post('/equipment/items/import-preview', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      } catch (e: unknown) {
        throw new Error(extractErrorMsg(e));
      }
    },
    onSuccess: (data) => {
      setPreview(data);
      setMapping(data.autoMapping);
      setDryRun(null);
      setCommitted(null);
    },
  });

  // ファイル選択時に自動でヘッダープレビューを取得
  useEffect(() => {
    if (file && !preview && !previewMutation.isPending) {
      previewMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const validateMutation = useMutation<DryRunResult, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error('ファイルが選択されていません');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      try {
        const res = await api.post('/equipment/items/import', fd, {
          params: { mode: 'dry_run', duplicate: duplicateMode },
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      } catch (e: unknown) {
        throw new Error(extractErrorMsg(e));
      }
    },
    onSuccess: (data) => { setDryRun(data); setCommitted(null); },
  });

  const commitMutation = useMutation<CommitResult, Error, void>({
    mutationFn: async () => {
      if (!file) throw new Error('ファイルが選択されていません');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mapping', JSON.stringify(mapping));
      try {
        const res = await api.post('/equipment/items/import', fd, {
          params: { mode: 'commit', duplicate: duplicateMode },
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      } catch (e: unknown) {
        throw new Error(extractErrorMsg(e));
      }
    },
    onSuccess: (data) => {
      setCommitted(data);
      setDryRun(null);
      qc.invalidateQueries({ queryKey: ['equipment-items'] });
    },
  });

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFileChange = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setMapping({});
    setDryRun(null);
    setCommitted(null);
  };

  const updateMapping = (key: string, excelHeader: string) => {
    setMapping((prev) => ({
      ...prev,
      [key]: excelHeader === NONE_VALUE ? null : excelHeader,
    }));
    setDryRun(null); // マッピング変更時は検証結果をリセット
  };

  const errorCount = dryRun?.summary.error ?? 0;
  const canCommit = dryRun && (dryRun.summary.insert + dryRun.summary.update > 0);
  const unmatchedCount = preview
    ? preview.expectedColumns.filter((c) => !mapping[c.key]).length
    : 0;

  return (
    <FormDialog open={open} onOpenChange={handleClose} title="機材リスト Excelインポート" wide>
        <div className="space-y-4">
          {/* テンプレートDL */}
          <Card>
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                <span>初めての方は<strong>テンプレート</strong>をダウンロードして編集してください</span>
              </div>
              <Button size="sm" variant="outline" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                テンプレートを取る
              </Button>
            </CardContent>
          </Card>

          {/* ファイル選択 */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <label className="block text-sm font-medium">Excelファイル (.xlsx)</label>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="block w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded file:border file:bg-muted file:text-foreground hover:file:bg-muted/70"
              />

              {previewMutation.error && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  {(previewMutation.error as Error).message}
                </p>
              )}
              {previewMutation.isPending && (
                <p className="text-xs text-muted-foreground">列を読み取っています…</p>
              )}
            </CardContent>
          </Card>

          {/* 列マッピング UI */}
          {preview && !committed && (
            <Card className={unmatchedCount > 0 ? "border-amber-400/60" : "border-green-500/40"}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">列の対応づけ</h3>
                  <span className="text-xs text-muted-foreground">
                    読み取った列: {preview.detectedHeaders.length} / 未対応: {unmatchedCount}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  自動判定できなかった列は、Excelのどの列に該当するかを選択してください（使わない場合は「使用しない」）
                </p>

                <div className="border rounded max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left w-1/3">期待される列</th>
                        <th className="px-2 py-1.5 text-left">Excel列</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.expectedColumns.map((col) => {
                        const current = mapping[col.key];
                        const isUnmatched = !current;
                        return (
                          <tr key={col.key} className={isUnmatched ? 'bg-amber-50' : ''}>
                            <td className="px-2 py-1.5 font-medium">{col.header}</td>
                            <td className="px-2 py-1">
                              <Select
                                value={current || NONE_VALUE}
                                onValueChange={(v) => updateMapping(col.key, v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="(未選択)" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE_VALUE}>
                                    <span className="text-muted-foreground">(使用しない)</span>
                                  </SelectItem>
                                  {preview.detectedHeaders.map((h) => (
                                    <SelectItem key={h} value={h}>{h}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">同じIDがあったら</label>
                    <Select value={duplicateMode} onValueChange={(v) => setDuplicateMode(v as 'skip' | 'update' | 'error')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">スキップ (既存はそのまま)</SelectItem>
                        <SelectItem value="update">上書き更新</SelectItem>
                        <SelectItem value="error">エラーにする</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => validateMutation.mutate()}
                      disabled={!file || validateMutation.isPending}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {validateMutation.isPending ? '試しています…' : '試す'}
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
          )}

          {/* dry_run結果 */}
          {dryRun && !committed && (
            <Card className={errorCount > 0 ? "border-destructive/40" : "border-green-500/40"}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">検証結果</h3>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">新規 {dryRun.summary.insert}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">更新 {dryRun.summary.update}</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-700">スキップ {dryRun.summary.skip}</span>
                    {errorCount > 0 && (
                      <span className="px-2 py-0.5 rounded bg-red-100 text-red-800">エラー {errorCount}</span>
                    )}
                  </div>
                </div>

                {dryRun.warnings.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                    {dryRun.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                  </div>
                )}

                {/* 行リスト */}
                <div className="border rounded max-h-72 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">行</th>
                        <th className="px-2 py-1 text-left">ID</th>
                        <th className="px-2 py-1 text-left">商品名</th>
                        <th className="px-2 py-1 text-left">動作</th>
                        <th className="px-2 py-1 text-left">エラー</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRun.rows.map((r) => (
                        <tr key={r.rowNumber} className={r.errors.length > 0 ? 'bg-red-50' : ''}>
                          <td className="px-2 py-1 tabular-nums">{r.rowNumber}</td>
                          <td className="px-2 py-1 ">{r.eq_code || '-'}</td>
                          <td className="px-2 py-1">{r.name}</td>
                          <td className="px-2 py-1">
                            <span className={
                              r.errors.length > 0 ? 'text-red-600' :
                              r.action === 'insert' ? 'text-blue-600' :
                              r.action === 'update' ? 'text-amber-600' : 'text-zinc-500'
                            }>
                              {r.errors.length > 0 ? '✗' : r.action === 'insert' ? '＋新規' : r.action === 'update' ? '◯更新' : 'スキップ'}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-red-600">
                            {r.errors.join(' / ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {commitMutation.error && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    {(commitMutation.error as Error).message}
                  </p>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={reset}>キャンセル</Button>
                  <Button
                    onClick={() => commitMutation.mutate()}
                    disabled={!canCommit || commitMutation.isPending}
                  >
                    {commitMutation.isPending ? '取り込んでいます…' : `取り込む (${dryRun.summary.insert + dryRun.summary.update}件)`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* commit結果 */}
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
    </FormDialog>
  );
}
