import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { normalizeRichContent } from '../../../shared/services/rich-content';
import { recordFinanceDocCorrections, recordInquiryCorrections } from './inbox-ai-feedback.service';
import { ensureGroup, guessProject, type ExpenseKind } from './finance-doc-chain.service';
import {
  storeAttachment, MAX_ATTACHMENTS_PER_DOC, type IncomingAttachment,
} from '../../../shared/services/mail-attachment-box.service';
import { guessProcessingMonth } from '../../../shared/services/finance-chain';

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

  // ── migration 281: ひとつづり / 当て先 / 添付 ──────────────
  /** 束（見積書→発注書→請求書）。渡さなければ取込時に1つ作る */
  group_id?: string | null;
  /** 束ね直しの鍵（見積番号・取引先＋件名など）。同じ鍵なら同じ束に入る */
  group_key?: string | null;
  /** 束の題名。渡さなければ件名から作る */
  group_title?: string | null;
  /** 取引先名（差出人の会社名） */
  vendor_name?: string | null;
  /** 当て先の案件。**AI は直接渡さず `project_hint` を渡すこと** */
  project_id?: string | null;
  /** 当て先を当てる手がかり（GLS 番号・案件名）。サーバーが解決して確からしさを付ける */
  project_hint?: string | null;
  /** 誰が付けたか。人が直したら `human` */
  project_source?: 'ai' | 'human' | null;
  /** 案件の仕入か販管費か。決めきれなければ渡さない */
  expense_kind?: ExpenseKind | null;
  /** 販管費のとき: 支払サイト（日数） */
  payment_terms_days?: number | null;
  /** 販管費のとき: 処理月（YYYY-MM） */
  processing_month?: string | null;
  /** 書類番号（見積番号・請求番号） */
  doc_no?: string | null;
  /** 見積の改定回数（1 始まり） */
  revision?: number | null;
  /** メールの添付。BOX の「受領書類（メール）」フォルダへ置く */
  attachments?: IncomingAttachment[] | null;
}

/**
 * 受領書類の列。
 *
 * ── AI の印は `source` では判定しない（247）──────────────────
 *
 * 画面は長らく `source === 'email'` を ✨ の条件にしていましたが、
 * あれは**出どころ**であって「誰が入れたか」ではありません
 * （手で足したメールの行にも印が付いていた）。入ってきた情報側は
 * migration 171 で `ai_outputs` から求める形に直してあり、
 * **書類側だけが取り残されていました**。同じ判定に揃えます。
 *
 * `created_by` は利用者 id なので、そのままでは画面に出せません
 * （経緯に「誰が取り込んだか」を出すため、名前を引いてくる）。
 */
const FD_COLS = `d.id, d.doc_type, d.sender, d.subject, d.content, d.amount, d.closing_month, d.payment_due,
  d.status, d.received_at, d.processed_by, d.processed_at, d.gls_number, d.notes, d.source, d.message_id,
  d.requested_by, d.created_by, d.created_at, d.updated_at,
  -- v4 ⑥: 台帳（仕入 / 販管費）へ渡した先。**片側だけだと突き合わせられない**
  d.linked_kind, d.linked_id,
  -- 160: AI が組み立てた「読める形」の中身と、メール本文の全文
  d.details, d.body_text,
  -- 281: ひとつづり（束）と当て先。**片側だけだと「どの案件の何番目の書類か」が読めない**
  d.group_id, d.project_id, d.project_source, d.project_confidence, d.project_reason,
  d.expense_kind, d.expense_kind_source, d.vendor_name,
  d.payment_terms_days, d.processing_month, d.doc_no, d.revision,
  g.title AS group_title, g.group_key, pr.gls_number AS project_gls_number, pr.name AS project_name,
  -- 247: 経緯（誰が取り込んだか）。created_by は利用者 id なのでそのままでは読めない
  cu.name AS created_by_name,
  EXISTS (SELECT 1 FROM ai_outputs o
           WHERE o.target_table = 'finance_docs' AND o.target_id = d.id
             AND o.kind = 'finance_doc_intake') AS is_ai`;

