import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { normalizeRichContent } from '../../../shared/services/rich-content';
import { recordFinanceDocCorrections, recordInquiryCorrections } from './inbox-ai-feedback.service';

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
  /** AI が組み立てた「読める形」の中身 (migration 160)。形は rich-content.ts が検査する */
  details?: unknown;
  /** メール本文の全文。**切り詰めない** — AI がどこを読み違えたかを後から確かめるため */
  body_text?: string | null;
}

const FD_COLS = `id, doc_type, sender, subject, content, amount, closing_month, payment_due,
  status, received_at, processed_by, processed_at, gls_number, notes, source, message_id,
  requested_by, created_by, created_at, updated_at,
  -- v4 ⑥: 台帳（仕入 / 販管費）へ渡した先。**片側だけだと突き合わせられない**
  linked_kind, linked_id,
  -- 160: AI が組み立てた「読める形」の中身と、メール本文の全文
  details, body_text`;

/**
 * `details` を DB へ入れる形にする。**検査を通ったものだけ**が入る。
 * 中身が1つも残らなければ `null` — 空配列を入れると「AI が何も出せなかった」と
 * 「そもそも構造化していない」の区別が付かなくなる。
 */
function jsonOrNull(v: unknown): string | null {
  const blocks = normalizeRichContent(v);
  return blocks ? JSON.stringify(blocks) : null;
}

function assertIn<T extends string>(val: string, allowed: readonly T[], label: string): void {
  if (!(allowed as readonly string[]).includes(val)) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} は ${allowed.join(' / ')} のいずれかです`);
  }
}

export const financeDocService = {
  async list(filter: { status?: string; doc_type?: string; pendingOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.status) { assertIn(filter.status, FINANCE_DOC_STATUSES, 'status'); conds.push('status = ?'); params.push(filter.status); }
    if (filter.doc_type) { assertIn(filter.doc_type, FINANCE_DOC_TYPES, 'doc_type'); conds.push('doc_type = ?'); params.push(filter.doc_type); }
    // **見積書（quote）は既定では出さない**（ユーザー指摘「実際に台帳に入れるのは
    // 請求書になるので」）。「受け取った書類」画面はこの一覧を doc_type 無指定で呼ぶため、
    // 承認しても「台帳に入れる」にたどり着けない見積書がキューに並び続けていた。
    // `doc_type=quote` を明示すれば見える（MCP の一覧・監査用の抜け道は残す）
    else conds.push(`doc_type <> 'quote'`);
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
    // list() と同じ条件（見積書は数えない）。ここだけ揃え忘れると
    // ホームのバッジと画面の件数が食い違う
    const row = await queryOne(
      `SELECT COUNT(*) AS c FROM finance_docs
        WHERE deleted_at IS NULL AND status NOT IN ('processed','rejected') AND doc_type <> 'quote'`,
    );
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
          received_at, gls_number, notes, source, message_id, requested_by, created_by,
          details, body_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)`,
      [
        id, docType, input.sender ?? null, input.subject ?? null, input.content ?? null,
        input.amount ?? null, input.closing_month ?? null, input.payment_due ?? null, status,
        input.received_at ?? null, input.gls_number ?? null, input.notes ?? null,
        input.source ?? 'email', input.message_id ?? null, input.requested_by ?? null, input.created_by ?? null,
        jsonOrNull(input.details), input.body_text ?? null,
      ],
    );
    return { row: (await this.getById(id))!, action: 'created' };
  },

  async update(id: string, input: FinanceDocInput & { processed_by_user?: string | null }): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '書類が見つかりません');
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
    if (input.details !== undefined) { sets.push('details = ?::jsonb'); params.push(jsonOrNull(input.details)); }
    if (input.body_text !== undefined) set('body_text', input.body_text ?? null);
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
    const after = (await queryOne(`SELECT * FROM finance_docs WHERE id = ?`, [id])) ?? {};
    // **人がどこを直したか**を残す（会社方針・条件2）。失敗しても保存は成功させる
    await recordFinanceDocCorrections(id, existing, after, String(input.created_by ?? 'unknown'));
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    const existing = await queryOne(`SELECT id FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '書類が見つかりません');
    await execute(`UPDATE finance_docs SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },
};

