// テロップCG — 進行台本（Qシート）からの取り込み（段C）。
//
// docs/design/v4/graphics-redesign.md §9「進行台本との連携」1〜2番の最小実装。
//   1. 台本のテロップ列（`type === 'telop'` の block）の文言を、コーナー（section）ごと
//      そのままの並びで「取り込み候補」として一覧にする（previewQsheetImport）
//   2. 選んだ候補を graphics_pages へ一括投入する（commitQsheetImport）。取り込んだページは
//      台本の行 ID（qsheet_row_id）を覚えるので、あとから「台本と違います」の差分検出
//      （fetchQsheetLiveText）ができる
// §9 3番「本番で追従」・4番「依頼のタイミング選択」はここでは実装しない（段E/段D）。
//
// roster-import.service.ts（Excel名簿からの一括生成）と役割は近い（「まとめて
// graphics_pages を作る」）が、あちらと違って**取り込み元が別テーブルの JSONB**であり、
// かつ**紐づけを覚えて後から差分検出する**点が違う——preview/commit の2段構えと
// 呼出番号の払い出し方だけを踏襲する。
//
// ⚠️ サーバーは client-techops を import できない（`server/src/shared/collab/yjsDoc.ts`
// 冒頭コメントと同じ理由）。qsheet_documents.data の形の正は
// client-techops/src/pages/rundown/rundownData.ts の DocumentData/Section/CueRow/Block
// だが、ここでは必要な部分だけを緩い形（プロパティは全て unknown 起点）で複製し、
// 使う側で都度 typeof/Array.isArray を見て確かめる（JSONB は壊れた形でも入りうるため）。
import { queryAll, queryOne, withTransaction } from '../../../shared/db/connection';
import { AppError } from '../../../shared/middleware/errorHandler';
import { AccessUser, canAccessDoc } from '../../qsheet/access';
import { GraphicsPage, mapPage, PartKey, PART_KEYS, Slot, SLOTS, SLOT_CALL_BASE } from '../store';

// ── qsheet_documents.data（JSONB）の緩い形 ──────────────────────────────
// 各プロパティを unknown 起点にしてあるのは「型を信じない」ことを型で強制するため
// （実際に読むところ〈collectTelopEntries〉で typeof / Array.isArray を都度見る）。
interface RawTelopEntry {
  label?: unknown;
  memo?: unknown;
}
interface RawCell {
  entries?: RawTelopEntry[];
}
interface RawRow {
  id?: unknown;
  cells?: Record<string, RawCell>;
}
interface RawSection {
  label?: unknown;
  rows?: RawRow[];
}
interface RawBlock {
  id?: unknown;
  type?: unknown;
}
interface RawDocData {
  meta?: { title?: unknown };
  blocks?: RawBlock[];
  sections?: RawSection[];
}

/**
 * 台本の文言から種類（PartKey）を推定する。完璧な推定は要らない
 * ——設計書 §9 も「あとから直せる」前提（TelopEditorPanel.tsx で選び直せる）。
 *   ・「／」（全角）・「/」（半角）を含む文言 → ネーム（例:「山田太郎／ゲスト」）
 *   ・12文字以下の短文 → 題字
 *   ・それ以外 → ネーム（いちばんよく使われる種類を既定にしておく）
 */
export function inferPartKey(text: string): PartKey {
  if (text.includes('／') || text.includes('/')) return 'name';
  if (text.length <= 12) return 'title';
  return 'name';
}

interface TelopTextEntry {
  qsheetRowId: string;
  section: string | null;
  text: string;
  memo: string;
}

/**
 * doc.data の telop 列（`type === 'telop'` の block。0個・1個・複数個いずれもあり得る）
 * × sections × rows を全て走査し、文言（`cells[blockId].entries[0].label`）が
 * 空でない行を列挙する。previewQsheetImport（全件・重複可——複数の telop 列は
 * 独立して全部候補に出す）と fetchQsheetLiveText（rowId→文言のインデックス作成）が
 * この関数を共有する。探索ロジックを2箇所に複製すると片方だけ直し忘れて挙動がずれるため。
 *
 * telop 列が1つも無い台本（新規ドキュメントの既定。DEFAULT_BLOCKS は
 * scenario/video/audio のみ）は空配列を返す——これは正常な0件応答であり、
 * 呼び出し側はエラーにしない。
 *
 * ⚠️ 1行に複数の telop 列がある場合、どちらの列から来たかは区別できない
 * （`graphics_pages.qsheet_row_id` は行 ID だけを覚え、列 ID までは覚えない設計——
 * migration 280 のコメント参照）。fetchQsheetLiveText 側はこの関数が返す配列の
 * **最初の一致**を採用することで割り切っている。
 */
