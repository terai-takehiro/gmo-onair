/**
 * 制作のジャーニー — サーバーは**数えた事実だけ**返す。
 *
 * 割合・閾値・「進み具合の%」は一切計算しない（画一的な判定式を作らない）。
 * 「決まった」と言えるのは人が `production_journey_marks` にピンを押したときだけ。
 *
 * ⚠️ 段3の時点で存在しないものは、型は確定させつつ空のまま返す:
 *   - `frames[]`（`qsheet_schedule_items` が無い） → 常に `[]`
 *   - `durationGapMin`（`qsheet_doc_index` が無い） → 常に `null`
 *   - `duration_gap` / `mic_unassigned` の提案 → 出さない（索引が無い）
 *
 * ⚠️ `jsonb_array_length` は配列でない値に投げると例外になる。台本の
 * `data.sections` は Yjs が書くのでサーバーはスキーマを検証しておらず、
 * 壊れた行が1件でもあると一覧全体が 500 で落ちる。**必ず `jsonb_typeof` で
 * ガードしてから数える**（壊れた行は 0 件として扱う。他の人の一覧は生きたまま）。
 */
import { queryAll, queryOne } from '../../../shared/db/connection';
import { isQsheetAdmin, canAccessDoc } from '../access';
import { docPathOf } from '../../../shared/production/miniapps';
import type {
  JourneyDay,
  JourneyResponse,
  StageHint,
  HintTone,
  Suggestion,
  ScopeCard,
  ScopeGroup,
} from '../../../shared/production/journey';

interface AccessUser {
  id: string;
  role: string;
  permissions?: Record<string, string>;
}

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

function buildDayFromDocs(date: string | null, label: string | null, docs: DocRow[]): JourneyDay {
  const hasAny = docs.length > 0;
  const latestUpdatedAt = docs.length > 0 ? (docs[0].updated_at as unknown as string) : null;
  const hasRows = docs.some((d) => d.section_count > 0);

  const stages: StageHint[] = [
    // `day`（枠）: qsheet_schedule_items がまだ無いので常に blank（段4で埋める）
    { stage: 'day', tone: 'blank', facts: [] },
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
  if (!hasAny) {
    suggestions.push({ key: 'no_sheet', label: '進行台本がまだありません', to: '/qsheet/sheets' });
  } else {
    const emptyDoc = docs.find((d) => d.section_count === 0);
    if (emptyDoc) {
      suggestions.push({ key: 'sheet_no_rows', label: '進行台本の中身がまだ空です', to: docPathOf('sheet', emptyDoc.id) });
    }
  }
  // duration_gap / mic_unassigned は qsheet_doc_index（段7）が無いので段3では出さない

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
    frames: [], // qsheet_schedule_items が無い段3では常に空（段4で埋める）
    suggestions,
  };
}

/** 案件単位のジャーニー。案件が無ければ null（呼び出し側が 404 を返す） */
export async function getJourneyForProject(projectId: string): Promise<JourneyResponse | null> {
  const project = await queryOne('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
  if (!project) return null;

  const docs = await fetchDocsForProject(projectId);

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

  const docsByDate = new Map<string | null, DocRow[]>();
  for (const d of docs) {
    const key = d.broadcast_date ?? null;
    if (!docsByDate.has(key)) docsByDate.set(key, []);
    docsByDate.get(key)!.push(d);
  }

  const dates = [...dateLabels.keys()].sort();
  const days: JourneyDay[] = dates.map((date) => buildDayFromDocs(date, dateLabels.get(date) ?? null, docsByDate.get(date) ?? []));

  // 日が決まっていない資料（broadcast_date が無い）は「日が決まっていない」束にまとめる
  const undated = docsByDate.get(null) ?? [];
  if (undated.length > 0) days.push(buildDayFromDocs(null, null, undated));

  return { days };
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
  return { days: [buildDayFromDocs(doc.broadcast_date, null, [doc])] };
}
