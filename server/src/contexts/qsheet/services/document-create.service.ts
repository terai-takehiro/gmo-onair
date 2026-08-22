/**
 * 進行台本（`qsheet_documents`）の新規作成 — 唯一の正。
 *
 * これまで新規作成の初期値は `DashboardPage.tsx` がクライアント側で組んでおり、
 * `POST /qsheet/documents` は `req.body.data` をそのまま入れるだけだった
 * （サーバー側に「唯一の正」となる関数が無かった。04-schedule-impl.md §4-5・§12-8）。
 *
 * `POST /qsheet/documents` と `POST /schedules/:id/items/:itemId/qsheet`（枠→台本の橋）の
 * **両方がこれを呼ぶ**。既存クライアントが `data` を自分で組んで送ってくる経路は
 * 引き続き尊重する（互換を壊さない）が、`masters` が抜けていたら必ず補う
 * （抜けると話者・素材の参照が落ちる。`DashboardPage.tsx:509` は入れている）。
 */
import { v4 as uuid } from 'uuid';
import { execute, queryOne, type Row } from '../../../shared/db/connection';
import { issueDocNo } from './docNo.service';

/** `execute`/`queryOne` と同じ形の最小インターフェース。`withTransaction` の `tx` もこれを満たす */
export interface DocumentDbClient {
  execute(sql: string, params?: unknown[]): Promise<void>;
  queryOne(sql: string, params?: unknown[]): Promise<Row | undefined>;
}
const defaultDb: DocumentDbClient = { execute, queryOne };

const MAX_TITLE_LENGTH = 500;

export const DEFAULT_BLOCKS = [
  { id: 'scenario', type: 'scenario', label: '台本', width: 300 },
  { id: 'video', type: 'video', label: '映像', width: 150 },
  { id: 'audio', type: 'audio', label: '音声', width: 150 },
];

const EMPTY_MASTERS = { persons: [], video: [], audio: [], telop: [] };

export interface CreateDocumentInput {
  title: string;
  projectId?: string | null;
  /** 番組（マニュアル・案件管理外）。`projectId` と同時には立てない（migration 227） */
  programId?: string | null;
  episodeId?: string | null;
  episodeCode?: string | null;
  broadcastDate?: string | null;
  /** "HH:MM" / "HH:MM"（25:30 のような日跨ぎを含む）。`data` を渡さないときだけ使う */
  startTime?: string | null;
  /** クライアントが自分で組んだ `data`。あれば尊重するが masters だけは補う */
  data?: unknown;
  blocks?: unknown[];
  createdBy: string;
}

function ensureMasters(data: Record<string, unknown>): Record<string, unknown> {
  if (data.masters && typeof data.masters === 'object') return data;
  return { ...data, masters: EMPTY_MASTERS };
}

function buildDefaultData(input: CreateDocumentInput): Record<string, unknown> {
  const title = input.title;
  return {
    meta: {
      title,
      draftNumber: 1,
      draftType: 'numbered',
      broadcastDate: input.broadcastDate ?? '',
      broadcastStartTime: input.startTime ?? '',
      startTime: input.startTime ?? '',
    },
    blocks: input.blocks ?? DEFAULT_BLOCKS,
    sections: [],
    masters: EMPTY_MASTERS,
  };
}

/**
 * 新規作成して、保存済みの行を返す。
 *
 * `db` を渡すと（`withTransaction` の `tx` など）その中で INSERT する。
 * 枠→台本の橋（`schedule-bridge.service.ts`）は「文書の作成」と「項目への
 * リンク」を同じトランザクションに乗せるためにこれを使う。
 */
export async function createDocument(input: CreateDocumentInput, db: DocumentDbClient = defaultDb): Promise<Row> {
  const id = uuid();
  const safeTitle = typeof input.title === 'string' ? input.title.slice(0, MAX_TITLE_LENGTH) : '';

  const rawData = input.data && typeof input.data === 'object' ? (input.data as Record<string, unknown>) : null;
  const safeData = rawData ? ensureMasters(rawData) : buildDefaultData({ ...input, title: safeTitle });

  // 案件にも番組にも紐づかない資料だけ、口頭で言える番号 (SB-202608-0001) を採る。
  // 案件に紐づく資料は GLS 番号が、番組に紐づく資料は番組名が主なので doc_no は不要。
  // ⚠️ 採番自体はこの関数の外側（tx の外）でアトミックに完結する。tx の ROLLBACK と
  //   採番の巻き戻しは連動しない（欠番が出ることはあるが、既存の全採番と同じ性質）。
  const docNo = (input.projectId || input.programId) ? null : await issueDocNo('sheet');

  await db.execute(
    `INSERT INTO qsheet_documents (id, title, data, episode_id, project_id, program_id, broadcast_date, episode_code, status, created_by, updated_by, doc_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    [
      id,
      safeTitle,
      JSON.stringify(safeData),
      input.episodeId || null,
      input.projectId || null,
      input.programId || null,
      input.broadcastDate || null,
      input.episodeCode || null,
      input.createdBy,
      input.createdBy,
      docNo,
    ],
  );

  const row = await db.queryOne('SELECT * FROM qsheet_documents WHERE id = ?', [id]);
  if (!row) throw new Error('createDocument: INSERT 直後の SELECT が空でした');
  return row;
}
