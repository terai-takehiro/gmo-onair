// 台本 Excel 入出力 API（実装設計 03-excel.md §9）。書き出し・解析も生成もクライアントでは行わない
// （§2-2: 列定義はサーバー1箇所・未知ファイルを解くのはサーバー・バンドルを太らせない）。
import api from "@/lib/api";
import type { PlanOp } from "./applyPlan";

export interface ImportPlanSummary {
  sections: { add: number; update: number };
  rows: { add: number; update: number };
  masters: { video: number; audio: number; telop: number; persons: number };
  ledScenes: { add: number };
  errors: number;
}
export interface ImportPlanEntry {
  sheetRow: number;
  kind: string;
  id: string | null;
  action: "add" | "update" | "skip" | "error";
  ref: string;
  messages: string[];
}
export interface ImportPlanResult {
  batchId: string;
  ops: PlanOp[];
  summary: ImportPlanSummary;
  entries: ImportPlanEntry[];
  warnings: string[];
  metaPatch: Record<string, string>;
}

function filenameFromDisposition(disposition: string | undefined, fallback: string): string {
  const m = disposition?.match(/filename\*=UTF-8''([^;]+)/);
  return m ? decodeURIComponent(m[1]) : fallback;
}

export async function exportQsheet(
  docId: string,
  opts: { format: "xlsx" | "csv"; content?: "full" | "empty"; current?: unknown },
): Promise<{ blob: Blob; filename: string }> {
  const res = await api.post(`/qsheet/documents/${docId}/export`, opts, { responseType: "blob" });
  const filename = filenameFromDisposition(res.headers["content-disposition"], `cuesheet.${opts.format}`);
  return { blob: res.data as Blob, filename };
}

export async function downloadTemplate(docId: string): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get(`/qsheet/documents/${docId}/excel/template`, { responseType: "blob" });
  const filename = filenameFromDisposition(res.headers["content-disposition"], "template.xlsx");
  return { blob: res.data as Blob, filename };
}

export async function importPlan(docId: string, file: File, mode: "merge" | "append", current: unknown): Promise<ImportPlanResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  form.append("current", JSON.stringify(current));
  const { data } = await api.post(`/qsheet/documents/${docId}/excel/import-plan`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.data as ImportPlanResult;
}

export async function markBatchApplied(docId: string, batchId: string, after: unknown): Promise<void> {
  await api.post(`/qsheet/documents/${docId}/excel/batches/${batchId}/applied`, { after });
}

export async function undoBatch(docId: string, batchId: string): Promise<unknown> {
  const { data } = await api.post(`/qsheet/documents/${docId}/excel/batches/${batchId}/undo`);
  return data.data.data;
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