const FD_FROM = `FROM finance_docs d
  LEFT JOIN users cu ON cu.id = d.created_by
  LEFT JOIN finance_doc_groups g ON g.id = d.group_id
  LEFT JOIN projects pr ON pr.id = d.project_id`;

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

/**
 * 添付を読む。**BOX に入らなかったものも返す** — 画面が
 * 「BOX に入っていません（理由）」と言えないと、**入ったつもりで原本がどこにも無い**
 * 状態に誰も気づけない。
 */
async function listAttachments(docId: string): Promise<Record<string, unknown>[]> {
  return queryAll(
    `SELECT id, doc_id, filename, mime_type, size_bytes, box_file_id, box_url,
            stored_at, failure_reason, created_at
       FROM finance_doc_attachments WHERE doc_id = ? ORDER BY created_at ASC`,
    [docId],
  );
}

/**
 * メールの添付を BOX に置いて記録する。
 *
 * **取込そのものは止めません。** BOX が落ちている日に請求書を記録できなく
 * なるのは本末転倒なので、失敗しても行だけ残し、理由を持たせます。
 * 同じ中身の添付は `content_sha256` の一意索引が弾きます（再取込で増えない）。
 */
async function saveAttachments(docId: string, input: FinanceDocInput): Promise<void> {
  const list = (input.attachments ?? []).slice(0, MAX_ATTACHMENTS_PER_DOC);
  if (list.length === 0) return;
  const month = (input.received_at ?? '').slice(0, 7) || new Date().toISOString().slice(0, 7);
  const prefix = [(input.received_at ?? '').replace(/-/g, ''), input.vendor_name ?? input.sender ?? '']
    .filter(Boolean).join('_') || null;

  for (const att of list) {
    const stored = await storeAttachment(att, month, prefix);
    try {
      await execute(
        `INSERT INTO finance_doc_attachments
           (id, doc_id, filename, mime_type, size_bytes, content_sha256,
            box_file_id, box_url, stored_at, failure_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [uuidv4(), docId, stored.filename, stored.mime_type, stored.size_bytes,
         stored.content_sha256, stored.box_file_id, stored.box_url,
         stored.stored_at, stored.failure_reason],
      );
    } catch (err) {
      // **記録に失敗しても取込は成功させる。** ただし黙らない
      console.error(`[finance-doc] failed to record attachment '${stored.filename}':`, (err as Error).message);
    }
  }
}

export const financeDocService = {
  async list(filter: { status?: string; doc_type?: string; pendingOnly?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['d.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.status) { assertIn(filter.status, FINANCE_DOC_STATUSES, 'status'); conds.push('d.status = ?'); params.push(filter.status); }
    if (filter.doc_type) { assertIn(filter.doc_type, FINANCE_DOC_TYPES, 'doc_type'); conds.push('d.doc_type = ?'); params.push(filter.doc_type); }
    /*
      ⚠️ **見積書（quote）を一覧から外すのはやめました**（migration 281・2026-09 のご指示）。

      以前は「実際に台帳へ入るのは請求書・注文書だけ」という理由で既定の一覧から
      外していましたが、実際の取引は **見積書 → 発注書 → 請求書** と段を踏み、
      しかも「見積を取ったが発注しなかった」「見積が3回改定された」が普通に起きます。
      外していると **あの見積がどうなったかを後から引けません**（画面に出る道が無い）。

      いまは束（`finance_doc_groups`）で1つの取引としてまとめ、
      **見積だけの束は「見積書のみ」の段として残ります**。台帳へ渡せないのは
      変わりません（`doc-handoff.service.ts` が境界で止める）。
    */
    if (filter.pendingOnly) conds.push(`d.status NOT IN ('processed','rejected')`);
    /*
      ⚠️ **並びは「支払期日が近い順」が先**（247）。
      以前は状態（受信→確認中→承認…）を第1キーにしていたので、
      **明日が期日の承認済みより、期日が2か月先の受信が上に来ていました**。
      この画面は「払う前に確かめる机」なので、急ぐ順＝期日順にする。
      期日が入っていない行は受信日で代用し、どちらも無いものは最後に置く
      （状態は同じ期日の中での並び順として残す）。
    */
    return queryAll(
      `SELECT ${FD_COLS} ${FD_FROM} WHERE ${conds.join(' AND ')}
       ORDER BY COALESCE(d.payment_due, d.received_at) ASC NULLS LAST,
                CASE d.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'approved' THEN 2 WHEN 'rejected' THEN 3 ELSE 4 END,
                d.created_at DESC`,
      params,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    const row = (await queryOne(`SELECT ${FD_COLS} ${FD_FROM} WHERE d.id = ? AND d.deleted_at IS NULL`, [id])) ?? undefined;
    if (!row) return undefined;
    return { ...row, attachments: await listAttachments(id) };
  },

  /** 添付だけ読む（画面が PDF を開くとき） */
  async attachments(docId: string): Promise<Record<string, unknown>[]> {
    return listAttachments(docId);
  },

  /** 未処理件数 (アラート用): processed / rejected 以外 */
  async pendingCount(): Promise<number> {
    // **list() と同じ条件**。ここだけ揃え忘れると、ホームのバッジと画面の件数が
    // 食い違う（281 で見積書も数えるようにした — 一覧に出るのに数えないと
    // 「0件」と出ている画面に行が並ぶ）
    const row = await queryOne(
      `SELECT COUNT(*) AS c FROM finance_docs
        WHERE deleted_at IS NULL AND status NOT IN ('processed','rejected')`,
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
    /*
      ── 束（ひとつづり）に入れる（migration 281）──────────────

      **1通ずつ並べると「この請求書はどの見積の続きか」が読めません。**
      取込のたびに束を用意し、`group_key` が同じなら**同じ束に入れます**。
      鍵が渡されないときは**そのつど新しい束**を作ります —
      勝手に別の取引とくっつけるより、あとで人が束ね直すほうが安全です。
    */
    const groupId = input.group_id
      ?? (await ensureGroup({
        title: (input.group_title || input.subject || input.sender || '受領書類').slice(0, 200),
        vendor_name: input.vendor_name ?? input.sender ?? null,
        group_key: input.group_key ?? null,
        expense_kind: input.expense_kind ?? null,
        processing_month: input.processing_month ?? guessProcessingMonth(input.received_at ?? null),
        payment_terms_days: input.payment_terms_days ?? null,
        created_by: input.created_by ?? null,
      })).id;

    /*
      ── 当て先は「仮」で置く。決めるのは人（ご指示）──────────

      `project_id` を AI に直接書かせません。手がかり（`project_hint`）を
      サーバーが解決し、**どれくらい確からしいか**を一緒に残します。
      候補が複数あるときは**付けません**（適当に1件付けると、人は
      「合っている」と思って確かめずに登録します）。
    */
    const guess = input.project_id
      ? { project_id: input.project_id, confidence: 'high' as const, reason: '呼び出し側が案件を指定しました' }
      : await guessProject(input.project_hint ?? input.gls_number ?? null, input.vendor_name ?? input.sender ?? null);

    const id = uuidv4();
    await execute(
      `INSERT INTO finance_docs
         (id, doc_type, sender, subject, content, amount, closing_month, payment_due, status,
          received_at, gls_number, notes, source, message_id, requested_by, created_by,
          details, body_text,
          group_id, project_id, project_source, project_confidence, project_reason,
          expense_kind, expense_kind_source, vendor_name, payment_terms_days, processing_month,
          doc_no, revision)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, docType, input.sender ?? null, input.subject ?? null, input.content ?? null,
        input.amount ?? null, input.closing_month ?? null, input.payment_due ?? null, status,
        input.received_at ?? null, input.gls_number ?? null, input.notes ?? null,
        input.source ?? 'email', input.message_id ?? null, input.requested_by ?? null, input.created_by ?? null,
        jsonOrNull(input.details), input.body_text ?? null,
        groupId, guess.project_id, guess.project_id ? (input.project_source ?? 'ai') : null,
        guess.confidence, guess.reason,
        input.expense_kind ?? null, input.expense_kind ? 'ai' : null,
        input.vendor_name ?? null, input.payment_terms_days ?? null,
        input.processing_month ?? guessProcessingMonth(input.received_at ?? null),
        input.doc_no ?? null, input.revision ?? null,
      ],
    );

    await saveAttachments(id, input);
    return { row: (await this.getById(id))!, action: 'created' };
  },

  async update(id: string, input: FinanceDocInput & { processed_by_user?: string | null }): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM finance_docs WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '書類が見つかりません');
    /*
      ⚠️ **仕入・販管費に登録済みの書類の中身は直せない**（migration 281）。

      直せてしまうと、**台帳に載っている金額と書類の金額が食い違い**、
      どちらが正しいのか誰にも分からなくなります（台帳側は直りません）。
      画面はボタンを出しませんが、**守りは境界に置きます** —
      別の画面・MCP・直接叩きからも同じ形で入れるためです
      （client/CLAUDE.md「二重登録・押し直しへの守り」と同じ考え方）。

      **状態を戻す（登録の取り消し）は別の口**（`handoff/undo`）なので、
      ここで止めるのは中身の項目だけです。
    */
    const CONTENT_FIELDS = [
      'doc_type', 'amount', 'payment_due', 'closing_month', 'doc_no', 'revision',
      'sender', 'subject', 'content', 'gls_number', 'project_id', 'expense_kind',
      'vendor_name', 'payment_terms_days', 'processing_month', 'group_id',
    ] as const;
    if (existing.status === 'processed'
      && CONTENT_FIELDS.some((f) => (input as Record<string, unknown>)[f] !== undefined)) {
      throw new AppError(409, 'ALREADY_PROCESSED',
        '仕入・販管費に登録済みの書類は直せません。先に登録を取り消してください');
    }
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
    /*
      ── 人が直せる項目（migration 281）────────────────────────

      **案件の付け替えは `project_source='human'` に変える。** 変えないと、
      人が直した行が「AI が当てた」ままになり、`ai_corrections` の
      無修正採用率が実際より良く見えます（会社方針・条件2 の計測バグ）。
    */
    if (input.project_id !== undefined) {
      if (input.project_id) {
        const okp = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [input.project_id]);
        if (!okp) throw new AppError(400, 'VALIDATION_ERROR', 'その案件が見つかりません');
      }
      set('project_id', input.project_id ?? null);
      set('project_source', 'human');
      set('project_confidence', input.project_id ? 'high' : null);
    }
    if (input.expense_kind !== undefined) {
      if (input.expense_kind && input.expense_kind !== 'purchase' && input.expense_kind !== 'sga') {
        throw new AppError(400, 'VALIDATION_ERROR', '行き先は 仕入 か 販管費 のどちらかです');
      }
      set('expense_kind', input.expense_kind ?? null);
      set('expense_kind_source', 'human');
    }
    if (input.vendor_name !== undefined) set('vendor_name', input.vendor_name ?? null);
    if (input.payment_terms_days !== undefined) set('payment_terms_days', input.payment_terms_days ?? null);
    if (input.processing_month !== undefined) set('processing_month', input.processing_month ?? null);
    if (input.doc_no !== undefined) set('doc_no', input.doc_no ?? null);
    if (input.revision !== undefined) set('revision', input.revision ?? null);
    if (input.group_id !== undefined && input.group_id) set('group_id', input.group_id);
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
  -- 247: ストックを机に戻す日。**これが無いとストックは見送りと同じ**（migration 247）
  i.stock_review_on,
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

