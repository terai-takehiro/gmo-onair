import { v4 as uuidv4 } from 'uuid';
import { queryAll, queryOne, execute } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { freezeKeepPackForWeeklyReport } from './keep-pack-store.service';
import {
  findLatestAiOutput, hasCorrections, recordCorrections, type CorrectionType,
} from '../../../shared/services/ai-output.service';
import { WEEKLY_REPORT_DRAFT_KIND } from './weekly-report-ai.service';

// 日常業務アプリ (dailyops) — 汎用レポート基盤の service 層。
// API (reports.routes) と MCP (opsreports.tools) の両方から使う。
//
// モデル:
// - ops_reports      … kind × period_key で 1 本 (週報/日報/今後の小メニュー)
// - ops_report_items … レポート内の行 (1 行 = 1 項目)。AI と人間が行単位で追加する。
// AI の report upsert は本体 (title/body/payload/status) のみを更新し、items には一切触らない。

/**
 * レポートの種類。
 *
 * `mail_intake`（メール取込ログ・2026-09）は**メールの仕分けが「何を落としたか」を残すため**の
 * 1日1本の記録です。取り込んだものは各テーブルに残りますが、
 * **落とした判断はどこにも残らない**ので、取りこぼしを後から数えられませんでした
 * （実測: Kairos3 の資料ダウンロード通知 21件のうち 17件が未処理のまま、
 * 1か月誰にも気づかれなかった）。
 *
 * ⚠️ **中身の全文は入れません。** 走査した通数・種別ごとの件数・落とした件数と
 * 代表の件名だけです（メール本文は取り込んだ側の `body_text` にあります）。
 */
export const OPS_REPORT_KINDS = ['weekly_activity', 'daily_news', 'mail_intake'] as const;
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
const MONTH_RE = /^\d{4}-\d{2}$/;

