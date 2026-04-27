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

    // Push current state to this new connection
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

    socket.on('disconnect', () => {});
  });
}