// ── その他問い合わせ ──────────────────────────────
export const INQUIRY_IMPORTANCE = ['high', 'medium', 'low'] as const;

/**
 * 行き先 (migration 171)。**絞り込みはこの列だけを見る。**
 *
 * `handled_at` は「誰がいつ触ったか」の記録として残っていますが、
 * 両方で絞れるようにすると片方だけ動いた行が一覧から消えます。
 */
export const INQUIRY_STATES = ['unsorted', 'stock', 'ticket', 'project', 'dropped'] as const;
export type InquiryState = (typeof INQUIRY_STATES)[number];

/** 出どころ。`manual` は**出どころが分からない既存行**で、新規では入りません */
export const INQUIRY_SOURCES = ['mail', 'slack', 'phone', 'talk', 'manual'] as const;

/**
 * 人が直接動かせる行き先。
 *
 * `ticket` と `project` は**実体（タスク・案件）を作ったときだけ**入ります。
 * ここから入れられるようにすると、タスクが無いのに「チケットにした」と出て、
 * 誰も拾っていない用件が片づいたように見えます。
 */
export const INQUIRY_MOVABLE_STATES = ['unsorted', 'stock', 'dropped'] as const;

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
  /** タグ (migration 171)。渡さなければ**今の値を保つ** */
  tags?: unknown;
  /** AI が組み立てた「読める形」の中身 (migration 160)。形は rich-content.ts が検査する */
  details?: unknown;
  /** メール本文の全文。**切り詰めない** */
  body_text?: string | null;
}

/**
 * AI が取り込んだ行かどうかは **`ai_outputs` に記録があるか**で決める。
 *
 * 以前は `source === 'email'` を印にしていましたが、あれは出どころであって
 * 「AI が入れたか」ではありません（手で足したメールにも印が付いていた）。
 */
const IQ_COLS = `i.id, i.sender, i.subject, i.summary, i.category, i.importance, i.action_needed, i.url,
  i.received_at, i.handled_at, i.handled_by, i.notes, i.source, i.message_id, i.requested_by, i.created_by,
  i.created_at, i.updated_at,
  -- 160: AI が組み立てた「読める形」の中身と、メール本文の全文
  i.details, i.body_text,
  -- 171: 行き先・タグ・チケット（タスク）・案件
  i.state, i.tags, i.task_id, i.project_id,
  t.title AS task_title, t.due_at AS task_due_at, t.is_completed AS task_done,
  p.name  AS project_name, p.stage AS project_stage,
  EXISTS (SELECT 1 FROM ai_outputs o
           WHERE o.target_table = 'misc_inquiries' AND o.target_id = i.id
             AND o.kind = 'inquiry_intake') AS is_ai`;

const IQ_FROM = `FROM misc_inquiries i
  LEFT JOIN project_tasks t ON t.id = i.task_id    AND t.deleted_at IS NULL
  LEFT JOIN projects      p ON p.id = i.project_id AND p.deleted_at IS NULL`;

/** 出どころを揃える。**知らない値は入れない** — CHECK に弾かれて取込ごと 500 になる */
export function normalizeInquirySource(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'email') return 'mail';   // 旧 MCP が送っていた綴り
  return (INQUIRY_SOURCES as readonly string[]).includes(s) ? s : fallback;
}

/**
 * タグを揃える。空白だけ・重複・長すぎるものを落とす。
 * **上限を置く** — AI が本文の単語をそのまま並べたときに一覧が読めなくなるため。
 */
