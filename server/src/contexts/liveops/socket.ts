import { Server as IOServer, Namespace } from 'socket.io';
import { queryOne, execute } from '../../shared/db/connection';

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

// In-memory states keyed by timerId
const states = new Map<string, TimerState>();
// Tick interval keyed by timerId
const ticks = new Map<string, ReturnType<typeof setInterval>>();

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

  ns.on('connection', (socket) => {
    socket.on('timer:join', async ({ timerId }: { timerId: string }) => {
      await socket.join(`timer:${timerId}`);

      // Load or reuse in-memory state
      if (!states.has(timerId)) {
        const s = await loadTimer(timerId);
        if (s) states.set(timerId, s);
      }
      const s = states.get(timerId);
      if (s) socket.emit('state', getClientState(s));
    });

    socket.on('timer:set', async ({ timerId, seconds }: { timerId: string; seconds: number }) => {
      const clamped = Math.max(0, Math.min(5999, Math.round(seconds)));
      const s = states.get(timerId) || (await loadTimer(timerId)) || ({ id: timerId, warningThresholdSec: 60 } as any);
      const updated: TimerState = {
        ...s, id: timerId, totalSeconds: clamped,
        remainingMs: clamped * 1000, running: false,
        startedAt: null, pausedRemaining: clamped * 1000,
        phase: clamped === 0 ? 'idle' : 'countdown',
      };
      states.set(timerId, updated);
      stopTick(timerId);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    socket.on('timer:start', async ({ timerId }: { timerId: string }) => {
      const s = states.get(timerId);
      if (!s || s.running || s.pausedRemaining <= 0) return;
      const updated: TimerState = { ...s, running: true, startedAt: Date.now() };
      states.set(timerId, updated);
      startTick(ns, timerId);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    socket.on('timer:stop', async ({ timerId }: { timerId: string }) => {
      const s = states.get(timerId);
      if (!s || !s.running) return;
      const remaining = s.startedAt != null ? s.pausedRemaining - (Date.now() - s.startedAt) : s.pausedRemaining;
      const updated: TimerState = { ...s, running: false, pausedRemaining: remaining, startedAt: null };
      states.set(timerId, updated);
      stopTick(timerId);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    socket.on('timer:reset', async ({ timerId }: { timerId: string }) => {
      const s = states.get(timerId);
      if (!s) return;
      const updated: TimerState = {
        ...s, running: false, startedAt: null,
        remainingMs: 0, pausedRemaining: 0, totalSeconds: 0, phase: 'idle',
      };
      states.set(timerId, updated);
      stopTick(timerId);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    socket.on('timer:adjust', async ({ timerId, deltaSeconds }: { timerId: string; deltaSeconds: number }) => {
      const s = states.get(timerId);
      if (!s) return;
      const current = s.running && s.startedAt
        ? s.pausedRemaining - (Date.now() - s.startedAt)
        : s.pausedRemaining;
      const newRemaining = current + deltaSeconds * 1000;
      const updated: TimerState = {
        ...s,
        pausedRemaining: s.running ? s.pausedRemaining + deltaSeconds * 1000 : newRemaining,
        startedAt: s.running ? s.startedAt : null,
      };
      states.set(timerId, updated);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });
  });

  return ns;
}
