/**
 * 枠 → 台本の橋（`POST` / `PUT /schedules/:id/items/:itemId/qsheet`）。
 * 実装設計: 04-schedule-impl.md §4-5
 */
import { queryOne, execute, withTransaction, type Row } from '../../../shared/db/connection';
import { fmtHmPad } from '../../../shared/schedule/time';
import { createDocument } from './document-create.service';
import { canAccessDoc, type AccessUser } from '../access';
import { NotFoundError, ValidationError, HttpError } from './httpErrors';

const LINKABLE_KINDS = ['onair', 'rehearsal', 'recording'];

interface ItemRow {
  id: string;
  schedule_id: string;
  title: string;
  kind: string;
  start_min: number;
  qsheet_document_id: string | null;
}

async function getItemForBridge(scheduleId: string, itemId: string): Promise<ItemRow> {
  const item = await queryOne(
    'SELECT id, schedule_id, title, kind, start_min, qsheet_document_id FROM qsheet_schedule_items WHERE id = $1 AND schedule_id = $2 AND deleted_at IS NULL',
    [itemId, scheduleId],
  );
  if (!item) throw new NotFoundError('項目が見つかりません');
  return item as unknown as ItemRow;
}

/** 項目から新規に台本を作って結ぶ */
export async function createAndLinkDocument(
  scheduleId: string,
  itemId: string,
  userId: string,
): Promise<{ item: Row; document: Row }> {
  const item = await getItemForBridge(scheduleId, itemId);
  if (!LINKABLE_KINDS.includes(item.kind)) {
    throw new ValidationError('台本を作れるのは 本番／リハーサル／収録 の項目だけです');
  }
  if (item.qsheet_document_id) {
    throw new HttpError(409, 'ALREADY_LINKED', 'この項目にはすでに台本が結ばれています');
  }

  const schedule = await queryOne('SELECT service_date, project_id, episode_id FROM qsheet_schedules WHERE id = $1', [scheduleId]);

  return withTransaction(async (tx) => {
    // 文書の作成と項目へのリンクを同じトランザクションに乗せる（§4-5 の手順3・4）
    const document = await createDocument(
      {
        title: item.title || '無題の進行台本',
        projectId: (schedule?.project_id as string) ?? null,
        episodeId: (schedule?.episode_id as string) ?? null,
        broadcastDate: (schedule?.service_date as unknown as string) ?? null,
        startTime: fmtHmPad(item.start_min),
        createdBy: userId,
      },
      tx,
    );
    await tx.execute('UPDATE qsheet_schedule_items SET qsheet_document_id = ?, updated_at = NOW() WHERE id = ?', [document.id, itemId]);
    const updatedItem = await tx.queryOne('SELECT * FROM qsheet_schedule_items WHERE id = ?', [itemId]);
    return { item: updatedItem as Row, document };
  });
}

/** 既存の台本に結ぶ／外す */
export async function setDocumentLink(
  scheduleId: string,
  itemId: string,
  documentId: string | null,
  user: AccessUser,
): Promise<Row> {
  await getItemForBridge(scheduleId, itemId);

  if (documentId) {
    const doc = await queryOne('SELECT id, created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL', [documentId]);
    if (!doc) throw new NotFoundError('進行台本が見つかりません');
    // 存在秘匿のため 404（アクセスできない台本を進行表経由で開ける裏口を作らない・§4-5）
    if (!(await canAccessDoc(user, doc.id as string, (doc.created_by as string) ?? null))) {
      throw new NotFoundError('進行台本が見つかりません');
    }
  }

  await execute('UPDATE qsheet_schedule_items SET qsheet_document_id = $1, updated_at = NOW() WHERE id = $2', [documentId, itemId]);
  const row = await queryOne(
    `SELECT i.*, (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken
     FROM qsheet_schedule_items i
     LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
     WHERE i.id = $1`,
    [itemId],
  );
  if (!row) throw new Error('setDocumentLink: UPDATE 直後の SELECT が空でした');
  return row;
}
