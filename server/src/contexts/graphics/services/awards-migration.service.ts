// テロップCG — 旧リアルタイムCG（client-awards）の過去実績データを新エンジンへ変換移行するツール（段6-9）。
//
// データモデルの対応関係（docs/design/v4/graphics-awards-migration-plan.md の読み取り専用調査で確定済み）:
//   awards_events（1件）        → graphics_projects（1件）。owner_type='program'・
//                                  owner_id='awards-migrated-{eventId}'（移行専用の決め打ちキー）
//   awards_categories（複数）    → graphics_pages（part_key='ranking'・slot='fullscreen'）1件ずつ
//   awards_entries（複数）       → fields.entries（RankingEntry[]。rankingFields.ts の型に対応）
//
// **旧 `awards_*` テーブルには一切書き込まない**（読み取り専用。`client-awards/CLAUDE.md` の
// 「旧 `/awards` は移行完了・検証まで一切変更しない」方針どおり）。
//
// **`fields.step` は常に 'idle'。** 移行直後は何も表示しない安全側の初期状態にする——
// 過去の演出進行状態そのものを移す意味は無く、最終結果（`rank`/`isWinner`）だけが資産
// （タスク指示・rankingFields.ts の `withRankingStepReset` と同じ既定値）。
//
// `previewAwardsMigration`（DB へは一切書き込まない）→ `commitAwardsMigration`（1トランザクションで
// INSERT）の2段構えは、名簿取込（`roster-import.service.ts` の preview→commit）と同じ設計。
import { queryAll, queryOne, withTransaction, Row, TxClient } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { SLOT_CALL_BASE } from '../store';

// ── 旧 awards データの読み取り（読み取り専用） ────────────────────────

interface AwardsEventRow {
  id: number;
  name: string;
  status: string;
}

async function requireAwardsEvent(eventId: number): Promise<AwardsEventRow> {
  const row = await queryOne(
    `SELECT id, name, status FROM awards_events WHERE id = ?`,
    [eventId]
  );
  if (!row) throw new AppError(404, 'NOT_FOUND', '旧リアルタイムCGのイベントが見つかりません');
  return { id: row.id as number, name: row.name as string, status: row.status as string };
}

/** 旧 `awards_entries.points`（NUMERIC(10,1)。pg が既に number へ変換済み）を安全な数値へ丸める。
 *  rankingFields.ts の `toPoints` と同じ丸め（小数第1位まで）。 */
function toPoints(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v * 10) / 10;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Math.round(Number(v) * 10) / 10;
  return 0;
}

/** `graphics_pages.fields.entries` の1件（`rankingFields.ts` の `RankingEntry` に対応する形）。
 *  値の無いキーは `undefined` のまま返す — `JSON.stringify` が落とすので、クライアント側の
 *  `normalizeRankingEntries` が読む形と一致する。 */
function toRankingEntry(row: Row): Record<string, unknown> {
  return {
    rank: row.rank == null ? null : Number(row.rank),
    name: (row.name as string | null) ?? '',
    nameEn: (row.name_en as string | null) || undefined,
    company: (row.org as string | null) || undefined,
    companyEn: (row.org_en as string | null) || undefined,
    points: toPoints(row.points),
    ownPoints: row.own_points == null ? undefined : toPoints(row.own_points),
    photoUrl: (row.photo_url as string | null) || undefined,
    isWinner: row.is_winner === true,
  };
}

/** `graphics_projects.owner_id` に使う移行専用の決め打ちキー（冪等性の判定に使う）。 */
export function awardsMigrationOwnerId(eventId: number): string {
  return `awards-migrated-${eventId}`;
}

// ── 一覧（移行元候補の選択用） ──────────────────────────────────────

export interface AwardsMigrationEventSummary {
  id: number;
  name: string;
  subtitle: string | null;
  status: string;
  scheduledAt: unknown;
  categoryCount: number;
  entryCount: number;
}

