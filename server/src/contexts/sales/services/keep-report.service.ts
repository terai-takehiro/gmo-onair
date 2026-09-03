import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { projectService } from './project.service';
import { getMonthlySummary } from '../../finance/services/monthly-summary.service';
import { listKpt, listKptForProjects } from './kpt.service';

// 隔週キープ資料 (報告資料) の基礎データ service。
// UI (案件管理アプリの報告資料ページ) と MCP ツール (eventreports/budget/minutes.tools) の
// 両方がこの service を通ることで、画面と AI が同じ結果・同じ副作用になる。
//   Phase 1: event_reports (イベント実施報告 — 案件 1:1)
//   Phase 2: monthly_budgets + monthly_actual_overrides (予算 / 経理確定値補正) + 損益 (目標 vs 実績)
//   Phase 3: meeting_minutes (議事録サマリ)

export interface PhotoEntry {
  id: string;
  box_file_id: string;
  caption: string | null;
  sort_order: number;
}

export interface EventReportUpsert {
  headline?: string;
  attendees_onsite?: number;
  attendees_online?: number;
  attendees_note?: string;
  report_status?: 'draft' | 'confirmed';
  reported_at?: string;
}

/** BIGINT は pg から string で返るため数値化 (null は保持) */
function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

async function assertProject(projectId: string): Promise<Record<string, unknown>> {
  const p = await queryOne(
    'SELECT id, name, gls_number, event_start, event_end FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  ) as Record<string, unknown> | null;
  if (!p) throw new AppError(404, 'NOT_FOUND', '案件が見つかりません (project_id を確認してください)');
  return p;
}

export const keepReportService = {
  // ============================================================
  // Phase 1: イベント実施報告
  // ============================================================
  async getEventReportByProject(projectId: string) {
    return await queryOne('SELECT * FROM event_reports WHERE project_id = ?', [projectId]) as Record<string, unknown> | null;
  },

  async getEventReportWithProject(projectId: string) {
    const project = await assertProject(projectId);
    const report = await this.getEventReportByProject(projectId);
    // **まだ書いていなくてもお金の実績は返す。** 売上・仕入は書いたかどうかと
    // 関係なく存在するので、`found=false` のときに落とすと
    // ふりかえりの画面が「売上 —」で始まる（実測して直した）
    const summary = await projectService.getSummary(projectId);
    // **KPT は報告そのものが無くても返す。** `highlights` を畳んだ先が別の表に
    // なったので (migration 185)、`found=false` のときに落とすと
    // 「AI の下書きだけ入っている案件」の中身が画面から消えます
    const kpt = await listKpt(projectId);
    if (!report) {
      return {
        found: false as const,
        project: {
          id: project.id, name: project.name, gls_number: project.gls_number,
          event_start: project.event_start, event_end: project.event_end,
        },
        summary,
        kpt,
      };
    }
    return {
      found: true as const,
      report,
      project: { id: project.id, name: project.name, gls_number: project.gls_number, event_start: project.event_start, event_end: project.event_end },
      summary,
      kpt,
    };
  },

  async listEventReports(filter: { status?: 'confirmed' | 'draft' | 'all'; reportedFrom?: string; reportedTo?: string; limit?: number }) {
    const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    const status = filter.status ?? 'confirmed';
    if (status !== 'all') { where += ' AND r.report_status = ?'; params.push(status); }
    if (filter.reportedFrom) { where += ' AND r.reported_at >= ?'; params.push(filter.reportedFrom); }
    if (filter.reportedTo) { where += ' AND r.reported_at <= ?'; params.push(filter.reportedTo); }
    const rows = await queryAll(
      `SELECT r.*, p.name AS project_name, p.gls_number, p.event_start, p.event_end, p.stage
       FROM event_reports r
       JOIN projects p ON p.id = r.project_id AND p.deleted_at IS NULL
       ${where}
       ORDER BY r.reported_at DESC NULLS LAST, r.updated_at DESC
       LIMIT ?`,
      [...params, limit],
    ) as Record<string, unknown>[];
    // **行ごとに引かない**（N+1）。行ごとに getSummary（5クエリ）+ listKpt を
    // 並列に投げると、50行で数百クエリが一斉にプールへ押し寄せる
    const ids = rows.map((r) => r.project_id as string);
    const [summaries, kpts] = await Promise.all([
      projectService.getSummaries(ids),
      /*
       * ⚠️ **確かめた行だけ**（レビューでの指摘 #83）。
       * この一覧は**隔週キープの資料**と MCP の `list_event_reports` が読みます。
       * AI が起こしたまま誰も確かめていない K/P/T が混ざると、
       * **AI の推測がそのまま実施報告として資料に載ります**
       * （migration 185 が禁じている形。案件詳細のふりかえりでは全部見えます）。
       */
      listKptForProjects(ids, { confirmedOnly: true }),
    ]);
    return rows.map((r) => ({
      ...r,
      summary: summaries.get(r.project_id as string)!,
      kpt: kpts.get(r.project_id as string) ?? [],
    }));
  },

  /** レポート未作成の報告候補 (直近 N 日にイベントが終了した / 完了した案件) */
  async listEventReportCandidates(days = 60) {
    const rows = await queryAll(
      `SELECT p.id, p.name, p.gls_number, p.stage, p.event_start, p.event_end
       FROM projects p
       LEFT JOIN event_reports r ON r.project_id = p.id
       WHERE p.deleted_at IS NULL
         AND r.id IS NULL
         AND (
           p.stage IN ('r_delivered', 's_completed')
           OR (p.stage = 'a_won' AND NULLIF(p.event_end, '') IS NOT NULL AND p.event_end < CURRENT_DATE::text)
         )
         AND COALESCE(NULLIF(p.event_end, ''), NULLIF(p.event_start, ''), '9999-12-31')
             >= (CURRENT_DATE - (? || ' days')::interval)::text
       ORDER BY COALESCE(NULLIF(p.event_end, ''), p.event_start) DESC NULLS LAST
       LIMIT 50`,
      [days],
    ) as Record<string, unknown>[];
    // 一覧と同じく行ごとに getSummary を呼ばない（N+1）
    const summaries = await projectService.getSummaries(rows.map((p) => p.id as string));
    return rows.map((p) => ({
      ...p,
      summary: summaries.get(p.id as string)!,
    }));
  },

  /** 渡したフィールドのみ更新 (マージ)。無ければ作成。 */
  async upsertEventReport(projectId: string, fields: EventReportUpsert) {
    await assertProject(projectId);
    const existing = await this.getEventReportByProject(projectId);
    let action: 'created' | 'updated';
    let id: string;
    if (!existing) {
      id = uuidv4();
      action = 'created';
      await execute(
        `INSERT INTO event_reports (id, project_id, headline, attendees_onsite, attendees_online, attendees_note, report_status, reported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, fields.headline ?? null,
         fields.attendees_onsite ?? null, fields.attendees_online ?? null, fields.attendees_note ?? null,
         fields.report_status ?? 'draft', fields.reported_at ?? null],
      );
    } else {
      id = existing.id as string;
      action = 'updated';
      const sets: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      if (fields.headline !== undefined) { sets.push('headline = ?'); params.push(fields.headline); }
      if (fields.attendees_onsite !== undefined) { sets.push('attendees_onsite = ?'); params.push(fields.attendees_onsite); }
      if (fields.attendees_online !== undefined) { sets.push('attendees_online = ?'); params.push(fields.attendees_online); }
      if (fields.attendees_note !== undefined) { sets.push('attendees_note = ?'); params.push(fields.attendees_note); }
      if (fields.report_status !== undefined) { sets.push('report_status = ?'); params.push(fields.report_status); }
      if (fields.reported_at !== undefined) { sets.push('reported_at = ?'); params.push(fields.reported_at); }
      await execute(`UPDATE event_reports SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    }
    const row = await this.getEventReportByProject(projectId);
    return { id, action, report: row! };
  },

  async attachEventPhoto(projectId: string, photo: { box_file_id: string; caption?: string; sort_order?: number }) {
    await assertProject(projectId);
    let report = await this.getEventReportByProject(projectId);
    if (!report) {
      await execute(`INSERT INTO event_reports (id, project_id, report_status) VALUES (?, ?, 'draft')`, [uuidv4(), projectId]);
      report = await this.getEventReportByProject(projectId);
    }
    const photos = (report!.photos ?? []) as PhotoEntry[];
    const entry: PhotoEntry = {
      id: uuidv4(),
      box_file_id: photo.box_file_id,
      caption: photo.caption ?? null,
      sort_order: photo.sort_order ?? (photos.length > 0 ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0),
    };
    photos.push(entry);
    photos.sort((a, b) => a.sort_order - b.sort_order);
    await execute(`UPDATE event_reports SET photos = ?::jsonb, updated_at = NOW() WHERE id = ?`, [JSON.stringify(photos), report!.id]);
    return { photo_id: entry.id, photo_count: photos.length, photos };
  },

  async detachEventPhoto(photoId: string) {
    const report = await queryOne(
      `SELECT id, project_id, photos FROM event_reports
       WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(photos) e WHERE e->>'id' = ?)`,
      [photoId],
    ) as Record<string, unknown> | null;
    if (!report) throw new AppError(404, 'NOT_FOUND', 'その photo_id の写真が見つかりません');
    const photos = (report.photos as PhotoEntry[]).filter((p) => p.id !== photoId);
    await execute(`UPDATE event_reports SET photos = ?::jsonb, updated_at = NOW() WHERE id = ?`, [JSON.stringify(photos), report.id]);
    return { project_id: report.project_id as string, photo_count: photos.length };
  },

  // ============================================================
  // Phase 2: 月次予算 + 実績補正 + 損益 (目標 vs 実績)
  // ============================================================
  async getBudget(ym: string) {
    const r = await queryOne('SELECT * FROM monthly_budgets WHERE year_month = ?', [ym]) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      year_month: r.year_month,
      revenue: num(r.revenue),
      cogs_fixed: num(r.cogs_fixed),
      cogs_variable: num(r.cogs_variable),
      sga: num(r.sga),
      operating_profit: num(r.operating_profit),
      updated_at: r.updated_at,
    };
  },

  async upsertBudget(ym: string, fields: { revenue?: number; cogs_fixed?: number; cogs_variable?: number; sga?: number; operating_profit?: number }) {
    const existing = await this.getBudget(ym);
    const merged = {
      revenue: fields.revenue ?? existing?.revenue ?? null,
      cogs_fixed: fields.cogs_fixed ?? existing?.cogs_fixed ?? null,
      cogs_variable: fields.cogs_variable ?? existing?.cogs_variable ?? null,
      sga: fields.sga ?? existing?.sga ?? null,
      operating_profit: fields.operating_profit ?? existing?.operating_profit ?? null,
    };
    // 営業利益: 明示指定が無く構成要素が揃っていれば自動計算
    if (fields.operating_profit === undefined
        && merged.revenue != null && merged.cogs_fixed != null && merged.cogs_variable != null && merged.sga != null) {
      merged.operating_profit = merged.revenue - merged.cogs_fixed - merged.cogs_variable - merged.sga;
    }
    await execute(
      `INSERT INTO monthly_budgets (year_month, revenue, cogs_fixed, cogs_variable, sga, operating_profit)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (year_month) DO UPDATE SET
         revenue = EXCLUDED.revenue, cogs_fixed = EXCLUDED.cogs_fixed, cogs_variable = EXCLUDED.cogs_variable,
         sga = EXCLUDED.sga, operating_profit = EXCLUDED.operating_profit, updated_at = NOW()`,
      [ym, merged.revenue, merged.cogs_fixed, merged.cogs_variable, merged.sga, merged.operating_profit],
    );
    return { action: existing ? 'updated' as const : 'created' as const, budget: (await this.getBudget(ym))! };
  },

  async getOverride(ym: string) {
    const r = await queryOne('SELECT * FROM monthly_actual_overrides WHERE year_month = ?', [ym]) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      year_month: r.year_month,
      cogs_fixed_actual: num(r.cogs_fixed_actual),
      sga_actual: num(r.sga_actual),
      note: r.note,
      updated_at: r.updated_at,
    };
  },

  async upsertOverride(ym: string, fields: { cogs_fixed_actual?: number | null; sga_actual?: number | null; note?: string | null }) {
    const existing = await this.getOverride(ym);
    const merged = {
      cogs_fixed_actual: fields.cogs_fixed_actual !== undefined ? fields.cogs_fixed_actual : existing?.cogs_fixed_actual ?? null,
      sga_actual: fields.sga_actual !== undefined ? fields.sga_actual : existing?.sga_actual ?? null,
      note: fields.note !== undefined ? fields.note : existing?.note ?? null,
    };
    await execute(
      `INSERT INTO monthly_actual_overrides (year_month, cogs_fixed_actual, sga_actual, note)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (year_month) DO UPDATE SET
         cogs_fixed_actual = EXCLUDED.cogs_fixed_actual, sga_actual = EXCLUDED.sga_actual,
         note = EXCLUDED.note, updated_at = NOW()`,
      [ym, merged.cogs_fixed_actual, merged.sga_actual, merged.note],
    );
    return { action: existing ? 'updated' as const : 'created' as const, override: (await this.getOverride(ym))! };
  },

  /**
   * 損益ページの単一入口: 予算 / 補正込み実績 / 対目標差・比・判定。
   * 判定 (要件書 §2.5): 売上・利益系 実績≧目標→○ / 費用系 実績≦目標→○ / 目標未登録→"-"
   */
  async getMonthlyPl(ym: string) {
    const [budget, override, summary] = await Promise.all([
      this.getBudget(ym),
      this.getOverride(ym),
      getMonthlySummary({ month: ym }),
    ]);
    const revenue = Number(summary.revenue_total);
    const cogsVariable = Number(summary.variable_cost_total);
    const cogsFixed = override?.cogs_fixed_actual ?? Number(summary.fixed_cost_total);
    const sga = override?.sga_actual ?? Number(summary.sga_total);
    const marginalProfit = revenue - cogsVariable;
    const grossProfit = marginalProfit - cogsFixed;
    const operatingProfit = grossProfit - sga;
    const varianceOf = (actual: number, b: number | null, kind: 'higher_better' | 'lower_better') => {
      if (b == null) return { actual, budget: null, diff: null, ratio: null, judge: '-' };
      const diff = actual - b;
      const ratio = b !== 0 ? Math.round((actual / b) * 1000) / 10 : null;
      const judge = kind === 'higher_better' ? (actual >= b ? '○' : '✕') : (actual <= b ? '○' : '✕');
      return { actual, budget: b, diff, ratio, judge };
    };
    return {
      year_month: ym,
      budget,
      actual: {
        revenue,
        cogs_fixed: cogsFixed,
        cogs_variable: cogsVariable,
        sga,
        marginal_profit: marginalProfit,
        gross_profit: grossProfit,
        operating_profit: operatingProfit,
      },
      variance: {
        revenue: varianceOf(revenue, budget?.revenue ?? null, 'higher_better'),
        cogs_fixed: varianceOf(cogsFixed, budget?.cogs_fixed ?? null, 'lower_better'),
        cogs_variable: varianceOf(cogsVariable, budget?.cogs_variable ?? null, 'lower_better'),
        sga: varianceOf(sga, budget?.sga ?? null, 'lower_better'),
        operating_profit: varianceOf(operatingProfit, budget?.operating_profit ?? null, 'higher_better'),
      },
      has_override: !!override,
      override_note: (override?.note as string | null) ?? null,
      override,
    };
  },

  // ============================================================
  // Phase 3: 議事録サマリ
  // ============================================================
  async getMinutes(meetingDate: string) {
    return await queryOne('SELECT * FROM meeting_minutes WHERE meeting_date = ?', [meetingDate]) as Record<string, unknown> | null;
  },

  async upsertMinutes(meetingDate: string, fields: { decisions?: string[]; topics?: Array<{ area: string; text: string }>; next_meeting_date?: string }) {
    const existing = await this.getMinutes(meetingDate);
    let action: 'created' | 'updated';
    if (!existing) {
      action = 'created';
      await execute(
        `INSERT INTO meeting_minutes (meeting_date, decisions, topics, next_meeting_date)
         VALUES (?, ?::jsonb, ?::jsonb, ?)`,
        [meetingDate, JSON.stringify(fields.decisions ?? []), JSON.stringify(fields.topics ?? []), fields.next_meeting_date ?? null],
      );
    } else {
      action = 'updated';
      const sets: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      if (fields.decisions !== undefined) { sets.push('decisions = ?::jsonb'); params.push(JSON.stringify(fields.decisions)); }
      if (fields.topics !== undefined) { sets.push('topics = ?::jsonb'); params.push(JSON.stringify(fields.topics)); }
      if (fields.next_meeting_date !== undefined) { sets.push('next_meeting_date = ?'); params.push(fields.next_meeting_date); }
      await execute(`UPDATE meeting_minutes SET ${sets.join(', ')} WHERE meeting_date = ?`, [...params, meetingDate]);
    }
    return { action, minutes: (await this.getMinutes(meetingDate))! };
  },

  async listMinutes(filter: { from?: string; to?: string; limit?: number }) {
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    if (filter.from) { where += ' AND meeting_date >= ?'; params.push(filter.from); }
    if (filter.to) { where += ' AND meeting_date <= ?'; params.push(filter.to); }
    return await queryAll(
      `SELECT * FROM meeting_minutes ${where} ORDER BY meeting_date DESC LIMIT ?`,
      [...params, limit],
    ) as Record<string, unknown>[];
  },
};
