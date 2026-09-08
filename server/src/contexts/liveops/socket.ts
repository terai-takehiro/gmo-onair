import type { Server as IOServer, Namespace } from 'socket.io';
import { queryOne, execute } from '../../shared/db/connection';
import { resolveSocketUser } from '../../shared/collab/socketAuth';
import { canControlProduction } from '../../shared/collab/controlPermission';

interface TimerState {
  id: string;
  totalSeconds: number;
  remainingMs: number;
  running: boolean;
  startedAt: number | null;
  pausedRemaining: number;
  phase: 'idle' | 'countdown' | 'yellow' | 'red';
  warningThresholdSec: number;
}

const states = new Map<string, TimerState>();
const ticks = new Map<string, ReturnType<typeof setInterval>>();
const operations = new Map<string, Promise<void>>();

function computePhase(remainingMs: number, totalSeconds: number, warningThresholdSec: number): TimerState['phase'] {
  if (totalSeconds === 0) return 'idle';
  if (remainingMs <= 0) return 'red';
  if (remainingMs <= warningThresholdSec * 1000) return 'yellow';
  return 'countdown';
}

function getClientState(s: TimerState) {
  const remainingMs = s.running && s.startedAt != null
    ? s.pausedRemaining - (Date.now() - s.startedAt)
    : s.pausedRemaining;
  const phase = computePhase(remainingMs, s.totalSeconds, s.warningThresholdSec);
  return { id: s.id, totalSeconds: s.totalSeconds, remainingMs, running: s.running, phase };
}