/**
 * 「今日さばくもの」の条件（migration 247）。
 *
 * 未仕分け ＋ **見直しの日が来たストック**。ストックの `stock_review_on` が
 * 空（まだ決めていない）ものも含めます — 空を「出さない」と読むと、
 * 見直す日を足す前と同じ行き止まり（ストック＝見送り）に戻ります。
 * **画面側の判定は `shared/src/utils/inboxDesk.ts` の `isStockReviewDue()`**で、
 * 同じ規則をこちらは SQL で書いています（片方だけ直さないこと）。
 */
/**
 * 今日（**日本時間**）。
 *
 * ⚠️ **`CURRENT_DATE` を使わないこと。** DB のタイムゾーンは UTC なので、
 * 日本時間の 00:00〜09:00 はまだ「前日」を返します。見直しの日が来た
 * ストックが**朝いちばんに机へ出ず、9時になってから出る**ことになります
 * （この製品の決めごと: SQL の中では `NOW() AT TIME ZONE 'Asia/Tokyo'`。
 * `server/src/shared/utils/jst.ts` の冒頭）。
 */
const TODAY_JST = `(NOW() AT TIME ZONE 'Asia/Tokyo')::date`;

/**
 * 「今日さばくもの」の条件。**別名は `i` = `misc_inquiries` 固定**。
 *
 * ⚠️ **受信箱（`dashboard.routes.ts`）もこれを読むこと。** あちらは長らく
 * `state = 'unsorted'` だけで数えていて、この画面・ホームのタイル
 * （`GET /dailyops/alerts`）と**違う件数**を出していた。ストックに見直しの日が
 * 付いた（migration 247）いま、写すと必ずまた割れる。
 */
