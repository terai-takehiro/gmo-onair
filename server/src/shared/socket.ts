import { Server as HttpServer, IncomingMessage } from 'http';
import { Server } from 'socket.io';
import { getAllowedOrigins } from '../config';

export function initSocketIO(httpServer: HttpServer): Server {
  // HTTP CORS (app.ts) と同じ許可オリジンに揃える。
  // 任意オリジン (origin: true) は社内限定運用では過剰なため明示ホワイトリスト化。
  const allowedOrigins = getAllowedOrigins();

  // cors.origin は HTTP (polling) ハンドシェイクの CORS ヘッダーにしか効かず、
  // ブラウザは WebSocket には CORS を強制しないため、それだけでは
  // 別オリジンのページからの WebSocket 接続を遮断できない。
  // Engine.IO の allowRequest でハンドシェイク自体を Origin で検証する。
  // - Origin 無し (サーバー間 / ネイティブクライアント / OBS 等) は許可
  // - Origin あり (ブラウザ) は許可リストに含まれる場合のみ許可
  const allowRequest = (req: IncomingMessage, callback: (err: string | null, success: boolean) => void) => {
    const origin = req.headers.origin;
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback('origin not allowed', false);
    }
  };

  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    allowRequest,
    transports: ['websocket', 'polling'],
    perMessageDeflate: false,
  });

  console.log('Socket.IO initialized');
  return io;
}

export function shutdownSocketIO() {
  // no-op
}
