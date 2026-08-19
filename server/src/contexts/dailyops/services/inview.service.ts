import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { projectService } from '../../sales/services/project.service';
import { activityLogService } from '../../sales/services/activity-log.service';
import { looksLikeGmoGroup } from '../../../shared/services/gmo-group';
import { createCustomerRecord } from '../../../shared/services/company-directory.service';

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
  companions?: (string | Partial<InviewCompanion>)[] | null;
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

/** 同行者1人。migration 154 で「氏名の文字列」から この形に変わった */
export interface InviewCompanion {
  id: string;
  name: string;
  checked_in_at: string | null;
  checked_in_by: string | null;
}

/** 同行者の氏名を取り出す。旧形式 (文字列) と新形式 (オブジェクト) の両方を受ける */
export function companionName(c: unknown): string {
  if (typeof c === 'string') return c.trim();
  if (c && typeof c === 'object') return String((c as Record<string, unknown>).name ?? '').trim();
  return '';
}

/**
 * DB の companions を `InviewCompanion[]` として読む。
 * 旧形式 (氏名の文字列) や id 欠けの行も受け、その場で id を振る
 * (受付の切り替えは id で行うため、id が無いと個別受付ができない)。
 */
function readCompanions(v: unknown): InviewCompanion[] {
  if (!Array.isArray(v)) return [];
  const out: InviewCompanion[] = [];
  for (const x of v) {
    const nm = companionName(x);
    if (!nm) continue;
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    out.push({
      id: String(o.id ?? '') || uuidv4(),
      name: nm,
      checked_in_at: (o.checked_in_at as string | null) ?? null,
      checked_in_by: (o.checked_in_by as string | null) ?? null,
    });
  }
  return out;
}

/**
 * 同行者を `{ id, name, checked_in_at, checked_in_by }` の配列に正規化する。
 *
 * **編集フォームは氏名の配列しか送ってこない** (1行1名のテキスト欄なので、
 * 送れるのは氏名だけ)。素直に文字列で上書きすると**同行者ごとの受付記録
 * (checked_in_at / checked_in_by) が消える** — 当日の受付を済ませたあとに
 * 誰かが登録内容を直しただけで受付が無かったことになる。
 *
 * そこで氏名で既存と突き合わせ、一致したものは id と受付記録を引き継ぐ。
 * 同名が複数いるときは出てきた順に1つずつ使う (先着で消費)。
 * 対応が取れなかった行は新しい id を振り、未受付として入れる。
 */
function normCompanions(v: unknown, existing?: unknown): InviewCompanion[] | null {
  if (!Array.isArray(v)) return null;

  const byName = new Map<string, InviewCompanion[]>();
  for (const p of readCompanions(existing)) {
    const list = byName.get(p.name) ?? [];
    list.push(p);
    byName.set(p.name, list);
  }

  const out: InviewCompanion[] = [];
  for (const x of v) {
    const nm = companionName(x);
    if (!nm) continue;
    const queue = byName.get(nm);
    if (queue && queue.length) out.push(queue.shift() as InviewCompanion);
    else out.push({ id: uuidv4(), name: nm, checked_in_at: null, checked_in_by: null });
  }
  return out.length ? out : null;
}

