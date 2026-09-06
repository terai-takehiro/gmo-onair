/**
 * 受領書類の「ひとつづり」— 束ね・当て先の当て推量・台帳への渡し（migration 281）
 *
 * ── ここが引き受けること ────────────────────────────────────
 *
 *  ① **束ねる**: 見積書 → 発注書 → 請求書 を1つの取引として束ねる
 *  ② **当て先を当てる**: どの案件の仕入か／案件に紐づかない販管費か を**仮で**置く
 *  ③ **人が直す**: 案件の付け替え・金額の修正・ゴミの削除
 *  ④ **台帳へ渡す**: 束ごと 仕入 か 販管費 に入れる
 *
 * ── 当て先は AI が決めない（決めるのは人）─────────────────
 *
 * ご指示のとおり、**どの案件かは最終的に人が判断します**。
 * ただし空欄で置くと人が全部調べ直すので、**AI が候補を置き、
 * どれくらい確からしいかを一緒に残します**。
 *
 *   high   … GLS 番号が書類（件名・本文）にあり、その案件が実在する
 *   medium … 取引先名と案件名/お客様名が一致する案件が**1件だけ**ある
 *   low    … 候補が複数ある／名前が部分的にしか合わない
 *
 * **候補が複数あるときは付けません**（`low` の理由だけ残す）。
 * 適当に1件付けると、人は「合っている」と思って確かめずに登録します。
 *
 * ── 販管費は「何日サイト」「何月処理」で期日を作る ─────────
 *
 * 案件に紐づかない請求書（家賃・回線・ソフトの月額）は販管費です。
 * 支払期日は書類に書いていないことのほうが多く、実務は
 * 「締日から◯日サイト」で決まります。計算は
 * `shared/src/utils/financeDocChain.ts`（画面と同じ関数）に置いてあります。
 */
import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import {
  canHandoffChain, chainAmount, chainStage, paymentDueFromTerms,
  startOfMonthIso, type ChainDoc,
} from '../../../shared/services/finance-chain';
import { attachmentFailureLabel } from '../../../shared/services/mail-attachment-box.service';

export type ExpenseKind = 'purchase' | 'sga';
export type ProjectConfidence = 'high' | 'medium' | 'low';

export interface ProjectGuess {
  project_id: string | null;
  confidence: ProjectConfidence | null;
  /** なぜそう当てたか。**画面にそのまま出す**（人が確かめる材料） */
  reason: string | null;
}

/** GLS 番号の書き方。`GLS-A-2608-001` の形と、番号だけの書き方の両方を拾う */
const GLS_RE = /GLS[-\s]?[A-Z]?[-\s]?\d{3,4}[-\s]?\d{2,4}/i;

/**
 * 当て先の案件を当てる。**当てられないときは付けない**。
 *
 * @param hint AI が渡した手がかり（GLS 番号・案件名・件名など）
 * @param vendorName 取引先名（案件のお客様名との一致を見る）
 */
export async function guessProject(
  hint?: string | null, vendorName?: string | null,
): Promise<ProjectGuess> {
  const none: ProjectGuess = { project_id: null, confidence: null, reason: null };
  const text = [hint, vendorName].filter(Boolean).join(' ').trim();
  if (!text) return none;

  // ① GLS 番号が書いてあるか。**これが一番強い手がかり**
  const gls = GLS_RE.exec(text)?.[0]?.toUpperCase().replace(/\s+/g, '-');
  if (gls) {
    const row = await queryOne(
      `SELECT id, name, gls_number FROM projects
        WHERE UPPER(REPLACE(gls_number, ' ', '-')) = ? AND deleted_at IS NULL`,
      [gls],
    ) as { id: string; name: string; gls_number: string } | undefined;
    if (row) {
      return { project_id: row.id, confidence: 'high', reason: `件名・本文の ${row.gls_number} と一致しました` };
    }
    return { project_id: null, confidence: 'low', reason: `${gls} と書かれていますが、その番号の案件が見つかりません` };
  }

  // ② 案件名・お客様名に取引先名が入っているか。**1件だけのときしか付けない**
  const needle = (hint || vendorName || '').trim();
  if (needle.length < 2) return none;
  const rows = await queryAll(
    `SELECT p.id, p.name, p.gls_number, c.name AS customer_name
       FROM projects p
       LEFT JOIN companies c ON c.id = p.customer_id
      WHERE p.deleted_at IS NULL
        AND p.stage NOT IN ('e_lost')
        AND (p.name ILIKE ? OR c.name ILIKE ?)
      ORDER BY p.updated_at DESC
      LIMIT 5`,
    [`%${needle}%`, `%${needle}%`],
  ) as { id: string; name: string; gls_number: string | null; customer_name: string | null }[];

  if (rows.length === 1) {
    return {
      project_id: rows[0].id,
      confidence: 'medium',
      reason: `「${needle}」で案件「${rows[0].name}」だけが当たりました（確かめてください）`,
    };
  }
  if (rows.length > 1) {
    return {
      project_id: null,
      confidence: 'low',
      reason: `「${needle}」で ${rows.length} 件の案件が当たったため決めていません（${rows.slice(0, 3).map((r) => r.name).join(' / ')}）`,
    };
  }
  return none;
}

