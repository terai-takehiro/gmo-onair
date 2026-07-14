import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// 日常業務アプリ (dailyops) — 受信箱型トラッキングの service 層。
// 見積/請求書 (finance_docs) と その他問い合わせ (misc_inquiries)。
// API (finance-docs.routes / inquiries.routes) と MCP (inbox.tools) から使う。

// ── 見積/請求書/注文書 ──────────────────────────────
export const FINANCE_DOC_TYPES = ['quote', 'invoice', 'order'] as const;
export const FINANCE_DOC_STATUSES = ['new', 'reviewing', 'approved', 'rejected', 'processed'] as const;
export type FinanceDocType = (typeof FINANCE_DOC_TYPES)[number];
export type FinanceDocStatus = (typeof FINANCE_DOC_STATUSES)[number];

export interface FinanceDocInput {
  doc_type?: string | null;
  sender?: string | null;
  subject?: string | null;
  content?: string | null;
  amount?: number | null;
  closing_month?: string | null;
  payment_due?: string | null;
  status?: string | null;
  received_at?: string | null;
  processed_by?: string | null;
  gls_number?: string | null;
  notes?: string | null;
  source?: string | null;
  message_id?: string | null;
  requested_by?: string | null;
  created_by?: string | null;
}

const FD_COLS = `id, doc_type, sender, subject, content, amount, closing_month, payment_due,
  status, received_at, processed_by, processed_at, gls_number, notes, source, message_id,
  requested_by, created_by, created_at, updated_at`;

function assertIn<T extends string>(val: string, allowed: readonly T[], label: string): void {
  if (!(allowed as readonly string[]).includes(val)) {
    throw new AppError(400, `${label} は ${allowed.join(' / ')} のいずれかです`, 'VALIDATION_ERROR');
  }
}