async function loadTimer(id: string): Promise<TimerState | null> {
  const row = await queryOne(
    'SELECT * FROM liveops_timers WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!row) return null;
  const r = row as any;
  const remainingMs = r.running && r.started_at
    ? Number(r.paused_remaining_ms) - (Date.now() - new Date(r.started_at).getTime())
    : Number(r.paused_remaining_ms);

  return {
    id: r.id as string,
    totalSeconds: Number(r.total_seconds),
    remainingMs,
    running: Boolean(r.running),
    startedAt: r.started_at ? new Date(r.started_at).getTime() : null,
    pausedRemaining: Number(r.paused_remaining_ms),
    phase: computePhase(remainingMs, Number(r.total_seconds), Number(r.warning_threshold_sec)),
    warningThresholdSec: Number(r.warning_threshold_sec),
  };
}

async function persistState(s: TimerState) {
  const remaining = s.running && s.startedAt
    ? s.pausedRemaining - (Date.now() - s.startedAt)
    : s.pausedRemaining;
  await execute(
    `UPDATE liveops_timers SET
       total_seconds = $2, remaining_ms = $3, running = $4,
       started_at = $5, paused_remaining_ms = $6,
       phase = $7, updated_at = NOW()
     WHERE id = $1`,
    [
      s.id, s.totalSeconds, remaining, s.running,
      s.startedAt ? new Date(s.startedAt).toISOString() : null,
      s.pausedRemaining,
      computePhase(remaining, s.totalSeconds, s.warningThresholdSec),
    ]
  );
}

function startTick(ns: Namespace, timerId: string) {
  if (ticks.has(timerId)) return;
  const interval = setInterval(() => {
    const s = states.get(timerId);
    if (!s || !s.running) { clearInterval(interval); ticks.delete(timerId); return; }
    ns.to(`timer:${timerId}`).emit('state', getClientState(s));
  }, 100);
  ticks.set(timerId, interval);
}

function stopTick(timerId: string) {
  const t = ticks.get(timerId);
  if (t) { clearInterval(t); ticks.delete(timerId); }
}

export function initLiveopsSocketIO(io: IOServer) {
  const ns = io.of('/liveops');
  // 公開表示は匿名で受信できる。操作権限はイベントごとに最新のDBから確認する。
  ns.use(async (socket, next) => {
    try {
      const user = await resolveSocketUser(socket);
      if (user) socket.data.userId = user.id;
      next();
    } catch { next(new Error('Auth error')); }
  });
  ns.on('connection', (socket) => {
    // Socket.IO は非同期イベントの例外を自動では捕捉しない。
    socket.use(([event, data], next) => {
      if (!['timer:join', 'timer:set', 'timer:start', 'timer:stop', 'timer:reset', 'timer:adjust'].includes(event)) return next();
      if (!data || typeof data.timerId !== 'string' || !data.timerId || data.timerId.length > 200) return next(new Error('Invalid timer'));
      if (event === 'timer:set' && (typeof data.seconds !== 'number' || !Number.isFinite(data.seconds))) return next(new Error('Invalid seconds'));
      if (event === 'timer:adjust' && (typeof data.deltaSeconds !== 'number' || !Number.isFinite(data.deltaSeconds) || Math.abs(data.deltaSeconds) > 5999)) return next(new Error('Invalid adjustment'));
      next();
    });
    socket.on('error', (err) => console.warn('[liveops] rejected event:', err.message));
    function onTimer<T extends { timerId: string }>(event: string, handler: (data: T) => Promise<void>) {
      socket.on(event, (data: T) => {
        const previous = operations.get(data.timerId) ?? Promise.resolve();
        const pending = previous.then(() => handler(data)).catch((err) => {
          console.error('[liveops] timer operation failed:', event, err);
          socket.emit('timer:error', { message: 'タイマーの操作に失敗しました。もう一度お試しください。' });
        });
        operations.set(data.timerId, pending);
        void pending.then(() => {
          if (operations.get(data.timerId) === pending) operations.delete(data.timerId);
        });
      });
    }

    onTimer('timer:join', async ({ timerId }: { timerId: string }) => {
      await socket.join(`timer:${timerId}`);
      if (!states.has(timerId)) {
        const s = await loadTimer(timerId);
        if (s) states.set(timerId, s);
      }
      const s = states.get(timerId);
      if (s) socket.emit('state', getClientState(s));
    });

    onTimer('timer:set', async ({ timerId, seconds }: { timerId: string; seconds: number }) => {
      if (!await canControlProduction(socket.data.userId)) return;
      const clamped = Math.max(0, Math.min(5999, Math.round(seconds)));
      const s = states.get(timerId) || (await loadTimer(timerId));
      if (!s) return;
      const updated: TimerState = {
        ...s, id: timerId, totalSeconds: clamped,
        remainingMs: clamped * 1000, running: false,
        startedAt: null, pausedRemaining: clamped * 1000,
        phase: clamped === 0 ? 'idle' : 'countdown',
      };
      await persistState(updated);
      states.set(timerId, updated);
      stopTick(timerId);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    onTimer('timer:start', async ({ timerId }: { timerId: string }) => {
      if (!await canControlProduction(socket.data.userId)) return;
      const s = states.get(timerId);
      if (!s || s.running || s.pausedRemaining <= 0) return;
      const updated: TimerState = { ...s, running: true, startedAt: Date.now() };
      await persistState(updated);
      states.set(timerId, updated);
      startTick(ns, timerId);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    onTimer('timer:stop', async ({ timerId }: { timerId: string }) => {
      if (!await canControlProduction(socket.data.userId)) return;
      const s = states.get(timerId);
      if (!s || !s.running) return;
      const remaining = s.startedAt != null ? s.pausedRemaining - (Date.now() - s.startedAt) : s.pausedRemaining;
      const updated: TimerState = { ...s, running: false, pausedRemaining: remaining, startedAt: null };
      await persistState(updated);
      states.set(timerId, updated);
      stopTick(timerId);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    onTimer('timer:reset', async ({ timerId }: { timerId: string }) => {
      if (!await canControlProduction(socket.data.userId)) return;
      const s = states.get(timerId);
      if (!s) return;
      const updated: TimerState = {
        ...s, running: false, startedAt: null,
        remainingMs: 0, pausedRemaining: 0, totalSeconds: 0, phase: 'idle',
      };
      await persistState(updated);
      states.set(timerId, updated);
      stopTick(timerId);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    onTimer('timer:adjust', async ({ timerId, deltaSeconds }: { timerId: string; deltaSeconds: number }) => {
      if (!await canControlProduction(socket.data.userId)) return;
      const s = states.get(timerId);
      if (!s) return;
      const updated: TimerState = {
        ...s,
        pausedRemaining: s.pausedRemaining + deltaSeconds * 1000,
        startedAt: s.running ? s.startedAt : null,
      };
      await persistState(updated);
      states.set(timerId, updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });
  });

  return ns;
}
