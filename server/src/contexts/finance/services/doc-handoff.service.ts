/**
 * 受け取った書類 → 台帳（仕入 / 販管費）への受け渡し (v4 ⑥)
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * `finance_docs`（届いた 請求書/見積書/注文書）は「処理完了」にできましたが、
 * **それが実際にどの仕入・販管費になったのかを持っていませんでした**。
 * そのため同じ請求書を2回入力し（届いた記録 ＋ 台帳の記録）、突き合わせは
 * 記憶頼みでした。ここで1本に繋ぎます。
 *
 *   届いた書類（金額・締月・支払期日・GLS番号）
 *     → 台帳の行を作る（値を引き継ぐ）
 *     → 書類に「どの行になったか」を記録して処理完了にする
 *
 * ── 決めたこと ──────────────────────────────────────────────
 *
 * ・**承認済みだけ渡せる。** 確認前・却下のものを台帳に入れられると、
 *   承認のステップが意味を持たなくなる（承認の担当が未定なので、
 *   いまある「確認中 → 承認」をそのまま関門として使う）
 * ・**二度渡せない。** 渡し済みの書類をもう一度渡すと台帳に二重に載る。
 *   すでに `linked_id` があるものは弾く
 * ・**金額はそのまま持っていかない。** 書類の金額は**税込**で入っている
 *   （`record_finance_doc` の説明が「金額 (税込・円)」）。台帳は税抜なので、
 *   **画面で確かめた金額を受け取る**。ここで勝手に割り戻さない
 *   （税区分が書類に無いので、割り戻すと必ずどこかでずれる）
 */
