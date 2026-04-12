import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { queryOne, execute } from '../../shared/db/connection';

// In-memory stamp aggregation (flushed to DB every 60s)
const stampBuffer: Map<string, Map<string, number>> = new Map(); // eventId -> (stampId -> count)

let flushInterval: ReturnType<typeof setInterval> | null = null;

export function initSocketIO(httpServer: HttpServer): Server {
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  ];

  const io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: true,  // Allow all origins (audience page is public)
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const interactiveNs = io.of('/interactive');

  interactiveNs.on('connection', (socket: Socket) => {
    const eventId = socket.handshake.query.eventId as string;
    const sessionToken = socket.handshake.query.sessionToken as string;

    if (!eventId) {
      socket.disconnect();
      return;
    }

    // Join event room
    socket.join(`event:${eventId}`);

    // Admin room (for control panel)
    const isAdmin = socket.handshake.query.admin === 'true';
    if (isAdmin) {
      socket.join(`admin:${eventId}`);
    }

    // Broadcast connection count update
    broadcastConnectionCount(interactiveNs, eventId);

    // Handle stamp
    socket.on('stamp', async (data: { stampId: string; count?: number }) => {
      if (!data.stampId || !sessionToken) return;

      const pressCount = Math.min(Math.max(Number(data.count) || 1, 1), 50); // Max 50 presses per message

      // Buffer the stamp count
      if (!stampBuffer.has(eventId)) {
        stampBuffer.set(eventId, new Map());
      }
      const eventBuffer = stampBuffer.get(eventId)!;
      eventBuffer.set(data.stampId, (eventBuffer.get(data.stampId) || 0) + pressCount);

      // Broadcast to all clients in the event (200ms throttle handled client-side)
      interactiveNs.to(`event:${eventId}`).emit('stamp:update', {
        stampId: data.stampId,
        count: pressCount,
        timestamp: Date.now(),
      });
    });

    // Handle admin commands
    socket.on('event:start', async () => {
      if (!isAdmin) return;
      await execute(
        `UPDATE interactive_events SET status='live', started_at=NOW(), updated_at=NOW() WHERE id=?`,
        [eventId]
      );
      interactiveNs.to(`event:${eventId}`).emit('event:status', { status: 'live' });
    });

    socket.on('event:stop', async () => {
      if (!isAdmin) return;
      await execute(
        `UPDATE interactive_events SET status='ended', ended_at=NOW(), updated_at=NOW() WHERE id=?`,
        [eventId]
      );
      interactiveNs.to(`event:${eventId}`).emit('event:status', { status: 'ended' });
    });

    socket.on('disconnect', async () => {
      if (sessionToken) {
        await execute(
          'UPDATE interactive_sessions SET disconnected_at = NOW() WHERE session_token = ? AND event_id = ?',
          [sessionToken, eventId]
        ).catch(() => {});
      }
      broadcastConnectionCount(interactiveNs, eventId);
    });
  });

  // Flush stamp buffer to DB every 60 seconds
  flushInterval = setInterval(() => flushStampBuffer(), 60000);

  console.log('Socket.IO initialized for interactive events');
  return io;
}

async function broadcastConnectionCount(ns: ReturnType<Server['of']>, eventId: string) {
  try {
    const sockets = await ns.in(`event:${eventId}`).fetchSockets();
    ns.to(`admin:${eventId}`).emit('connections:count', {
      count: sockets.length,
      timestamp: Date.now(),
    });
  } catch {
    // ignore
  }
}

async function flushStampBuffer() {
  for (const [eventId, stamps] of stampBuffer.entries()) {
    for (const [stampId, count] of stamps.entries()) {
      if (count === 0) continue;
      const bucketAt = new Date();
      bucketAt.setSeconds(0, 0);

      try {
        // Try upsert first, fall back to insert
        const existing = await queryOne(
          `SELECT id, count FROM interactive_stamp_counts WHERE stamp_id = ? AND event_id = ? AND bucket_at = ?`,
          [stampId, eventId, bucketAt.toISOString()]
        ) as any;

        if (existing) {
          await execute(
            `UPDATE interactive_stamp_counts SET count = count + ? WHERE id = ?`,
            [count, existing.id]
          );
        } else {
          await execute(
            `INSERT INTO interactive_stamp_counts (id, stamp_id, event_id, count, bucket_at) VALUES (gen_random_uuid(), ?, ?, ?, ?)`,
            [stampId, eventId, count, bucketAt.toISOString()]
          );
        }
      } catch (err) {
        console.error('Failed to flush stamp count:', err);
      }
    }
    stamps.clear();
  }
}

export function shutdownSocketIO() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
  }
  // Final flush
  flushStampBuffer().catch(() => {});
}
