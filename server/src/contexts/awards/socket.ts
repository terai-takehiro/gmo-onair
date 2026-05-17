import { Server, Socket } from 'socket.io';
import { execute, queryOne } from '../../shared/db/connection';

// v2.8.98+: NEXT (送出予約) state は in-memory 保持。
// LIVE (cue) 状態は DB に永続化しているが、NEXT は operator の手元の状態を
// 別のブラウザ (NEXT 専用 URL) にミラーするだけなので揮発で十分。
// operator が disconnect しても直近の NEXT は残し、新規接続時に push する。
const nextCueByEvent = new Map<number, RankingNextCue>();
const nextOneshotByEvent = new Map<number, OneShotNextCue>();

// 余興 (Standalone) Poll: in-memory per-room (DB 永続化なし、ad-hoc 用途)
interface StandalonePollState {
  title: string;
  titleEn: string;
  question: string;
  questionEn: string;
  choices: {
    name: string; nameEn: string;
    company: string; companyEn: string;
    photoDataUrl: string | null;
    voteCount: number;
  }[];
  step: 'idle' | 'poll' | 'reveal' | 'winner';
  pollStartedAt: number | null;
  display: 'count' | 'percent';
  revealPhase: 0 | 1 | 2;
  lang: 'ja' | 'en';
  timestamp: number;
}
const standalonePollByRoom = new Map<string, StandalonePollState>();

interface RankingNextCue {
  step: string;
  categoryId: number | null;
  oneshotStyle: string;
  voteDisplay: string;
  pollStartedAt: number | null;
  revealPhase: number;
  timestamp: number;
}
interface OneShotNextCue {
  entryId: number | null;
  moduleKey: string;
  tickerOn: boolean;
  tickerCatIdx: number;
  transparent: boolean;
  lang: 'ja' | 'en';
  isLive: boolean;
  showPortrait: boolean;
  bilingual: boolean;
  countdownOn: boolean;
  countdownTarget: string | null;
  countdownPrefixJa: string;
  countdownPrefixEn: string;
  countdownX: number;
  countdownY: number;
  countdownScale: number;
  timestamp: number;
}