// ── 束 ──────────────────────────────────────────────────────

export interface GroupInput {
  title: string;
  vendor_name?: string | null;
  group_key?: string | null;
  expense_kind?: ExpenseKind | null;
  project_id?: string | null;
  payment_terms_days?: number | null;
  processing_month?: string | null;
  created_by?: string | null;
}

/**
 * 束を用意する。**同じ鍵の束があればそれを返す**（再取込で増やさない）。
 *
 * 鍵は AI が渡した `group_key`（見積番号・取引先＋件名など）。
 * 渡されなければ**そのつど新しい束**を作ります —
 * 束ね直しは画面からできるので、勝手に別の取引とくっつけるより安全です。
 */
export async function ensureGroup(input: GroupInput): Promise<{ id: string; created: boolean }> {
  const key = input.group_key?.trim() || null;
  if (key) {
    const found = await queryOne(
      'SELECT id FROM finance_doc_groups WHERE group_key = ? AND deleted_at IS NULL', [key],
    ) as { id: string } | undefined;
    if (found) return { id: found.id, created: false };
  }
  const id = uuidv4();
  await execute(
    `INSERT INTO finance_doc_groups
       (id, title, vendor_name, group_key, expense_kind, project_id,
        payment_terms_days, processing_month, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.title.slice(0, 200), input.vendor_name ?? null, key,
     input.expense_kind ?? null, input.project_id ?? null,
     input.payment_terms_days ?? null, input.processing_month ?? null, input.created_by ?? null],
  );
  return { id, created: true };
}

const GROUP_COLS = `g.id, g.title, g.vendor_name, g.group_key, g.expense_kind, g.project_id,
  g.payment_terms_days, g.processing_month, g.created_at, g.updated_at,
  p.gls_number AS project_gls_number, p.name AS project_name`;

/**
 * 束に出す書類の列。
 *
 * ⚠️ **一覧用に列を間引かないこと**（Codex P1）。画面はこの行をそのまま
 * `FinanceDoc` として扱い、**書類を直すダイアログ・台帳へ渡すダイアログ・
 * 「中身を読む」の3つが同じ行を読みます**。間引くと、
 *
 *  ・`notes` が空で初期化され、金額だけ直したつもりが**メモが消える**
 *  ・`gls_number` が来ないので、台帳へ渡すとき**必ず販管費に倒れる**
 *  ・`is_ai` / `details` / `body_text` が来ないので **✨ が出ず、原文も読めない**
 *
 * が起きます。**必要なぶんだけ返す**のではなく、**行そのものを返します**。
 */
const GROUP_DOC_COLS = `d.id, d.group_id, d.doc_type, d.sender, d.subject, d.content,
  d.amount, d.status, d.received_at, d.payment_due, d.closing_month,
  d.revision, d.doc_no, d.gls_number, d.notes, d.source,
  d.processed_by, d.processed_at, d.created_at, d.updated_at,
  d.details, d.body_text,
  d.project_id, d.project_source, d.project_confidence, d.project_reason,
  d.expense_kind, d.expense_kind_source, d.vendor_name,
  d.payment_terms_days, d.processing_month,
  d.linked_kind, d.linked_id,
  cu.name AS created_by_name,
  pr.gls_number AS project_gls_number, pr.name AS project_name,
  EXISTS (SELECT 1 FROM ai_outputs o
           WHERE o.target_table = 'finance_docs' AND o.target_id = d.id
             AND o.kind = 'finance_doc_intake') AS is_ai`;

/**
 * 束の一覧（中の書類つき）。
 *
 * **見積書だけの束も出します**（ご指示。以前は一覧から外していた）。
 * 「見積を取ったが発注しなかった」ものが見えないと、
 * **あの見積どうなったかを後から引けません**。
 *
 * ── 並びと上限（Codex P2 で直した）────────────────────────────
 *
 * この画面は**払う前に確かめる机**なので、**急ぐ順＝支払期日が近い順**です。
 * `updated_at` で並べていたときは、**さっき触った期日2か月先の取引が、
 * 期日を過ぎた請求書より上**に来ていました。
 *
 * 上限（300）を**絞り込みより先に**掛けてもいけません。片づいた履歴が
 * 上限を食い潰し、**古い未処理の請求書が一覧から消えます**。
 * どちらも SQL 側でやります。
 */
export async function listGroups(filter: { pendingOnly?: boolean; expense_kind?: string } = {}): Promise<Record<string, unknown>[]> {
  const conds = ['g.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (filter.expense_kind) { conds.push('g.expense_kind = ?'); params.push(filter.expense_kind); }
  /*
    片づき = **書類があって、その全部が 登録済/却下**。
    書類が0本の束は片づきではありません（残骸なので、机に出して消してもらう）。
  */
  if (filter.pendingOnly) conds.push('(agg.doc_count = 0 OR agg.live_count > 0)');

  const groups = await queryAll(
    `SELECT ${GROUP_COLS}, agg.next_due, agg.live_count, agg.doc_count
       FROM finance_doc_groups g
       LEFT JOIN projects p ON p.id = g.project_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS doc_count,
                COUNT(*) FILTER (WHERE d.status NOT IN ('processed','rejected')) AS live_count,
                MIN(d.payment_due) FILTER (WHERE d.status NOT IN ('processed','rejected')) AS next_due
           FROM finance_docs d
          WHERE d.group_id = g.id AND d.deleted_at IS NULL
       ) agg ON TRUE
      WHERE ${conds.join(' AND ')}
      ORDER BY agg.next_due ASC NULLS LAST, g.updated_at DESC
      LIMIT 300`,
    params,
  ) as Record<string, unknown>[];
  if (groups.length === 0) return [];

  const ids = groups.map((g) => String(g.id));
  const docs = await queryAll(
    `SELECT ${GROUP_DOC_COLS}
       FROM finance_docs d
       LEFT JOIN users cu ON cu.id = d.created_by
       LEFT JOIN projects pr ON pr.id = d.project_id
      WHERE d.group_id IN (${ids.map(() => '?').join(',')}) AND d.deleted_at IS NULL
      ORDER BY d.received_at ASC NULLS LAST, d.created_at ASC`,
    ids,
  ) as Record<string, unknown>[];

  const atts = await queryAll(
    `SELECT a.id, a.doc_id, a.filename, a.mime_type, a.size_bytes,
            a.box_file_id, a.box_url, a.stored_at, a.failure_reason
       FROM finance_doc_attachments a
       JOIN finance_docs d ON d.id = a.doc_id
      WHERE d.group_id IN (${ids.map(() => '?').join(',')}) AND d.deleted_at IS NULL
      ORDER BY a.created_at ASC`,
    ids,
  ) as Record<string, unknown>[];

  return groups.map((g) => {
    const mine: Record<string, unknown>[] = docs
      .filter((d) => d.group_id === g.id)
      .map((d) => ({
        ...d,
        // **入らなかった理由は「言葉」で返す**（Codex P2）。理由コードだけ渡すと
        // 画面が独自に文言を持ち、サーバーと2か所に散る（片方だけ直る）
        attachments: atts.filter((a) => a.doc_id === d.id).map((a) => ({
          ...a, failure_label: attachmentFailureLabel(a.failure_reason as string | null),
        })),
      }));
    const chain = mine as unknown as ChainDoc[];
    return {
      ...g,
      docs: mine,
      stage: chainStage(chain),
      amount: chainAmount(chain),
      can_handoff: canHandoffChain(chain),
      /** 束として片づいたか。**中の書類が全部「登録済/却下」なら片づき**（数えるのは SQL） */
      settled: Number(g.doc_count ?? 0) > 0 && Number(g.live_count ?? 0) === 0,
    };
  });
}

export async function getGroup(id: string): Promise<Record<string, unknown> | undefined> {
  const rows = await listGroups();
  return rows.find((r) => r.id === id);
}

/**
 * 束を直す（人の操作）。**渡した項目だけ変える**。
 *
 * 案件を付け替えると、**中の書類の当て先も揃えます** —
 * 束と書類で違う案件を指していると、台帳へ渡すときにどちらを見るかで結果が変わります。
 */
export async function updateGroup(
  id: string,
  patch: Partial<Pick<GroupInput, 'title' | 'vendor_name' | 'expense_kind' | 'project_id' | 'payment_terms_days' | 'processing_month'>>,
): Promise<Record<string, unknown> | undefined> {
  /*
    ⚠️ **同じ列を2回入れない**（Codex P1）。

    `expense_kind='sga'` は「案件を外す」も意味するので `project_id` を書きます。
    ところが画面（`GroupEditDialog`）は**行き先と案件を必ず両方送る**ので、
    素直に積むと `SET project_id = ?, project_id = ?` になり、
    PostgreSQL が「同じ列への代入が複数ある」で弾きます
    （= **販管費として確定する操作が必ず失敗する**）。

    最後に書いた値が勝つよう、**列ごとに1つだけ**持ちます。
  */
  const assigned = new Map<string, unknown>();
  const put = (col: string, val: unknown) => { assigned.set(col, val); };

  if (patch.title !== undefined) put('title', String(patch.title).slice(0, 200));
  if (patch.vendor_name !== undefined) put('vendor_name', patch.vendor_name ?? null);
  if (patch.expense_kind !== undefined) {
    if (patch.expense_kind !== null && patch.expense_kind !== 'purchase' && patch.expense_kind !== 'sga') {
      throw new AppError(400, 'VALIDATION_ERROR', '行き先は 仕入 か 販管費 のどちらかです');
    }
    put('expense_kind', patch.expense_kind ?? null);
    // **販管費に変えたら案件を外す。** 案件が付いたままの販管費は、
    // どちらとしても数えられる行になり、原価と販管費の二重計上に見える
    if (patch.expense_kind === 'sga') put('project_id', null);
  }
  if (patch.project_id !== undefined) {
    if (patch.project_id) {
      const ok = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [patch.project_id]);
      if (!ok) throw new AppError(400, 'VALIDATION_ERROR', 'その案件が見つかりません');
    }
    put('project_id', patch.project_id ?? null);
  }
  if (patch.payment_terms_days !== undefined) {
    const n = patch.payment_terms_days;
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > 365)) {
      throw new AppError(400, 'VALIDATION_ERROR', '支払サイトは 0〜365 日で指定してください');
    }
    put('payment_terms_days', n ?? null);
  }
  if (patch.processing_month !== undefined) {
    if (patch.processing_month && !/^\d{4}-\d{2}$/.test(patch.processing_month)) {
      throw new AppError(400, 'VALIDATION_ERROR', '処理月は YYYY-MM で指定してください');
    }
    put('processing_month', patch.processing_month ?? null);
  }
  if (assigned.size === 0) return getGroup(id);

  const sets = [...assigned.keys()].map((c) => `${c} = ?`);
  const params = [...assigned.values()];
  await execute(`UPDATE finance_doc_groups SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`, [...params, id]);

  // 束の案件を人が決めたら、中の書類も同じ案件に揃える（`human` として記録）
  if (patch.project_id !== undefined || patch.expense_kind === 'sga') {
    const pid = patch.expense_kind === 'sga' ? null : (patch.project_id ?? null);
    await execute(
      `UPDATE finance_docs
          SET project_id = ?, project_source = 'human', updated_at = NOW()
        WHERE group_id = ? AND deleted_at IS NULL`,
      [pid, id],
    );
  }
  return getGroup(id);
}

/** 束を消す（ゴミだったとき）。**中の書類もまとめて消す**（残すと親無しの行になる） */
export async function removeGroup(id: string): Promise<void> {
  await withTransaction(async (tx) => {
    await tx.execute('UPDATE finance_docs SET deleted_at = NOW() WHERE group_id = ? AND deleted_at IS NULL', [id]);
    await tx.execute('UPDATE finance_doc_groups SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [id]);
  });
}

/** 書類を別の束へ移す（束ね直し） */
export async function moveDocToGroup(docId: string, groupId: string): Promise<void> {
  const g = await queryOne('SELECT id FROM finance_doc_groups WHERE id = ? AND deleted_at IS NULL', [groupId]);
  if (!g) throw new AppError(404, 'NOT_FOUND', 'その束が見つかりません');
  const d = await queryOne('SELECT id, status FROM finance_docs WHERE id = ? AND deleted_at IS NULL', [docId]) as { status: string } | undefined;
  if (!d) throw new AppError(404, 'NOT_FOUND', 'その書類が見つかりません');
  // **台帳に渡した書類は動かせない。** 動かすと、仕入の行が指す束と実際の束が食い違う
  if (d.status === 'processed') {
    throw new AppError(409, 'ALREADY_PROCESSED', '仕入・販管費に登録済みの書類は動かせません。先に登録を取り消してください');
  }
  await execute('UPDATE finance_docs SET group_id = ?, updated_at = NOW() WHERE id = ?', [groupId, docId]);
}

/**
 * 束の支払期日の見込み。**販管費のときだけ**（仕入は書類の期日を使う）。
 * 書類に期日が書いてあればそれが優先で、無いときにサイトから作る。
 */
export function sgaPaymentDue(
  group: { payment_terms_days?: number | null; processing_month?: string | null },
  docPaymentDue?: string | null,
): string | null {
  if (docPaymentDue) return docPaymentDue;
  if (!group.processing_month || group.payment_terms_days === null || group.payment_terms_days === undefined) return null;
  return paymentDueFromTerms(group.processing_month, group.payment_terms_days);
}

/** 販管費の計上月（台帳は月初の日付で持つ） */
export function sgaRecognitionDate(group: { processing_month?: string | null }): string | null {
  return group.processing_month ? startOfMonthIso(group.processing_month) : null;
}