function assertDateStr(value: string, label: string): void {
  if (!DATE_RE.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', `${label} は YYYY-MM-DD 形式で指定してください`);
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

/**
 * **確定した週報はもう直せない**（レビューでの指摘 #57）。
 *
 * ⚠️ **`status='published'` だけで判断しないこと。** デイリーニュースは
 * *閲覧型*で、`published` は「確定の操作が要らない種類」の印として使っています
 * （MCP が毎日 `published` で作り、人もそこへ行を足す）。種類で分けずに塞ぐと、
 * **ニュースが1行も書けなくなります**。
 *
 * 週報は違います。`published` は**人が読んで確定した**という記録で、
 * 画面もそこから先は編集させません（`WeeklyDetailPage` の `editable`）。
 * ところが守りが画面の側にしかなく、**ニュースの「週報へ送る」・MCP・
 * 直接叩き**から後から行が増えていました（送った人には成功に見えます）。
 */
const LOCKING_KINDS: readonly string[] = ['weekly_activity'];

export function isReportLocked(report: { kind?: unknown; status?: unknown }): boolean {
  return LOCKING_KINDS.includes(String(report.kind)) && report.status === 'published';
}

/** 直せない週報に書こうとしたときの断り方（**解き方まで書く**） */
function assertReportOpen(report: { kind?: unknown; status?: unknown }): void {
  if (isReportLocked(report)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'この週の報告は確定済みです。編集するには、週報の画面で「確定を取り消す」を押してください',
    );
  }
}

function assertKind(kind: string): asserts kind is OpsReportKind {
  if (!(OPS_REPORT_KINDS as readonly string[]).includes(kind)) {
    throw new AppError(400, 'VALIDATION_ERROR', `kind は ${OPS_REPORT_KINDS.join(' / ')} のいずれかを指定してください`);
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
      throw new AppError(400, 'VALIDATION_ERROR', 'status は draft / published のいずれかです');
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

    /*
     * ⚠️ 「published 済みを draft に戻さない」だけでは足りませんでした
     * （レビューでの指摘 #57）。**本文・題名・集計は素通しで上書きされて**いたので、
     * AI をもう一度走らせると**確定した週報の中身が書き換わり**ます
     * （確定した人が読んだ文章と、いま出ている文章が別物になる）。
     */
    assertReportOpen(existing);

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

  /** 行から親のレポートを引く（確定済みかを見るのに使う） */
  async reportOf(reportId: string): Promise<Record<string, unknown>> {
    const r = await queryOne(
      `SELECT id, kind, status FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [reportId],
    );
    if (!r) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    return r;
  },

  async getReportItems(reportId: string): Promise<Record<string, unknown>[]> {
    /**
     * `sent_to_weekly` は**この行がもう週報へ送られているか** (migration 167)。
     * ニュース側のボタンを「送る / 送り済み」で出し分けるために要る。
     * 週報側の行は `source_item_id` を自分で持っているのでそのまま読める。
     */
    return queryAll(
      `SELECT i.*,
              EXISTS (SELECT 1 FROM ops_report_items w
                       WHERE w.source_item_id = i.id AND w.deleted_at IS NULL) AS sent_to_weekly
         FROM ops_report_items i
        WHERE i.report_id = ? AND i.deleted_at IS NULL
        ORDER BY i.sort_order ASC, i.created_at ASC`,
      [reportId],
    );
  },

  /**
   * デイリーニュースの1行を**その日が属する週の週報へ写す** (migration 167)。
   *
   * ── なぜ「移す」ではなく「写す」なのか ──────────────────────
   *
   * ニュースはその日の記録として残り続けます。移してしまうと
   * 「その日に何があったか」が後から読めなくなります。
   *
   * ── 週は「ニュースの日付」で決める ──────────────────────────
   *
   * 押した日ではありません。金曜のニュースを月曜に送っても、**先週の週報**に
   * 入ります（押した日の週にすると、週明けにまとめる運用で全部ずれる）。
   *
   * ── 2回押しても増えない ────────────────────────────────────
   *
   * `source_item_id` に部分一意索引を張ってあります。すでに送っていれば
   * 何もせず `already: true` を返します（エラーにすると、押した人には
   * 「壊れた」ようにしか見えない）。
   */
  async sendItemToWeekly(
    itemId: string,
    userId: string,
    userName?: string | null,
  ): Promise<{ already: boolean; weekStart: string; item: Record<string, unknown> }> {
    const src = await queryOne(
      `SELECT i.*, r.kind, r.period_key
         FROM ops_report_items i
         JOIN ops_reports r ON r.id = i.report_id
        WHERE i.id = ? AND i.deleted_at IS NULL`,
      [itemId],
    ) as Record<string, unknown> | undefined;
    if (!src) throw new AppError(404, 'NOT_FOUND', '行が見つかりません');
    if (src.kind !== 'daily_news') {
      throw new AppError(400, 'VALIDATION_ERROR', '週報へ送れるのはデイリーニュースの行だけです');
    }

    const weekStart = normalizeWeekStart(String(src.period_key));

    const dup = await queryOne(
      `SELECT * FROM ops_report_items WHERE source_item_id = ? AND deleted_at IS NULL`,
      [itemId],
    ) as Record<string, unknown> | undefined;
    if (dup) return { already: true, weekStart, item: dup };

    const weekly = await this.ensureReport('weekly_activity', weekStart, userId);
    /*
     * ⚠️ **確定した週報には送れません**（レビューでの指摘 #57）。
     * ニュースの画面は週報の状態を知らないので、押した人には成功に見えたまま
     * **確定済みの週報に行が増えて**いました（読んで確定した内容と食い違う）。
     */
    assertReportOpen(weekly);
    const maxRow = await queryOne(
      `SELECT COALESCE(MAX(sort_order), 0) AS m FROM ops_report_items WHERE report_id = ?`,
      [weekly.id],
    );
    const id = uuidv4();
    await execute(
      `INSERT INTO ops_report_items
         (id, report_id, category, content, note, url, ai_related, pick, recorded_by, source, sort_order, source_item_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'human', ?, ?)`,
      [
        id, weekly.id, src.category ?? null, src.content, src.note ?? null, src.url ?? null,
        src.ai_related ?? null, src.pick ?? null,
        /*
         * `recorded_by` は**画面にそのまま出る名前**です（`TopicsSection` の記録者列）。
         * ここだけ**利用者 ID（UUID）を入れて**いたので、週報の記録者に
         * `9f3c…` が並んでいました（レビューでの指摘 #57）。
         * 送った人の名前を入れ、取れないときは**元のニュースの記録者**に落とす。
         */
        userName ?? src.recorded_by ?? null,
        Number(maxRow?.m ?? 0) + 1, itemId,
      ],
    );
    const item = await queryOne(`SELECT * FROM ops_report_items WHERE id = ?`, [id]);
    return { already: false, weekStart, item: item! };
  },

  async getReportById(id: string): Promise<Record<string, unknown> | undefined> {
    /*
     * `reviewed_by` は利用者 ID なので、そのままでは画面に出せない
     * （2026-09 の再設計で、総括カードの署名に「誰が確定したか」を出すため名前を引く）。
     * 退職などで `users` から消えていても、レポート自体は読めなければならないので LEFT JOIN。
     */
    const report = await queryOne(
      `SELECT r.*, u.name AS reviewed_by_name
         FROM ops_reports r
         LEFT JOIN users u ON u.id = r.reviewed_by
        WHERE r.id = ? AND r.deleted_at IS NULL`,
      [id],
    );
    if (!report) return undefined;
    return { ...report, items: await this.getReportItems(id) };
  },

  async getReportByPeriod(kind: string, periodKey: string): Promise<Record<string, unknown> | undefined> {
    assertKind(kind);
    const normalized = normalizePeriodKey(kind, periodKey);
    const report = await queryOne(
      `SELECT r.*, u.name AS reviewed_by_name
         FROM ops_reports r
         LEFT JOIN users u ON u.id = r.reviewed_by
        WHERE r.kind = ? AND r.period_key = ? AND r.deleted_at IS NULL`,
      [kind, normalized],
    );
    if (!report) return undefined;
    return { ...report, items: await this.getReportItems(report.id as string) };
  },

  /**
   * 月ぶんの行を日付ごとにまとめて返す (デイリーニュース報告の月表示・migration 不要)。
   *
   * **1件も無い日は含まない** — その日のレポート自体が作られていないので、
   * 空の見出しを出しても意味が無い（一覧の0件は「その月に無い」で表す）。
   *
   * ── 週報の確定状態は行ごとに計算する ─────────────────────────
   *
   * `sendItemToWeekly` と同じ規則（週はニュースの日付で決まる）で、月をまたぐと
   * 行によって送り先の週が違う。ページ単位の1つの真偽値では表せないため、
   * 月内で使う週ぶんだけまとめて1回引き、行ごとに `weekly_locked` を付ける。
   */
  async getReportItemsByMonth(kind: string, month: string): Promise<Record<string, unknown>[]> {
    assertKind(kind);
    if (!MONTH_RE.test(month) || Number(month.slice(5, 7)) < 1 || Number(month.slice(5, 7)) > 12) {
      throw new AppError(400, 'VALIDATION_ERROR', 'month は YYYY-MM 形式で指定してください');
    }
    const rows = await queryAll(
      /*
       * `i.*` ではなく列を明示する。`ops_report_items` 自身が `report_id`（`ops_reports`
       * への FK）列を持つため、`i.*` を展開すると `r.id AS report_id` と名前が衝突し、
       * 同じ結果セットに `report_id` が2つ並ぶ（値は結合条件により常に一致するので今は
       * 実害が無いが、driver がフィールド名の重複をどちらの値で解決するかに依存する
       * 危うい書き方になる — 結合条件が変わった日に気づきにくい形で壊れる）。
       */
      `SELECT r.id AS report_id, r.period_key, r.status, r.reviewed_at, r.reviewed_by,
              i.id, i.category, i.content, i.note, i.url, i.ai_related, i.pick,
              i.recorded_by, i.source, i.sort_order, i.source_item_id,
              i.created_at, i.updated_at,
              EXISTS (SELECT 1 FROM ops_report_items w
                       WHERE w.source_item_id = i.id AND w.deleted_at IS NULL) AS sent_to_weekly
         FROM ops_reports r
         JOIN ops_report_items i ON i.report_id = r.id AND i.deleted_at IS NULL
        WHERE r.kind = ? AND r.deleted_at IS NULL AND r.period_key LIKE ?
        ORDER BY r.period_key DESC, i.sort_order ASC, i.created_at ASC`,
      [kind, `${month}-%`],
    );
    if (!rows.length) return [];

    const weekStarts = [...new Set(rows.map((r) => normalizeWeekStart(String(r.period_key))))];
    const lockedWeeks = new Set<string>();
    if (weekStarts.length) {
      const weeklyRows = await queryAll(
        `SELECT period_key FROM ops_reports
          WHERE kind = 'weekly_activity' AND status = 'published' AND deleted_at IS NULL
            AND period_key IN (${weekStarts.map(() => '?').join(',')})`,
        weekStarts,
      );
      for (const w of weeklyRows) lockedWeeks.add(String(w.period_key));
    }

    const days = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      const periodKey = String(row.period_key);
      if (!days.has(periodKey)) {
        days.set(periodKey, {
          report_id: row.report_id,
          period_key: periodKey,
          status: row.status,
          reviewed_at: row.reviewed_at,
          reviewed_by: row.reviewed_by,
          items: [] as Record<string, unknown>[],
        });
      }
      const { report_id: reportId, period_key: _periodKey, status: _status, reviewed_at: _reviewedAt, reviewed_by: _reviewedBy, ...item } = row;
      (days.get(periodKey)!.items as Record<string, unknown>[]).push({
        ...item,
        // クライアントの `OpsReportItem` は `report_id` を持つ (どのレポートの行か)。
        // SQL 側は `i.report_id` を選ばず（`r.id AS report_id` と列名が衝突するため）
        // 結合元の `row.report_id`（＝この行の日の `report_id`）をそのまま使う。
        report_id: reportId,
        weekly_locked: lockedWeeks.has(normalizeWeekStart(periodKey)),
      });
    }
    return [...days.values()];
  },

  /**
   * 行の追加。dedupeUrl=true のとき、既存行と同じ URL の行はスキップする (AI 再実行の重複防止)。
   */
  async addItems(
    reportId: string,
    items: OpsReportItemInput[],
    opts: { source: 'ai' | 'human'; recordedBy?: string | null; dedupeUrl?: boolean },
  ): Promise<{ added: number; skipped: number }> {
    const report = await queryOne(`SELECT id, kind, status FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [reportId]);
    if (!report) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    assertReportOpen(report);

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

  /**
   * レポート本体（題名・本文）を人が直す。**ウィークリー活動報告に画面から編集する
   * 手段が無かった**ため新設（AI下書きボタンとセット）。`items` とは別の入口
   * （行の編集は `updateItem`）。確定済みは `assertReportOpen` が断る。
   */
  async updateReportContent(id: string, fields: { title?: string; body?: string }): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    assertReportOpen(existing);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.title !== undefined) { sets.push('title = ?'); params.push(fields.title); }
    if (fields.body !== undefined) { sets.push('body = ?'); params.push(fields.body); }
    if (!sets.length) return existing;
    sets.push('updated_at = NOW()');
    params.push(id);
    await execute(`UPDATE ops_reports SET ${sets.join(', ')} WHERE id = ?`, params);
    return (await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]))!;
  },

  async updateItem(itemId: string, fields: Partial<OpsReportItemInput>): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_report_items WHERE id = ? AND deleted_at IS NULL`, [itemId]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '行が見つかりません');
    assertReportOpen(await this.reportOf(existing.report_id as string));
    const sets: string[] = [];
    const params: unknown[] = [];
    if (fields.category !== undefined) { sets.push('category = ?'); params.push(fields.category ?? null); }
    if (fields.content !== undefined) {
      const content = (fields.content ?? '').trim();
      if (!content) throw new AppError(400, 'VALIDATION_ERROR', '内容 (content) は必須です');
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
    const existing = await queryOne(`SELECT id, report_id FROM ops_report_items WHERE id = ? AND deleted_at IS NULL`, [itemId]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', '行が見つかりません');
    assertReportOpen(await this.reportOf(existing.report_id as string));
    await execute(`UPDATE ops_report_items SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [itemId]);
  },

  /** 週報の確定: published + published_at + reviewed_at/by を打刻 */
  async publishReport(id: string, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    await execute(
      `UPDATE ops_reports SET status = 'published', published_at = COALESCE(published_at, NOW()),
              reviewed_at = NOW(), reviewed_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [userId, id],
    );
    /*
     * 週報を確定した時点で、隔週キープの**定例報告パックを凍結**する
     * （docs/design/v4/keep-report.md §5.5。「自動集計は投稿時点の数字」と同じ約束）。
     * その週の会議日（無ければ次の開催日）ぶんを 全体／全区分 で凍結し、
     * `payload.keep = { pack_id, meeting_date }` を**他の鍵（stats）を残したまま**足す。
     * ⚠️ **凍結に失敗しても確定は成功させる**（中で握る。記録の失敗で業務を止めない）。
     * 確定し直すたびに新しい版ができ、前の版は残る。
     */
    if (existing.kind === 'weekly_activity') {
      await freezeKeepPackForWeeklyReport(id, String(existing.period_key), userId);
      // 会社方針「AIを使い捨てにしない」条件2: 確定 = 人が「これでよい」と
      // 認めた瞬間なので、ここで AI の下書きと確定した本文を比べて差分を残す。
      // **before は `ai_outputs.payload_snapshot`**（直前の DB 行ではない）— 途中で
      // 何度も保存し直していても、比べる相手は常に「AI が最後に出したもの」にする。
      await recordWeeklyReportPublishCorrection(id, String(existing.body ?? ''), userId);
    }
    return (await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]))!;
  },

  /**
   * 週報の確定を解く（`draft` に戻す）。
   *
   * ⚠️ **これが無いと、確定を守った瞬間に行き止まりになります。**
   * 確定した週報は直せず、戻す口もどこにも無かった（`upsertReport` は
   * `published` から `draft` へ動かさない）ので、**書き足りない1行を
   * 入れる手段が消えます**。確定と同じ `editor` で解けるようにし、
   * **いつ確定したか（`published_at`）は消しません** — 一度出した事実は記録です。
   */
  async reopenReport(id: string): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    if (!isReportLocked(existing)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'この週報は確定していません');
    }
    // 確認の記録（`reviewed_at` / `reviewed_by`）は外す — もう一度確定するときに
    // 打ち直します。**`published_at` は残す**（いつ一度出したかは記録）
    await execute(
      `UPDATE ops_reports SET status = 'draft', reviewed_at = NULL, reviewed_by = NULL, updated_at = NOW()
       WHERE id = ?`,
      [id],
    );
    return (await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]))!;
  },

  /**
   * 週の箱を削除する（論理削除）。
   *
   * ⚠️ **確定済み（`weekly_activity` の `published`）は断る**（`assertReportOpen` を再利用）。
   * 確定済みをそのまま消せると、確認した内容が画面から黙って消える。直すときと同じく
   * 「確定を取り消す」を押してから削除してもらう。行 (`ops_report_items`) は物理削除しない
   * （`report_id` の FK はそのまま・`deleted_at` が付いた親を辿らないだけで整合は壊れない）。
   */
  async deleteReport(id: string): Promise<void> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    assertReportOpen(existing);
    await execute(`UPDATE ops_reports SET deleted_at = NOW(), updated_at = NOW() WHERE id = ?`, [id]);
  },

  /** 確認のみ (日次ニュースの既読相当): reviewed_at/by だけ記録 */
  async reviewReport(id: string, userId: string): Promise<Record<string, unknown>> {
    const existing = await queryOne(`SELECT * FROM ops_reports WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'レポートが見つかりません');
    await execute(
      `UPDATE ops_reports SET reviewed_at = NOW(), reviewed_by = ?, updated_at = NOW() WHERE id = ?`,
      [userId, id],
    );
    return (await queryOne(`SELECT * FROM ops_reports WHERE id = ?`, [id]))!;
  },
};

