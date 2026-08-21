/**
 * 提案の読み取り・取り込み率の集計・**生成（段8）の保存**。
 * 段7では「AI が出したものを受け止める器」だけを持っていたが、
 * 段8から `createProposal` を追加し、生成サービス（`*-ai.service.ts`）が呼ぶ。
 */
import { v4 as uuid } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../services/httpErrors';
import { AI_MAX_GENERATIONS_PER_HOUR, AI_MAX_OPEN_PROPOSALS, AI_PROPOSAL_EXPIRE_DAYS } from './kinds';
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

/**
 * 生成回数の上限（04-ai.md §6-5e）。乱打すると費用と F5（放置提案が分母から消える）の
 * 分母汚染が同時に起きる。**`qsheet_ai_proposals` を数えるだけ**（新テーブル不要）。
 */
export async function assertGenerationAllowed(target: { documentId?: string | null; scheduleId?: string | null }, userId: string): Promise<void> {
  const openCountRow = await queryOne(
    `SELECT COUNT(*)::int AS n FROM qsheet_ai_proposals
      WHERE state = 'open' AND ((document_id = ? AND ? IS NOT NULL) OR (schedule_id = ? AND ? IS NOT NULL))`,
    [target.documentId ?? null, target.documentId ?? null, target.scheduleId ?? null, target.scheduleId ?? null],
  );
  if ((Number(openCountRow?.n) || 0) >= AI_MAX_OPEN_PROPOSALS) {
    throw new ValidationError(`未処理の提案が${AI_MAX_OPEN_PROPOSALS}件たまっています。先に取り込むか捨ててください`);
  }
  const hourlyRow = await queryOne(
    `SELECT COUNT(*)::int AS n FROM qsheet_ai_proposals
      WHERE created_by = ? AND created_at >= NOW() - INTERVAL '1 hour'`,
    [userId],
  );
  if ((Number(hourlyRow?.n) || 0) >= AI_MAX_GENERATIONS_PER_HOUR) {
    throw new ValidationError('直近1時間の生成回数が上限に達しました。しばらくしてからお試しください');
  }
}

export interface CreateProposalInput {
  kind: string;
  scheduleId?: string | null;
  documentId?: string | null;
  projectId?: string | null;
  proposal: unknown;
  context: Record<string, unknown>;
  aiOutputId: string | null;
  model: string | null;
  promptVersion: string | null;
  createdBy: string;
  /** 生成に失敗したときも記録する（04-ai.md §8-1・§8-3） */
  state?: 'open' | 'failed';
  errorMessage?: string | null;
}

/** 生成した提案を保存する（段8）。**`data` には一切触らない** — 提案テーブルへ置くだけ */
export async function createProposal(input: CreateProposalInput): Promise<ProposalRow> {
  const id = uuid();
  await execute(
    `INSERT INTO qsheet_ai_proposals
       (id, kind, schedule_id, document_id, project_id, proposal, context,
        ai_output_id, model, prompt_version, state, error_message,
        expires_at, source, created_by)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?,
             NOW() + (? || ' days')::interval, 'server', ?)`,
    [
      id, input.kind, input.scheduleId ?? null, input.documentId ?? null, input.projectId ?? null,
      JSON.stringify(input.proposal ?? {}), JSON.stringify(input.context ?? {}),
      input.aiOutputId, input.model, input.promptVersion, input.state ?? 'open',
      input.errorMessage ?? null, String(AI_PROPOSAL_EXPIRE_DAYS), input.createdBy,
    ],
  );
  return getProposal(id);
}
