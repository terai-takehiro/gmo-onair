import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// 日常業務アプリ (dailyops) — 内覧会 来場予約の service 層。
// API (inview.routes) と MCP (inview.tools) の両方から使う。
// Kairos3 の登録通知メールをベースにした参加者名簿。回 (セッション) は
// session_label / session_date から自動グループ化する (マスター table は持たない)。

export interface InviewInput {
  session_label?: string | null;
  session_date?: string | null;
  session_time?: string | null;
  session_audience?: string | null;
  name?: string | null;
  furigana?: string | null;
  email?: string | null;
  company?: string | null;
  role?: string | null;
  postal_code?: string | null;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  mail_consent?: boolean | null;
  party_size?: number | null;
  companions?: string[] | null;
  visit_time?: string | null;
  interests?: string | null;
  notes?: string | null;
  source?: string | null;
  requested_by?: string | null;
  created_by?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 「参加希望の回」文字列から 日付 / 時間帯 / 対象 を抽出する。
 *  例: "2026/7/29(水)14:00-17:00｜イベント主催者向け" */
export function parseSessionLabel(label: string): { date: string | null; time: string | null; audience: string | null } {
  const s = (label ?? '').trim();
  let date: string | null = null;
  const dm = s.match(/(\d{4})[/年.-](\d{1,2})[/月.-](\d{1,2})/);
  if (dm) {
    const y = dm[1];
    const mo = String(Number(dm[2])).padStart(2, '0');
    const d = String(Number(dm[3])).padStart(2, '0');
    date = `${y}-${mo}-${d}`;
  }
  const tm = s.match(/(\d{1,2}:\d{2}\s*[-〜~ー]\s*\d{1,2}:\d{2})/);
  const time = tm ? tm[1].replace(/\s+/g, '') : null;
  // 対象: ｜ / | / 全角スペース区切りの末尾。時間帯以降を採用
  let audience: string | null = null;
  const am = s.split(/[｜|]/);
  if (am.length > 1) audience = am[am.length - 1].trim() || null;
  return { date, time, audience };
}

function normSize(v: unknown): number {
  const n = Math.round(Number(v));
  if (Number.isNaN(n) || n < 1) return 1;
  return Math.min(999, n);
}

function normCompanions(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const arr = v.map((x) => String(x ?? '').trim()).filter(Boolean);
  return arr.length ? arr : null;
}

const ROW_COLS = `id, session_label, session_date, session_time, session_audience,
  name, furigana, email, company, role, postal_code, address, phone, fax, mobile,
  mail_consent, party_size, companions, visit_time, interests, notes, source,
  checked_in_at, checked_in_by, requested_by, created_by, created_at, updated_at`;

export const inviewService = {
  /** 一覧 (既定は全件、フィルタで from/to/未来のみ)。session_date 降順・回内は登録順。 */
  async list(filter: { from?: string; to?: string; upcoming?: boolean } = {}): Promise<Record<string, unknown>[]> {
    const conds: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.from && DATE_RE.test(filter.from)) { conds.push('session_date >= ?'); params.push(filter.from); }
    if (filter.to && DATE_RE.test(filter.to)) { conds.push('session_date <= ?'); params.push(filter.to); }
    if (filter.upcoming) { conds.push('(session_date IS NULL OR session_date >= CURRENT_DATE::text)'); }
    return queryAll(
      `SELECT ${ROW_COLS} FROM inview_registrations
       WHERE ${conds.join(' AND ')}
       ORDER BY session_date DESC NULLS LAST, session_label, created_at ASC`,
      params,
    );
  },

  /** 回 (セッション) ごとのサマリー: 登録件数 + 合計人数 + 来場済み数 */
  async listSessions(): Promise<Record<string, unknown>[]> {
    return queryAll(
      `SELECT session_date, session_label,
              MIN(session_time) AS session_time, MIN(session_audience) AS session_audience,
              COUNT(*) AS registration_count,
              COALESCE(SUM(party_size), 0) AS total_headcount,
              COUNT(checked_in_at) AS checked_in_count
       FROM inview_registrations
       WHERE deleted_at IS NULL
       GROUP BY session_date, session_label
       ORDER BY session_date DESC NULLS LAST, session_label`,
    );
  },

  async getById(id: string): Promise<Record<string, unknown> | undefined> {
    return (await queryOne(`SELECT ${ROW_COLS} FROM inview_registrations WHERE id = ? AND deleted_at IS NULL`, [id])) ?? undefined;
  },

