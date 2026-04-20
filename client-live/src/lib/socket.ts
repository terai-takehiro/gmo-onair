import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getLiveopsSocket(): Socket {
  if (socket?.connected) return socket;

  // JWTトークンをhandshakeに渡す (本番認証用)
  const token = localStorage.getItem('gmo_onair_token');

  socket = io('/liveops', {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    auth: token ? { token } : {},
  });

  return socket;
}

export function disconnectLiveopsSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
