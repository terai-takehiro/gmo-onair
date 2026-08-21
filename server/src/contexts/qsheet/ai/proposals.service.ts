/**
 * 提案の読み取り・取り込み率の集計（段7 §1・§6-2）。**生成（POST での新規作成）はここに置かない**
 * — この段は「AI が出したものを受け止める器」で、生成コードは1行も書かない。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import type { ProposalRow } from './types';

export interface ListProposalsQuery {
  documentId?: string;
  scheduleId?: string;
  state?: string;
}

const VALID_STATES = ['open', 'applied', 'discarded', 'failed'];

export async function listProposals(q: ListProposalsQuery): Promise<ProposalRow[]> {
  if (!q.documentId && !q.scheduleId) {
    throw new ValidationError('document_id か schedule_id のどちらかを指定してください');
  }
  const conds: string[] = [];
  const params: unknown[] = [];
  if (q.documentId) { conds.push('document_id = ?'); params.push(q.documentId); }
  if (q.scheduleId) { conds.push('schedule_id = ?'); params.push(q.scheduleId); }
  if (q.state && VALID_STATES.includes(q.state)) { conds.push('state = ?'); params.push(q.state); }
  const rows = await queryAll(
    `SELECT * FROM qsheet_ai_proposals WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
    params,
  );
  return rows as unknown as ProposalRow[];
}

export async function getProposal(id: string): Promise<ProposalRow> {
  const row = await queryOne('SELECT * FROM qsheet_ai_proposals WHERE id = ?', [id]);
  if (!row) throw new NotFoundError('提案が見つかりません');
  return row as unknown as ProposalRow;
}

export interface ProposalStat {
  kind: string;
  generated: number;
  applied: number;
  discarded: number;
  expired: number;
}

/**
 * 取り込み率（`applied / generated`）を kind ごとに出す。**生成ベースの数**
 * （`ai_corrections` の分母＝レビューベースとは別の見方。§6-2）。
 */
export async function proposalStats(windowDays: number): Promise<ProposalStat[]> {
  const rows = await queryAll(
    `SELECT kind,
            COUNT(*)                                                          AS generated,
            COUNT(*) FILTER (WHERE state = 'applied')                         AS applied,
            COUNT(*) FILTER (WHERE state = 'discarded'
                               AND COALESCE(discard_reason,'') <> 'expired')  AS discarded,
            COUNT(*) FILTER (WHERE discard_reason = 'expired')                AS expired
       FROM qsheet_ai_proposals
      WHERE created_at >= NOW() - (? || ' days')::interval
      GROUP BY kind
      ORDER BY kind`,
    [String(windowDays)],
  );
  return rows.map((r) => ({
    kind: String(r.kind),
    generated: Number(r.generated) || 0,
    applied: Number(r.applied) || 0,
    discarded: Number(r.discarded) || 0,
    expired: Number(r.expired) || 0,
  }));
}