export async function listAwardsMigrationEvents(): Promise<AwardsMigrationEventSummary[]> {
  const rows = await queryAll(
    `SELECT e.id, e.name, e.subtitle, e.status, e.scheduled_at,
            COUNT(DISTINCT c.id)::int AS category_count,
            COUNT(DISTINCT en.id)::int AS entry_count
       FROM awards_events e
       LEFT JOIN awards_categories c ON c.event_id = e.id
       LEFT JOIN awards_entries en ON en.event_id = e.id
      GROUP BY e.id
      ORDER BY e.scheduled_at DESC NULLS LAST, e.id DESC`
  );
  return rows.map((r) => ({
    id: r.id as number,
    name: r.name as string,
    subtitle: (r.subtitle as string | null) ?? null,
    status: r.status as string,
    scheduledAt: r.scheduled_at,
    categoryCount: r.category_count as number,
    entryCount: r.entry_count as number,
  }));
}

// ── プレビュー（DB には一切書き込まない） ────────────────────────────

export type AwardsMigrationPattern = 'direct' | 'vote';

export interface AwardsMigrationPagePreview {
  categoryId: number;
  categoryName: string;
  categoryNameEn: string | null;
  awardPattern: AwardsMigrationPattern;
  entryCount: number;
  /** データ不整合の警告（rank重複・pointsが全員0・nameが空、等）。
   *  **警告があっても移行は止めない**——確認材料として提示するだけ。 */
  warnings: string[];
}

export interface AwardsMigrationPreview {
  event: { id: number; name: string; status: string };
  project: { ownerId: string; name: string; theme: string };
  pages: AwardsMigrationPagePreview[];
  /** イベント全体に関わる警告（カテゴリが1件も無い、等） */
  warnings: string[];
  /** 既に移行済み（同じ ownerId の CGプロジェクトが存在する）かどうか。
   *  移行済みでも警告として見せるだけで、プレビュー自体は取得できる。 */
  alreadyMigrated: boolean;
}

function buildCategoryWarnings(entries: Row[]): string[] {
  const warnings: string[] = [];
  if (entries.length === 0) {
    warnings.push('エントリーがありません');
    return warnings;
  }

  const ranks = entries.map((e) => e.rank).filter((r): r is number => r != null);
  const seen = new Set<number>();
  const dupRanks = new Set<number>();
  for (const r of ranks) {
    if (seen.has(r)) dupRanks.add(r);
    seen.add(r);
  }
  if (dupRanks.size > 0) {
    warnings.push(`順位（rank）が重複しているエントリーがあります（${[...dupRanks].sort((a, b) => a - b).join('位・')}位）`);
  }

  const pointsList = entries.map((e) => toPoints(e.points));
  if (pointsList.every((p) => p === 0)) {
    warnings.push('得点（points）が全員0です');
  }

  const emptyNameCount = entries.filter((e) => !String(e.name ?? '').trim()).length;
  if (emptyNameCount > 0) {
    warnings.push(`名前が空のエントリーがあります（${emptyNameCount}件）`);
  }

  return warnings;
}

export async function previewAwardsMigration(eventId: number): Promise<AwardsMigrationPreview> {
  const event = await requireAwardsEvent(eventId);
  const ownerId = awardsMigrationOwnerId(eventId);

  const existing = await queryOne(
    `SELECT id FROM graphics_projects WHERE owner_type = 'program' AND owner_id = ?`,
    [ownerId]
  );

  const categories = await queryAll(
    `SELECT id, name, name_en, award_pattern FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`,
    [eventId]
  );

  const eventWarnings: string[] = [];
  if (categories.length === 0) {
    eventWarnings.push('カテゴリがありません（テロップは1件も作成されません）');
  }

  const pages: AwardsMigrationPagePreview[] = [];
  for (const cat of categories) {
    const entries = await queryAll(
      `SELECT rank, name, name_en, org, org_en, points, own_points, photo_url, is_winner
         FROM awards_entries WHERE category_id = ? ORDER BY rank ASC NULLS LAST, id ASC`,
      [cat.id]
    );
    pages.push({
      categoryId: cat.id as number,
      categoryName: cat.name as string,
      categoryNameEn: (cat.name_en as string | null) ?? null,
      awardPattern: cat.award_pattern === 'vote' ? 'vote' : 'direct',
      entryCount: entries.length,
      warnings: buildCategoryWarnings(entries),
    });
  }

  return {
    event: { id: event.id, name: event.name, status: event.status },
    project: { ownerId, name: event.name, theme: 'ceremony-gold' },
    pages,
    warnings: eventWarnings,
    alreadyMigrated: !!existing,
  };
}