import { v4 as uuidv4 } from 'uuid';
import { queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { generateSgaBillingKey } from '../../../shared/services/billing-key.service';

export type HandoffKind = 'purchase' | 'sga';

export interface HandoffInput {
  kind: HandoffKind;
  /** 税抜の金額。**画面で確かめた値**（書類の金額は税込なので使わない） */
  amount: number;
  tax_category?: string;
  /** 計上月の初日 (YYYY-MM-DD) */
  recognition_date: string;
  payment_due_date?: string | null;
  description?: string | null;
  /** 仕入のときだけ。どちらも必須 */
  project_id?: string | null;
  vendor_id?: string | null;
  /** 販管費のときだけ */
  vendor_name?: string | null;
  expense_type?: string | null;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export interface HandoffResult {
  kind: HandoffKind;
  id: string;
}

/**
 * 書類を台帳へ渡す。**書類の更新と台帳の作成を1つのトランザクションで行う** —
 * 分けると、台帳に入ったのに書類が「未処理」のまま残り、もう一度渡される。
 */
export async function handoffDoc(
  docId: string,
  input: HandoffInput,
  userId: string,
): Promise<HandoffResult> {
  const doc = await queryOne(
    `SELECT id, status, linked_kind, linked_id, sender, subject, doc_type
       FROM finance_docs WHERE id = ? AND deleted_at IS NULL`,
    [docId],
  ) as Record<string, unknown> | null;
  if (!doc) throw new AppError(404, 'NOT_FOUND', '書類が見つかりません');

  // ここでの確認は**早く断るため**だけのもの。**正は取引の中の確認**です（下記）
  if (doc.linked_id) {
    throw new AppError(409, 'ALREADY_LINKED',
      'この書類はすでに台帳へ渡しています。取り消してから渡し直してください');
  }
  // **承認済みだけ。** 確認前・却下を入れられると承認のステップが意味を持たない
  if (doc.status !== 'approved') {
    throw new AppError(400, 'NOT_APPROVED',
      '承認済みの書類だけ台帳へ渡せます（確認中のものは先に承認してください）');
  }

  if (!YMD.test(input.recognition_date)) {
    throw new AppError(400, 'VALIDATION_ERROR', '計上月は YYYY-MM-DD で指定してください');
  }
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new AppError(400, 'VALIDATION_ERROR', '金額を正しく入力してください');
  }
  const tax = input.tax_category || 'tax10';

  let created: HandoffResult;

  await withTransaction(async (tx) => {
    /*
     * ⚠️ **確かめるのは取引の中で、行を押さえてから**（レビューでの指摘 #56）。
     *
     * 上の確認は取引の外なので、**2人が同時に押すと両方が通り**、
     * 台帳に**同じ請求書の行が2つ**できていました（`linked_id` は後から書いた
     * ほうだけが残るので、**もう1行はどこからも参照されないまま原価に載り続けます**）。
     * 議事録の持ち帰り（v4.0.10）・見積の売上変換とまったく同じ形です。
     */
    const locked = await tx.queryOne(
      'SELECT linked_id, status FROM finance_docs WHERE id = ? FOR UPDATE', [docId],
    ) as { linked_id: string | null; status: string } | undefined;
    if (locked?.linked_id) {
      throw new AppError(409, 'ALREADY_LINKED',
        'この書類はすでに台帳へ渡しています。取り消してから渡し直してください');
    }
    if (locked?.status !== 'approved') {
      throw new AppError(400, 'NOT_APPROVED',
        '承認済みの書類だけ台帳へ渡せます（確認中のものは先に承認してください）');
    }

    if (input.kind === 'purchase') {
      if (!input.project_id || !input.vendor_id) {
        throw new AppError(400, 'VALIDATION_ERROR', '仕入にするには案件と仕入先が必要です');
      }
      const id = uuidv4();
      await tx.execute(
        `INSERT INTO purchases
           (id, project_id, vendor_id, assigned_to, tax_category, invoice_qualified, amount,
            description, recognition_date, payment_due_date, notes, is_provisional, created_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, false, ?)`,
        [id, input.project_id, input.vendor_id, userId, tax, input.amount,
         input.description || null, input.recognition_date, input.payment_due_date || null,
         // **どの書類から来たかを台帳側にも残す。** 片側だけだと、
         // 台帳を見ている人が「これは何の請求か」を辿れない
         `受け取った書類から: ${String(doc.sender ?? '')} ${String(doc.subject ?? '')}`.trim(),
         userId],
      );
      created = { kind: 'purchase', id };
    } else {
      const id = uuidv4();
      await tx.execute(
        `INSERT INTO sga_expenses
           (id, billing_key, vendor_name, description, notes, recognition_date, payment_due_date,
            tax_category, invoice_qualified, amount, expense_type, source, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'staff', ?)`,
        [id, generateSgaBillingKey(input.recognition_date, tax),
         input.vendor_name || String(doc.sender ?? '') || null,
         input.description || null,
         `受け取った書類から: ${String(doc.sender ?? '')} ${String(doc.subject ?? '')}`.trim(),
         input.recognition_date, input.payment_due_date || null, tax, input.amount,
         input.expense_type || 'spot', userId],
      );
      created = { kind: 'sga', id };
    }

    await tx.execute(
      `UPDATE finance_docs
          SET status = 'processed', linked_kind = ?, linked_id = ?,
              processed_by = ?, processed_at = NOW(), updated_at = NOW()
        WHERE id = ?`,
      [created.kind, created.id, userId, docId],
    );
  });

  return created!;
}

/**
 * 渡したのを取り消す。**台帳の行は消しません** —
 * 経理がそのあと直しているかもしれないので、勝手に消すほうが危険です。
 * 書類側の結びつきだけ外して「承認済み」に戻し、**台帳の行は画面から案内**します。
 */
export async function undoHandoff(docId: string, userId: string): Promise<{ was: string | null }> {
  const doc = await queryOne(
    'SELECT id, linked_kind, linked_id FROM finance_docs WHERE id = ? AND deleted_at IS NULL',
    [docId],
  ) as Record<string, unknown> | null;
  if (!doc) throw new AppError(404, 'NOT_FOUND', '書類が見つかりません');
  if (!doc.linked_id) throw new AppError(400, 'NOT_LINKED', 'この書類はまだ台帳へ渡していません');

  await execute(
    `UPDATE finance_docs
        SET status = 'approved', linked_kind = NULL, linked_id = NULL,
            processed_by = NULL, processed_at = NULL, updated_at = NOW(),
            notes = COALESCE(notes, '')
      WHERE id = ?`,
    [docId],
  );
  void userId;
  return { was: (doc.linked_id as string) ?? null };
}