  /**
   * 登録の作成。session_label から date/time/audience を自動抽出 (明示指定があれば優先)。
   * 同一 email × 同一 session_label の既存があれば更新 (Kairos3 メール再取り込みの重複防止)。
   */
  async create(input: InviewInput): Promise<{ row: Record<string, unknown>; action: 'created' | 'updated' }> {
    const name = (input.name ?? '').trim();
    if (!name) throw new AppError(400, '名前 (name) は必須です', 'VALIDATION_ERROR');

    const label = (input.session_label ?? '').trim();
    const parsed = parseSessionLabel(label);
    const sessionDate = (input.session_date && DATE_RE.test(input.session_date)) ? input.session_date : parsed.date;
    const sessionTime = input.session_time ?? parsed.time;
    const sessionAudience = input.session_audience ?? parsed.audience;
    const email = (input.email ?? '').trim() || null;

    // 重複ガード: email + session_label が一致する既存を更新
    if (email && label) {
      const dup = await queryOne(
        `SELECT id FROM inview_registrations WHERE deleted_at IS NULL AND email = ? AND session_label = ?`,
        [email, label],
      );
      if (dup) {
        const updated = await this.update(String(dup.id), input);
        return { row: updated, action: 'updated' };
      }
    }

    const id = uuidv4();
    await execute(
      `INSERT INTO inview_registrations
         (id, session_label, session_date, session_time, session_audience,
          name, furigana, email, company, role, postal_code, address, phone, fax, mobile,
          mail_consent, party_size, companions, visit_time, interests, notes, source,
          requested_by, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?)`,
      [
        id, label, sessionDate, sessionTime, sessionAudience,
        name, input.furigana ?? null, email, input.company ?? null, input.role ?? null,
        input.postal_code ?? null, input.address ?? null, input.phone ?? null, input.fax ?? null, input.mobile ?? null,
        typeof input.mail_consent === 'boolean' ? input.mail_consent : null,
        normSize(input.party_size ?? 1),
        input.companions !== undefined ? JSON.stringify(normCompanions(input.companions)) : null,
        input.visit_time ?? null, input.interests ?? null, input.notes ?? null,
        input.source ?? 'kairos3', input.requested_by ?? null, input.created_by ?? null,
      ],
    );
    return { row: (await this.getById(id))!, action: 'created' };
  },

  /** 部分更新 (渡したフィールドだけ変更)。session_label 変更時は date/time/audience を再抽出。 */
  async update(id: string, input: InviewInput): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM inview_registrations WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '来場予約が見つかりません', 'NOT_FOUND');

    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown) => { sets.push(`${col} = ?`); params.push(val); };

    if (input.session_label !== undefined) {
      const label = (input.session_label ?? '').trim();
      set('session_label', label);
      const parsed = parseSessionLabel(label);
      // 明示指定が無ければラベルから再抽出して同期
      set('session_date', (input.session_date && DATE_RE.test(input.session_date)) ? input.session_date : parsed.date);
      set('session_time', input.session_time ?? parsed.time);
      set('session_audience', input.session_audience ?? parsed.audience);
    } else {
      if (input.session_date !== undefined) set('session_date', input.session_date && DATE_RE.test(input.session_date) ? input.session_date : null);
      if (input.session_time !== undefined) set('session_time', input.session_time ?? null);
      if (input.session_audience !== undefined) set('session_audience', input.session_audience ?? null);
    }
    if (input.name !== undefined) {
      const nm = (input.name ?? '').trim();
      if (!nm) throw new AppError(400, '名前 (name) は必須です', 'VALIDATION_ERROR');
      set('name', nm);
    }
    if (input.furigana !== undefined) set('furigana', input.furigana ?? null);
    if (input.email !== undefined) set('email', (input.email ?? '').trim() || null);
    if (input.company !== undefined) set('company', input.company ?? null);
    if (input.role !== undefined) set('role', input.role ?? null);
    if (input.postal_code !== undefined) set('postal_code', input.postal_code ?? null);
    if (input.address !== undefined) set('address', input.address ?? null);
    if (input.phone !== undefined) set('phone', input.phone ?? null);
    if (input.fax !== undefined) set('fax', input.fax ?? null);
    if (input.mobile !== undefined) set('mobile', input.mobile ?? null);
    if (input.mail_consent !== undefined) set('mail_consent', typeof input.mail_consent === 'boolean' ? input.mail_consent : null);
    if (input.party_size !== undefined) set('party_size', normSize(input.party_size ?? 1));
    if (input.companions !== undefined) { sets.push('companions = ?::jsonb'); params.push(JSON.stringify(normCompanions(input.companions))); }
    if (input.visit_time !== undefined) set('visit_time', input.visit_time ?? null);
    if (input.interests !== undefined) set('interests', input.interests ?? null);
    if (input.notes !== undefined) set('notes', input.notes ?? null);
    if (input.requested_by !== undefined && input.requested_by !== null) set('requested_by', input.requested_by);

    if (!sets.length) return (await this.getById(id))!;
    sets.push('updated_at = NOW()');
    params.push(id);
    await execute(`UPDATE inview_registrations SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await this.getById(id))!;
  },

  async remove(id: string): Promise<void> {
    const existing = await queryOne(`SELECT id FROM inview_registrations WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '来場予約が見つかりません', 'NOT_FOUND');
    await execute(`UPDATE inview_registrations SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },

  /** 来場チェックの切替 (checkedIn=true で受付、false で取消) */
  async setCheckIn(id: string, checkedIn: boolean, userName?: string | null): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT id FROM inview_registrations WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, '来場予約が見つかりません', 'NOT_FOUND');
    if (checkedIn) {
      await execute(
        `UPDATE inview_registrations SET checked_in_at = NOW(), checked_in_by = ?, updated_at = NOW() WHERE id = ?`,
        [userName ?? null, id],
      );
    } else {
      await execute(
        `UPDATE inview_registrations SET checked_in_at = NULL, checked_in_by = NULL, updated_at = NOW() WHERE id = ?`,
        [id],
      );
    }
    return (await this.getById(id))!;
  },
};
