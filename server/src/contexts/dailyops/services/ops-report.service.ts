import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';

// 日常業務アプリ (dailyops) — 汎用レポート基盤の service 層。
// API (reports.routes) と MCP (opsreports.tools) の両方から使う。
//
// モデル:
// - ops_reports      … kind × period_key で 1 本 (週報/日報/今後の小メニュー)
// - ops_report_items … レポート内の行 (1 行 = 1 項目)。AI と人間が行単位で追加する。
// AI の report upsert は本体 (title/body/payload/status) のみを更新し、items には一切触らない。

export const OPS_REPORT_KINDS = ['weekly_activity', 'daily_news'] as const;
export type OpsReportKind = (typeof OPS_REPORT_KINDS)[number];

export interface OpsReportItemInput {
  category?: string | null;
  content: string;
  note?: string | null;
  url?: string | null;
  ai_related?: boolean | null;
  pick?: number | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDateStr(value: string, label: string): void {
  if (!DATE_RE.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new AppError(400, `${label} は YYYY-MM-DD 形式で指定してください`, 'VALIDATION_ERROR');
  }
}

/** ローカル日付 (UTC 依存を避けるため文字列演算ベース) の Date を YYYY-MM-DD にする */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 任意の日付を「その週の月曜日」に正規化する (週次レポートの period_key の唯一の真実源) */
export function normalizeWeekStart(dateStr: string): string {
  assertDateStr(dateStr, 'week_start');
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = d.getDay(); // 0=日, 1=月, ...
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

/** 既定の週 = 先週の月曜日 (週明けに前週分をまとめる運用を想定) */
export function defaultWeekStart(now = new Date()): string {
  const thisMonday = normalizeWeekStart(toDateStr(now));
  const d = new Date(`${thisMonday}T00:00:00`);
  d.setDate(d.getDate() - 7);
  return toDateStr(d);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** kind に応じて period_key を正規化する (週次=月曜へ丸め、日次=日付検証のみ) */
export function normalizePeriodKey(kind: string, periodKey: string): string {
  assertDateStr(periodKey, 'period_key');
  if (kind === 'weekly_activity') return normalizeWeekStart(periodKey);
  return periodKey;
}

function assertKind(kind: string): asserts kind is OpsReportKind {
  if (!(OPS_REPORT_KINDS as readonly string[]).includes(kind)) {
    throw new AppError(400, `kind は ${OPS_REPORT_KINDS.join(' / ')} のいずれかを指定してください`, 'VALIDATION_ERROR');
  }
}

export interface UpsertReportInput {
  kind: string;
  period_key: string;
  title?: string;
  body?: string;
  payload?: unknown;
  status?: 'draft' | 'published';
  requested_by?: string | null;
  created_by?: string | null;
}

export const opsReportService = {
  /**
   * レポート本体の upsert (kind × period_key で 1 本)。
   * 既存があれば「渡されたフィールドだけ」を更新し、items には一切触らない。
   * published 済みのレポートを draft に戻すことはしない (人間の確定を AI が覆さない)。
   */
  async upsertReport(input: UpsertReportInput): Promise<{ report: Record<string, unknown>; action: 'created' | 'updated' }> {
    assertKind(input.kind);
    const periodKey = normalizePeriodKey(input.kind, input.period_key);
    if (input.status && !['draft', 'published'].includes(input.status)) {
      throw new AppError(400, 'status は draft / published のいずれかです', 'VALIDATION_ERROR');
    }

    const existing = await queryOne(
      `SELECT * FROM ops_reports WHERE kind = ? AND period_key = ? AND deleted_at IS NULL`,
      [input.kind, periodKey],
    );

    if (!existing) {
      const id = uuidv4();
      const status = input.status ?? 'draft';
      await execute(
        `INSERT INTO ops_reports (id, kind, period_key, title, body, payload, status, requested_by, created_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?, CASE WHEN ? = 'published' THEN NOW() ELSE NULL END)`,
        [
          id, input.kind, periodKey,
          input.title ?? '', input.body ?? '',
          input.payload !== undefined ? JSON.stringify(input.payload) : null,
          status, input.requested_by ?? null, input.created_by ?? null, status,
        ],
      );
      const report = await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]);
      return { report: report!, action: 'created' };
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.title !== undefined) { sets.push('title = ?'); params.push(input.title); }
    if (input.body !== undefined) { sets.push('body = ?'); params.push(input.body); }
    if (input.payload !== undefined) { sets.push('payload = ?::jsonb'); params.push(JSON.stringify(input.payload)); }
    if (input.requested_by !== undefined && input.requested_by !== null) {
      sets.push('requested_by = ?'); params.push(input.requested_by);
    }
    // published 済みは draft に戻さない。draft → published は published_at を打刻。
    if (input.status && existing.status !== 'published') {
      sets.push('status = ?'); params.push(input.status);
      if (input.status === 'published') sets.push('published_at = NOW()');
    }
    sets.push('updated_at = NOW()');
    params.push(existing.id);
    await execute(`UPDATE ops_reports SET ${sets.join(', ')} WHERE id = ?`, params);
    const report = await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [existing.id]);
    return { report: report!, action: 'updated' };
  },

