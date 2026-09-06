/**
 * 受領書類 → 台帳（仕入 / 販管費）への受け渡し (v4 ⑥)
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
import { assertVendorCompanyId } from '../../../shared/services/company-directory.service';
import { paymentDueFromTerms, startOfMonthIso } from '../../../shared/services/finance-chain';

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
  /*
    束（migration 281）から既定値を引く。**画面が入れ忘れた項目を書類・束が補う** —
    販管費の計上月と支払期日は「処理月 ＋ 何日サイト」で決まっており、
    書類に書いていないことのほうが多い（`shared/src/utils/financeDocChain.ts`）。
  */
  const doc = await queryOne(
    `SELECT d.id, d.status, d.linked_kind, d.linked_id, d.sender, d.subject, d.doc_type,
            d.project_id, d.vendor_name, d.expense_kind,
            -- ⚠️ 処理月と支払サイトは **束（人が決めたほう）が先**（Codex P1）。
            -- 書類側の processing_month は取込のとき受信日から当てた値が入っているので、
            -- 書類を先に見ると **人が直した月がいつまでも効きません**
            -- （販管費が違う月に計上される）。書類側にこれを人が直す欄は無い
            COALESCE(g.processing_month, d.processing_month)     AS processing_month,
            COALESCE(g.payment_terms_days, d.payment_terms_days) AS payment_terms_days,
            -- 案件は逆に **書類が先**。書類ごとに人が付け替えられる欄があるため
            COALESCE(d.project_id, g.project_id)                 AS chain_project_id
       FROM finance_docs d
       LEFT JOIN finance_doc_groups g ON g.id = d.group_id
      WHERE d.id = ? AND d.deleted_at IS NULL`,
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
  /*
    **見積書は台帳に渡せない。** 実際に仕入・販管費になるのは請求書・注文書だけです。

    ⚠️ migration 281 で**見積書も一覧に出るようになりました**（見積 → 発注 → 請求 の
    ひとつづりとして見せるため）。出るようになったぶん、**ここで止める意味が増えています** —
    「見積を取ったが発注しなかった」束は画面に残り続けるので、
    承認を押し間違えても台帳には入りません。
  */
  if (doc.doc_type === 'quote') {
    throw new AppError(400, 'QUOTE_NOT_HANDOFFABLE',
      '見積書は台帳（仕入・販管費）に入れられません。請求書が届いてから渡してください');
  }

  /*
    ── 入っていないぶんは束から作る（migration 281）──────────────

    **勝手に埋めるのは「書いていないもの」だけ。** 画面が渡した値は必ず勝ちます
    （人が直したものを上書きすると、直した意味が無くなる）。
  */
  const termsDays = typeof doc.payment_terms_days === 'number' ? doc.payment_terms_days : null;
  const month = typeof doc.processing_month === 'string' ? doc.processing_month : null;
  const recognitionDate = input.recognition_date || (month ? startOfMonthIso(month) : '');
  const paymentDue = input.payment_due_date
    ?? (month !== null && termsDays !== null ? paymentDueFromTerms(month, termsDays) : null);
  // 仕入のときは書類・束が持っている案件を既定にする（人が画面で決めた案件が最優先）
  const projectId = input.project_id
    ?? (typeof doc.chain_project_id === 'string' ? doc.chain_project_id : null);

  if (!YMD.test(recognitionDate)) {
    throw new AppError(400, 'VALIDATION_ERROR',
      '計上月を指定してください（販管費は「処理月」を入れると自動で決まります）');
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
      'SELECT linked_id, status, deleted_at FROM finance_docs WHERE id = ? FOR UPDATE', [docId],
    ) as { linked_id: string | null; status: string; deleted_at: Date | null } | undefined;
    /*
      ⚠️ **消えていないかも、押さえてから見る**（281 の自己レビュー）。

      束ごと消す操作（`removeGroup`）は書類を soft delete します。
      **ここで `deleted_at` を見ないと、待たされて先に進んだあとに
      「消えた書類から作った仕入・販管費の行」ができ**、どこからも辿れなくなります。
      取引の外の確認（この関数の冒頭）は `deleted_at IS NULL` で引いていますが、
      **正はこちら**です。
    */
    if (!locked || locked.deleted_at) {
      throw new AppError(409, 'ALREADY_DELETED',
        'この書類は取り消されています（取引ごと消された可能性があります）。'
        + '受領書類の画面を開き直してください');
    }
    if (locked?.linked_id) {
      throw new AppError(409, 'ALREADY_LINKED',
        'この書類はすでに台帳へ渡しています。取り消してから渡し直してください');
    }
    if (locked?.status !== 'approved') {
      throw new AppError(400, 'NOT_APPROVED',
        '承認済みの書類だけ台帳へ渡せます（確認中のものは先に承認してください）');
    }

    if (input.kind === 'purchase') {
      if (!projectId || !input.vendor_id) {
        throw new AppError(400, 'VALIDATION_ERROR', '仕入にするには案件と仕入先が必要です');
      }
      // `vendor_id` は companies.id（Phase 3-2b）を直接指すため確かめる
      // （`purchases.routes.ts` の POST と同じ理由）
      await assertVendorCompanyId(input.vendor_id);
      const id = uuidv4();
      await tx.execute(
        `INSERT INTO purchases
           (id, project_id, vendor_id, assigned_to, tax_category, invoice_qualified, amount,
            description, recognition_date, payment_due_date, notes, is_provisional, created_by)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, false, ?)`,
        [id, projectId, input.vendor_id, userId, tax, input.amount,
         input.description || null, recognitionDate, paymentDue || null,
         // **どの書類から来たかを台帳側にも残す。** 片側だけだと、
         // 台帳を見ている人が「これは何の請求か」を辿れない
         `受領書類から: ${String(doc.sender ?? '')} ${String(doc.subject ?? '')}`.trim(),
         userId],
      );
      created = { kind: 'purchase', id };
    } else {
      const id = uuidv4();
      // migration 268: 仕入 (上の分岐) と同じく `is_provisional=false` 固定。
      // 承認済みの書類から作る行なので、金額は書類記載の値で確定している
      // （「仮」は精算前の見込みのための状態で、ここには当てはまらない）
      await tx.execute(
        `INSERT INTO sga_expenses
           (id, billing_key, vendor_name, description, notes, recognition_date, payment_due_date,
            tax_category, invoice_qualified, amount, expense_type, source, is_provisional, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'staff', false, ?)`,
        [id, generateSgaBillingKey(recognitionDate, tax),
         input.vendor_name || String(doc.vendor_name ?? '') || String(doc.sender ?? '') || null,
         input.description || null,
         `受領書類から: ${String(doc.sender ?? '')} ${String(doc.subject ?? '')}`.trim(),
         recognitionDate, paymentDue || null, tax, input.amount,
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
