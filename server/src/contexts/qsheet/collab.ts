// Qシート 同時共同編集 (Phase 2.2) — サーバー側 Yjs ルームマネージャ
//
// doc_id ごとに Y.Doc をメモリに保持し、クライアントからの更新をマージ・中継・永続化する。
// - 初回オープン時は qsheet_documents.data (JSONB) から **一度だけ** 種を作り (canonical seed)、
//   以後は保存済み Y state を正とする (二重 seed による内容重複を防ぐ)。
// - 永続化は debounce + ルーム無人化時に flush。
// - 単一プロセス前提 (本番は env ごと単一コンテナ)。複数インスタンス化する場合は
//   別途 pub/sub 共有が必要。
//
// 永続化は注入 (RoomPersistence) にして純粋にテスト可能にしている。

import { randomUUID } from 'crypto';
import { queryOne, execute } from '../../shared/db/connection';
import { docToUpdate, updateToData } from '../../shared/collab/yjsDoc';
import { YjsRoomManager, type RoomPersistence } from '../../shared/collab/roomManager';

// ルームマネージャは shared/collab/roomManager.ts に移設した (案件の共同編集と共有)。
// ここに残すのは Qシート固有の永続化 (JSONB 種化 + JSONB スナップショット同期) だけ。
export { YjsRoomManager, type RoomPersistence };

/**
 * 種化前に全 section/row へ安定 id を後付けする。
 * Phase 0 (クライアント ensureStableIds) 前の JSONB には id が無く、
 * id キーの粒度マージが機能しないため、サーバー種でも必ず id を保証する。
 * 種は初回一度きり永続化されるので id はその後 Y state 内で安定する。
 */
function backfillIds(data: any): any {
  if (!data || !Array.isArray(data.sections)) return data;
  for (const sec of data.sections) {
    if (sec && typeof sec === 'object' && !sec.id) sec.id = `sec_${randomUUID()}`;
    if (sec && Array.isArray(sec.rows)) {
      for (const row of sec.rows) {
        if (row && typeof row === 'object' && !row.id) row.id = `row_${randomUUID()}`;
      }
    }
  }
  return data;
}

// ── 本番配線: DB 永続化 ────────────────────────────────
const dbPersistence: RoomPersistence = {
  async loadState(docId) {
    const row = await queryOne('SELECT state FROM qsheet_doc_yjs WHERE doc_id = $1', [docId]);
    const state = row?.state as Buffer | undefined;
    return state ? new Uint8Array(state) : null;
  },
  async loadSeed(docId) {
    const row = await queryOne(
      'SELECT data FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
      [docId],
    );
    if (!row) return null;
    const data = typeof row.data === 'string' ? JSON.parse(row.data as string) : row.data;
    return docToUpdate(backfillIds(data));
  },
  async persist(docId, state) {
    await execute(
      `INSERT INTO qsheet_doc_yjs (doc_id, state, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (doc_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
      [docId, Buffer.from(state)],
    );
    // Phase 4a: JSONB スナップショットも同期し、JSONB を読む既存経路
    // (OnAir/Rundown/Prompter/音声サポート/PDF/一覧) を collab 編集中も最新に保つ。
    // これがカットオーバー (全員常時 collab) の前提。失敗しても Y 永続化は成立済みなので握りつぶす。
    try {
      const data = updateToData(state);
      await execute(
        `UPDATE qsheet_documents SET data = $2, updated_at = now() WHERE id = $1 AND deleted_at IS NULL`,
        [docId, JSON.stringify(data)],
      );
    } catch (e) {
      console.error('[qsheet-collab] jsonb snapshot error', e);
    }
  },
};

export const qsheetRooms = new YjsRoomManager(dbPersistence, 3000, 'qsheet-collab');