export function normalizeTags(v: unknown): string[] | null {
  if (v === undefined) return null;                       // 渡していない = 今の値を保つ
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,、]/) : [];
  const out: string[] = [];
  for (const raw of arr) {
    const t = String(raw ?? '').trim().slice(0, 24);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

export const inquiryService = {
  async list(filter: { importance?: string; state?: string; tag?: string; unhandledOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.importance) { assertIn(filter.importance, INQUIRY_IMPORTANCE, 'importance'); conds.push('i.importance = ?'); params.push(filter.importance); }
    if (filter.state) { assertIn(filter.state, INQUIRY_STATES, 'state'); conds.push('i.state = ?'); params.push(filter.state); }
    if (filter.tag) { conds.push('i.tags && ARRAY[?]::text[]'); params.push(filter.tag); }
    // 「未対応」= まだ仕分けていないもの。**`handled_at` では絞らない**（正は state）
    if (filter.unhandledOnly) conds.push(`i.state = 'unsorted'`);
    return queryAll(
      `SELECT ${IQ_COLS} ${IQ_FROM} WHERE ${conds.join(' AND ')}
       ORDER BY (i.state = 'unsorted') DESC,
                CASE i.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                i.received_at DESC NULLS LAST, i.created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    return (await queryOne(`SELECT ${IQ_COLS} ${IQ_FROM} WHERE i.id = ? AND i.deleted_at IS NULL`, [id])) ?? undefined;
  },

  /** 未仕分け件数 (アラート用)。**受付の作業列に何件残っているか** */
  async unhandledCount(): Promise<number> {
    const row = await queryOne(`SELECT COUNT(*) AS c FROM misc_inquiries WHERE deleted_at IS NULL AND state = 'unsorted'`);
    return Number(row?.c ?? 0);
  },

  async create(input: InquiryInput): Promise<{ row: Record<string, unknown>; action: 'created' | 'updated' }> {
    const summary = (input.summary ?? '').trim();
    if (!summary) throw new AppError(400, 'VALIDATION_ERROR', '要約 (summary) は必須です');
    const importance = (input.importance ?? 'medium').trim() || 'medium';
    assertIn(importance, INQUIRY_IMPORTANCE, 'importance');
    if (input.message_id) {
      const dup = await queryOne(`SELECT id FROM misc_inquiries WHERE deleted_at IS NULL AND message_id = ?`, [input.message_id]);
      if (dup) return { row: await this.update(String(dup.id), input), action: 'updated' };
    }
    // タグと分類は**同じものの2つの見え方**。片方だけ書くと受信箱の分類だけ古くなる
    const tags = normalizeTags(input.tags) ?? (input.category ? normalizeTags([input.category])! : []);
    const category = tags[0] ?? input.category ?? null;

    const id = uuidv4();
    await execute(
      `INSERT INTO misc_inquiries
         (id, sender, subject, summary, category, importance, action_needed, url, received_at,
          notes, source, message_id, requested_by, created_by, details, body_text, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::text[])`,
      [
        id, input.sender ?? null, input.subject ?? null, summary, category, importance,
        input.action_needed ?? null, input.url ?? null, input.received_at ?? null, input.notes ?? null,
        normalizeInquirySource(input.source, 'manual'), input.message_id ?? null,
        input.requested_by ?? null, input.created_by ?? null,
        jsonOrNull(input.details), input.body_text ?? null, tags,
      ],
    );
    return { row: (await this.getById(id))!, action: 'created' };
  },

  async update(id: string, input: InquiryInput): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (c: string, v: unknown) => { sets.push(`${c} = ?`); params.push(v); };
    if (input.sender !== undefined) set('sender', input.sender ?? null);
    if (input.subject !== undefined) set('subject', input.subject ?? null);
    if (input.summary !== undefined) {
      const s = (input.summary ?? '').trim();
      if (!s) throw new AppError(400, 'VALIDATION_ERROR', '要約 (summary) は必須です');
      set('summary', s);
    }
    // タグを渡してきたら分類も揃える（片方だけ直すと受信箱の分類が古いままになる）
    const nextTags = normalizeTags(input.tags);
    if (nextTags) {
      sets.push('tags = ?::text[]'); params.push(nextTags);
      set('category', nextTags[0] ?? null);
    } else if (input.category !== undefined) {
      set('category', input.category ?? null);
    }
    if (input.importance !== undefined && input.importance) { assertIn(input.importance, INQUIRY_IMPORTANCE, 'importance'); set('importance', input.importance); }
    if (input.source !== undefined && input.source !== null) {
      set('source', normalizeInquirySource(input.source, String(existing.source ?? 'manual')));
    }
    if (input.action_needed !== undefined) set('action_needed', input.action_needed ?? null);
    if (input.url !== undefined) set('url', input.url ?? null);
    if (input.received_at !== undefined) set('received_at', input.received_at ?? null);
    if (input.notes !== undefined) set('notes', input.notes ?? null);
    if (input.details !== undefined) { sets.push('details = ?::jsonb'); params.push(jsonOrNull(input.details)); }
    if (input.body_text !== undefined) set('body_text', input.body_text ?? null);
    if (input.requested_by !== undefined && input.requested_by !== null) set('requested_by', input.requested_by);
    if (!sets.length) return (await this.getById(id))!;
    sets.push('updated_at = NOW()');
    params.push(id);
    await execute(`UPDATE misc_inquiries SET ${sets.join(', ')} WHERE id = ?`, params);
    const after = (await queryOne(`SELECT * FROM misc_inquiries WHERE id = ?`, [id])) ?? {};
    await recordInquiryCorrections(id, existing, after, String(input.created_by ?? 'unknown'));
    return (await this.getById(id))!;
  },

  /**
   * 行き先を動かす（ストックする / 見送りにする / 未仕分けに戻す）。
   *
   * **チケット・案件にはここからは入れません** (`INQUIRY_MOVABLE_STATES`)。
   * 実体を作らずに「チケットにした」と出ると、誰も拾っていない用件が
   * 片づいたように見えます。
   *
   * `handled_at` は記録として併せて打ちます（読むのは `state` だけ）。
   */
  async setState(id: string, state: string, userName?: string | null): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT id, state FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');
    assertIn(state, INQUIRY_MOVABLE_STATES, 'state');

    // チケット・案件から戻すのは許す（間違えて作ることはある）。
    // ただし**作った実体は消しません** — 勝手に消すほうが危険なので、
    // 結びつきだけ外して「タスクは残っている」と画面に出す
    const unlink = existing.state === 'ticket' || existing.state === 'project';
    if (state === 'unsorted') {
      await execute(
        `UPDATE misc_inquiries SET state = 'unsorted', handled_at = NULL, handled_by = NULL,
           ${unlink ? 'task_id = NULL, project_id = NULL,' : ''} updated_at = NOW() WHERE id = ?`, [id]);
    } else {
      await execute(
        `UPDATE misc_inquiries SET state = ?, handled_at = NOW(), handled_by = ?,
           ${unlink ? 'task_id = NULL, project_id = NULL,' : ''} updated_at = NOW() WHERE id = ?`,
        [state, userName ?? null, id]);
    }
    return (await this.getById(id))!;
  },

  /**
   * チケットにする = **案件管理のタスクを1本作る**（モックの文言そのまま）。
   *
   * - `project_id` は入れません。案件に紐づかない仕事なのでここへ来ています
   *   （`project_tasks.project_id` は migration 135 で NULL 可）
   * - `source` / `source_ref` に由来を残すので、タスクから元の情報へ戻れます
   * - **2回押しても増えません。** 既にチケットがあればそれを返します
   *   （押せたか分からず押し直すのは普通に起きる）
   */
  async makeTicket(
    id: string,
    input: { title?: string | null; assigned_to?: string | null; due_at?: string | null; description?: string | null },
    userId: string,
    userName?: string | null,
  ): Promise<{ row: Record<string, unknown>; task_id: string; already: boolean }> {
    const existing = await queryOne(
      `SELECT id, summary, subject, action_needed, task_id FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');

    if (existing.task_id) {
      const alive = await queryOne(`SELECT id FROM project_tasks WHERE id = ? AND deleted_at IS NULL`, [existing.task_id]);
      if (alive) return { row: (await this.getById(id))!, task_id: String(existing.task_id), already: true };
      // タスクが消されていたら作り直せるようにする（結びつきだけ残っている状態）
    }

    const title = (input.title ?? '').trim()
      || String(existing.action_needed ?? '').trim()
      || String(existing.summary ?? '').trim();
    if (!title) throw new AppError(400, 'VALIDATION_ERROR', 'チケットの件名を入れてください');

    const assignee = (input.assigned_to ?? '').trim() || userId;
    const user = await queryOne(`SELECT id FROM users WHERE id = ?`, [assignee]);
    if (!user) throw new AppError(404, 'NOT_FOUND', '担当者のユーザーが見つかりません');

    const taskId = uuidv4();
    await execute(
      `INSERT INTO project_tasks
         (id, project_id, title, description, task_type, assigned_to,
          due_at, importance, urgency, source, source_ref, visibility, sort_order, created_by, updated_by)
       VALUES (?, NULL, ?, ?, 'free', ?, ?, 2, 2, 'inquiry', ?, 'team', 0, ?, ?)`,
      [taskId, title, input.description ?? (existing.summary ? String(existing.summary) : null), assignee,
       input.due_at || null, id, userId, userId],
    );
    await execute(
      `UPDATE misc_inquiries SET state = 'ticket', task_id = ?, handled_at = NOW(), handled_by = ?, updated_at = NOW()
        WHERE id = ?`, [taskId, userName ?? null, id]);
    return { row: (await this.getById(id))!, task_id: taskId, already: false };
  },

  /**
   * 案件の受付へ送った結果を書き留める。**案件はここでは作りません。**
   *
   * 作るのは案件管理の登録モーダル（16項目・顧客の選択・権限の判定を持っている）で、
   * ここは「どの案件になったか」を残すだけです。写しの登録画面をもう1つ作ると、
   * 必須の項目が片方だけ増えて食い違います。
   *
   * **2回送っても2件にならない**ように、既に案件があればそれを返します。
   */
  async linkProject(id: string, projectId: string, userName?: string | null): Promise<{ row: Record<string, unknown>; already: boolean }> {
    const existing = await queryOne(`SELECT id, project_id FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');
    const project = await queryOne(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`, [projectId]);
    if (!project) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません');

    if (existing.project_id && existing.project_id !== projectId) {
      const alive = await queryOne(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`, [existing.project_id]);
      if (alive) return { row: (await this.getById(id))!, already: true };
    }
    await execute(
      `UPDATE misc_inquiries SET state = 'project', project_id = ?, handled_at = NOW(), handled_by = ?, updated_at = NOW()
        WHERE id = ?`, [projectId, userName ?? null, id]);
    return { row: (await this.getById(id))!, already: false };
  },

  /**
   * よく使うタグ（モックの右側の枠）。
   *
   * **画面で数えない。** 一覧は絞り込んだぶんしか持っていないので、
   * 画面側で数えるとタブを切り替えるたびにタグの件数が変わります。
   */
  async tagStats(): Promise<{ tag: string; count: number }[]> {
    const rows = await queryAll(
      `SELECT t AS tag, COUNT(*)::int AS count
         FROM misc_inquiries i, UNNEST(i.tags) AS t
        WHERE i.deleted_at IS NULL
        GROUP BY t ORDER BY count DESC, t ASC LIMIT 20`,
    );
    return rows.map((r) => ({ tag: String(r.tag), count: Number(r.count) }));
  },

  async remove(id: string): Promise<void> {
    const existing = await queryOne(`SELECT id FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');
    await execute(`UPDATE misc_inquiries SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },
};
