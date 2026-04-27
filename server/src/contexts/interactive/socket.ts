import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { queryOne, execute } from '../../shared/db/connection';

// DB集計用バッファ（60秒バッチでDBへフラッシュ）
const stampBuffer: Map<string, Map<string, number>> = new Map(); // eventId -> (stampId -> count)

// ブロードキャスト用バッファ（毎秒スタンプ種類ごとに1回だけ全員へ配信）
// 1万人連打時に「タップ即ブロードキャスト」だと O(N^2) で破綻するため
const broadcastBuffer: Map<string, Map<string, number>> = new Map(); // eventId -> (stampId -> count)

const BROADCAST_INTERVAL_MS = Number(process.env.STAMP_BROADCAST_INTERVAL_MS) || 1000;

let dbFlushInterval: ReturnType<typeof setInterval> | null = null;
let broadcastFlushInterval: ReturnType<typeof setInterval> | null = null;

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
    // WebSocket優先（pollingフォールバックは互換性のため残す）
    transports: ['websocket', 'polling'],
    // 圧縮はCPU消費が大きいため大規模配信時は無効化
    perMessageDeflate: false,
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

    // Handle stamp — メモリに加算するだけ。実ブロードキャストは broadcastFlushInterval が一括処理。
    socket.on('stamp', (data: { stampId: string; count?: number }) => {
      if (!data.stampId || !sessionToken) return;

      const pressCount = Math.min(Math.max(Number(data.count) || 1, 1), 50); // Max 50 presses per message

      // DB集計用バッファ
      let dbEventBuf = stampBuffer.get(eventId);
      if (!dbEventBuf) {
        dbEventBuf = new Map();
        stampBuffer.set(eventId, dbEventBuf);
      }
      dbEventBuf.set(data.stampId, (dbEventBuf.get(data.stampId) || 0) + pressCount);

      // ブロードキャスト用バッファ（次回フラッシュで全員へ集約配信）
      let bcEventBuf = broadcastBuffer.get(eventId);
      if (!bcEventBuf) {
        bcEventBuf = new Map();
        broadcastBuffer.set(eventId, bcEventBuf);
      }
      bcEventBuf.set(data.stampId, (bcEventBuf.get(data.stampId) || 0) + pressCount);
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

  // DBフラッシュ: 60秒ごと（集計値のみ書き込み）
  dbFlushInterval = setInterval(() => flushStampBuffer(), 60000);

  // ブロードキャストフラッシュ: BROADCAST_INTERVAL_MS（既定1秒）ごとに集約配信
  broadcastFlushInterval = setInterval(() => flushBroadcastBuffer(interactiveNs), BROADCAST_INTERVAL_MS);

  console.log(
    `Socket.IO initialized for interactive events (broadcast interval: ${BROADCAST_INTERVAL_MS}ms)`
  );
  return io;
}

function flushBroadcastBuffer(ns: ReturnType<Server['of']>) {
  for (const [eventId, stamps] of broadcastBuffer.entries()) {
    if (stamps.size === 0) continue;
    const room = ns.to(`event:${eventId}`);
    for (const [stampId, count] of stamps.entries()) {
      if (count <= 0) continue;
      // 既存クライアントとの後方互換: 1スタンプ種類ごとに1回 stamp:update を送る。
      // count にはバッチ期間中の合計タップ数が入るため、Overlay側が密度判定で使える。
      room.emit('stamp:update', {
        stampId,
        count,
        timestamp: Date.now(),
      });
    }
    stamps.clear();
  }
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
  if (dbFlushInterval) {
    clearInterval(dbFlushInterval);
    dbFlushInterval = null;
  }
  if (broadcastFlushInterval) {
    clearInterval(broadcastFlushInterval);
    broadcastFlushInterval = null;
  }
  // Final DB flush
  flushStampBuffer().catch(() => {});
}
