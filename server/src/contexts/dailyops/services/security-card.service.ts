import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// 日常業務アプリ (dailyops) — スタジオ セキュリティカード管理の service 層。
// API (security-card.routes) と MCP (security-cards.tools) の両方から使う。
// カード台帳 (security_cards) はセキュリティレベルで固定のアクセス権を持つ参照データ。
// 貸出/返却 (security_card_lendings) で「どの会社・担当者に、いつからいつまで」を記録する。
// 貸出対応者は GMO ONAiR のユーザー。現時点は GMOサムライスタジオ用賀 (studio='yoga') のみ。

// ── エリア (解錠対象の部屋) の正準定義。クライアントの列見出しと揃える ──────
export interface AreaDef { key: string; label: string; floor: string }
export const SECURITY_AREAS: AreaDef[] = [
  { key: 'office', label: '執務室', floor: '27F' },
  { key: 'cargo_ev', label: '通用口（貨物EV）', floor: '27F' },
  { key: 'private_ev', label: '通用口（占有EV）', floor: '27F' },
  { key: 'room_a', label: 'ROOM A', floor: '27F' },
  { key: 'room_b', label: 'ROOM B', floor: '27F' },
  { key: 'room_c', label: 'ROOM C', floor: '27F' },
  { key: 'meeting', label: 'MEETING ROOM', floor: '27F' },
  { key: 'vip', label: 'VIP LOUNGE', floor: '27F' },
  { key: 'tech_storage', label: '技術倉庫', floor: '27F' },
  { key: 'soc1', label: '第1SOC', floor: '26F' },
];

