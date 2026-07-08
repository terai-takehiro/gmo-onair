import { Server, Socket } from 'socket.io';
import { verifyToken } from '../../shared/auth/jwt';
import { queryOne } from '../../shared/db/connection';
import { canAccessDoc } from './access';
import { config } from '../../config';
import { qsheetRooms } from './collab';

/**
 * Qsheet Socket.IO namespace.
 *   - OnAir ↔ Rundown の cue 同期 (従来どおり)
 *   - 在席表示 (presence): このシートを今開いている人の一覧
 *
 * 認証モデル (Phase 1):
 *   - ハンドシェイクで JWT (prod) / userId (dev mockAuth) を検証し、
 *     この doc に canAccessDoc なユーザーだけを「編集参加者」として扱う。
 *   - 匿名/未認可でも room への join = リッスンは許可する
 *     (音声サポート公開URL / 単なる閲覧は cue:sync を受けるだけ)。
 *   - transport (cue:*) を **発火** できるのはアクセス権のあるユーザーのみ
 *     → docId さえ知れば誰でも進行を注入できた従来の穴を塞ぐ。
 */

interface SocketUser {
  id: string;
  name: string;
  role: string;
}

// docId -> (socketId -> user) : 認証済み参加者のみ
const presenceByDoc = new Map<string, Map<string, SocketUser>>();

function parseCookie(header: string | undefined, key: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === key) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** ハンドシェイクからユーザーを解決する (JWT 優先、dev のみ userId を信頼)。 */
async function resolveSocketUser(socket: Socket): Promise<SocketUser | null> {
  const auth = (socket.handshake.auth || {}) as { token?: string; userId?: string };
  let userId: string | null = null;

  // 1) JWT (prod): auth.token または cookie
  const token =
    auth.token && auth.token !== 'undefined' && auth.token !== 'null'
      ? auth.token
      : parseCookie(socket.handshake.headers.cookie, 'gmo_onair_token');
  if (token) {
    const payload = verifyToken(token);
    if (payload) userId = payload.userId;
  }

  // 2) dev mockAuth: password 認証が無効なときのみ client の userId を信頼 (HTTP の x-user-id と同じ)
  if (!userId && config.authMode !== 'password' && auth.userId) {
    userId = auth.userId;
  }

  if (!userId) return null;
  try {
    const u = (await queryOne(
      'SELECT id, name, role FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    )) as { id: string; name: string; role: string } | undefined;
    return u ? { id: u.id, name: u.name, role: u.role } : null;
  } catch {
    return null; // DB not ready
  }
}

/** doc の在席一覧を userId で重複排除して返す (同一ユーザーの複数タブ = 1 件)。 */
function presenceList(docId: string): { userId: string; name: string }[] {
  const m = presenceByDoc.get(docId);
  if (!m) return [];
  const seen = new Map<string, string>();
  for (const u of m.values()) if (!seen.has(u.id)) seen.set(u.id, u.name);
  return Array.from(seen, ([userId, name]) => ({ userId, name }));
}

export function initQsheetSocketIO(io: Server): void {
  const qsheetNs = io.of('/qsheet');

  qsheetNs.on('connection', async (socket: Socket) => {
    const docId = socket.handshake.query.docId as string;
    if (!docId) {
      socket.disconnect();
      return;
    }

    const room = `doc:${docId}`;
    socket.join(room);

    // 認証 + アクセス判定 (匿名も join してリッスンは可能)
    const user = await resolveSocketUser(socket);
    let canAccess = false;
    if (user) {
      try {
        const doc = (await queryOne(
          'SELECT created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
          [docId]
        )) as { created_by: string | null } | undefined;
        if (doc) canAccess = await canAccessDoc(user, docId, doc.created_by ?? null);
      } catch {
        /* DB not ready — アクセス不可扱い */
      }
    }
    socket.data.user = user;
    socket.data.canAccess = canAccess;

    // 在席登録: 認証済み & アクセス権のあるユーザーのみ
    if (user && canAccess) {
      let m = presenceByDoc.get(docId);
      if (!m) {
        m = new Map();
        presenceByDoc.set(docId, m);
      }
      m.set(socket.id, user);
      qsheetNs.to(room).emit('presence:sync', { users: presenceList(docId) });
    } else {
      // リッスン専用でも現在の在席一覧は渡す
      socket.emit('presence:sync', { users: presenceList(docId) });
    }

    socket.on('presence:query', () => {
      socket.emit('presence:sync', { users: presenceList(docId) });
    });

    // ── 同時共同編集 (Phase 2.2): Yjs 更新の同期・中継 ──
    // アクセス権のあるユーザーのみ参加可 (匿名/未認可は cue:sync リッスンのみ)。
    let collabAcquired = false;
    socket.on('yjs:sync', async () => {
      if (!socket.data.canAccess) return;
      if (!collabAcquired) {
        collabAcquired = true;
        try {
          await qsheetRooms.acquire(docId);
        } catch (e) {
          collabAcquired = false;
          console.error('[qsheet-collab] acquire error', e);
          return;
        }
      }
      const state = qsheetRooms.getState(docId);
      if (state) socket.emit('yjs:state', Buffer.from(state));
    });

    socket.on('yjs:update', (update: ArrayBuffer | Buffer | Uint8Array) => {
      if (!socket.data.canAccess || !collabAcquired) return;
      const u = update instanceof Uint8Array ? update : new Uint8Array(update as ArrayBuffer);
      qsheetRooms.applyUpdate(docId, u);
      // 他の参加者へ増分を中継
      socket.to(room).emit('yjs:update', Buffer.from(u));
    });

    // ── transport (cue:*) — 発火はアクセス権のあるユーザーのみ、匿名/未認可はリッスンのみ ──
    socket.on('cue:update', (data: { currentCue: number; elapsed: number; isPlaying: boolean }) => {
      if (!socket.data.canAccess) return;
      socket.to(room).emit('cue:sync', {
        currentCue: data.currentCue,
        elapsed: data.elapsed,
        isPlaying: data.isPlaying,
        timestamp: Date.now(),
      });
    });
    socket.on('cue:next', () => {
      if (socket.data.canAccess) socket.to(room).emit('cue:next');
    });
    socket.on('cue:prev', () => {
      if (socket.data.canAccess) socket.to(room).emit('cue:prev');
    });
    socket.on('cue:jump', (data: { cueIndex: number }) => {
      if (socket.data.canAccess) socket.to(room).emit('cue:jump', { cueIndex: data.cueIndex });
    });
    socket.on('cue:play', () => {
      if (socket.data.canAccess) socket.to(room).emit('cue:play');
    });
    socket.on('cue:pause', () => {
      if (socket.data.canAccess) socket.to(room).emit('cue:pause');
    });
    socket.on('cue:reset', () => {
      if (socket.data.canAccess) socket.to(room).emit('cue:reset');
    });

    socket.on('disconnect', () => {
      if (collabAcquired) {
        qsheetRooms.release(docId);
        collabAcquired = false;
      }
      const m = presenceByDoc.get(docId);
      if (m && m.delete(socket.id)) {
        if (m.size === 0) presenceByDoc.delete(docId);
        qsheetNs.to(room).emit('presence:sync', { users: presenceList(docId) });
      }
    });
  });

  console.log('Socket.IO initialized for qsheet sync (auth + presence)');
}
