/**
 * 運営マニュアル — 差し込みブロックの resolver（段C・進行台本の3種）。
 * 設計: docs/design/v4/production-manual.md §4-3（カタログ）・§5-4（`resolve` API）。
 *
 * `sheet.rundown`（進行表）・`sheet.excerpt`（台本の抜粋）・`sheet.micAssignment`（マイク割り）の
 * 3種を担当する。いずれも `qsheet_documents.data`（Yjs の正が3秒ごとに書き込む読み取り専用の
 * スナップショット）を読むだけで、Yjs 自体はデコードしない —
 * `server/src/contexts/qsheet/services/production/qsheet-read.service.ts` の
 * `fetchDocForRead`/`getQsheetOutline`/`getQsheetRows`（MCP の `get_sheet` が使っているのと同じ関数）
 * をそのまま呼ぶ。
 *
 * ⚠️ **アクセス制御は `canAccessDoc` を使わない**（作成者／個別共有／`system_admin` だけで、
 * 案件メンバー自動可視が無いため）。代わりに、`sourceId` で引いた `qsheet_documents` の
 * `project_id`/`program_id` が、呼び出し元（冊子）の `project_id`/`program_id` と一致することだけを
 * 検査する（`resolveAccessibleDoc`）。冊子自体のアクセス確認（`canAccessManual`）はルート側の責務
 * ——ここでは「同じ案件/番組の台本か」だけを見る。一致しなければ他案件のデータを一切返さない
 * （`{ data: null, updatedAt: null, error: 'access_denied' }`）。
 *
 * ディスパッチャ（`GET /techops/manuals/:id/resolve`）との契約は `ManualLinkResolveResult`
 * （`{ data, updatedAt, error? }`）に統一する。データが無い/権限が無いときは例外を投げず
 * この形で返す（呼び出し元が blockId ごとにマップへ詰めるだけで済むように）。
 */
import { queryAll, queryOne } from '../../../../shared/db/connection';
import type { BlockLike } from '../../../../shared/qsheet/blockRef';
import {
  fetchDocForRead,
  getQsheetOutline,
  getQsheetRows,
  type QsheetOutline,
  type QsheetRowsSection,
} from '../production/qsheet-read.service';

type Json = Record<string, unknown>;

/** `fetchDocForRead` の戻り値の型を、公開されていない内部 `DocRow` から名前無しで借りる */
type SheetDoc = NonNullable<Awaited<ReturnType<typeof fetchDocForRead>>>;

/** resolver へ渡す文脈。冊子（`qsheet_manuals`）の `project_id`/`program_id` をそのまま渡す */
export interface ManualLinkResolveScope {
  projectId: string | null;
  programId: string | null;
}

/** sheet.* の3種は `sourceId`（`qsheet_documents.id`）が必須 */
export interface ManualLinkResolveCtx extends ManualLinkResolveScope {
  sourceId: string | null;
}

/** resolver 全員の統一シグネチャ（共通ポリシー3）。例外は投げてよい——ディスパッチャがまとめて捕捉する */
export interface ManualLinkResolveResult {
  data: unknown;
  updatedAt: string | null;
  error?: string;
}

interface DocOwner {
  projectId: string | null;
  programId: string | null;
  updatedAt: string;
}

async function fetchDocOwner(sourceId: string): Promise<DocOwner | null> {
  const row = await queryOne(
    'SELECT project_id, program_id, updated_at FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL',
    [sourceId],
  );
  if (!row) return null;
  return {
    projectId: (row.project_id as string) ?? null,
    programId: (row.program_id as string) ?? null,
    updatedAt: new Date(row.updated_at as string).toISOString(),
  };
}

/** 冊子と同じ project_id、または同じ program_id を持つ資料だけを true にする（null 同士は一致させない） */
function ownerMatchesCtx(ctx: ManualLinkResolveScope, owner: DocOwner): boolean {
  if (ctx.projectId && owner.projectId === ctx.projectId) return true;
  if (ctx.programId && owner.programId === ctx.programId) return true;
  return false;
}

