import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getQsheetSocket(docId: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  socket = io('/qsheet', {
    path: '/socket.io/',
    query: { docId },
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
