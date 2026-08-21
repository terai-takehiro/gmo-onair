/**
 * ナレッジ（`qsheet_ai_knowledge`）— 段9・04-ai.md §6-3。
 *
 * digest（統計）・few-shot（現物）に続く3段目。**明示的なルール**で、
 * 人が承認した（`status='active'`）ものだけがプロンプトに載る。
 * `draft` を載せると、たまたま数件続いた偏りが恒久ルールとして固定化するため
 * **絶対にプロンプトへ載せない**（§6-3 の最重要事項）。
 */
import { v4 as uuid } from 'uuid';
import { execute, queryAll, queryOne } from '../../../shared/db/connection';
import { NotFoundError, ValidationError } from '../services/httpErrors';

export type KnowledgeStatus = 'draft' | 'active' | 'retired';
export type KnowledgeOrigin = 'auto' | 'human';

export interface KnowledgeRow {
  id: string;
  kind: string | null;
  segment_key: string | null;
  body: string;
  rationale: string | null;
  status: KnowledgeStatus;
  origin: KnowledgeOrigin;
  evidence: Record<string, unknown> | null;
  rev: number;
  sort_order: number;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** プロンプトに載せる最小の形（本文とリビジョンだけ。§6-5b の payload_snapshot.input.knowledge も同じ形） */
export interface KnowledgeForPrompt {
  id: string;
  body: string;
  rev: number;
}

/**
 * この機能・この型に**いま効いている**ナレッジ（`status='active'`）を取り出す。
 *
 * `kind IS NULL`（全機能共通）・`segment_key IS NULL`（全型共通）の行も含める —
 * 絞り込みではなく「載せてよいものを広げる」方向で NULL を扱う（§6-3 の表の意図）。
 */
export async function listActiveKnowledge(kind: string, segmentKey: string | null): Promise<KnowledgeForPrompt[]> {
  try {
    const rows = await queryAll(
      `SELECT id, body, rev FROM qsheet_ai_knowledge
        WHERE status = 'active'
          AND (kind IS NULL OR kind = ?)
          AND (segment_key IS NULL OR segment_key = ?)
        ORDER BY sort_order ASC, created_at ASC
        LIMIT 20`,
      [kind, segmentKey],
    );
    return rows.map((r) => ({ id: String(r.id), body: String(r.body ?? ''), rev: Number(r.rev) || 0 }));
  } catch (e) {
    // best-effort（materials.ts の他の取得と同じ方針）。ナレッジが引けなくても生成は続ける
    console.warn('[qsheet-ai] listActiveKnowledge に失敗しました（続行）:', (e as Error).message);
    return [];
  }
}

/**
 * いまの「ナレッジの版」= 表全体で最大の `rev`。0 件なら 0。
 * `promptVersionOf` に渡し、`+k<rev>` として prompt_version に刻む（§6-5a）。
 */
export async function currentKnowledgeRev(): Promise<number> {
  try {
    const row = await queryOne('SELECT COALESCE(MAX(rev), 0) AS rev FROM qsheet_ai_knowledge');
    return Number(row?.rev) || 0;
  } catch (e) {
    console.warn('[qsheet-ai] currentKnowledgeRev に失敗しました（続行）:', (e as Error).message);
    return 0;
  }
}

export interface ListKnowledgeFilter { kind?: string; segmentKey?: string }

/** 管理画面の一覧。全状態（draft/active/retired）を返す */
export async function listKnowledge(filter: ListKnowledgeFilter): Promise<KnowledgeRow[]> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) { conds.push('kind = ?'); params.push(filter.kind); }
  if (filter.segmentKey) { conds.push('segment_key = ?'); params.push(filter.segmentKey); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await queryAll(
    `SELECT * FROM qsheet_ai_knowledge ${where} ORDER BY status ASC, sort_order ASC, created_at DESC`,
    params,
  );
  return rows as unknown as KnowledgeRow[];
}

export interface CreateKnowledgeInput {
  kind?: string | null;
  segmentKey?: string | null;
  body: string;
  rationale?: string | null;
  sortOrder?: number;
}

/**
 * 人が直接書く（`POST /qsheet/ai/knowledge`）。**既定 `status='draft'`。**
 * 承認は別操作（`PUT .../:id`）— 書いた本人がそのまま即有効化できると、
 * 「承認が必須」（§6-3）という約束が画面の作りだけの飾りになる。
 */