function collectTelopEntries(data: RawDocData): TelopTextEntry[] {
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const telopBlockIds = blocks
    .filter((b) => b && b.type === 'telop' && typeof b.id === 'string')
    .map((b) => b.id as string);
  if (telopBlockIds.length === 0) return [];

  const sections = Array.isArray(data.sections) ? data.sections : [];
  const out: TelopTextEntry[] = [];

  for (const blockId of telopBlockIds) {
    for (const section of sections) {
      if (!section) continue;
      const rows = Array.isArray(section.rows) ? section.rows : [];
      const sectionLabel = typeof section.label === 'string' ? section.label : null;
      for (const row of rows) {
        if (!row || typeof row.id !== 'string') continue;
        const cell = row.cells?.[blockId];
        const entry = cell?.entries?.[0];
        // ⚠️ ここでの entry.label は「行のラベル」ではなく telop の**文言そのもの**
        // ——row.label とは別物（rundownData.ts の CueRow 型コメントと同じ注意点）
        const text = typeof entry?.label === 'string' ? entry.label.trim() : '';
        if (!text) continue;
        out.push({
          qsheetRowId: row.id,
          section: sectionLabel,
          text,
          memo: typeof entry?.memo === 'string' ? entry.memo : '',
        });
      }
    }
  }
  return out;
}

/** 台本ドキュメントを1件取得し、アクセス権を確認する。見つからない・アクセス不可は
 *  どちらも同じ 404（存在の秘匿）——documents.routes.ts の GET /documents/:id と同じ作法。 */
async function loadAccessibleQsheetDoc(
  user: AccessUser,
  qsheetDocId: string
): Promise<{ id: string; data: RawDocData }> {
  const doc = await queryOne(
    `SELECT id, data, created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL`,
    [qsheetDocId]
  );
  if (!doc) throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
  if (!(await canAccessDoc(user, doc.id as string, (doc.created_by as string) ?? null))) {
    throw new AppError(404, 'NOT_FOUND', '台本が見つかりません');
  }
  return { id: doc.id as string, data: (doc.data ?? {}) as RawDocData };
}

export interface QsheetImportCandidate {
  qsheetRowId: string;
  section: string | null;
  text: string;
  memo: string;
  suggestedPartKey: PartKey;
}

export interface QsheetImportPreview {
  docTitle: string;
  candidates: QsheetImportCandidate[];
}

/** 台本のテロップ列を取り込み候補として一覧化する（①「＋テロップ」→「台本から取り込む」）。 */
export async function previewQsheetImport(
  user: AccessUser,
  qsheetDocId: string
): Promise<QsheetImportPreview> {
  const { data } = await loadAccessibleQsheetDoc(user, qsheetDocId);
  const title = data.meta?.title;
  const docTitle = typeof title === 'string' ? title : '';

  const candidates: QsheetImportCandidate[] = collectTelopEntries(data).map((entry) => ({
    ...entry,
    suggestedPartKey: inferPartKey(entry.text),
  }));

  return { docTitle, candidates };
}

export interface QsheetImportItemInput {
  qsheetRowId: string;
  section: string | null;
  slot: string;
  partKey: string;
  name: string;
  fields: Record<string, unknown>;
}

/** 一度の取り込みで作成できるページ数の上限（画面の暴走・誤操作の被害を抑える安全弁）。 */
const MAX_IMPORT_ITEMS = 200;

/**
 * 取り込み候補のうち選ばれた行を graphics_pages へ一括 INSERT する。
 * 呼出番号・並び順の払い出しは roster-import.service.ts の commitRosterImport と
 * 同じやり方（既存の使用状況を1回だけ読み、以降はメモリ上で払い出す）。
 */
