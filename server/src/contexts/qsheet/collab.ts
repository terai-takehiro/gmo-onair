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

import * as Y from 'yjs';
import { randomUUID } from 'crypto';
import { queryOne, execute } from '../../shared/db/connection';
import { docToUpdate } from '../../shared/collab/yjsDoc';

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

export interface RoomPersistence {
  /** 保存済み Y state を返す (無ければ null)。 */
  loadState(docId: string): Promise<Uint8Array | null>;
  /** JSONB から初期 Y state (種) を構築して返す (無ければ null)。 */
  loadSeed(docId: string): Promise<Uint8Array | null>;
  /** Y state を永続化する。 */
  persist(docId: string, state: Uint8Array): Promise<void>;
}

interface Room {
  ydoc: Y.Doc;
  members: number;
  dirty: boolean;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

export class YjsRoomManager {
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room>>();

  constructor(
    private persistence: RoomPersistence,
    private saveDebounceMs = 3000,
  ) {}

  private async hydrate(docId: string): Promise<Room> {
    const ydoc = new Y.Doc();
    const saved = await this.persistence.loadState(docId);
    if (saved) {
      Y.applyUpdate(ydoc, saved);
    } else {
      const seed = await this.persistence.loadSeed(docId);
      if (seed) {
        Y.applyUpdate(ydoc, seed);
        // 種を即 authoritative として永続化 (以後は loadState 経由になり二度と seed しない)
        await this.persistence.persist(docId, Y.encodeStateAsUpdate(ydoc));
      }
    }
    return { ydoc, members: 0, dirty: false, saveTimer: null };
  }

  /** ルームを取得 (無ければ hydrate)。member 数を +1 する。 */
  async acquire(docId: string): Promise<void> {
    const existing = this.rooms.get(docId);
    if (existing) {
      existing.members++;
      return;
    }
    let p = this.loading.get(docId);
    if (!p) {
      p = this.hydrate(docId).then((r) => {
        this.rooms.set(docId, r);
        this.loading.delete(docId);
        return r;
      });
      this.loading.set(docId, p);
    }
    const room = await p;
    room.members++;
  }

  /** member 数を -1。無人になったら flush して evict。 */
  release(docId: string): void {
    const room = this.rooms.get(docId);
    if (!room) return;
    room.members = Math.max(0, room.members - 1);
    if (room.members === 0) {
      void this.flush(docId).finally(() => {
        const r = this.rooms.get(docId);
        if (r && r.members === 0) {
          r.ydoc.destroy();
          this.rooms.delete(docId);
        }
      });
    }
  }

  /** 現在の Y state (全体) を返す (同期の初期応答用)。 */
  getState(docId: string): Uint8Array | null {
    const room = this.rooms.get(docId);
    return room ? Y.encodeStateAsUpdate(room.ydoc) : null;
  }

  /** クライアントからの増分更新を適用 (マージ) し、debounce 永続化を予約する。 */
  applyUpdate(docId: string, update: Uint8Array): void {
    const room = this.rooms.get(docId);
    if (!room) return;
    Y.applyUpdate(room.ydoc, update, 'remote');
    room.dirty = true;
    this.scheduleSave(docId);
  }

  private scheduleSave(docId: string): void {
    const room = this.rooms.get(docId);
    if (!room || room.saveTimer) return;
    room.saveTimer = setTimeout(() => {
      if (room) room.saveTimer = null;
      this.flush(docId).catch((e) => console.error('[qsheet-collab] persist error', e));
    }, this.saveDebounceMs);
  }

  /** dirty なら即永続化する。 */
  async flush(docId: string): Promise<void> {
    const room = this.rooms.get(docId);
    if (!room || !room.dirty) return;
    room.dirty = false;
    if (room.saveTimer) {
      clearTimeout(room.saveTimer);
      room.saveTimer = null;
    }
    await this.persistence.persist(docId, Y.encodeStateAsUpdate(room.ydoc));
  }
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
  },
};

export const qsheetRooms = new YjsRoomManager(dbPersistence);
