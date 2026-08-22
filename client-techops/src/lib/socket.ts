import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// ハンドシェイク認証用の資格情報を localStorage から読む。
// prod: JWT (gmo_onair_token) / dev mockAuth: user.id (x-user-id 相当)。
// 匿名 (公開音声サポート等) では両方 null になり得るが、その場合はリッスン専用で接続できる。
function readSocketAuth(): { token?: string; userId?: string } {
  try {
    const token = localStorage.getItem('gmo_onair_token');
    const rawUser = localStorage.getItem('gmo_onair_user');
    const userId = rawUser ? (JSON.parse(rawUser)?.id as string | undefined) : undefined;
    const auth: { token?: string; userId?: string } = {};
    if (token && token !== 'undefined' && token !== 'null') auth.token = token;
    if (userId) auth.userId = userId;
    return auth;
  } catch {
    return {};
  }
}

// qsheet→techops移行 Phase 3（2026-08-22）: 新規ビルドは `/techops` ネームスペースに繋ぐ。
// サーバー側（server/src/contexts/qsheet/socket.ts）が `/qsheet`・`/techops` の両方を
// 同じルームへブリッジしているため、旧ビルドをまだ開いているタブ（`/qsheet` に接続したまま）
// とも yjs:update / awareness:update / presence:sync / cue:* が引き続き同期する。
export function getQsheetSocket(docId: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io('/techops', {
    path: '/socket.io/',
    query: { docId },
    auth: readSocketAuth(),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function disconnectQsheetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
