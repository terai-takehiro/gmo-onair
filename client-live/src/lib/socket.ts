import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getLiveopsSocket(): Socket {
  // `.active` = 接続済みまたは再接続待ち。`.connected` で見ると、初回接続が
  // 確立する前に呼ばれるたびに新しいソケットを作って前のを放置してしまう
  if (socket?.active) return socket;

  // JWTトークンをhandshakeに渡す (本番認証用)
  const token = localStorage.getItem('gmo_onair_token');

  socket = io('/liveops', {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    // 表示画面は本番中に無人で開きっぱなしになる。回数の上限があると
    // デプロイや長い網の断で再接続を諦めて永久に固まる
    reconnectionAttempts: Infinity,
    auth: token ? { token } : {},
  });

  return socket;
}

export function disconnectLiveopsSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
