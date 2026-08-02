import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentEventId: number | null = null;

export function getAwardsSocket(eventId: number): Socket {
  if (socket && currentEventId === eventId && socket.connected) {
    return socket;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentEventId = eventId;
  socket = io('/awards', {
    query: { eventId: String(eventId) },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectAwardsSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentEventId = null;
  }
}