export const DESK_COND = `(i.state = 'unsorted'
  OR (i.state = 'stock' AND (i.stock_review_on IS NULL OR i.stock_review_on <= ${TODAY_JST})))`;

/** 見直しの日が来たストックだけ（見出しの内訳に出す数） */
const STOCK_DUE_COND = `(i.state = 'stock' AND (i.stock_review_on IS NULL OR i.stock_review_on <= ${TODAY_JST}))`;

/** 一覧の既定の上限。**溜まるほど遅くなる**ので必ず切る（件数は別に COUNT で数える） */
export const INQUIRY_LIST_LIMIT_DEFAULT = 50;
export const INQUIRY_LIST_LIMIT_MAX = 200;

/**
 * 見直す日を揃える（migration 247）。`YYYY-MM-DD` 以外は**入れない**。
 *
 * **400 で弾かない** — ストックすること自体は日付の書き方で止めません
 * （落とすと「保存できないので見送りにする」が起きる）。読めない値は
 * 「決めていない」として NULL に落ち、その行は翌日から机に出ます。
 */
export function normalizeReviewDate(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export const inquiryService = {
  async list(filter: {
    importance?: string; state?: string; states?: string[]; tag?: string;
    unhandledOnly?: boolean; deskOnly?: boolean; limit?: number; offset?: number;
  } = {}): Promise<Record<string, unknown>[]> {
    const conds = ['i.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.importance) { assertIn(filter.importance, INQUIRY_IMPORTANCE, 'importance'); conds.push('i.importance = ?'); params.push(filter.importance); }
    if (filter.state) { assertIn(filter.state, INQUIRY_STATES, 'state'); conds.push('i.state = ?'); params.push(filter.state); }
    // 「仕分け済み」タブは チケット / 案件にした / 見送り をまとめて出す
    // （受領証のタブを3つ並べても、片づいたものの棚が3つに割れるだけ）
    if (filter.states?.length) {
      for (const s of filter.states) assertIn(s, INQUIRY_STATES, 'state');
      conds.push(`i.state IN (${filter.states.map(() => '?').join(', ')})`);
      params.push(...filter.states);
    }
    if (filter.tag) { conds.push('i.tags && ARRAY[?]::text[]'); params.push(filter.tag); }
    // 「未対応」= まだ仕分けていないもの。**`handled_at` では絞らない**（正は state）
    if (filter.unhandledOnly) conds.push(`i.state = 'unsorted'`);
    // 「今日さばくもの」= 未仕分け ＋ 見直しの日が来たストック
    if (filter.deskOnly) conds.push(DESK_COND);

    const limit = Math.min(Math.max(Number(filter.limit) || INQUIRY_LIST_LIMIT_DEFAULT, 1), INQUIRY_LIST_LIMIT_MAX);
    const offset = Math.max(Number(filter.offset) || 0, 0);
    /*
      ⚠️ **上限を必ず付ける**（247）。画面は長らく「全 state・全件・ページングなし」で
      引いてから画面側で絞っていたので、溜まるほど遅くなり、
      しかも**タブの件数を出すためだけに全件を運んで**いました。
      件数は `counts()` が COUNT で数えます（数えていない総数を作らない）。
    */
    return queryAll(
      `SELECT ${IQ_COLS} ${IQ_FROM} WHERE ${conds.join(' AND ')}
       ORDER BY (i.state = 'unsorted') DESC,
                CASE i.importance WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
                i.received_at DESC NULLS LAST, i.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
  },

  /**
   * タブに出す件数。**一覧とは別に COUNT で数える**（migration 247）。
   *
   * 一覧に上限を付けた以上、画面で `rows.length` を数えると
   * 「51件あるのに 50件」と嘘になります（`shared/tests/countHonesty.test.ts` の形）。
   */
  async counts(): Promise<{ states: Record<string, number>; sources: { source: string; total: number; ticket: number }[] }> {
    const row = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE i.state = 'unsorted')                       AS unsorted,
         COUNT(*) FILTER (WHERE i.state = 'stock')                          AS stock,
         COUNT(*) FILTER (WHERE ${STOCK_DUE_COND})                          AS stock_due,
         COUNT(*) FILTER (WHERE i.state IN ('ticket','project','dropped'))  AS sorted,
         COUNT(*) FILTER (WHERE i.state = 'ticket')                         AS ticket,
         COUNT(*) FILTER (WHERE i.state = 'project')                        AS project,
         COUNT(*) FILTER (WHERE i.state = 'dropped')                        AS dropped,
         COUNT(*) FILTER (WHERE ${DESK_COND})                               AS desk
       FROM misc_inquiries i WHERE i.deleted_at IS NULL`,
    );
    const n = (k: string) => Number(row?.[k] ?? 0);
    /*
      出どころ別も**サーバーが数える**（247）。画面は一覧を上限つきで引くように
      なったので、運んだ行から数えると「メールだけ・他は0」という
      **その画面ぶんの内訳**を全体の内訳として出してしまう。
      **0 件の出どころは返さない** — 本番のメール取込がまだ `source` を
      渡していないため（docs/mcp-server.md）、Slack・電話・口頭が必ず 0 で並び、
      画面の右半分が「0 の枠」で埋まっていた。
    */
    const sources = await queryAll(
      `SELECT i.source AS source, COUNT(*)::int AS total,
              (COUNT(*) FILTER (WHERE i.state = 'ticket'))::int AS ticket
         FROM misc_inquiries i WHERE i.deleted_at IS NULL
        GROUP BY i.source ORDER BY total DESC, source ASC`,
    );
    return {
      states: {
        unsorted: n('unsorted'), stock: n('stock'), stock_due: n('stock_due'),
        sorted: n('sorted'), ticket: n('ticket'), project: n('project'), dropped: n('dropped'),
        desk: n('desk'),
      },
      sources: sources.map((s) => ({ source: String(s.source), total: Number(s.total), ticket: Number(s.ticket) })),
    };
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    return (await queryOne(`SELECT ${IQ_COLS} ${IQ_FROM} WHERE i.id = ? AND i.deleted_at IS NULL`, [id])) ?? undefined;
  },

  /**
   * 「今日さばくもの」の件数 (アラート用)。**机に何件残っているか**
   *
   * 未仕分けだけでなく、**見直しの日が来たストックも数えます**（migration 247）。
   * ここを未仕分けだけにすると、ホームのタイルとバッジには出ないまま
   * 画面の中にだけ「見直し時期」が溜まり、**開いた人しか気づけません**。
   */
  async unhandledCount(): Promise<number> {
    const row = await queryOne(
      `SELECT COUNT(*) AS c FROM misc_inquiries i WHERE i.deleted_at IS NULL AND ${DESK_COND}`);
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
   *
   * ── ストックには**見直す日**が付く（migration 247）───────────
   *
   * `stock_review_on` を渡すとその日に机へ戻ります。渡さなくても保存は
   * 通しますが、その行は「見直す日が決まっていない」ものとして
   * **翌日から机に出ます**（`DESK_COND`）。ストックが見送りと同じに
   * ならないようにするための決めごとです。
   * ストック以外へ動かしたときは日付を消します（チケットにしたものが
   * 1か月後にまた机へ出ると、片づいた仕事がやり直しになる）。
   */
  async setState(
    id: string, state: string, userName?: string | null,
    opts: { stockReviewOn?: string | null } = {},
  ): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT id, state FROM misc_inquiries WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '問い合わせが見つかりません');
    assertIn(state, INQUIRY_MOVABLE_STATES, 'state');

    /*
      ⚠️ **「渡していない」と「決めないと渡した」を分ける**（247）。

      ・**渡していない**（`undefined`）→ 既定の1か月後を入れる。
        この口は「入ってきた情報」の画面だけでなく**案件作成の
        「ネタのまま残す」**（`client/src/contexts/sales/.../useCreateProject.ts`）
        も叩きます。見直す日を知らない呼び手に空を入れると、
        そちらから残したネタが**翌日また机に出て**きます
      ・**`null` を渡した**（画面の「決めない」）→ 空のまま。
        決めなかったものは翌日から机に出ます（そう画面に書いてある）
    */
    const useDefaultReview = state === 'stock' && opts.stockReviewOn === undefined;
    const reviewOn = state === 'stock' ? normalizeReviewDate(opts.stockReviewOn) : null;
    const reviewSql = useDefaultReview
      ? `(${TODAY_JST} + INTERVAL '1 month')::date`
      : '?::date';

    // チケット・案件から戻すのは許す（間違えて作ることはある）。
    // ただし**作った実体は消しません** — 勝手に消すほうが危険なので、
    // 結びつきだけ外して「タスクは残っている」と画面に出す
    const unlink = existing.state === 'ticket' || existing.state === 'project';
    if (state === 'unsorted') {
      await execute(
        `UPDATE misc_inquiries SET state = 'unsorted', handled_at = NULL, handled_by = NULL,
           stock_review_on = NULL,
           ${unlink ? 'task_id = NULL, project_id = NULL,' : ''} updated_at = NOW() WHERE id = ?`, [id]);
    } else {
      await execute(
        `UPDATE misc_inquiries SET state = ?, handled_at = NOW(), handled_by = ?,
           stock_review_on = ${reviewSql},
           ${unlink ? 'task_id = NULL, project_id = NULL,' : ''} updated_at = NOW() WHERE id = ?`,
        useDefaultReview ? [state, userName ?? null, id] : [state, userName ?? null, reviewOn, id]);
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
      // 247: チケットにしたら見直しの日は消す（片づいた仕事が1か月後にまた机へ出ない）
      `UPDATE misc_inquiries SET state = 'ticket', task_id = ?, handled_at = NOW(), handled_by = ?,
              stock_review_on = NULL, updated_at = NOW()
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
      // 247: 案件にしたら見直しの日は消す（チケットと同じ理由）
      `UPDATE misc_inquiries SET state = 'project', project_id = ?, handled_at = NOW(), handled_by = ?,
              stock_review_on = NULL, updated_at = NOW()
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