export async function createKnowledge(input: CreateKnowledgeInput, userId: string): Promise<KnowledgeRow> {
  const body = input.body.trim();
  if (!body) throw new ValidationError('ルール文 (body) を入力してください');
  const id = uuid();
  await execute(
    `INSERT INTO qsheet_ai_knowledge (id, kind, segment_key, body, rationale, status, origin, sort_order, created_by)
     VALUES (?, ?, ?, ?, ?, 'draft', 'human', ?, ?)`,
    [id, input.kind ?? null, input.segmentKey ?? null, body, input.rationale ?? null, input.sortOrder ?? 0, userId],
  );
  return getKnowledge(id);
}

async function getKnowledge(id: string): Promise<KnowledgeRow> {
  const row = await queryOne('SELECT * FROM qsheet_ai_knowledge WHERE id = ?', [id]);
  if (!row) throw new NotFoundError('ナレッジが見つかりません');
  return row as unknown as KnowledgeRow;
}

export interface UpdateKnowledgeInput {
  status?: KnowledgeStatus;
  body?: string;
  rationale?: string | null;
  sortOrder?: number;
}

/**
 * 承認 / 却下 / 引退（`PUT /qsheet/ai/knowledge/:id`・`manager` 以上）。
 *
 * `status` が変わるときだけ `rev` を単調に進める（§6-5a）。本文だけの typo 修正では
 * 版を進めない — 版は「効くルールの集合が変わったか」を表すもので、文言修正の回数ではない。
 */
export async function updateKnowledge(id: string, input: UpdateKnowledgeInput, userId: string): Promise<KnowledgeRow> {
  const existing = await getKnowledge(id);
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw new ValidationError('ルール文 (body) を空にはできません');
    sets.push('body = ?'); params.push(body);
  }
  if (input.rationale !== undefined) { sets.push('rationale = ?'); params.push(input.rationale); }
  if (input.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(input.sortOrder); }

  if (input.status !== undefined && input.status !== existing.status) {
    if (!['draft', 'active', 'retired'].includes(input.status)) {
      throw new ValidationError('status は draft / active / retired のいずれかです');
    }
    sets.push('status = ?'); params.push(input.status);
    // 表全体で1本の通し番号（行ごとではない）。承認・却下・引退のどれでも進める —
    // どの向きの変化でも「効くルールの集合」が変わっているため
    const nextRev = await queryOne('SELECT COALESCE(MAX(rev), 0) + 1 AS rev FROM qsheet_ai_knowledge');
    sets.push('rev = ?'); params.push(Number(nextRev?.rev) || 1);
    if (input.status === 'active') {
      sets.push('approved_by = ?', 'approved_at = NOW()'); params.push(userId);
    }
  }
  if (sets.length === 1) return existing; // 何も変わっていない
  params.push(id);
  await execute(`UPDATE qsheet_ai_knowledge SET ${sets.join(', ')} WHERE id = ?`, params);
  return getKnowledge(id);
}

/**
 * 月次レビューの下書き生成時に、よく直されるフィールドの上位から
 * `origin='auto' / status='draft'` のルール案を機械的に作る（§6-3 育て方1）。
 *
 * **既に同じ内容の draft/active 案があれば作らない**（同じ月次バッチを2回走らせても
 * 増殖しないように。body の完全一致で判定する簡易な重複防止）。
 */
export async function draftAutoKnowledge(input: {
  kind: string;
  segmentKey: string | null;
  body: string;
  rationale: string;
  evidence: Record<string, unknown>;
}): Promise<{ created: boolean }> {
  const dup = await queryOne(
    `SELECT id FROM qsheet_ai_knowledge
      WHERE kind IS NOT DISTINCT FROM ? AND segment_key IS NOT DISTINCT FROM ?
        AND body = ? AND status <> 'retired'`,
    [input.kind, input.segmentKey, input.body],
  );
  if (dup) return { created: false };
  await execute(
    `INSERT INTO qsheet_ai_knowledge (id, kind, segment_key, body, rationale, status, origin, evidence)
     VALUES (?, ?, ?, ?, ?, 'draft', 'auto', ?::jsonb)`,
    [uuid(), input.kind, input.segmentKey, input.body, input.rationale, JSON.stringify(input.evidence)],
  );
  return { created: true };
}