export const financeDocService = {
  async list(filter: { status?: string; doc_type?: string; pendingOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.status) { assertIn(filter.status, FINANCE_DOC_STATUSES, 'status'); conds.push('status = ?'); params.push(filter.status); }
    if (filter.doc_type) { assertIn(filter.doc_type, FINANCE_DOC_TYPES, 'doc_type'); conds.push('doc_type = ?'); params.push(filter.doc_type); }
    if (filter.pendingOnly) conds.push(`status NOT IN ('processed','rejected')`);
    return queryAll(
      `SELECT ${FD_COLS} FROM finance_docs WHERE ${conds.join(' AND ')}
       ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'approved' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
                COALESCE(payment_due, received_at) ASC NULLS LAST, created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    return (await queryOne(`SELECT ${FD_COLS} FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [id])) ?? undefined;
  },

  /** 未処理件数 (アラート用): processed / rejected 以外 */
  async pendingCount(): Promise<number> {
    const row = await queryOne(`SELECT COUNT(*) AS c FROM finance_docs WHERE deleted_at IS NULL AND status NOT IN ('processed','rejected')`);
    return Number(row?.c ?? 0);
  },

  async create(input: FinanceDocInput): Promise<{ row: Record<string, unknown>; action: 'created' | 'updated' }> {
    const docType = (input.doc_type ?? 'invoice').trim() || 'invoice';
    assertIn(docType, FINANCE_DOC_TYPES, 'doc_type');
    const status = (input.status ?? 'new').trim() || 'new';
    assertIn(status, FINANCE_DOC_STATUSES, 'status');

    // Message-ID による重複取込ガード
    if (input.message_id) {
      const dup = await queryOne(`SELECT id FROM finance_docs WHERE deleted_at IS NULL AND message_id = ?`, [input.message_id]);
      if (dup) return { row: await this.update(String(dup.id), input), action: 'updated' };
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO finance_docs
         (id, doc_type, sender, subject, content, amount, closing_month, payment_due, status,
          received_at, gls_number, notes, source, message_id, requested_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, docType, input.sender ?? null, input.subject ?? null, input.content ?? null,
        input.amount ?? null, input.closing_month ?? null, input.payment_due ?? null, status,
        input.received_at ?? null, input.gls_number ?? null, input.notes ?? null,
        input.source ?? 'email', input.message_id ?? null, input.requested_by ?? null, input.created_by ?? null,
      ],
    );
    return { row: (await this.getById(id))!, action: 'created' };
  },

  async update(id: string, input: FinanceDocInput & { processed_by_user?: string | null }): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '書類が見つかりません', 'NOT_FOUND');
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (c: string, v: unknown) => { sets.push(`${c} = ?`); params.push(v); };
    if (input.doc_type !== undefined && input.doc_type) { assertIn(input.doc_type, FINANCE_DOC_TYPES, 'doc_type'); set('doc_type', input.doc_type); }
    if (input.sender !== undefined) set('sender', input.sender ?? null);
    if (input.subject !== undefined) set('subject', input.subject ?? null);
    if (input.content !== undefined) set('content', input.content ?? null);
    if (input.amount !== undefined) set('amount', input.amount ?? null);
    if (input.closing_month !== undefined) set('closing_month', input.closing_month ?? null);
    if (input.payment_due !== undefined) set('payment_due', input.payment_due ?? null);
    if (input.received_at !== undefined) set('received_at', input.received_at ?? null);
    if (input.gls_number !== undefined) set('gls_number', input.gls_number ?? null);
    if (input.notes !== undefined) set('notes', input.notes ?? null);
    if (input.status !== undefined && input.status) {
      assertIn(input.status, FINANCE_DOC_STATUSES, 'status');
      set('status', input.status);
      // 処理完了に遷移したら請求処理者と日時を打刻。他状態に戻したら解除。
      if (input.status === 'processed') {
        set('processed_by', input.processed_by ?? input.processed_by_user ?? existing.processed_by ?? null);
        sets.push('processed_at = COALESCE(processed_at, NOW())');
      } else {
        set('processed_by', null);
        set('processed_at', null);
      }
    } else if (input.processed_by !== undefined) {
      set('processed_by', input.processed_by ?? null);
    }
    if (input.requested_by !== undefined && input.requested_by !== null) set('requested_by', input.requested_by);
    if (!sets.length) return (await this.getById(id))!;
    sets.push('updated_at = NOW()');
    params.push(id);
    await execute(`UPDATE finance_docs SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    const existing = await queryOne(`SELECT id FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '書類が見つかりません', 'NOT_FOUND');
    await execute(`UPDATE finance_docs SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },
};

// ── その他問い合わせ ──────────────────────────────
export const INQUIRY_IMPORTANCE = ['high', 'medium', 'low'] as const;

export interface InquiryInput {
  sender?: string | null;
  subject?: string | null;
  summary?: string | null;
  category?: string | null;
  importance?: string | null;
  action_needed?: string | null;
  url?: string | null;
  received_at?: string | null;
  notes?: string | null;
  source?: string | null;
  message_id?: string | null;
  requested_by?: string | null;
  created_by?: string | null;
}

const IQ_COLS = `id, sender, subject, summary, category, importance, action_needed, url,
  received_at, handled_at, handled_by, notes, source, message_id, requested_by, created_by,
  created_at, updated_at`;

export const inquiryService = {
  async list(filter: { importance?: string; unhandledOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.importance) { assertIn(filter.importance, INQUIRY_IMPORTANCE, 'importance'); conds.push('importance = ?'); params.push(filter.importance); }
    if (filter.unhandledOnly) conds.push('handled_at IS NULL');
    return queryAll(
      `SELECT ${IQ_COLS} FROM misc_inquiries WHERE ${conds.join(' AND ')}
       ORDER BY (handled_at IS NULL) DESC,
                CASE importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                received_at DESC NULLS LAST, created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    return (await queryOne(`SELECT ${IQ_COLS} FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id])) ?? undefined;
  },

  /** 未対応件数 (アラート用) */
  async unhandledCount(): Promise<number> {
    const row = await queryOne(`SELECT COUNT(*) AS c FROM misc_inquiries WHERE deleted_at IS NULL AND handled_at IS NULL`);
    return Number(row?.c ?? 0);
  },

  async create(input: InquiryInput): Promise<{ row: Record<string, unknown>; action: 'created' | 'updated' }> {
    const summary = (input.summary ?? '').trim();
    if (!summary) throw new AppError(400, '要約 (summary) は必須です', 'VALIDATION_ERROR');
    const importance = (input.importance ?? 'medium').trim() || 'medium';
    assertIn(importance, INQUIRY_IMPORTANCE, 'importance');
    if (input.message_id) {
      const dup = await queryOne(`SELECT id FROM misc_inquiries WHERE deleted_at IS NULL AND message_id = ?`, [input.message_id]);
      if (dup) return { row: await this.update(String(dup.id), input), action: 'updated' };
    }
    const id = uuidv4();
    await execute(
      `INSERT INTO misc_inquiries
         (id, sender, subject, summary, category, importance, action_needed, url, received_at,
          notes, source, message_id, requested_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, input.sender ?? null, input.subject ?? null, summary, input.category ?? null, importance,
        input.action_needed ?? null, input.url ?? null, input.received_at ?? null, input.notes ?? null,
        input.source ?? 'email', input.message_id ?? null, input.requested_by ?? null, input.created_by ?? null,
      ],
    );
    return { row: (await this.getById(id))!, action: 'created' };
  },

  async update(id: string, input: InquiryInput): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '問い合わせが見つかりません', 'NOT_FOUND');
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (c: string, v: unknown) => { sets.push(`${c} = ?`); params.push(v); };
    if (input.sender !== undefined) set('sender', input.sender ?? null);
    if (input.subject !== undefined) set('subject', input.subject ?? null);
    if (input.summary !== undefined) {
      const s = (input.summary ?? '').trim();
      if (!s) throw new AppError(400, '要約 (summary) は必須です', 'VALIDATION_ERROR');
      set('summary', s);
    }
    if (input.category !== undefined) set('category', input.category ?? null);
    if (input.importance !== undefined && input.importance) { assertIn(input.importance, INQUIRY_IMPORTANCE, 'importance'); set('importance', input.importance); }
    if (input.action_needed !== undefined) set('action_needed', input.action_needed ?? null);
    if (input.url !== undefined) set('url', input.url ?? null);
    if (input.received_at !== undefined) set('received_at', input.received_at ?? null);
    if (input.notes !== undefined) set('notes', input.notes ?? null);
    if (input.requested_by !== undefined && input.requested_by !== null) set('requested_by', input.requested_by);
    if (!sets.length) return (await this.getById(id))!;
    sets.push('updated_at = NOW()');
    params.push(id);
    await execute(`UPDATE misc_inquiries SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await this.getById(id))!;
  },

  async setHandled(id: string, handled: boolean, userName?: string | null): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT id FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '問い合わせが見つかりません', 'NOT_FOUND');
    if (handled) {
      await execute(`UPDATE misc_inquiries SET handled_at = NOW(), handled_by = ?, updated_at = NOW() WHERE id = ?`, [userName ?? null, id]);
    } else {
      await execute(`UPDATE misc_inquiries SET handled_at = NULL, handled_by = NULL, updated_at = NOW() WHERE id = ?`, [id]);
    }
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    const existing = await queryOne(`SELECT id FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '問い合わせが見つかりません', 'NOT_FOUND');
    await execute(`UPDATE misc_inquiries SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },
};