// ── 確定（1トランザクションで INSERT） ────────────────────────────

export interface AwardsMigrationCommitResult {
  projectId: number;
  pageIds: number[];
}

/**
 * 実際に `graphics_projects` + `graphics_pages` を作成する。
 *
 * **冪等性**: `graphics_projects.owner_id` に決め打ちキー（`awards-migrated-{eventId}`。
 * `ownerId` を渡せば上書きも可）を使い、`(owner_type, owner_id)` の UNIQUE 制約
 * （migration 250）に先んじて存在チェックし、既にあれば親切なエラーメッセージで弾く
 * （同じイベントを2回移行して重複作成しないため）。
 *
 * 元の `awards_*` テーブルには一切書き込まない（読み取りのみ）。
 */
export async function commitAwardsMigration(eventId: number, ownerId?: string): Promise<AwardsMigrationCommitResult> {
  const event = await requireAwardsEvent(eventId);
  const canonicalOwnerId = (ownerId && ownerId.trim()) || awardsMigrationOwnerId(eventId);

  return withTransaction(async (tx: TxClient) => {
    const existing = await tx.queryOne(
      `SELECT id FROM graphics_projects WHERE owner_type = 'program' AND owner_id = ?`,
      [canonicalOwnerId]
    );
    if (existing) {
      throw new AppError(
        409,
        'ALREADY_MIGRATED',
        `このイベント「${event.name}」は既に移行済みです（テロップCGプロジェクト #${existing.id}）。同じイベントを重複して移行することはできません。`
      );
    }

    const projectRow = await tx.queryOne(
      `INSERT INTO graphics_projects (owner_type, owner_id, name, theme)
       VALUES ('program', ?, ?, 'ceremony-gold')
       RETURNING id`,
      [canonicalOwnerId, event.name]
    );
    const projectId = projectRow!.id as number;

    const categories = await tx.queryAll(
      `SELECT id, name, name_en, award_pattern FROM awards_categories WHERE event_id = ? ORDER BY display_order, id`,
      [eventId]
    );

    const pageIds: number[] = [];
    let candidateCallNo = SLOT_CALL_BASE.fullscreen;
    let sortOrder = 0;

    for (const cat of categories) {
      const entries = await tx.queryAll(
        `SELECT rank, name, name_en, org, org_en, points, own_points, photo_url, is_winner
           FROM awards_entries WHERE category_id = ? ORDER BY rank ASC NULLS LAST, id ASC`,
        [cat.id]
      );

      const fields = {
        categoryName: cat.name as string,
        categoryNameEn: (cat.name_en as string | null) || undefined,
        awardPattern: cat.award_pattern === 'vote' ? 'vote' : 'direct',
        step: 'idle',
        entries: entries.map(toRankingEntry),
      };

      const callNo = candidateCallNo;
      candidateCallNo += 1;
      sortOrder += 1;

      const pageRow = await tx.queryOne(
        `INSERT INTO graphics_pages (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order)
         VALUES (?, ?, 'fullscreen', 'ranking', ?, ?::jsonb, 'draft', ?)
         RETURNING id`,
        [projectId, callNo, cat.name, JSON.stringify(fields), sortOrder]
      );
      pageIds.push(pageRow!.id as number);
    }

    return { projectId, pageIds };
  });
}