/**
 * 週報の確定時に AI 下書きとの差分を記録する（best-effort・記録の失敗で確定は止めない）。
 *
 * **その出力にもう差分が付いていれば何もしない**（`hasCorrections`）— 確定を取り消して
 * 本文を直さずにもう一度確定した場合など、同じ AI 出力に二度積むと「よく開かれる週報ほど
 * 精度が高く見える」ことになる。AI 下書きを一度も作っていない週報（`findLatestAiOutput` が
 * null）は何もしない — 人が最初から書いた週報を分母に混ぜない。
 */
async function recordWeeklyReportPublishCorrection(reportId: string, publishedBody: string, userId: string): Promise<void> {
  try {
    const latest = await findLatestAiOutput('ops_reports', reportId, WEEKLY_REPORT_DRAFT_KIND);
    if (!latest) return;
    if (await hasCorrections(latest.id)) return;
    const before = String((latest.payload as { body?: unknown } | null)?.body ?? '');
    const same = before === publishedBody;
    const type: CorrectionType = same ? 'none' : (before === '' ? 'enrich' : 'fix');
    await recordCorrections(latest.id, [{ fieldPath: 'body', before, after: publishedBody, type }], userId);
  } catch (e) {
    console.warn('[ops-report] weekly report correction 記録に失敗しました（続行）:', (e as Error).message);
  }
}

function clampPick(pick: number | null | undefined): number | null {
  if (pick === null || pick === undefined) return null;
  const n = Math.round(Number(pick));
  if (Number.isNaN(n)) return null;
  return Math.min(5, Math.max(1, n));
}
