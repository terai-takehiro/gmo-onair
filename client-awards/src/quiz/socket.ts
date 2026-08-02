import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentQuizId: number | null = null;

export function getQuizSocket(quizId: number): Socket {
  if (socket && currentQuizId === quizId && socket.connected) return socket;
  if (socket) { socket.disconnect(); socket = null; }
  currentQuizId = quizId;
  socket = io('/quiz', {
    query: { quizId: String(quizId) },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });
  return socket;
}

export function disconnectQuizSocket(): void {
  if (socket) { socket.disconnect(); socket = null; currentQuizId = null; }
}