export async function commitQsheetImport(
  user: AccessUser,
  projectId: number,
  qsheetDocId: string,
  items: QsheetImportItemInput[]
): Promise<GraphicsPage[]> {
  // プレビューは通っていても、その間に共有が外れた・台本が削除された可能性があるため
  // 念のため再確認する（防御的チェック。プレビューと投入が別リクエストである以上、
  // 間に何が起きても不思議はない）。
  await loadAccessibleQsheetDoc(user, qsheetDocId);

  if (items.length > MAX_IMPORT_ITEMS) {
    throw new AppError(400, 'VALIDATION_ERROR', `一度に取り込めるのは ${MAX_IMPORT_ITEMS} 件までです`);
  }
  for (const item of items) {
    if (!item || typeof item.qsheetRowId !== 'string' || !item.qsheetRowId) {
      throw new AppError(400, 'VALIDATION_ERROR', 'qsheetRowId は必須です');
    }
    if (!SLOTS.includes(item.slot as Slot)) {
      throw new AppError(400, 'VALIDATION_ERROR', `slot は ${SLOTS.join(' / ')} のいずれかです`);
    }
    if (!PART_KEYS.includes(item.partKey as PartKey)) {
      throw new AppError(400, 'VALIDATION_ERROR', `partKey は ${PART_KEYS.join(' / ')} のいずれかです`);
    }
    if (typeof item.name !== 'string' || !item.name.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', 'name は必須です');
    }
  }

  return withTransaction(async (tx) => {
    // 呼出番号・並び順は既存の使用状況を1回だけ読み、以降はメモリ上で払い出す
    // （commitRosterImport と同じ理由——行ごとに DB を引くと N 往復になるうえ、
    //  同一トランザクション内では未コミットの直前行を SELECT で拾えない）。
    const existing = await tx.queryAll(
      `SELECT call_no, sort_order FROM graphics_pages WHERE project_id = ?`,
      [projectId]
    );
    const usedCallNos = new Set(existing.map((r) => r.call_no as number));
    let nextSortOrder = existing.reduce((max, r) => Math.max(max, (r.sort_order as number) ?? 0), 0) + 1;

    const created: GraphicsPage[] = [];

    for (const item of items) {
      const slot = item.slot as Slot;
      // roster と違い items 全体で slot が揃っているとは限らない（部品ごとに既定スロットが
      // 違う——例: ネーム/題字は lower・ティッカーは ticker）ため、行ごとに
      // SLOT_CALL_BASE[slot] から探し直す（store.ts の nextCallNo と同じ探し方）。
      let callNo = SLOT_CALL_BASE[slot];
      while (usedCallNos.has(callNo)) callNo += 1;
      usedCallNos.add(callNo);

      const sortOrder = nextSortOrder;
      nextSortOrder += 1;

      const name = item.name.trim().slice(0, 300); // graphics_pages.name は VARCHAR(300)
      const fields = (item.fields && typeof item.fields === 'object' && !Array.isArray(item.fields))
        ? item.fields
        : {};

      const inserted = await tx.queryOne(
        `INSERT INTO graphics_pages
           (project_id, call_no, slot, part_key, name, fields, proof_state, sort_order,
            section, qsheet_doc_id, qsheet_row_id)
         VALUES (?, ?, ?, ?, ?, ?::jsonb, 'draft', ?, ?, ?, ?)
         RETURNING *`,
        [
          projectId, callNo, slot, item.partKey, name, JSON.stringify(fields), sortOrder,
          item.section || null, qsheetDocId, item.qsheetRowId,
        ]
      );
      if (inserted) created.push(mapPage(inserted));
    }

    return created;
  });
}

export interface QsheetLiveTextEntry {
  pageId: number;
  liveText: string | null;
}

/**
 * 台本から取り込んだページ（`qsheet_doc_id`/`qsheet_row_id` を持つページ）について、
 * 台本側のいまの文言（`liveText`）を返す。①の「台本と違います」バッジが
 * `fields[primaryFieldKey]` と `liveText` を突き合わせて差分を判定する
 * （突き合わせ自体はクライアント側・GraphicsHubPage.tsx の役割——ここは
 * 「いまの台本の文言」を返すだけ）。
 */
export async function fetchQsheetLiveText(
  user: AccessUser,
  projectId: number
): Promise<QsheetLiveTextEntry[]> {
  const pages = await queryAll(
    `SELECT id, qsheet_doc_id, qsheet_row_id FROM graphics_pages
     WHERE project_id = ? AND qsheet_doc_id IS NOT NULL AND qsheet_row_id IS NOT NULL`,
    [projectId]
  );
  if (pages.length === 0) return [];

  // qsheet_doc_id ごとにグループ化する——ドキュメントは1回だけ fetch する
  // （ページ数ぶん同じ台本を何度も読み直さない）。
  const refsByDoc = new Map<string, { pageId: number; qsheetRowId: string }[]>();
  for (const p of pages) {
    const docId = p.qsheet_doc_id as string;
    const list = refsByDoc.get(docId) ?? [];
    list.push({ pageId: p.id as number, qsheetRowId: p.qsheet_row_id as string });
    refsByDoc.set(docId, list);
  }

  const results: QsheetLiveTextEntry[] = [];

  for (const [docId, refs] of refsByDoc) {
    const doc = await queryOne(
      `SELECT id, data, created_by FROM qsheet_documents WHERE id = ? AND deleted_at IS NULL`,
      [docId]
    );
    // 削除済み・アクセス不可のドキュメントは、このグループの全ページを liveText: null にする
    // ——エラーにせず握りつぶす。「台本と違います」の差分検出は「わからなければ差分なし
    // 扱い」でよい設計（false negative 上等・誤検知を避ける方を優先。GraphicsHubPage.tsx
    // 側のコメントと対応する）。
    if (!doc || !(await canAccessDoc(user, doc.id as string, (doc.created_by as string) ?? null))) {
      for (const ref of refs) results.push({ pageId: ref.pageId, liveText: null });
      continue;
    }

    // 同じ行 id が複数の telop 列に跨って存在する場合（1行に複数のテロップ列がある台本）は
    // 先に見つかった方を優先する——collectTelopEntries 冒頭コメント参照。
    const liveTextByRowId = new Map<string, string>();
    for (const entry of collectTelopEntries(doc.data as RawDocData)) {
      if (!liveTextByRowId.has(entry.qsheetRowId)) {
        liveTextByRowId.set(entry.qsheetRowId, entry.text);
      }
    }

    for (const ref of refs) {
      results.push({ pageId: ref.pageId, liveText: liveTextByRowId.get(ref.qsheetRowId) ?? null });
    }
  }

  return results;
}
