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

export function getQsheetSocket(docId: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io('/qsheet', {
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
