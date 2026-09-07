import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { projectService } from './project.service';
import { getMonthlySummary } from '../../finance/services/monthly-summary.service';
import { listKpt, listKptForProjects } from './kpt.service';
// 2026年10月の事業再編（docs/reorg-2026-10-plan.md §4.6・P2 Round 1）:
// 月次予算・実績補正は会社（entity_code）ごとに持つ（migration 288・PK が (entity_code, year_month) に）
import { CURRENT_ENTITY_CODE } from '../../../shared/constants/entity-default';
import type { LegalEntityCode } from '../../platform/services/legal-entity.service';
// 隔週キープの計算列・稼働率の設定（純粋関数は keep-report-rules.ts。テストが直接固定する）
import {
  varianceOf, sumBudgetFields, normalizeUtilizationSettings, mergeUtilizationSettings, type UtilizationSettings,
} from './keep-report-rules';

/** 計上会社の並び（legal_entities の sort_order と同じ。'all' の合計はこの3社） */
const ENTITY_CODES: readonly LegalEntityCode[] = ['GJV', 'GSS', 'GMO'];
const UTILIZATION_KEY = 'utilization';
const YM_RANGE_RE = /^\d{4}-\d{2}$/;
function assertYmRange(range: { from: string; to: string }): void {
  if (!YM_RANGE_RE.test(range.from) || !YM_RANGE_RE.test(range.to) || range.from > range.to) {
    throw new AppError(400, 'VALIDATION_ERROR', 'from / to は YYYY-MM で from ≦ to');
  }
}

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
  async getBudget(ym: string, entityCode: LegalEntityCode = CURRENT_ENTITY_CODE) {
    const r = await queryOne(
      'SELECT * FROM monthly_budgets WHERE entity_code = ? AND year_month = ?', [entityCode, ym],
    ) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      year_month: r.year_month,
      entity_code: r.entity_code,
      revenue: num(r.revenue),
      cogs_fixed: num(r.cogs_fixed),
      cogs_variable: num(r.cogs_variable),
      sga: num(r.sga),
      operating_profit: num(r.operating_profit),
      updated_at: r.updated_at,
    };
  },

  /** 期間内の全会社の予算（YYYY-MM の範囲・両端を含む）。「お金のルール」の入力表と隔週キープの推移用 */
  async listBudgets(range: { from: string; to: string }) {
    assertYmRange(range);
    const rows = await queryAll(
      'SELECT * FROM monthly_budgets WHERE year_month >= ? AND year_month <= ? ORDER BY year_month, entity_code',
      [range.from, range.to],
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      year_month: String(r.year_month),
      entity_code: r.entity_code as LegalEntityCode,
      revenue: num(r.revenue),
      cogs_fixed: num(r.cogs_fixed),
      cogs_variable: num(r.cogs_variable),
      sga: num(r.sga),
      operating_profit: num(r.operating_profit),
      updated_at: r.updated_at,
    }));
  },

  /**
   * 渡したフィールドだけ更新する。**`undefined` は「渡さなかった＝今の値を保つ」、明示の `null` は
   * 「消す」**（`upsertOverride`・`saveMoneyRules` と同じ契約）。`??` で畳むと null が「保つ」に化け、
   * 「お金のルール」で目標の升を空にしても消えない（実測して直した）。MCP は省略を undefined で渡す。
   */
  async upsertBudget(
    ym: string,
    fields: {
      revenue?: number | null; cogs_fixed?: number | null; cogs_variable?: number | null;
      sga?: number | null; operating_profit?: number | null;
    },
    entityCode: LegalEntityCode = CURRENT_ENTITY_CODE,
  ) {
    const existing = await this.getBudget(ym, entityCode);
    const pick = (next: number | null | undefined, current: number | null | undefined): number | null =>
      (next !== undefined ? next : current ?? null);
    const merged = {
      revenue: pick(fields.revenue, existing?.revenue),
      cogs_fixed: pick(fields.cogs_fixed, existing?.cogs_fixed),
      cogs_variable: pick(fields.cogs_variable, existing?.cogs_variable),
      sga: pick(fields.sga, existing?.sga),
      operating_profit: pick(fields.operating_profit, existing?.operating_profit),
    };
    // 営業利益: 明示指定が無く構成要素が揃っていれば自動計算（明示の null は「消す」なので計算しない）
    if (fields.operating_profit === undefined
        && merged.revenue != null && merged.cogs_fixed != null && merged.cogs_variable != null && merged.sga != null) {
      merged.operating_profit = merged.revenue - merged.cogs_fixed - merged.cogs_variable - merged.sga;
    }
    await execute(
      `INSERT INTO monthly_budgets (entity_code, year_month, revenue, cogs_fixed, cogs_variable, sga, operating_profit)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (entity_code, year_month) DO UPDATE SET
         revenue = EXCLUDED.revenue, cogs_fixed = EXCLUDED.cogs_fixed, cogs_variable = EXCLUDED.cogs_variable,
         sga = EXCLUDED.sga, operating_profit = EXCLUDED.operating_profit, updated_at = NOW()`,
      [entityCode, ym, merged.revenue, merged.cogs_fixed, merged.cogs_variable, merged.sga, merged.operating_profit],
    );
    return { action: existing ? 'updated' as const : 'created' as const, budget: (await this.getBudget(ym, entityCode))! };
  },

  async getOverride(ym: string, entityCode: LegalEntityCode = CURRENT_ENTITY_CODE) {
    const r = await queryOne(
      'SELECT * FROM monthly_actual_overrides WHERE entity_code = ? AND year_month = ?', [entityCode, ym],
    ) as Record<string, unknown> | null;
    if (!r) return null;
    return {
      year_month: r.year_month,
      entity_code: r.entity_code,
      cogs_fixed_actual: num(r.cogs_fixed_actual),
      sga_actual: num(r.sga_actual),
      note: r.note,
      updated_at: r.updated_at,
    };
  },

  /** 期間内の全会社の補正値（YYYY-MM の範囲・両端を含む） */
  async listOverrides(range: { from: string; to: string }) {
    assertYmRange(range);
    const rows = await queryAll(
      'SELECT * FROM monthly_actual_overrides WHERE year_month >= ? AND year_month <= ? ORDER BY year_month, entity_code',
      [range.from, range.to],
    ) as Record<string, unknown>[];
    return rows.map((r) => ({
      year_month: String(r.year_month),
      entity_code: r.entity_code as LegalEntityCode,
      cogs_fixed_actual: num(r.cogs_fixed_actual),
      sga_actual: num(r.sga_actual),
      note: (r.note as string | null) ?? null,
      updated_at: r.updated_at,
    }));
  },

  async upsertOverride(
    ym: string,
    fields: { cogs_fixed_actual?: number | null; sga_actual?: number | null; note?: string | null },
    entityCode: LegalEntityCode = CURRENT_ENTITY_CODE,
  ) {
    const existing = await this.getOverride(ym, entityCode);
    const merged = {
      cogs_fixed_actual: fields.cogs_fixed_actual !== undefined ? fields.cogs_fixed_actual : existing?.cogs_fixed_actual ?? null,
      sga_actual: fields.sga_actual !== undefined ? fields.sga_actual : existing?.sga_actual ?? null,
      note: fields.note !== undefined ? fields.note : existing?.note ?? null,
    };
    await execute(
      `INSERT INTO monthly_actual_overrides (entity_code, year_month, cogs_fixed_actual, sga_actual, note)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (entity_code, year_month) DO UPDATE SET
         cogs_fixed_actual = EXCLUDED.cogs_fixed_actual, sga_actual = EXCLUDED.sga_actual,
         note = EXCLUDED.note, updated_at = NOW()`,
      [entityCode, ym, merged.cogs_fixed_actual, merged.sga_actual, merged.note],
    );
    return { action: existing ? 'updated' as const : 'created' as const, override: (await this.getOverride(ym, entityCode))! };
  },

  /**
   * 損益ページの単一入口: 予算 / 補正込み実績 / 対目標差・比・判定。
   *
   * `scope` は会社1つ（既定は今の会社 = GSS。既存の呼び出し・MCP はそのまま）か `'all'`（隔週キープの
   * 「全体（統合）」）。`'all'` の予算は**3社の合計**（1つも無ければ null・按分しない）、実績は会社ごとに
   * 「補正があればそれ、無ければ集計」を足す（片方の会社だけ経理確定した月に、もう片方の集計値が
   * 落ちないように）。
   * 判定 (要件書 §2.5): 売上・利益系 実績≧目標→○ / 費用系 実績≦目標→○ / 目標未登録→"-"。
   * 対目標比は `keep-report-rules.ts` の `varianceOf`（目標が赤字の行は 9/4 の資料の式）。
   */
  async getMonthlyPl(ym: string, scope: LegalEntityCode | 'all' = CURRENT_ENTITY_CODE) {
    const entityCode: LegalEntityCode | null = scope === 'all' ? null : scope;
    const [allBudgets, allOverrides] = await Promise.all([
      this.listBudgets({ from: ym, to: ym }),
      this.listOverrides({ from: ym, to: ym }),
    ]);
    const budgets = entityCode ? allBudgets.filter((b) => b.entity_code === entityCode) : allBudgets;
    const overrides = entityCode ? allOverrides.filter((o) => o.entity_code === entityCode) : allOverrides;

    let revenue = 0;
    let cogsVariable = 0;
    let cogsFixed = 0;
    let sga = 0;
    if (entityCode) {
      const summary = await getMonthlySummary({ month: ym, entityCode });
      const ov = overrides[0] ?? null;
      revenue = Number(summary.revenue_total);
      cogsVariable = Number(summary.variable_cost_total);
      cogsFixed = ov?.cogs_fixed_actual ?? Number(summary.fixed_cost_total);
      sga = ov?.sga_actual ?? Number(summary.sga_total);
    } else if (overrides.length === 0) {
      // 補正が1つも無ければ全社集計そのまま（クエリ4本）
      const summary = await getMonthlySummary({ month: ym });
      revenue = Number(summary.revenue_total);
      cogsVariable = Number(summary.variable_cost_total);
      cogsFixed = Number(summary.fixed_cost_total);
      sga = Number(summary.sga_total);
    } else {
      const summaries = await Promise.all(ENTITY_CODES.map((code) => getMonthlySummary({ month: ym, entityCode: code })));
      ENTITY_CODES.forEach((code, i) => {
        const sm = summaries[i];
        const ov = overrides.find((o) => o.entity_code === code) ?? null;
        revenue += Number(sm.revenue_total);
        cogsVariable += Number(sm.variable_cost_total);
        cogsFixed += ov?.cogs_fixed_actual ?? Number(sm.fixed_cost_total);
        sga += ov?.sga_actual ?? Number(sm.sga_total);
      });
    }

    const budgetFields = sumBudgetFields(budgets);
    const latest = budgets.map((b) => b.updated_at).filter((v): v is NonNullable<typeof v> => v != null).sort().at(-1) ?? null;
    const budget = budgetFields ? { year_month: ym, entity_code: scope, ...budgetFields, updated_at: latest } : null;
    const marginalProfit = revenue - cogsVariable;
    const grossProfit = marginalProfit - cogsFixed;
    const operatingProfit = grossProfit - sga;
    const notes = overrides.filter((o) => o.note);
    const overrideNote = notes.length === 0 ? null
      : notes.length === 1 && entityCode ? notes[0].note
      : notes.map((o) => `${o.entity_code}: ${o.note}`).join(' ／ ');
    return {
      year_month: ym,
      entity_code: scope,
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
      has_override: overrides.length > 0,
      override_note: overrideNote,
      /** 会社を指定したときのその会社の補正（'all' は null。内訳は overrides） */
      override: entityCode ? (overrides[0] ?? null) : null,
      /** この月に効いた補正の行（0〜3件） */
      overrides,
    };
  },

  // ============================================================
  // 稼働率の数え方 (keep_settings.key = 'utilization'・keep-report.md §5.4)
  // ============================================================

  /** 無ければ既定（メンテナンス以外を全部数える・土曜は営業日にしない）。壊れた値は整えて返す */
  async getUtilizationSettings(): Promise<UtilizationSettings & { updated_at: unknown; updated_by: string | null }> {
    const r = await queryOne(
      'SELECT value, updated_at, updated_by FROM keep_settings WHERE key = ?', [UTILIZATION_KEY],
    ) as Record<string, unknown> | null;
    return {
      ...normalizeUtilizationSettings(r?.value),
      updated_at: r?.updated_at ?? null,
      updated_by: (r?.updated_by as string | null) ?? null,
    };
  },

  /** 渡した鍵だけ更新。知らない種別・真偽値でない土曜の指定は 400 */
  async setUtilizationSettings(patch: unknown, userId: string) {
    const current = await this.getUtilizationSettings();
    const merged = mergeUtilizationSettings(
      { counted_types: current.counted_types, count_saturday: current.count_saturday }, patch,
    );
    if (!merged.ok) throw new AppError(400, 'VALIDATION_ERROR', merged.reason);
    await execute(
      `INSERT INTO keep_settings (key, value, updated_by) VALUES (?, ?::jsonb, ?)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
      [UTILIZATION_KEY, JSON.stringify(merged.value), userId],
    );
    return await this.getUtilizationSettings();
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