export const STUDIOS: { key: string; label: string }[] = [
  { key: 'yoga', label: 'GMOサムライスタジオ用賀' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normDate(v: unknown, fallback?: string): string | null {
  const s = String(v ?? '').trim();
  if (DATE_RE.test(s)) return s;
  return fallback ?? null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LendInput {
  borrower_company?: string | null;
  borrower_person?: string | null;
  borrower_contact?: string | null;
  purpose?: string | null;
  lent_on?: string | null;
  due_on?: string | null;
  lent_by_user_id?: string | null;
  lent_by_name?: string | null;
  notes?: string | null;
  requested_by?: string | null;
  created_by?: string | null;
  /** どの案件のために貸したか (任意)。付けると案件の書類タブに返却が出る (15章) */
  project_id?: string | null;
}

export interface ReturnInput {
  returned_on?: string | null;
  returned_by_user_id?: string | null;
  returned_by_name?: string | null;
  notes?: string | null;
  requested_by?: string | null;
}

// 貸出行の列 (l. 修飾済み)。両テーブルに notes/status/created_at 等があるため必ず修飾する。
const LENDING_COLS = `l.id, l.card_id, l.borrower_company, l.borrower_person, l.borrower_contact, l.purpose,
  l.lent_on::text AS lent_on, l.due_on::text AS due_on, l.returned_on::text AS returned_on,
  l.lent_by_user_id, l.lent_by_name, l.returned_by_user_id, l.returned_by_name,
  l.notes, l.status, l.requested_by, l.created_by, l.created_at, l.updated_at`;

// カード行 + 現在の貸出中情報 (LEFT JOIN LATERAL) + 期限超過フラグ
const CARD_SELECT = `
  SELECT c.id, c.studio, c.card_no, c.label, c.security_level, c.level_label, c.access,
         c.is_active, c.notes, c.created_at, c.updated_at,
         l.id AS lending_id, l.borrower_company, l.borrower_person, l.borrower_contact,
         l.purpose, l.lent_on::text AS lent_on, l.due_on::text AS due_on,
         l.lent_by_user_id, l.lent_by_name,
         CASE WHEN l.id IS NULL THEN 'available' ELSE 'lent' END AS status,
         CASE WHEN l.id IS NOT NULL AND l.due_on IS NOT NULL AND l.due_on < CURRENT_DATE THEN true ELSE false END AS overdue
  FROM security_cards c
  LEFT JOIN LATERAL (
    SELECT * FROM security_card_lendings sl
    WHERE sl.card_id = c.id AND sl.status = 'active' AND sl.deleted_at IS NULL
    ORDER BY sl.lent_on DESC, sl.created_at DESC LIMIT 1
  ) l ON true
`;

export const securityCardService = {
  /** カード一覧 (拠点/ステータス/検索で絞り込み)。カード番号順。 */
  async listCards(filter: { studio?: string; status?: 'available' | 'lent'; search?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds: string[] = ['c.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.studio) { conds.push('c.studio = ?'); params.push(filter.studio); }
    const rows = await queryAll(
      `${CARD_SELECT} WHERE ${conds.join(' AND ')} ORDER BY c.studio, c.card_no`,
      params,
    );
    let out = rows;
    if (filter.status === 'available') out = out.filter((r) => r.status === 'available');
    else if (filter.status === 'lent') out = out.filter((r) => r.status === 'lent');
    if (filter.search) {
      const q = filter.search.toLowerCase();
      out = out.filter((r) =>
        String(r.card_no).includes(q) ||
        String(r.level_label ?? '').toLowerCase().includes(q) ||
        String(r.borrower_company ?? '').toLowerCase().includes(q) ||
        String(r.borrower_person ?? '').toLowerCase().includes(q));
    }
    return out;
  },

  /** カード状況サマリー (ホームのバッジ用): 総数 / 利用可能 / 貸出中 / 期限超過 */
  async stats(studio?: string): Promise<{ total: number; available: number; lent: number; overdue: number }> {
    const cards = await this.listCards(studio ? { studio } : {});
    const total = cards.length;
    const lent = cards.filter((c) => c.status === 'lent').length;
    const overdue = cards.filter((c) => c.overdue === true).length;
    return { total, available: total - lent, lent, overdue };
  },

  async getCard(id: string): Promise<Record<string, unknown> | undefined> {
    const row = await queryOne(`${CARD_SELECT} WHERE c.id = ? AND c.deleted_at IS NULL`, [id]);
    if (!row) return undefined;
    row.history = await this.listLendings({ card_id: id });
    return row;
  },

  /** カード番号から取得 (MCP 用: 人が「10番のカード」と指定するため) */
  async getCardByNo(cardNo: number, studio = 'yoga'): Promise<Record<string, unknown> | undefined> {
    const row = await queryOne(
      `${CARD_SELECT} WHERE c.card_no = ? AND c.studio = ? AND c.deleted_at IS NULL`,
      [cardNo, studio],
    );
    if (!row) return undefined;
    row.history = await this.listLendings({ card_id: String(row.id) });
    return row;
  },

  /** カードの軽微な編集 (表示名 / メモ / 運用有効フラグ)。アクセス権は固定のため変更しない。 */
  async updateCard(id: string, input: { label?: string | null; notes?: string | null; is_active?: boolean }): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT id FROM security_cards WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'セキュリティカードが見つかりません', 'NOT_FOUND');
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.label !== undefined) { sets.push('label = ?'); params.push(input.label ?? null); }
    if (input.notes !== undefined) { sets.push('notes = ?'); params.push(input.notes ?? null); }
    if (input.is_active !== undefined) { sets.push('is_active = ?'); params.push(!!input.is_active); }
    if (sets.length) {
      sets.push('updated_at = NOW()');
      params.push(id);
      await execute(`UPDATE security_cards SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    return (await this.getCard(id))!;
  },

  /**
   * 貸出。カードが利用可能 (active な貸出なし・is_active=true) なら貸出記録を作成する。
   * 貸出対応者 (lent_by) は呼び出し側が渡す (通常はログイン中の ONAiR ユーザー)。
   */
  async lend(cardId: string, input: LendInput): Promise<Record<string, unknown>> {
    const card = await queryOne(`SELECT id, is_active FROM security_cards WHERE id = ? AND deleted_at IS NULL`, [cardId]);
    if (!card) throw new AppError(404, 'セキュリティカードが見つかりません', 'NOT_FOUND');
    if (!card.is_active) throw new AppError(400, 'このカードは運用対象外です (紛失/廃止など)', 'VALIDATION_ERROR');

    const active = await queryOne(
      `SELECT id, borrower_person, borrower_company FROM security_card_lendings WHERE card_id = ? AND status = 'active' AND deleted_at IS NULL`,
      [cardId],
    );
    if (active) {
      throw new AppError(409, `このカードは既に貸出中です (${active.borrower_company || ''} ${active.borrower_person || ''})。先に返却してください`, 'ALREADY_LENT');
    }

    const person = (input.borrower_person ?? '').trim();
    if (!person) throw new AppError(400, '貸出先の担当者 (borrower_person) は必須です', 'VALIDATION_ERROR');

    const id = uuidv4();
    await execute(
      `INSERT INTO security_card_lendings
         (id, card_id, borrower_company, borrower_person, borrower_contact, purpose,
          lent_on, due_on, lent_by_user_id, lent_by_name, notes, status, requested_by, created_by,
          project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        id, cardId,
        input.borrower_company ?? null, person, input.borrower_contact ?? null, input.purpose ?? null,
        normDate(input.lent_on, today()), normDate(input.due_on),
        input.lent_by_user_id ?? null, input.lent_by_name ?? null,
        input.notes ?? null, input.requested_by ?? null, input.created_by ?? null,
        // 案件は任意 (社内の用事で貸すこともある)。付いていれば案件の
        // 「そろっていないもの」に返却が出る (15章)
        input.project_id ?? null,
      ],
    );
    return (await this.getCard(cardId))!;
  },

  /** 返却。カードの active な貸出を returned にする。 */
  async returnCard(cardId: string, input: ReturnInput): Promise<Record<string, unknown>> {
    const card = await queryOne(`SELECT id FROM security_cards WHERE id = ? AND deleted_at IS NULL`, [cardId]);
    if (!card) throw new AppError(404, 'セキュリティカードが見つかりません', 'NOT_FOUND');
    const active = await queryOne(
      `SELECT id, notes FROM security_card_lendings WHERE card_id = ? AND status = 'active' AND deleted_at IS NULL`,
      [cardId],
    );
    if (!active) throw new AppError(400, 'このカードは貸出中ではありません', 'NOT_LENT');

    // 返却時のメモは既存メモに追記 (貸出時の備考を消さない)
    const combinedNotes = input.notes
      ? [active.notes, `【返却時】${input.notes}`].filter(Boolean).join('\n')
      : (active.notes ?? null);

    await execute(
      `UPDATE security_card_lendings
         SET status = 'returned', returned_on = ?, returned_by_user_id = ?, returned_by_name = ?,
             notes = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        normDate(input.returned_on, today()),
        input.returned_by_user_id ?? null, input.returned_by_name ?? null,
        combinedNotes, active.id,
      ],
    );
    return (await this.getCard(cardId))!;
  },

  /** 貸出履歴 (card_id / status / 期間で絞り込み)。新しい貸出順。 */
  async listLendings(filter: { card_id?: string; status?: 'active' | 'returned'; from?: string; to?: string; studio?: string } = {}): Promise<Record<string, unknown>[]> {
    const conds: string[] = ['l.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.card_id) { conds.push('l.card_id = ?'); params.push(filter.card_id); }
    if (filter.status) { conds.push('l.status = ?'); params.push(filter.status); }
    if (filter.from && DATE_RE.test(filter.from)) { conds.push('l.lent_on >= ?'); params.push(filter.from); }
    if (filter.to && DATE_RE.test(filter.to)) { conds.push('l.lent_on <= ?'); params.push(filter.to); }
    if (filter.studio) { conds.push('c.studio = ?'); params.push(filter.studio); }
    return queryAll(
      `SELECT ${LENDING_COLS},
              c.card_no, c.level_label, c.security_level, c.studio,
              CASE WHEN l.status = 'active' AND l.due_on IS NOT NULL AND l.due_on < CURRENT_DATE THEN true ELSE false END AS overdue
       FROM security_card_lendings l
       JOIN security_cards c ON c.id = l.card_id
       WHERE ${conds.join(' AND ')}
       ORDER BY l.lent_on DESC, l.created_at DESC`,
      params,
    );
  },
};