const ROW_COLS = `id, session_label, session_date, session_time, session_audience,
  name, furigana, email, company, role, postal_code, address, phone, fax, mobile,
  mail_consent, party_size, companions, visit_time, interests, notes, source,
  checked_in_at, checked_in_by, promoted_project_id, promoted_at, promoted_by,
  requested_by, created_by, created_at, updated_at`;

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
    if (!name) throw new AppError(400, 'VALIDATION_ERROR', '名前 (name) は必須です');

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
    if (!existing) throw new AppError(404, 'NOT_FOUND', '来場予約が見つかりません');

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
      if (!nm) throw new AppError(400, 'VALIDATION_ERROR', '名前 (name) は必須です');
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
    if (input.companions !== undefined) { sets.push('companions = ?::jsonb'); params.push(JSON.stringify(normCompanions(input.companions, (existing as Record<string, unknown>).companions))); }
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
    if (!existing) throw new AppError(404, 'NOT_FOUND', '来場予約が見つかりません');
    await execute(`UPDATE inview_registrations SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },

  /**
   * 来場予約を「案件化 (昇格)」する。顧客を会社名から find-or-create し、ヨミ案件 (stage=neta) と
   * 来場の活動記録 (activity_type=visit) を起票して、登録に promoted_project_id を記録する。
   * 既に昇格済みなら何もせず既存の project_id を返す (冪等)。
   * @param actor 実行ユーザー { userId, userName }
   * @param opts  gls_category (既定 'A' スタジオ) / customer_id (明示指定で find-or-create をスキップ)
   */
  async promote(
    id: string,
    actor: { userId: string; userName?: string | null },
    opts: { gls_category?: 'A' | 'B'; customer_id?: string } = {},
  ): Promise<{ promoted: boolean; already?: boolean; project_id: string; customer_id: string; customer_created?: boolean }> {
    const reg = await this.getById(id);
    if (!reg) throw new AppError(404, 'NOT_FOUND', '来場予約が見つかりません');
    if (reg.promoted_project_id) {
      return { promoted: false, already: true, project_id: String(reg.promoted_project_id), customer_id: '' };
    }

    // 1) 顧客の解決 (明示指定 > 会社名で find > 作成)
    const company = String(reg.company ?? '').trim();
    const personName = String(reg.name ?? '').trim();
    let customerId = opts.customer_id;
    let customerCreated = false;
    if (!customerId) {
      const key = company || personName;
      // Phase 3-2a: projects.customer_id は companies.id を直接指すので、
      // customers ではなく companies（is_customer=TRUE）から名前で引く。
      // Phase 3-3-4: 以前は `customers` 行が生きているかを EXISTS で追加確認していたが
      // （削除済みの顧客の名前で内覧会予約が誤って紐づかないように・PR #199 P2 の2巡目）、
      // `DELETE /customers/:id` が `companies.is_customer` も更新するようになった（PR #226）ので
      // `co.is_customer = TRUE` だけで同じ保証になり、EXISTS は不要になった。
      if (company) {
        const found = await queryOne(
          `SELECT co.id FROM companies co
           WHERE co.deleted_at IS NULL AND co.is_customer = TRUE
             AND (co.name = ? OR co.short_name = ?)
           ORDER BY (co.name = ?) DESC LIMIT 1`,
          [company, company, company],
        ) as any;
        if (found) customerId = String(found.id);
      }
      if (!customerId) {
        // **`companies`（取引先マスター）にも紐づける**（company-directory.service.ts）。
        // グループの印は社名から見立てる（migration 192）。
        // `createCustomerRecord` は `customers.id` を返すので、作った行の
        // company_id を引き直して customer_id として使う
        const cid = await createCustomerRecord(
          {
            name: key || '（内覧会来場者）', contact_name: personName || null,
            email: (reg.email as string) || null,
            phone: (reg.phone as string) || (reg.mobile as string) || null,
            address: (reg.address as string) || null, is_gmo_group: looksLikeGmoGroup(key),
          },
          actor.userId,
        );
        const cr = await queryOne('SELECT company_id FROM customers WHERE id = ?', [cid]) as any;
        customerId = String(cr?.company_id ?? cid);
        customerCreated = true;
      }
    }

    // 2) ヨミ案件を起票 (stage=neta は projectService.create が固定)
    const glsCategory = opts.gls_category === 'B' ? 'B' : 'A';
    const noteLines = [
      '内覧会 来場予約からの起票',
      reg.session_label ? `回: ${reg.session_label}` : '',
      `来場者: ${personName}${reg.role ? `（${reg.role}）` : ''}`,
      company ? `会社: ${company}` : '',
      reg.party_size ? `参加人数: ${reg.party_size}名` : '',
      Array.isArray(reg.companions) && reg.companions.length ? `同行者: ${(reg.companions as unknown[]).map(companionName).filter(Boolean).join('、')}` : '',
      reg.interests ? `興味・相談: ${reg.interests}` : '',
      (reg.email || reg.phone || reg.mobile) ? `連絡先: ${[reg.email, reg.phone, reg.mobile].filter(Boolean).join(' / ')}` : '',
    ].filter(Boolean);
    const project = await projectService.create(
      {
        name: company ? `${company}（内覧会）` : `内覧会来場 ${personName}`,
        customer_id: customerId,
        gls_category: glsCategory,
        assigned_to: actor.userId,
        notes: noteLines.join('\n'),
      },
      actor.userId,
    ) as any;
    // 流入チャネルを記録 (create は source_channel を持たないため後付け UPDATE)
    await execute(`UPDATE projects SET source_channel = '内覧会' WHERE id = ?`, [project.id]);

    // 3) 来場を活動記録に (visit)
    const activityDate = (reg.session_date && /^\d{4}-\d{2}-\d{2}$/.test(String(reg.session_date)))
      ? String(reg.session_date) : new Date().toISOString().slice(0, 10);
    await activityLogService.create(
      {
        project_id: project.id,
        customer_id: customerId,
        activity_type: 'visit',
        activity_date: activityDate,
        subject: '内覧会 来場',
        description: noteLines.slice(1).join('\n'),
      },
      actor.userId,
    );

    // 4) 昇格を記録
    await execute(
      `UPDATE inview_registrations SET promoted_project_id = ?, promoted_at = NOW(), promoted_by = ?, updated_at = NOW() WHERE id = ?`,
      [project.id, actor.userName ?? actor.userId, id],
    );

    return { promoted: true, project_id: String(project.id), customer_id: String(customerId), customer_created: customerCreated };
  },

  /** 来場チェックの切替 (checkedIn=true で受付、false で取消) */
  async setCheckIn(id: string, checkedIn: boolean, userName?: string | null): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT id FROM inview_registrations WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '来場予約が見つかりません');
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

  /**
   * 同行者1人の来場チェック (checkedIn=true で受付、false で取消)。
   *
   * 代表者の受付とは独立に切り替える。当日は「代表だけ先に来て同行者は後から」
   * のような入り方が普通にあるため、まとめて1つの状態にすると誰が来ているのか
   * 分からなくなる。companions (JSONB) の該当要素だけを書き換える。
   */
  async setCompanionCheckIn(
    id: string,
    companionId: string,
    checkedIn: boolean,
    userName?: string | null,
  ): Promise<Record<string, unknown>> {
    const existing = await queryOne(
      `SELECT id, companions FROM inview_registrations WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!existing) throw new AppError(404, 'NOT_FOUND', '来場予約が見つかりません');

    const companions = readCompanions((existing as Record<string, unknown>).companions);
    const idx = companions.findIndex((c) => c.id === companionId);
    if (idx < 0) throw new AppError(404, 'NOT_FOUND', '同行者が見つかりません');

    companions[idx] = {
      ...companions[idx],
      checked_in_at: checkedIn ? new Date().toISOString() : null,
      checked_in_by: checkedIn ? (userName ?? null) : null,
    };
    await execute(
      `UPDATE inview_registrations SET companions = ?::jsonb, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(companions), id],
    );
    return (await this.getById(id))!;
  },
};
