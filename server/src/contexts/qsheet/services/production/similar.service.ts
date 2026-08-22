/**
 * `find_similar_qsheets`（MCP・段10 / 05-mcp.md §4-5）。
 *
 * ⚠️ **設計書との食い違い**: 05-mcp.md は「04 §2-3 の `qsheet_doc_index` と同じスコア関数を
 * 呼ぶだけ」にする方針だったが、そのスコア関数（類似検索・few-shot 本体）を持つ 04-ai.md の
 * 段8はこのブランチではまだ実装されていない（`qsheet_doc_index` は段7で表と最小限の埋め込み
 * ―section_count/row_count/total_sec/block_types/section_labels/is_reference―だけを持ち、
 * customer_id/project_type/person_names 等はまだ NULL のまま）。
 * そこで本段では、**いま埋まっている列だけで組める最小限のスコア関数**をここに置く
 * （同じ案件・型構成の重なり・尺の近さ）。04 の段8が本実装を入れたら、そちらを呼ぶだけに
 * 差し替える（呼び出し口はこの1関数なので差し替えの影響範囲は小さい）。
 *
 * 見える範囲は他の read ツールと同じ（作成者本人／共有先／`system_admin`）で絞ってから返す
 * （§4-5 決めたこと: 新しく入った人には結果が空になりうるが、共有されていない他人の台本を
 * 見せるよりは正しい）。`is_reference = false` の台本は返さない（04 §2-7 の守秘の印）。
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import { AppError } from '../../../../shared/middleware/errorHandler';
import { isQsheetAdmin, type AccessUser } from '../../access';

export interface FindSimilarInput {
  documentId?: string;
  projectId?: string;
  excludeDocumentId?: string;
  limit: number;
}

export interface SimilarQsheet {
  id: string;
  title: string;
  docNo: string | null;
  projectName: string | null;
  customerName: string | null;
  serviceDate: string | null;
  score: number;
  reasons: string[];
  sections: { label: string; duration: string | null; rowCount: number }[];
  blockTypes: string[];
  totals: { sections: number; rows: number; totalSec: number };
  isReference: boolean;
}

interface IndexRow {
  document_id: string;
  project_id: string | null;
  service_date: string | null;
  section_count: number;
  row_count: number;
  total_sec: number;
  block_types: string[];
  section_labels: string[];
}

async function fetchSeed(input: FindSimilarInput): Promise<{ projectId: string | null; blockTypes: string[]; totalSec: number } | null> {
  if (input.documentId) {
    const row = await queryOne(
      'SELECT project_id, block_types, total_sec FROM qsheet_doc_index WHERE document_id = ?',
      [input.documentId],
    );
    if (!row) return null; // 索引が無い（未締め）— project_id だけで探す方には回さない
    return {
      projectId: (row.project_id as string) ?? null,
      blockTypes: Array.isArray(row.block_types) ? (row.block_types as string[]) : [],
      totalSec: Number(row.total_sec) || 0,
    };
  }
  if (input.projectId) return { projectId: input.projectId, blockTypes: [], totalSec: 0 };
  throw new AppError(400, 'BAD_REQUEST', 'document_id か project_id のどちらかを指定してください');
}

function scoreOf(seed: { projectId: string | null; blockTypes: string[]; totalSec: number }, cand: IndexRow): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (seed.projectId && cand.project_id === seed.projectId) {
    score += 5;
    reasons.push('同じ案件');
  }
  const overlap = seed.blockTypes.filter((t) => (cand.block_types ?? []).includes(t));
  if (overlap.length > 0) {
    score += overlap.length;
    reasons.push(`列構成が近い（${overlap.join('・')}）`);
  }
  if (seed.totalSec > 0 && cand.total_sec > 0) {
    const diffMin = Math.abs(seed.totalSec - cand.total_sec) / 60;
    if (diffMin <= 15) {
      score += 2;
      reasons.push('尺が近い');
    }
  }
  return { score, reasons };
}

export async function findSimilarQsheets(actor: AccessUser, input: FindSimilarInput): Promise<SimilarQsheet[]> {
  const seed = await fetchSeed(input);
  if (!seed) return [];

  let sql = `
    SELECT i.document_id, i.project_id, to_char(i.service_date, 'YYYY-MM-DD') AS service_date,
           i.section_count, i.row_count, i.total_sec, i.block_types, i.section_labels,
           d.title, d.doc_no, p.name AS project_name
    FROM qsheet_doc_index i
    JOIN qsheet_documents d ON d.id = i.document_id AND d.deleted_at IS NULL
    LEFT JOIN projects p ON p.id = i.project_id
    WHERE i.is_reference = TRUE
  `;
  const params: unknown[] = [];
  const exclude = input.excludeDocumentId ?? input.documentId;
  if (exclude) { sql += ' AND i.document_id != ?'; params.push(exclude); }
  if (!isQsheetAdmin(actor)) {
    sql += ` AND (d.created_by = ? OR EXISTS (SELECT 1 FROM qsheet_document_shares s WHERE s.document_id = d.id AND s.user_id = ?))`;
    params.push(actor.id, actor.id);
  }
  sql += ' ORDER BY i.indexed_at DESC LIMIT 200';

  const rows = (await queryAll(sql, params)) as unknown as (IndexRow & { title: string; doc_no: string | null; project_name: string | null })[];

  // 見える範囲は上の SQL（created_by / shares）で既に絞ってあるので、ここでは再判定しない
  const scored = rows
    .map((r) => ({ row: r, ...scoreOf(seed, r) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);

  return scored.map(({ row, score, reasons }) => ({
    id: row.document_id,
    title: row.title,
    docNo: row.doc_no,
    projectName: row.project_name,
    customerName: null, // qsheet_doc_index.customer_id は段8未実装のため常に null（上の食い違いメモ参照）
    serviceDate: row.service_date,
    score,
    reasons,
    sections: (row.section_labels ?? []).map((label) => ({ label, duration: null, rowCount: 0 })),
    blockTypes: row.block_types ?? [],
    totals: { sections: row.section_count, rows: row.row_count, totalSec: row.total_sec },
    isReference: true,
  }));
}
