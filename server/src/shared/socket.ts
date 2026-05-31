import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

export function initSocketIO(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: true,
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
