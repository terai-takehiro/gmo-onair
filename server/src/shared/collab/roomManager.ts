// 同時共同編集の部屋管理 (汎用) — Yjs ルームマネージャ
//
// もともと qsheet 専用 (contexts/qsheet/collab.ts) にあったものを shared に移した。
// 中身は最初から永続化を注入する形になっていて Qシート固有の要素が無かったので、
// **コピーせずにそのまま共有する**。案件 (GLS-B) の共同編集もこれを使う。
//
// 設計:
//   - docId ごとに Y.Doc をメモリに保持し、クライアントからの更新をマージ・中継・永続化する
//   - 初回オープン時は既存データから **一度だけ** 種を作り (canonical seed)、
//     以後は保存済み Y state を正とする (二重 seed による内容重複を防ぐ)
//   - 永続化は debounce + ルーム無人化時に flush
//   - **単一プロセス前提** (本番は env ごと単一コンテナ)。
//     複数インスタンスに増やす場合は別途 pub/sub 共有が必要
//
// 永続化は注入 (RoomPersistence) にして純粋にテスト可能にしている。

import * as Y from 'yjs';

export interface RoomPersistence {
  /** 保存済み Y state を返す (無ければ null)。 */
  loadState(docId: string): Promise<Uint8Array | null>;
  /** 既存データから初期 Y state (種) を構築して返す (無ければ null)。 */
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
    /** ログの接頭辞。どの機能の部屋かを切り分けるため */
    private label = 'collab',
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
    // 壊れた/不正な形式のバイナリ（クライアントのバグ・悪意ある入力どちらもあり得る）を
    // 渡すと Y.applyUpdate が例外を投げる。呼び出し元（Socket.IO の 'yjs:update' ハンドラ）
    // は try/catch を持たないため、ここで潰さないと**1件の壊れた更新でプロセスごと落ちる**
    // （qsheet だけでなく案件の共同編集も同じルームマネージャを使うため影響範囲が広い。
    // 実際に qsheet→techops移行 Phase 3 のブリッジ検証中、ダミーのバイナリを送って再現した）。
    try {
      Y.applyUpdate(room.ydoc, update, 'remote');
    } catch (e) {
      console.error(`[${this.label}] applyUpdate 失敗 (docId=${docId}) — 不正な update を無視`, e);
      return;
    }
    room.dirty = true;
    this.scheduleSave(docId);
  }

  private scheduleSave(docId: string): void {
    const room = this.rooms.get(docId);
    if (!room || room.saveTimer) return;
    room.saveTimer = setTimeout(() => {
      if (room) room.saveTimer = null;
      this.flush(docId).catch((e) => console.error(`[${this.label}] persist error`, e));
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

  /** 部屋が開いているか (テスト・診断用)。 */
  isOpen(docId: string): boolean {
    return this.rooms.has(docId);
  }
}
