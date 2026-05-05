import { Server, Socket } from 'socket.io';
import { execute, queryOne } from '../../shared/db/connection';

export function initAwardsSocketIO(io: Server): void {
  const awardsNs = io.of('/awards');

  awardsNs.on('connection', (socket: Socket) => {
    const eventId = parseInt(socket.handshake.query.eventId as string);
    if (!eventId || isNaN(eventId)) {
      socket.disconnect();
      return;
    }

    const room = `event:${eventId}`;
    socket.join(room);

    // Push current state to this new connection (ranking CG)
    queryOne(
      `SELECT step, category_id, oneshot_style FROM awards_cue_state WHERE event_id = ?`,
      [eventId]
    ).then((state) => {
      if (state) {
        socket.emit('cue:sync', {
          step: state.step,
          categoryId: state.category_id,
          oneshotStyle: state.oneshot_style,
          timestamp: Date.now(),
        });
      }
    }).catch(() => {});

    // Push current 1S CG state too (independent of ranking cue)
    queryOne(
      `SELECT entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live, show_portrait
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
          timestamp: Date.now(),
        });
      }
    }).catch(() => {});

    // Control page → Output page: update cue
    socket.on('cue:set', async (data: {
      step?: string;
      categoryId?: number | null;
      oneshotStyle?: string;
    }) => {
      try {
        const step = data.step ?? 'idle';
        const catId = data.categoryId ?? null;
        const style = data.oneshotStyle ?? 'classic';

        await execute(
          `INSERT INTO awards_cue_state (event_id, step, category_id, oneshot_style, updated_at)
           VALUES (?, ?, ?, ?, NOW())
           ON CONFLICT (event_id) DO UPDATE
             SET step = EXCLUDED.step,
                 category_id = EXCLUDED.category_id,
                 oneshot_style = EXCLUDED.oneshot_style,
                 updated_at = NOW()`,
          [eventId, step, catId, style]
        );

        awardsNs.to(room).emit('cue:sync', {
          step,
          categoryId: catId,
          oneshotStyle: style,
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

        await execute(
          `INSERT INTO awards_oneshot_cue_state
             (event_id, entry_id, module_key, ticker_on, ticker_cat_idx, transparent, lang, is_live, show_portrait, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON CONFLICT (event_id) DO UPDATE
             SET entry_id = EXCLUDED.entry_id,
                 module_key = EXCLUDED.module_key,
                 ticker_on = EXCLUDED.ticker_on,
                 ticker_cat_idx = EXCLUDED.ticker_cat_idx,
                 transparent = EXCLUDED.transparent,
                 lang = EXCLUDED.lang,
                 is_live = EXCLUDED.is_live,
                 show_portrait = EXCLUDED.show_portrait,
                 updated_at = NOW()`,
          [eventId, entryId, moduleKey, tickerOn, tickerCatIdx, transparent, lang, isLive, showPortrait]
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
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('[awards socket] oneshot:set error', err);
      }
    });

    socket.on('disconnect', () => {});
  });
}
