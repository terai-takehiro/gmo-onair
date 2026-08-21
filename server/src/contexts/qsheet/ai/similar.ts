/**
 * 過去の類似 Qシートを探す（段8・04-ai.md §2-2・§2-3・§2-7）。**AI を呼ばない。**
 *
 * ベクトル検索は入れない（§2-2）— 拡張未導入・欲しいのは構造の類似・母数が未知。
 * `qsheet_doc_index`（段7で作成済み）に対して SQL は絞り込みだけを行い、
 * **点数付けは Node 側**で行う（重みを直すたびに migration が要らないように）。
 *
 * ⚠️ 守秘（§2-7）: 骨格の見える範囲の既定は「可視のもの」に絞る（`scope: 'visible'`）。
 * `org_outline`（全社の骨格だけ・本文もタイトルも渡さない）は MCP 用の型を残すだけで
 * **この段では呼び出し口を作らない**（05-mcp は段10）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { parseDur } from '../../../shared/schedule/time';

export interface SimilarDocSection { label: string; durationSec: number; rowCount: number }

export interface SimilarDocSummary {
  documentId: string;
  title: string;
  score: number;
  serviceDate: string | null;
  reasons: string[];
  /** 骨格の要約（見本として few-shot に渡す。**本文は含まない**。§2-7） */
  sections: SimilarDocSection[];
}

interface IndexRow {
  document_id: string;
  project_id: string | null;
  customer_id: string | null;
  project_type: string | null;
  broadcast_type: string | null;
  media_platform: string | null;
  location_id: string | null;
  total_sec: number;
  row_count: number;
  block_types: string[];
  section_labels: string[];
  settled_at: string | null;
  service_date: string | null;
  title: string;
}

export interface FindSimilarOptions {
  viewerId: string;
  isAdmin: boolean;
  scope?: 'visible' | 'org_outline';
  projectId?: string | null;
  customerId?: string | null;
  totalSecHint?: number | null;
  excludeDocumentId?: string | null;
  limit?: number;
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a), sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function scoreOf(row: IndexRow, opts: FindSimilarOptions, selfLabels: string[]): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (opts.projectId && row.project_id === opts.projectId) { score += 6; reasons.push('同じ案件の過去回'); }
  if (opts.customerId && row.customer_id === opts.customerId) { score += 3; reasons.push('同じ顧客'); }
  if (opts.totalSecHint && row.total_sec > 0) {
    const diff = Math.abs(row.total_sec - opts.totalSecHint) / opts.totalSecHint;
    if (diff <= 0.2) { score += 3; reasons.push('合計尺が近い'); }
  }
  const j = jaccard(selfLabels, row.section_labels ?? []);
  if (j > 0) { score += Math.round(j * 4); reasons.push('ロール名が近い'); }
  if (row.settled_at) {
    const months = (Date.now() - new Date(row.settled_at).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months > 18) { score -= 2; reasons.push('確定から18か月以上'); }
  }
  return { score, reasons };
}

/**
 * 過去の類似 Qシートの上位3件を返す。`scope:'visible'` が既定
 * （見える範囲＝作成者本人／共有先／`system_admin`。§2-7 の既定は狭いほう）。
 *
 * 0点の行は返さない（「似ていないもの」を見本にすると害・§2-3）。
 */
export async function findSimilarDocs(opts: FindSimilarOptions): Promise<SimilarDocSummary[]> {
  const limit = Math.max(1, Math.min(10, opts.limit ?? 3));
  try {
    const rows = await queryAll(
      `SELECT i.document_id, i.project_id, i.customer_id, i.project_type, i.broadcast_type,
              i.media_platform, i.location_id, i.total_sec, i.row_count, i.block_types,
              i.section_labels, i.settled_at, i.service_date, d.title, d.created_by
         FROM qsheet_doc_index i
         JOIN qsheet_documents d ON d.id = i.document_id AND d.deleted_at IS NULL
         LEFT JOIN qsheet_document_shares s ON s.document_id = i.document_id AND s.user_id = ?
        WHERE i.is_reference = TRUE
          AND (? OR d.created_by = ? OR s.user_id IS NOT NULL)
          AND (? IS NULL OR i.document_id <> ?)
        ORDER BY i.indexed_at DESC
        LIMIT 200`,
      [opts.viewerId, opts.isAdmin, opts.viewerId,
        opts.excludeDocumentId ?? null, opts.excludeDocumentId ?? null],
    ) as unknown as IndexRow[];

    // 自分自身のロール名（Jaccard 用）。projectId から代表1件を拾う程度で足りる
    const selfLabels = opts.projectId
      ? (rows.find((r) => r.project_id === opts.projectId)?.section_labels ?? [])
      : [];

    const scored = rows
      .map((row) => ({ row, ...scoreOf(row, opts, selfLabels) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => (b.score - a.score) || (
        new Date(b.row.service_date ?? 0).getTime() - new Date(a.row.service_date ?? 0).getTime()
      ))
      .slice(0, limit);

    if (scored.length === 0) return [];

    // 上位だけ本文（sections の要約）を data から読む。**本文（scenario の html）は含めない**
    const results: SimilarDocSummary[] = [];
    for (const s of scored) {
      const sections = await fetchOutlineSections(s.row.document_id);
      results.push({
        documentId: s.row.document_id, title: s.row.title ?? '',
        score: s.score, serviceDate: s.row.service_date,
        reasons: s.reasons, sections,
      });
    }
    return results;
  } catch (e) {
    console.warn('[qsheet-ai] findSimilarDocs に失敗しました（続行）:', (e as Error).message);
    return [];
  }
}

/** 骨格の要約（ロール名・尺・行数）だけを読む。本文（`entries[0].html`）は読まない */
async function fetchOutlineSections(documentId: string): Promise<SimilarDocSection[]> {
  try {
    const doc = await queryOne(
      'SELECT data FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL', [documentId],
    );
    const sections = (doc?.data as Record<string, unknown> | undefined)?.sections;
    if (!Array.isArray(sections)) return [];
    return sections
      .filter((s: Record<string, unknown>) => !s?._break && !s?._pageBreak && !s?._vtr)
      .slice(0, 20)
      .map((s: Record<string, unknown>) => ({
        label: String(s.label ?? ''),
        durationSec: parseDur(s.duration as string | number | null | undefined),
        rowCount: Array.isArray(s.rows) ? s.rows.length : 0,
      }));
  } catch (e) {
    console.warn('[qsheet-ai] fetchOutlineSections に失敗しました（続行）:', (e as Error).message);
    return [];
  }
}
