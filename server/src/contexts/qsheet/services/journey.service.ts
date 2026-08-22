/**
 * 制作のジャーニー — サーバーは**数えた事実だけ**返す。
 *
 * 割合・閾値・「進み具合の%」は一切計算しない（画一的な判定式を作らない）。
 * 「決まった」と言えるのは人が `production_journey_marks` にピンを押したときだけ。
 *
 * ⚠️ `durationGapMin`（`qsheet_doc_index` が無い・段7で追加予定） → 常に `null`
 *    `duration_gap` / `mic_unassigned` の提案 → 出さない（索引が無い）
 *
 * `frames[]` は段4で `qsheet_schedule_items` から埋まるようになった（§8）。
 * `canAccessSchedule` を通した表のものだけを返す（N+1 を避けるため SQL の行条件に埋める）。
 *
 * ⚠️ `jsonb_array_length` は配列でない値に投げると例外になる。台本の
 * `data.sections` は Yjs が書くのでサーバーはスキーマを検証しておらず、
 * 壊れた行が1件でもあると一覧全体が 500 で落ちる。**必ず `jsonb_typeof` で
 * ガードしてから数える**（壊れた行は 0 件として扱う。他の人の一覧は生きたまま）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { isQsheetAdmin, canAccessDoc, type AccessUser } from '../access';
import { docPathOf } from '../../../shared/production/miniapps';
import type {
  JourneyDay,
  JourneyResponse,
  StageHint,
  HintTone,
  Suggestion,
  ScopeCard,
  ScopeGroup,
  JourneyFrame,
} from '../../../shared/production/journey';

/** `data.sections` の件数を安全に数える SQL 断片。壊れた行は 0 件として扱う（§6-3） */
const SECTION_COUNT_SQL = `
  CASE WHEN jsonb_typeof(d.data->'sections') = 'array'
       THEN jsonb_array_length(d.data->'sections')
       ELSE 0 END
`;

const RECENT_DAYS = 7;

function toneOf(hasAny: boolean, latestUpdatedAt: string | null): HintTone {
  if (!hasAny) return 'blank';
  if (latestUpdatedAt) {
    const ageMs = Date.now() - new Date(latestUpdatedAt).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= RECENT_DAYS * 24 * 60 * 60 * 1000) return 'recent';
  }
  return 'touched';
}

// ============================================================
// トップ（案件を選ぶ）— 4束の件数
// ============================================================

/**
 * `projects.stage` の CHECK 値そのまま
 * （`neta,d_hold,c_proposal,b_verbal,a_won,s_completed,e_lost`）を使って4つに分ける。
 * 内訳（重複なし・4つで全案件を尽くす。standalone だけ別の表を数える）:
 *   - `neta`         : gls_number IS NULL AND stage = 'neta'
 *   - `pre_project`  : gls_number IS NULL AND stage NOT IN ('neta','e_lost')
 *   - `in_progress`  : gls_number IS NOT NULL AND stage NOT IN ('s_completed','e_lost')
 *   - `standalone`   : project_id が無い資料（アクセス権で絞ってから数える）
 */
