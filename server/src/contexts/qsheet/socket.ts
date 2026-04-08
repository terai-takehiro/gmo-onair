import { Server, Socket } from 'socket.io';

/**
 * Qsheet Socket.IO namespace — stateless relay for OnAir ↔ Rundown sync.
 * OnAir sends cue:update, server broadcasts cue:sync to the room.
 * Rundown (or any client) can send transport commands back.
 */
export function initQsheetSocketIO(io: Server): void {
  const qsheetNs = io.of('/qsheet');

  qsheetNs.on('connection', (socket: Socket) => {
    const docId = socket.handshake.query.docId as string;

    if (!docId) {
      socket.disconnect();
      return;
    }

    // Join document room
    const room = `doc:${docId}`;
    socket.join(room);

    // OnAir → Rundown: periodic state update
    socket.on('cue:update', (data: { currentCue: number; elapsed: number; isPlaying: boolean }) => {
      socket.to(room).emit('cue:sync', {
        currentCue: data.currentCue,
        elapsed: data.elapsed,
        isPlaying: data.isPlaying,
        timestamp: Date.now(),
      });
    });

    // Transport commands (bidirectional: Rundown → OnAir or OnAir → Rundown)
    socket.on('cue:next', () => {
      socket.to(room).emit('cue:next');
    });

    socket.on('cue:prev', () => {
      socket.to(room).emit('cue:prev');
    });

    socket.on('cue:jump', (data: { cueIndex: number }) => {
      socket.to(room).emit('cue:jump', { cueIndex: data.cueIndex });
    });

    socket.on('cue:play', () => {
      socket.to(room).emit('cue:play');
    });

    socket.on('cue:pause', () => {
      socket.to(room).emit('cue:pause');
    });

    socket.on('cue:reset', () => {
      socket.to(room).emit('cue:reset');
    });

    socket.on('disconnect', () => {
      // No cleanup needed — stateless relay
    });
  });

  console.log('Socket.IO initialized for qsheet sync');
}
