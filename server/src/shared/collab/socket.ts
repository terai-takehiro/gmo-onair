// 同時共同編集の Socket.IO ネームスペース (汎用ファクトリ)
//
// Yjs の同期・中継・在席 (presence)・ライブカーソル (awareness) は対象が変わっても同じなので、
// ここに 1 つだけ持ってアクセス判定だけを注入する。
//
// Qシート (contexts/qsheet/socket.ts) は cue:* の進行同期が絡み合っているので今回は移していない。
// あちらを後から寄せる場合も、判定 (resolveSocketUser) は shared/collab/socketAuth.ts で
// 共有しているので認証だけ食い違うことはない。
//
// アクセス制御の考え方 (Qシートと同じ):
//   - 未認証 / 権限なしでも room への join = リッスンは許す
//   - **書き込み (yjs:update) と awareness の発火はアクセス権のあるユーザーだけ**
//     → docId を知っただけで他人の案件に書き込める、という穴を作らない

import type { Server, Socket } from 'socket.io';
import { resolveSocketUser, type SocketUser } from './socketAuth';
import type { YjsRoomManager } from './roomManager';

export interface CollabNamespaceConfig {
  /** Socket.IO の namespace (例 '/project-collab') */
  namespace: string;
  /** ハンドシェイクのクエリ名 (例 'projectId') */
  idParam: string;
  /** room 名の接頭辞 (例 'project' → 'project:<id>') */
  roomPrefix: string;
  /** ログの接頭辞 */
  label: string;
  rooms: YjsRoomManager;
  /** この docId を編集してよいか。**false ならリッスンのみ** */
  canEdit(user: SocketUser, docId: string): Promise<boolean>;
}

export function initCollabNamespace(io: Server, cfg: CollabNamespaceConfig): void {
  // docId -> (socketId -> user) : 認証済み & 編集可のユーザーのみ
  const presence = new Map<string, Map<string, SocketUser>>();

  /** 在席一覧を userId で重複排除して返す (同一ユーザーの複数タブ = 1 件) */
  const presenceList = (docId: string): { userId: string; name: string }[] => {
    const m = presence.get(docId);
    if (!m) return [];
    const seen = new Map<string, string>();
    for (const u of m.values()) if (!seen.has(u.id)) seen.set(u.id, u.name);
    return Array.from(seen, ([userId, name]) => ({ userId, name }));
  };

  const ns = io.of(cfg.namespace);

  // サーバー由来の更新 (AI の追記など) を接続中の全員へ配る。
  // クライアント由来は下の 'yjs:update' で中継しているが、あちらは送信者を除くため別に要る。
  cfg.rooms.setBroadcaster((docId, update) => {
    ns.to(`${cfg.roomPrefix}:${docId}`).emit('yjs:update', Buffer.from(update));
  });

  // connection ハンドラは **同期関数** にしてある。
  //
  // ここを async にして先に await すると、認証解決の間はまだ socket.on(...) が
  // 登録されておらず、**接続直後に飛んでくる最初の 'yjs:sync' が捨てられる**
  // (Socket.IO は未登録イベントをバッファしない)。実測で踏んだので、
  // ハンドラは即座に張り、各ハンドラ側で「準備完了」を待つ形にしている。
  ns.on('connection', (socket: Socket) => {
    const docId = socket.handshake.query[cfg.idParam] as string | undefined;
    if (!docId) {
      socket.disconnect();
      return;
    }
    const room = `${cfg.roomPrefix}:${docId}`;
    socket.join(room);

    // 認証とアクセス判定は非同期で進め、ハンドラはこれを await する
    const ready: Promise<void> = (async () => {
      const user = await resolveSocketUser(socket);
      let canEdit = false;
      if (user) {
        try {
          canEdit = await cfg.canEdit(user, docId);
        } catch (e) {
          console.error(`[${cfg.label}] アクセス判定に失敗 (編集不可として扱います)`, e);
        }
      }
      socket.data.user = user;
      socket.data.canEdit = canEdit;

      if (user && canEdit) {
        let m = presence.get(docId);
        if (!m) {
          m = new Map();
          presence.set(docId, m);
        }
        m.set(socket.id, user);
        ns.to(room).emit('presence:sync', { users: presenceList(docId) });
      } else {
        // リッスン専用でも現在の在席一覧は渡す
        socket.emit('presence:sync', { users: presenceList(docId) });
      }
    })();
    // 失敗しても接続自体は維持する (編集不可のまま)
    void ready.catch((e) => console.error(`[${cfg.label}] 初期化に失敗`, e));

    socket.on('presence:query', async () => {
      await ready;
      socket.emit('presence:sync', { users: presenceList(docId) });
    });

    // ── Yjs 同期 ──────────────────────────────────
    let acquired = false;

    socket.on('yjs:sync', async () => {
      await ready;
      if (!socket.data.canEdit) return;
      if (!acquired) {
        acquired = true;
        try {
          await cfg.rooms.acquire(docId);
        } catch (e) {
          acquired = false;
          console.error(`[${cfg.label}] acquire error`, e);
          return;
        }
      }
      const state = cfg.rooms.getState(docId);
      if (state) socket.emit('yjs:state', Buffer.from(state));
    });

    socket.on('yjs:update', async (update: ArrayBuffer | Buffer | Uint8Array) => {
      await ready;
      if (!socket.data.canEdit || !acquired) return;
      const u = update instanceof Uint8Array ? update : new Uint8Array(update as ArrayBuffer);
      cfg.rooms.applyUpdate(docId, u);
      // 他の参加者へ増分を中継
      socket.to(room).emit('yjs:update', Buffer.from(u));
    });

    // awareness (誰がどこを触っているか) — ephemeral。永続化せず中継のみ
    socket.on('awareness:update', async (update: ArrayBuffer | Buffer | Uint8Array) => {
      await ready;
      if (!socket.data.canEdit) return;
      const u = update instanceof Uint8Array ? update : new Uint8Array(update as ArrayBuffer);
      socket.to(room).emit('awareness:update', Buffer.from(u));
    });

    socket.on('disconnect', () => {
      const m = presence.get(docId);
      if (m?.delete(socket.id)) {
        if (m.size === 0) presence.delete(docId);
        ns.to(room).emit('presence:sync', { users: presenceList(docId) });
      }
      // 部屋の参照を必ず手放す (無人になれば flush + evict される)
      if (acquired) {
        acquired = false;
        cfg.rooms.release(docId);
      }
    });
  });
}