export async function getScopeCards(user: AccessUser): Promise<ScopeCard[]> {
  const [neta, preProject, inProgress, standalone] = await Promise.all([
    queryOne(
      `SELECT COUNT(*)::int AS n FROM projects
       WHERE deleted_at IS NULL AND gls_number IS NULL AND stage = 'neta'`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS n FROM projects
       WHERE deleted_at IS NULL AND gls_number IS NULL AND stage NOT IN ('neta', 'e_lost')`,
    ),
    queryOne(
      `SELECT COUNT(*)::int AS n FROM projects
       WHERE deleted_at IS NULL AND gls_number IS NOT NULL AND stage NOT IN ('s_completed', 'e_lost')`,
    ),
    countStandaloneDocs(user),
  ]);

  const cards: Array<[ScopeGroup, number]> = [
    ['in_progress', (inProgress?.n as number) ?? 0],
    ['pre_project', (preProject?.n as number) ?? 0],
    ['neta', (neta?.n as number) ?? 0],
    ['standalone', standalone],
  ];
  return cards.map(([group, count]) => ({ group, count }));
}

async function countStandaloneDocs(user: AccessUser): Promise<number> {
  // documents.routes.ts の一覧と同じ見える範囲（数の正直さ: 見えないものは数えない）
  if (isQsheetAdmin(user)) {
    const row = await queryOne(
      `SELECT COUNT(*)::int AS n FROM qsheet_documents WHERE deleted_at IS NULL AND project_id IS NULL`,
    );
    return (row?.n as number) ?? 0;
  }
  const row = await queryOne(
    `SELECT COUNT(*)::int AS n FROM qsheet_documents d
     WHERE d.deleted_at IS NULL AND d.project_id IS NULL
       AND (d.created_by = ? OR EXISTS (
         SELECT 1 FROM qsheet_document_shares s WHERE s.document_id = d.id AND s.user_id = ?
       ))`,
    [user.id, user.id],
  );
  return (row?.n as number) ?? 0;
}

// ============================================================
// ジャーニー（案件単位）
// ============================================================

interface DocRow {
  id: string;
  title: string;
  doc_no: string | null;
  broadcast_date: string | null;
  updated_at: string;
  section_count: number;
}

async function fetchDocsForProject(projectId: string): Promise<DocRow[]> {
  const rows = await queryAll(
    `SELECT d.id, d.title, d.doc_no, d.broadcast_date, d.updated_at,
            ${SECTION_COUNT_SQL} AS section_count
     FROM qsheet_documents d
     WHERE d.project_id = ? AND d.deleted_at IS NULL
     ORDER BY d.updated_at DESC`,
    [projectId],
  );
  return rows as unknown as DocRow[];
}

/**
 * その案件のスケジュール表の項目を「枠→台本の橋」として引く（§8）。
 * `canAccessSchedule` を通した表のものだけ（N+1 を避けるため SQL の行条件に埋める。§6-1 と同じ形）。
 * `assignee` / `note` は持たない（社長・副社長の分単位の所在を漏らさない。§8 の⚠️）。
 */
async function fetchFramesForProject(projectId: string, user: AccessUser): Promise<Map<string, JourneyFrame[]>> {
  let sql = `
    SELECT s.id AS schedule_id, i.id AS item_id, to_char(s.service_date, 'YYYY-MM-DD') AS service_date,
           c.label AS column_label, r.name AS room_name, i.title, i.kind, i.start_min, i.end_min,
           i.qsheet_document_id, (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken
    FROM qsheet_schedule_items i
    JOIN qsheet_schedules s ON s.id = i.schedule_id AND s.deleted_at IS NULL
    JOIN qsheet_schedule_columns c ON c.id = i.column_id
    LEFT JOIN studio_rooms r ON r.id = c.room_id
    LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
    WHERE s.project_id = $1 AND i.deleted_at IS NULL
  `;
  const params: unknown[] = [projectId];
  if (!isQsheetAdmin(user)) {
    sql += ` AND (s.created_by = $2 OR EXISTS (
               SELECT 1 FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id AND sh.user_id = $2))`;
    params.push(user.id);
  }
  sql += ' ORDER BY s.service_date, i.start_min';

  const rows = await queryAll(sql, params);
  const byDate = new Map<string, JourneyFrame[]>();
  for (const r of rows) {
    const date = r.service_date as string;
    const frame: JourneyFrame = {
      scheduleId: r.schedule_id as string,
      itemId: r.item_id as string,
      columnLabel: (r.room_name as string) || (r.column_label as string),
      title: r.title as string,
      kind: r.kind as string,
      startMin: r.start_min as number,
      endMin: r.end_min as number,
      documentId: (r.qsheet_document_id as string) ?? null,
      linkBroken: !!r.link_broken,
      // durationGapMin は qsheet_doc_index（段7）が無いので段4でも常に null（§8-4）
      durationGapMin: null,
    };
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(frame);
  }
  return byDate;
}

function buildDayFromDocs(date: string | null, label: string | null, docs: DocRow[], frames: JourneyFrame[]): JourneyDay {
  const hasAny = docs.length > 0;
  const latestUpdatedAt = docs.length > 0 ? (docs[0].updated_at as unknown as string) : null;
  const hasRows = docs.some((d) => d.section_count > 0);
  const hasFrames = frames.length > 0;

  const stages: StageHint[] = [
    // `day`（枠）: その日のスケジュール表の項目数だけを見る（判定式は作らない）
    {
      stage: 'day',
      tone: toneOf(hasFrames, null),
      facts: hasFrames ? [{ key: 'frame_count', label: '枠', count: frames.length }] : [],
    },
    // `flow`（進行台本の有無）
    {
      stage: 'flow',
      tone: toneOf(hasAny, latestUpdatedAt),
      facts: hasAny ? [{ key: 'sheet_count', label: '進行台本', count: docs.length, at: latestUpdatedAt ?? undefined }] : [],
    },
    // `script`（台本の中身。sections の有無を jsonb_array_length のガード付きで数える）
    {
      stage: 'script',
      tone: toneOf(hasRows, latestUpdatedAt),
      facts: hasRows
        ? [{ key: 'section_count', label: '構成', count: docs.reduce((n, d) => n + d.section_count, 0) }]
        : [],
    },
  ];

  const suggestions: Suggestion[] = [];
  if (!hasFrames) {
    suggestions.push({ key: 'no_schedule', label: 'スケジュール表がまだありません', to: '/qsheet/schedules' });
  }
  if (!hasAny) {
    suggestions.push({ key: 'no_sheet', label: '進行台本がまだありません', to: '/qsheet/sheets' });
  } else {
    const emptyDoc = docs.find((d) => d.section_count === 0);
    if (emptyDoc) {
      suggestions.push({ key: 'sheet_no_rows', label: '進行台本の中身がまだ空です', to: docPathOf('sheet', emptyDoc.id) });
    }
  }
  // duration_gap / mic_unassigned は qsheet_doc_index（段7）が無いので段4でも出さない

  return {
    date,
    label,
    stages,
    docs: docs.map((d) => ({
      app: 'sheet',
      id: d.id,
      title: d.title,
      docNo: d.doc_no,
      updatedAt: d.updated_at as unknown as string,
    })),
    frames,
    suggestions,
  };
}

// ============================================================
// ジャーニー（番組＝マニュアル単位。2026-08-22 追加）
// ============================================================

async function fetchDocsForProgram(programId: string): Promise<DocRow[]> {
  const rows = await queryAll(
    `SELECT d.id, d.title, d.doc_no, d.broadcast_date, d.updated_at,
            ${SECTION_COUNT_SQL} AS section_count
     FROM qsheet_documents d
     WHERE d.program_id = ? AND d.deleted_at IS NULL
     ORDER BY d.updated_at DESC`,
    [programId],
  );
  return rows as unknown as DocRow[];
}

/** 番組（マニュアル）版の `fetchFramesForProject`。持ち物は `program_id` に変わるだけで作りは同じ */
async function fetchFramesForProgram(programId: string, user: AccessUser): Promise<Map<string, JourneyFrame[]>> {
  let sql = `
    SELECT s.id AS schedule_id, i.id AS item_id, to_char(s.service_date, 'YYYY-MM-DD') AS service_date,
           c.label AS column_label, r.name AS room_name, i.title, i.kind, i.start_min, i.end_min,
           i.qsheet_document_id, (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken
    FROM qsheet_schedule_items i
    JOIN qsheet_schedules s ON s.id = i.schedule_id AND s.deleted_at IS NULL
    JOIN qsheet_schedule_columns c ON c.id = i.column_id
    LEFT JOIN studio_rooms r ON r.id = c.room_id
    LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
    WHERE s.program_id = $1 AND i.deleted_at IS NULL
  `;
  const params: unknown[] = [programId];
  if (!isQsheetAdmin(user)) {
    sql += ` AND (s.created_by = $2 OR EXISTS (
               SELECT 1 FROM qsheet_schedule_shares sh WHERE sh.schedule_id = s.id AND sh.user_id = $2))`;
    params.push(user.id);
  }
  sql += ' ORDER BY s.service_date, i.start_min';

  const rows = await queryAll(sql, params);
  const byDate = new Map<string, JourneyFrame[]>();
  for (const r of rows) {
    const date = r.service_date as string;
    const frame: JourneyFrame = {
      scheduleId: r.schedule_id as string,
      itemId: r.item_id as string,
      columnLabel: (r.room_name as string) || (r.column_label as string),
      title: r.title as string,
      kind: r.kind as string,
      startMin: r.start_min as number,
      endMin: r.end_min as number,
      documentId: (r.qsheet_document_id as string) ?? null,
      linkBroken: !!r.link_broken,
      durationGapMin: null,
    };
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(frame);
  }
  return byDate;
}

/**
 * 番組（マニュアル）単位のジャーニー。番組が無ければ null（呼び出し側が 404 を返す）。
 *
 * ⚠️ 案件単位（`getJourneyForProject`）との違いは1つだけ — **`episodes` を持たない**。
 * 番組は案件管理外の軽い入れ物（migration 227）で、回（エピソード）という概念が無いため、
 * 日の一覧は「資料の broadcast_date」「スケジュール表がある日」「`event_date`」の
 * 和集合で作る（`episodes` からの日は最初から無い）。
 */
export async function getJourneyForProgram(programId: string, user: AccessUser): Promise<JourneyResponse | null> {
  const program = await queryOne(
    `SELECT id, name, to_char(event_date, 'YYYY-MM-DD') AS event_date
     FROM qsheet_programs WHERE id = ? AND deleted_at IS NULL`,
    [programId],
  );
  if (!program) return null;

  const [docs, framesByDate] = await Promise.all([fetchDocsForProgram(programId), fetchFramesForProgram(programId, user)]);

  const dateLabels = new Map<string, string | null>();
  if (program.event_date) dateLabels.set(program.event_date as string, null);
  for (const d of docs) {
    if (d.broadcast_date && !dateLabels.has(d.broadcast_date)) dateLabels.set(d.broadcast_date, null);
  }
  for (const date of framesByDate.keys()) {
    if (!dateLabels.has(date)) dateLabels.set(date, null);
  }

  const docsByDate = new Map<string | null, DocRow[]>();
  for (const d of docs) {
    const key = d.broadcast_date ?? null;
    if (!docsByDate.has(key)) docsByDate.set(key, []);
    docsByDate.get(key)!.push(d);
  }

  const dates = [...dateLabels.keys()].sort();
  const days: JourneyDay[] = dates.map((date) =>
    buildDayFromDocs(date, dateLabels.get(date) ?? null, docsByDate.get(date) ?? [], framesByDate.get(date) ?? []));

  const undated = docsByDate.get(null) ?? [];
  if (undated.length > 0) days.push(buildDayFromDocs(null, null, undated, []));

  return {
    // `glsNumber` は番組には無いので常に null（JourneyResponse.project の型を割らない・§JourneyResponse のコメント参照）
    project: { id: program.id as string, name: program.name as string, glsNumber: null },
    days,
  };
}

/** 案件単位のジャーニー。案件が無ければ null（呼び出し側が 404 を返す） */
export async function getJourneyForProject(projectId: string, user: AccessUser): Promise<JourneyResponse | null> {
  const project = await queryOne(
    'SELECT id, name, gls_number FROM projects WHERE id = ? AND deleted_at IS NULL',
    [projectId],
  );
  if (!project) return null;

  const [docs, framesByDate] = await Promise.all([fetchDocsForProject(projectId), fetchFramesForProject(projectId, user)]);

  // days は「その案件の episodes の broadcast_date/recording_date」と
  // 「その案件の資料の broadcast_date」の和集合で作る（§6-7・N+1 を作らない: 資料は上で1回だけ引いた）
  const episodes = await queryAll(
    `SELECT episode_code, recording_date, broadcast_date
     FROM episodes WHERE project_id = ? AND deleted_at IS NULL`,
    [projectId],
  );

  const dateLabels = new Map<string, string | null>();
  for (const e of episodes) {
    const code = (e.episode_code as string) ?? null;
    if (e.broadcast_date) dateLabels.set(e.broadcast_date as string, code);
    if (e.recording_date && !dateLabels.has(e.recording_date as string)) {
      dateLabels.set(e.recording_date as string, code);
    }
  }
  for (const d of docs) {
    if (d.broadcast_date && !dateLabels.has(d.broadcast_date)) dateLabels.set(d.broadcast_date, null);
  }
  // スケジュール表がある日も和集合に加える（枠だけあって台本がまだ無い日を隠さないため）
  for (const date of framesByDate.keys()) {
    if (!dateLabels.has(date)) dateLabels.set(date, null);
  }

  const docsByDate = new Map<string | null, DocRow[]>();
  for (const d of docs) {
    const key = d.broadcast_date ?? null;
    if (!docsByDate.has(key)) docsByDate.set(key, []);
    docsByDate.get(key)!.push(d);
  }

  const dates = [...dateLabels.keys()].sort();
  const days: JourneyDay[] = dates.map((date) =>
    buildDayFromDocs(date, dateLabels.get(date) ?? null, docsByDate.get(date) ?? [], framesByDate.get(date) ?? []));

  // 日が決まっていない資料（broadcast_date が無い）は「日が決まっていない」束にまとめる
  const undated = docsByDate.get(null) ?? [];
  if (undated.length > 0) days.push(buildDayFromDocs(null, null, undated, []));

  return {
    project: {
      id: project.id as string,
      name: project.name as string,
      glsNumber: (project.gls_number as string) ?? null,
    },
    days,
  };
}

/** 資料単体のジャーニー（案件に紐づかない資料）。アクセス権が無ければ null */
export async function getJourneyForDocument(docId: string, user: AccessUser): Promise<JourneyResponse | null> {
  const row = await queryOne(
    `SELECT d.id, d.title, d.doc_no, d.broadcast_date, d.updated_at, d.created_by,
            ${SECTION_COUNT_SQL} AS section_count
     FROM qsheet_documents d WHERE d.id = ? AND d.deleted_at IS NULL`,
    [docId],
  );
  if (!row) return null;
  if (!(await canAccessDoc(user, row.id as string, (row.created_by as string) ?? null))) return null;

  const doc = row as unknown as DocRow;
  // ⚠️ 案件に紐づかない単体資料は、スケジュール表との対応付けの手がかり（project_id）を
  // 持たないため frames は空のまま返す（案件単位のジャーニーとの違い）。
  return { project: null, days: [buildDayFromDocs(doc.broadcast_date, null, [doc], [])] };
}
