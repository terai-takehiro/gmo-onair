import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentRoom: string | null = null;

export function getPollSocket(room: string): Socket {
  if (socket && currentRoom === room && socket.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }
  currentRoom = room;
  socket = io('/awards', {
    query: { pollRoom: room },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectPollSocket(): void {
  if (socket) { socket.disconnect(); socket = null; currentRoom = null; }
}