  /** kind + period_key で空レポートを確保して返す (人が AI より先に記入し始めるケース用) */
  async ensureReport(kind: string, periodKey: string, createdBy?: string | null): Promise<Record<string, unknown>> {
    assertKind(kind);
    const normalized = normalizePeriodKey(kind, periodKey);
    const existing = await queryOne(
      `SELECT * FROM ops_reports WHERE kind = ? AND period_key = ? AND deleted_at IS NULL`,
      [kind, normalized],
    );
    if (existing) return existing;
    const { report } = await this.upsertReport({ kind, period_key: normalized, created_by: createdBy ?? null });
    return report;
  },

  async listReports(filter: { kind?: string; status?: string; page?: number; limit?: number }): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const conds: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filter.kind) { assertKind(filter.kind); conds.push('r.kind = ?'); params.push(filter.kind); }
    if (filter.status) { conds.push('r.status = ?'); params.push(filter.status); }
    const where = conds.join(' AND ');
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const page = Math.max(1, filter.page ?? 1);
    const totalRow = await queryOne(`SELECT COUNT(*) AS c FROM ops_reports r WHERE ${where}`, params);
    const rows = await queryAll(
      `SELECT r.id, r.kind, r.period_key, r.title, r.status,
              r.requested_by, r.created_by, r.reviewed_at, r.reviewed_by, r.published_at,
              r.created_at, r.updated_at,
              (SELECT COUNT(*) FROM ops_report_items i WHERE i.report_id = r.id AND i.deleted_at IS NULL) AS item_count
       FROM ops_reports r
       WHERE ${where}
       ORDER BY r.period_key DESC, r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit],
    );
    return { rows, total: Number(totalRow?.c ?? 0) };
  },

  async getReportItems(reportId: string): Promise<Record<string, unknown>[]> {
    return queryAll(
      `SELECT * FROM ops_report_items
       WHERE report_id = ? AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
      [reportId],
    );
  },

  async getReportById(id: string): Promise<Record<string, unknown> | undefined> {
    const report = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!report) return undefined;
    return { ...report, items: await this.getReportItems(id) };
  },

  async getReportByPeriod(kind: string, periodKey: string): Promise<Record<string, unknown> | undefined> {
    assertKind(kind);
    const normalized = normalizePeriodKey(kind, periodKey);
    const report = await queryOne(
      `SELECT * FROM ops_reports WHERE kind = ? AND period_key = ? AND deleted_at IS NULL`,
      [kind, normalized],
    );
    if (!report) return undefined;
    return { ...report, items: await this.getReportItems(report.id as string) };
  },

  /**
   * 行の追加。dedupeUrl=true のとき、既存行と同じ URL の行はスキップする (AI 再実行の重複防止)。
   */
  async addItems(
    reportId: string,
    items: OpsReportItemInput[],
    opts: { source: 'ai' | 'human'; recordedBy?: string | null; dedupeUrl?: boolean },
  ): Promise<{ added: number; skipped: number }> {
    const report = await queryOne(`SELECT id FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [reportId]);
    if (!report) throw new AppError(404, 'レポートが見つかりません', 'NOT_FOUND');

    const existingUrls = new Set<string>();
    if (opts.dedupeUrl) {
      const rows = await queryAll(
        `SELECT url FROM ops_report_items WHERE report_id = ? AND deleted_at IS NULL AND url IS NOT NULL`,
        [reportId],
      );
      for (const r of rows) existingUrls.add(String(r.url));
    }
    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM ops_report_items WHERE report_id = ?`,
      [reportId],
    );
    let sortOrder = Number(maxRow?.m ?? 0);

    let added = 0;
    let skipped = 0;
    for (const item of items) {
      const content = (item.content ?? '').trim();
      if (!content) { skipped++; continue; }
      if (opts.dedupeUrl && item.url && existingUrls.has(item.url)) { skipped++; continue; }
      sortOrder += 1;
      await execute(
        `INSERT INTO ops_report_items (id, report_id, category, content, note, url, ai_related, pick, recorded_by, source, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(), reportId,
          item.category ?? null, content, item.note ?? null, item.url ?? null,
          item.ai_related ?? null,
          clampPick(item.pick),
          opts.recordedBy ?? null, opts.source, sortOrder,
        ],
      );
      if (item.url) existingUrls.add(item.url);
      added++;
    }
    await execute(`UPDATE ops_reports SET updated_at = NOW() WHERE id = ?`, [reportId]);
    return { added, skipped };
  },

  async updateItem(itemId: string, fields: Partial<OpsReportItemInput>): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_report_items WHERE id = ? AND deleted_at IS NULL`, [itemId]);
    if (!existing) throw new AppError(404, '行が見つかりません', 'NOT_FOUND');
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.category !== undefined) { sets.push('category = ?'); params.push(fields.category ?? null); }
    if (fields.content !== undefined) {
      const content = (fields.content ?? '').trim();
      if (!content) throw new AppError(400, '内容 (content) は必須です', 'VALIDATION_ERROR');
      sets.push('content = ?'); params.push(content);
    }
    if (fields.note !== undefined) { sets.push('note = ?'); params.push(fields.note ?? null); }
    if (fields.url !== undefined) { sets.push('url = ?'); params.push(fields.url ?? null); }
    if (fields.ai_related !== undefined) { sets.push('ai_related = ?'); params.push(fields.ai_related ?? null); }
    if (fields.pick !== undefined) { sets.push('pick = ?'); params.push(clampPick(fields.pick)); }
    if (!sets.length) return existing;
    sets.push('updated_at = NOW()');
    params.push(itemId);
    await execute(`UPDATE ops_report_items SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await queryOne(`SELECT * FROM ops_report_items WHERE id = ?`, [itemId]))!;
  },

  async deleteItem(itemId: string): Promise<void> {
    const existing = await queryOne(`SELECT id FROM ops_report_items WHERE id = ? AND deleted_at IS NULL`, [itemId]);
    if (!existing) throw new AppError(404, '行が見つかりません', 'NOT_FOUND');
    await execute(`UPDATE ops_report_items SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [itemId]);
  },

  /** 週報の確定: published + published_at + reviewed_at/by を打刻 */
  async publishReport(id: string, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'レポートが見つかりません', 'NOT_FOUND');
    await execute(
      `UPDATE ops_reports SET status = 'published', published_at = COALESCE(published_at, NOW()),
              reviewed_at = NOW(), reviewed_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [userId, id],
    );
    return (await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]))!;
  },

  /** 確認のみ (日次ニュースの既読相当): reviewed_at/by だけ記録 */
  async reviewReport(id: string, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'レポートが見つかりません', 'NOT_FOUND');
    await execute(
      `UPDATE ops_reports SET reviewed_at = NOW(), reviewed_by = ?, updated_at = NOW() WHERE id = ?`,
      [userId, id],
    );
    return (await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]))!;
  },
};

function clampPick(pick: number | null | undefined): number | null {
  if (pick === null || pick === undefined) return null;
  const n = Math.round(Number(pick));
  if (Number.isNaN(n)) return null;
  return Math.min(5, Math.max(1, n));
}
