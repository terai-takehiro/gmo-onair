import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getLiveopsSocket(): Socket {
  if (socket?.connected) return socket;

  socket = io('/liveops', {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function disconnectLiveopsSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