type AccessibleDoc =
  | { ok: true; doc: SheetDoc; updatedAt: string }
  | { ok: false; result: ManualLinkResolveResult };

/**
 * sourceId を検査してから中身を読む共通の入口。3つの resolver がすべてここを通る。
 * ⚠️ ここで弾かれた（=owner が一致しない）場合は絶対に doc.data を読まない
 * ——他案件/他番組の台本を盗み見る経路を作らないための必須ガード。
 */
async function resolveAccessibleDoc(ctx: ManualLinkResolveCtx): Promise<AccessibleDoc> {
  if (!ctx.sourceId) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_id_required' } };
  }
  const owner = await fetchDocOwner(ctx.sourceId);
  if (!owner) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_missing' } };
  }
  if (!ownerMatchesCtx(ctx, owner)) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'access_denied' } };
  }
  const doc = await fetchDocForRead(ctx.sourceId);
  if (!doc) {
    return { ok: false, result: { data: null, updatedAt: null, error: 'source_missing' } };
  }
  return { ok: true, doc, updatedAt: owner.updatedAt };
}

/**
 * outline の全セクションを、それぞれ `getQsheetRows(mode:'section')` で集めて返す。
 * `mode:'full'` は400行超で `TOO_LARGE` を投げる（qsheet-read.service.ts の元の制約）が、
 * セクション単位のループなら上限に関係なく全セクションを返せる。
 */
async function sectionsOf(doc: SheetDoc, outline: QsheetOutline, includeText: boolean): Promise<QsheetRowsSection[]> {
  const sections: QsheetRowsSection[] = [];
  for (const s of outline.sections) {
    const [section] = await getQsheetRows(doc, { mode: 'section', sectionId: s.id, includeText });
    if (section) sections.push(section);
  }
  return sections;
}

// ============================================================
// sheet.rundown（進行表: 項目・尺・担当。出す列はクライアントが options で選ぶ）
// ============================================================
export async function resolveSheetRundown(ctx: ManualLinkResolveCtx): Promise<ManualLinkResolveResult> {
  const resolved = await resolveAccessibleDoc(ctx);
  if (!resolved.ok) return resolved.result;
  const { doc, updatedAt } = resolved;
  const outline = await getQsheetOutline(doc);
  const sections = await sectionsOf(doc, outline, false);
  return {
    data: {
      docTitle: doc.title,
      docNo: doc.doc_no,
      // 出す列の候補（ref・type・label）。「項目・尺・担当」のどれをどの列に割り当てるかは
      // クライアントの options 任せ——resolver は候補を全部返すだけでよい
      blocks: outline.blocks,
      sections,
      totals: outline.totals,
    },
    updatedAt,
  };
}

// ============================================================
// sheet.excerpt（台本の抜粋: 全セクションのタイトル+本文。見せるセクションはクライアント任せ）
// ============================================================
export async function resolveSheetExcerpt(ctx: ManualLinkResolveCtx): Promise<ManualLinkResolveResult> {
  const resolved = await resolveAccessibleDoc(ctx);
  if (!resolved.ok) return resolved.result;
  const { doc, updatedAt } = resolved;
  const outline = await getQsheetOutline(doc);
  // includeText: true — 台詞などの本文もそのまま返す（どのセクションを載せるかは options 任せなので、
  // ここで絞り込まない）
  const sections = await sectionsOf(doc, outline, true);
  return {
    data: {
      docTitle: doc.title,
      docNo: doc.doc_no,
      blocks: outline.blocks,
      sections,
    },
    updatedAt,
  };
}

// ============================================================
// sheet.micAssignment（マイク割り: 出演者 × マイクCh）
// ============================================================
interface MicAssignmentEntry {
  ch: number;
  person: string;
  micType: string;
  state: string;
  sectionId: string;
  sectionLabel: string;
  rowId: string;
  rowLabel: string | null;
}

