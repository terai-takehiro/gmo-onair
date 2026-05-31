import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { getAllowedOrigins } from '../config';

export function initSocketIO(httpServer: HttpServer): Server {
  // HTTP CORS (app.ts) と同じ許可オリジンに揃える。
  // 任意オリジン (origin: true) は社内限定運用では過剰なため明示ホワイトリスト化。
  const allowedOrigins = getAllowedOrigins();
  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    perMessageDeflate: false,
  });

  console.log('Socket.IO initialized');
  return io;
}

export function shutdownSocketIO() {
  // no-op
}
