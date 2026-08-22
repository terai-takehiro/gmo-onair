import { Server as IOServer, Namespace } from 'socket.io';
import { queryOne, queryAll, execute } from '../../shared/db/connection';
import { verifyToken } from '../../shared/auth/jwt';
import { config } from '../../config';

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

/** cookieヘッダーから gmo_onair_token を取り出す */
function extractCookieToken(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gmo_onair_token=([^;]+)/);
  return match ? match[1] : null;
}

export function initLiveopsSocketIO(io: IOServer) {
  const ns = io.of('/liveops');

  // password mode (dev / 本番ともに) で JWT / cookie 認証を要求。
  // v2.5.0+ で dev も AUTH_MODE=password に統一されたため、dev でもこの分岐に入る。
  if (config.authMode === 'password') {
    ns.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth as any)?.token as string | undefined
          || extractCookieToken(socket.handshake.headers.cookie as string | undefined);

        if (!token) { next(); return; } // トークンなし = read-only 表示用接続を許可
        const payload = verifyToken(token);
        if (!payload) return next(new Error('Unauthorized'));

        const user = await queryOne(
          'SELECT id, role FROM users WHERE id = $1 AND deleted_at IS NULL',
          [payload.userId]
        );
        if (!user) return next(new Error('Unauthorized'));

        if ((user as any).role !== 'system_admin') {
          // 権限区画統合（migration 232・計時・視聴者のミニアプリ化フェーズ2）で
          // 'liveops' は 'qsheet' に統合済み。ここも追随させないと、password認証モードで
          // system_admin以外の全ユーザーがこのnamespaceに接続できなくなる
          // （'liveops'の行はもう存在しないため）。
          const perm = await queryOne(
            'SELECT access_level FROM user_permissions WHERE user_id = $1 AND module = $2',
            [(user as any).id, 'qsheet']
          );
          if (!perm) return next(new Error('Forbidden: qsheet permission required'));
        }

        (socket as any).userId = (user as any).id;
        next();
      } catch (err) {
        next(new Error('Auth error'));
      }
    });
  }

  ns.on('connection', (socket) => {
    socket.on('timer:join', async ({ timerId }: { timerId: string }) => {
      await socket.join(`timer:${timerId}`);
      if (!states.has(timerId)) {
        const s = await loadTimer(timerId);
        if (s) states.set(timerId, s);
      }
      const s = states.get(timerId);
      if (s) socket.emit('state', getClientState(s));
    });

    socket.on('timer:set', async ({ timerId, seconds }: { timerId: string; seconds: number }) => {
      if (!(socket as any).userId) return;
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
      if (!(socket as any).userId) return;
      const s = states.get(timerId);
      if (!s || s.running || s.pausedRemaining <= 0) return;
      const updated: TimerState = { ...s, running: true, startedAt: Date.now() };
      states.set(timerId, updated);
      startTick(ns, timerId);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });

    socket.on('timer:stop', async ({ timerId }: { timerId: string }) => {
      if (!(socket as any).userId) return;
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
      if (!(socket as any).userId) return;
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
      if (!(socket as any).userId) return;
      const s = states.get(timerId);
      if (!s) return;
      const updated: TimerState = {
        ...s,
        pausedRemaining: s.running ? s.pausedRemaining + deltaSeconds * 1000 : s.pausedRemaining + deltaSeconds * 1000,
        startedAt: s.running ? s.startedAt : null,
      };
      states.set(timerId, updated);
      await persistState(updated);
      ns.to(`timer:${timerId}`).emit('state', getClientState(updated));
    });
  });

  return ns;
}