/**
 * `audio_mic` 型の列だけを見て、行ごとの割り当てを生のまま集める。
 * `formatCell()` の `type === 'audio_mic'` 分岐と同じフィールド（`cell.assignments[].{ch, person,
 * micType, state}`）を読むが、こちらは表示用に文字列へ畳まず構造化データのまま返す
 * （紙面側でどう並べるかを決めるため）。
 */
function extractMicAssignments(doc: SheetDoc): MicAssignmentEntry[] {
  const data = doc.data;
  const blocks = Array.isArray(data.blocks) ? (data.blocks as BlockLike[]) : [];
  const micBlockIds = new Set(blocks.filter((b) => b?.type === 'audio_mic' && b.id).map((b) => b.id));
  if (micBlockIds.size === 0) return [];

  const sections = Array.isArray(data.sections) ? (data.sections as Json[]) : [];
  const entries: MicAssignmentEntry[] = [];
  for (const section of sections) {
    const sectionId = String(section.id ?? '');
    const sectionLabel = String(section.label ?? '');
    const rows = Array.isArray(section.rows) ? (section.rows as Json[]) : [];
    for (const row of rows) {
      const cells = (row.cells && typeof row.cells === 'object' ? row.cells : {}) as Json;
      for (const blockId of micBlockIds) {
        const cell = cells[blockId];
        if (!cell || typeof cell !== 'object') continue;
        const assignments = Array.isArray((cell as Json).assignments) ? ((cell as Json).assignments as Json[]) : [];
        for (const a of assignments) {
          entries.push({
            ch: Number(a.ch ?? 0),
            person: String(a.person ?? ''),
            micType: String(a.micType ?? ''),
            state: String(a.state ?? ''),
            sectionId,
            sectionLabel,
            rowId: String(row.id ?? ''),
            rowLabel: typeof row.label === 'string' ? row.label : null,
          });
        }
      }
    }
  }
  return entries.sort((a, b) => a.ch - b.ch);
}

export async function resolveSheetMicAssignment(ctx: ManualLinkResolveCtx): Promise<ManualLinkResolveResult> {
  const resolved = await resolveAccessibleDoc(ctx);
  if (!resolved.ok) return resolved.result;
  const { doc, updatedAt } = resolved;
  const outline = await getQsheetOutline(doc);
  const assignments = extractMicAssignments(doc);
  return {
    data: {
      docTitle: doc.title,
      docNo: doc.doc_no,
      // 定義済みのCh一覧（{ ch, label? }）。台本にマイク割りの列が無ければ空配列
      channels: outline.masters.micChannels,
      micTypes: outline.masters.micTypes,
      // 行ごとの生の割り当て（セクション/行の文脈つき）。「出演者 × Ch」の組み方は紙面側で決める
      assignments,
    },
    updatedAt,
  };
}

// ============================================================
// link-sources エンドポイント用: この project/program に属する進行台本の一覧
// ============================================================
export interface SheetSourceOption {
  id: string;
  label: string;
}

/**
 * `doc-list.service.ts` の `fetchSheets` に近いクエリ（見える範囲の絞り込みでは
 * なく、冊子と同じ project_id/program_id を持つ資料だけを返す——resolve と同じ
 * ポリシーに合わせるため、あえて別クエリにしてある）。
 */
export async function listSheetSources(scope: ManualLinkResolveScope): Promise<SheetSourceOption[]> {
  let sql = 'SELECT id, title, doc_no FROM qsheet_documents WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (scope.projectId) {
    sql += ' AND project_id = ?';
    params.push(scope.projectId);
  } else if (scope.programId) {
    sql += ' AND program_id = ?';
    params.push(scope.programId);
  } else {
    return [];
  }
  sql += ' ORDER BY updated_at DESC LIMIT 200';

  const rows = await queryAll(sql, params);
  return rows.map((r) => ({
    id: r.id as string,
    label: (r.title as string) || (r.doc_no as string) || '（無題）',
  }));
}