export function initAwardsSocketIO(io: Server): void {
  const awardsNs = io.of('/awards');

  awardsNs.on('connection', (socket: Socket) => {
    const pollRoomRaw = socket.handshake.query.pollRoom as string | undefined;
    // 余興 Standalone Poll モード: ?pollRoom=xxx で接続したクライアントはそのモードのみ。
    if (pollRoomRaw && typeof pollRoomRaw === 'string') {
      const pollRoom = pollRoomRaw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
      const room = `pollRoom:${pollRoom}`;
      socket.join(room);

      const current = standalonePollByRoom.get(pollRoom);
      if (current) socket.emit('standalonePoll:sync', current);

      socket.on('standalonePoll:set', (data: Partial<StandalonePollState>) => {
        const prev = standalonePollByRoom.get(pollRoom);
        const next: StandalonePollState = {
          title: data.title ?? prev?.title ?? '',
          titleEn: data.titleEn ?? prev?.titleEn ?? '',
          question: data.question ?? prev?.question ?? '',
          questionEn: data.questionEn ?? prev?.questionEn ?? '',
          choices: Array.isArray(data.choices) ? data.choices.slice(0, 3).map((c) => ({
            name: String(c?.name ?? ''),
            nameEn: String(c?.nameEn ?? ''),
            company: String(c?.company ?? ''),
            companyEn: String(c?.companyEn ?? ''),
            photoDataUrl: typeof c?.photoDataUrl === 'string' ? c.photoDataUrl : null,
            voteCount: Math.max(0, Math.floor(Number(c?.voteCount) || 0)),
          })) : (prev?.choices ?? []),
          step: (data.step as StandalonePollState['step']) ?? prev?.step ?? 'idle',
          pollStartedAt: typeof data.pollStartedAt === 'number' ? data.pollStartedAt : (data.pollStartedAt === null ? null : (prev?.pollStartedAt ?? null)),
          display: data.display === 'percent' ? 'percent' : 'count',
          revealPhase: Math.max(0, Math.min(2, Math.floor(data.revealPhase ?? prev?.revealPhase ?? 0))) as 0|1|2,
          lang: data.lang === 'en' ? 'en' : 'ja',
          timestamp: Date.now(),
        };
        standalonePollByRoom.set(pollRoom, next);
        awardsNs.to(room).emit('standalonePoll:sync', next);
      });

      socket.on('standalonePoll:clear', () => {
        standalonePollByRoom.delete(pollRoom);
        awardsNs.to(room).emit('standalonePoll:sync', null);
      });

      return; // event 系のハンドラはバインドしない
    }

    const eventId = parseInt(socket.handshake.query.eventId as string);
    if (!eventId || isNaN(eventId)) {
      socket.disconnect();
      return;
    }

    const room = `event:${eventId}`;
    socket.join(room);

    // Push current state to this new connection (ranking CG)
    queryOne(
      `SELECT step, category_id, oneshot_style, vote_display, poll_started_at, reveal_phase
       FROM awards_cue_state WHERE event_id = ?`,
      [eventId]
    ).then((state) => {
      if (state) {
        socket.emit('cue:sync', {
          step: state.step,
          categoryId: state.category_id,
          oneshotStyle: state.oneshot_style,
          voteDisplay: state.vote_display ?? 'count',
          pollStartedAt: state.poll_started_at ? new Date(state.poll_started_at as string | number | Date).getTime() : null,
          revealPhase: state.reveal_phase ?? 0,
          timestamp: Date.now(),
        });
      }
    }).catch(() => {});

    // Push current 1S CG state too (independent of ranking cue)
    queryOne(
      `SELECT entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live, show_portrait, bilingual,
              countdown_on, countdown_target, countdown_prefix_ja, countdown_prefix_en,
              countdown_x, countdown_y, countdown_scale
       FROM awards_oneshot_cue_state WHERE event_id = ?`,
      [eventId]
    ).then((state) => {
      if (state) {
        socket.emit('oneshot:sync', {
          entryId: state.entry_id,
          moduleKey: state.module_key,
          tickerOn: state.ticker_on,
          tickerCatIdx: state.ticker_cat_idx,
          transparent: state.transparent,
          lang: state.lang,
          isLive: state.is_live,
          showPortrait: state.show_portrait,
          bilingual: state.bilingual,
          countdownOn: state.countdown_on,
          countdownTarget: state.countdown_target,
          countdownPrefixJa: state.countdown_prefix_ja,
          countdownPrefixEn: state.countdown_prefix_en,
          countdownX: Number(state.countdown_x),
          countdownY: Number(state.countdown_y),
          countdownScale: Number(state.countdown_scale),
          timestamp: Date.now(),
        });
      }
    }).catch(() => {});

    // v2.8.98+: NEXT state も新規接続に push (in-memory)
    const nextCue = nextCueByEvent.get(eventId);
    if (nextCue) socket.emit('cue:nextSync', nextCue);
    const nextOneshot = nextOneshotByEvent.get(eventId);
    if (nextOneshot) socket.emit('oneshot:nextSync', nextOneshot);

    // Control page → Output page: update cue
    socket.on('cue:set', async (data: {
      step?: string;
      categoryId?: number | null;
      oneshotStyle?: string;
      voteDisplay?: string;
      pollStartedAt?: number | null;
      revealPhase?: number;
    }) => {
      try {
        const step = data.step ?? 'idle';
        const catId = data.categoryId ?? null;
        const style = data.oneshotStyle ?? 'classic';
        const voteDisplay = data.voteDisplay === 'percent' ? 'percent' : 'count';
        const pollStartedAt = typeof data.pollStartedAt === 'number' ? data.pollStartedAt : null;
        const revealPhase = Math.max(0, Math.min(2, Math.floor(data.revealPhase ?? 0)));

        await execute(
          `INSERT INTO awards_cue_state
             (event_id, step, category_id, oneshot_style, vote_display, poll_started_at, reveal_phase, updated_at)
           VALUES (?, ?, ?, ?, ?, ${pollStartedAt === null ? 'NULL' : 'to_timestamp(?::double precision / 1000.0)'}, ?, NOW())
           ON CONFLICT (event_id) DO UPDATE
             SET step = EXCLUDED.step,
                 category_id = EXCLUDED.category_id,
                 oneshot_style = EXCLUDED.oneshot_style,
                 vote_display = EXCLUDED.vote_display,
                 poll_started_at = EXCLUDED.poll_started_at,
                 reveal_phase = EXCLUDED.reveal_phase,
                 updated_at = NOW()`,
          pollStartedAt === null
            ? [eventId, step, catId, style, voteDisplay, revealPhase]
            : [eventId, step, catId, style, voteDisplay, pollStartedAt, revealPhase]
        );

        awardsNs.to(room).emit('cue:sync', {
          step,
          categoryId: catId,
          oneshotStyle: style,
          voteDisplay,
          pollStartedAt,
          revealPhase,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[awards socket] cue:set error', err);
      }
    });

    // 1S CG: Operator → Output で cue 同期
    socket.on('oneshot:set', async (data: {
      entryId?: number | null;
      moduleKey?: string;
      tickerOn?: boolean;
      tickerCatIdx?: number;
      transparent?: boolean;
      lang?: 'ja' | 'en';
      isLive?: boolean;
      showPortrait?: boolean;
      bilingual?: boolean;
      countdownOn?: boolean;
      countdownTarget?: string | null;
      countdownPrefixJa?: string;
      countdownPrefixEn?: string;
      countdownX?: number;
      countdownY?: number;
      countdownScale?: number;
    }) => {
      try {
        const entryId = data.entryId ?? null;
        const moduleKey = data.moduleKey ?? 'none';
        const tickerOn = data.tickerOn ?? false;
        const tickerCatIdx = data.tickerCatIdx ?? 0;
        const transparent = data.transparent ?? false;
        const lang = data.lang === 'en' ? 'en' : 'ja';
        const isLive = data.isLive ?? false;
        const showPortrait = data.showPortrait ?? true;
        const bilingual = data.bilingual ?? false;
        const countdownOn = data.countdownOn ?? false;
        const countdownTarget = data.countdownTarget ?? null;
        const countdownPrefixJa = data.countdownPrefixJa ?? 'アワードまであと';
        const countdownPrefixEn = data.countdownPrefixEn ?? 'Awards starts in';
        const countdownX = typeof data.countdownX === 'number' ? data.countdownX : 50;
        const countdownY = typeof data.countdownY === 'number' ? data.countdownY : 40;
        const countdownScale = typeof data.countdownScale === 'number' ? data.countdownScale : 1;

        await execute(
          `INSERT INTO awards_oneshot_cue_state
             (event_id, entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live, show_portrait, bilingual,
              countdown_on, countdown_target, countdown_prefix_ja, countdown_prefix_en, countdown_x, countdown_y, countdown_scale, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON CONFLICT (event_id) DO UPDATE
             SET entry_id = EXCLUDED.entry_id,
                 module_key = EXCLUDED.module_key,
                 ticker_on = EXCLUDED.ticker_on,
                 ticker_cat_idx = EXCLUDED.ticker_cat_idx,
                 transparent = EXCLUDED.transparent,
                 lang = EXCLUDED.lang,
                 is_live = EXCLUDED.is_live,
                 show_portrait = EXCLUDED.show_portrait,
                 bilingual = EXCLUDED.bilingual,
                 countdown_on = EXCLUDED.countdown_on,
                 countdown_target = EXCLUDED.countdown_target,
                 countdown_prefix_ja = EXCLUDED.countdown_prefix_ja,
                 countdown_prefix_en = EXCLUDED.countdown_prefix_en,
                 countdown_x = EXCLUDED.countdown_x,
                 countdown_y = EXCLUDED.countdown_y,
                 countdown_scale = EXCLUDED.countdown_scale,
                 updated_at = NOW()`,
          [eventId, entryId, moduleKey, tickerOn, tickerCatIdx, transparent, lang, isLive, showPortrait, bilingual,
           countdownOn, countdownTarget, countdownPrefixJa, countdownPrefixEn, countdownX, countdownY, countdownScale]
        );

        awardsNs.to(room).emit('oneshot:sync', {
          entryId,
          moduleKey,
          tickerOn,
          tickerCatIdx,
          transparent,
          lang,
          isLive,
          showPortrait,
          bilingual,
          countdownOn,
          countdownTarget,
          countdownPrefixJa,
          countdownPrefixEn,
          countdownX,
          countdownY,
          countdownScale,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[awards socket] oneshot:set error', err);
      }
    });

    // v2.8.98+: NEXT (送出予約) cue 同期 — operator → NEXT-output URL
    // ランキングCG NEXT
    socket.on('cue:nextSet', (data: {
      step?: string;
      categoryId?: number | null;
      oneshotStyle?: string;
      voteDisplay?: string;
      pollStartedAt?: number | null;
      revealPhase?: number;
    }) => {
      const next: RankingNextCue = {
        step: data.step ?? 'idle',
        categoryId: data.categoryId ?? null,
        oneshotStyle: data.oneshotStyle ?? 'classic',
        voteDisplay: data.voteDisplay === 'percent' ? 'percent' : 'count',
        pollStartedAt: typeof data.pollStartedAt === 'number' ? data.pollStartedAt : null,
        revealPhase: Math.max(0, Math.min(2, Math.floor(data.revealPhase ?? 0))),
        timestamp: Date.now(),
      };
      nextCueByEvent.set(eventId, next);
      awardsNs.to(room).emit('cue:nextSync', next);
    });

    // 1S CG (下位置CG) NEXT
    socket.on('oneshot:nextSet', (data: {
      entryId?: number | null;
      moduleKey?: string;
      tickerOn?: boolean;
      tickerCatIdx?: number;
      transparent?: boolean;
      lang?: 'ja' | 'en';
      isLive?: boolean;
      showPortrait?: boolean;
      bilingual?: boolean;
      countdownOn?: boolean;
      countdownTarget?: string | null;
      countdownPrefixJa?: string;
      countdownPrefixEn?: string;
      countdownX?: number;
      countdownY?: number;
      countdownScale?: number;
    }) => {
      const next: OneShotNextCue = {
        entryId: data.entryId ?? null,
        moduleKey: data.moduleKey ?? 'none',
        tickerOn: data.tickerOn ?? false,
        tickerCatIdx: data.tickerCatIdx ?? 0,
        transparent: data.transparent ?? false,
        lang: data.lang === 'en' ? 'en' : 'ja',
        isLive: data.isLive ?? false,
        showPortrait: data.showPortrait ?? true,
        bilingual: data.bilingual ?? false,
        countdownOn: data.countdownOn ?? false,
        countdownTarget: data.countdownTarget ?? null,
        countdownPrefixJa: data.countdownPrefixJa ?? 'アワードまであと',
        countdownPrefixEn: data.countdownPrefixEn ?? 'Awards starts in',
        countdownX: typeof data.countdownX === 'number' ? data.countdownX : 50,
        countdownY: typeof data.countdownY === 'number' ? data.countdownY : 40,
        countdownScale: typeof data.countdownScale === 'number' ? data.countdownScale : 1,
        timestamp: Date.now(),
      };
      nextOneshotByEvent.set(eventId, next);
      awardsNs.to(room).emit('oneshot:nextSync', next);
    });

    socket.on('disconnect', () => {});
  });
}
