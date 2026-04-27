import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(eventId: string, opts?: { admin?: boolean; sessionToken?: string }): Socket {
  if (socket?.connected) {
    return socket;
  }

  const query: Record<string, string> = { eventId };
  if (opts?.admin) query.admin = 'true';
  if (opts?.sessionToken) query.sessionToken = opts.sessionToken;

  socket = io('/interactive', {
    path: '/socket.io/',
    query,
    // 大規模配信時のCPU/帯域削減のため WebSocket のみ。
    // pollingフォールバックは廃止（WebSocket未対応環境は事実上ない）。
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
