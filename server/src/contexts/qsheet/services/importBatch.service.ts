/**
 * Excel 取込のスナップショット（`qsheet_import_batches`）の読み書き。実装設計: 03-excel.md §9-4・§10。
 */
import { randomUUID } from 'crypto';
import { queryOne, queryAll, execute } from '../../../shared/db/connection';
import { NotFoundError, ConflictError } from './httpErrors';
import type { PlanSummary, ImportMode } from '../excel/planTypes';

export interface ImportBatchRow {
  id: string;
  document_id: string;
  mode: ImportMode;
  source_kind: 'xlsx' | 'csv';
  file_name: string;
  file_size: number;
  summary: PlanSummary;
  before_data: unknown;
  after_data: unknown | null;
  applied_at: string | null;
  undone_at: string | null;
  created_by: string | null;
  created_at: string;
}

export async function createBatch(input: {
  documentId: string; mode: ImportMode; sourceKind: 'xlsx' | 'csv'; fileName: string; fileSize: number;
  summary: PlanSummary; beforeData: unknown; createdBy: string;
}): Promise<string> {
  const id = `imb_${randomUUID()}`;
  await execute(
    `INSERT INTO qsheet_import_batches (id, document_id, mode, source_kind, file_name, file_size, summary, before_data, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, input.documentId, input.mode, input.sourceKind, input.fileName.slice(0, 255), input.fileSize,
      JSON.stringify(input.summary), JSON.stringify(input.beforeData), input.createdBy],
  );
  return id;
}

async function loadBatch(batchId: string, documentId: string): Promise<ImportBatchRow> {
  const row = await queryOne('SELECT * FROM qsheet_import_batches WHERE id = $1 AND document_id = $2', [batchId, documentId]);
  if (!row) throw new NotFoundError('取込の記録が見つかりません');
  return row as unknown as ImportBatchRow;
}

/** 適用済みとして記録する（§9-4）。`after` はクライアントが適用後に持っている完全な data。 */
export async function markApplied(batchId: string, documentId: string, after: unknown): Promise<void> {
  await loadBatch(batchId, documentId);
  await execute(
    `UPDATE qsheet_import_batches SET after_data = $1, applied_at = NOW() WHERE id = $2 AND document_id = $3`,
    [JSON.stringify(after), batchId, documentId],
  );
}

/** 取消（undo）。適用から 24 時間以内・その台本で最後に適用された batch のみ（§9-4）。 */
export async function undoBatch(batchId: string, documentId: string): Promise<unknown> {
  const batch = await loadBatch(batchId, documentId);
  if (!batch.applied_at) throw new ConflictError('この取込はまだ適用されていません', new Date().toISOString(), null);
  if (batch.undone_at) throw new ConflictError('この取込は既に取り消し済みです', new Date().toISOString(), null);

  const latest = await queryOne(
    `SELECT id FROM qsheet_import_batches WHERE document_id = $1 AND applied_at IS NOT NULL ORDER BY applied_at DESC LIMIT 1`,
    [documentId],
  );
  if (!latest || (latest.id as string) !== batchId) {
    throw new ConflictError('取り消せるのは、この台本で最後に適用した取込だけです', new Date().toISOString(), null);
  }
  const appliedMs = new Date(batch.applied_at).getTime();
  if (Date.now() - appliedMs > 24 * 60 * 60 * 1000) {
    throw new ConflictError('取込の取消は 24 時間以内のみ行えます', new Date().toISOString(), null);
  }

  await execute('UPDATE qsheet_import_batches SET undone_at = NOW() WHERE id = $1', [batchId]);
  return batch.before_data;
}

export async function listBatches(documentId: string, limit = 20): Promise<ImportBatchRow[]> {
  const rows = await queryAll(
    `SELECT ib.*, u.name AS created_by_name FROM qsheet_import_batches ib
     LEFT JOIN users u ON ib.created_by = u.id
     WHERE ib.document_id = $1 ORDER BY ib.created_at DESC LIMIT $2`,
    [documentId, limit],
  );
  return rows as unknown as ImportBatchRow[];
}
