import { Server, Socket } from 'socket.io';
import { queryOne } from '../../shared/db/connection';
import { applyCueTake, bumpRevealPhase, fetchCues, SLOTS, Slot } from './store';

// テロップCG の Socket.IO ネームスペース（awards/socket.ts と同型・handshake 認証なし。
// 出力画面 = OBS ブラウザソースが繋ぐため。graphics.md §7「公開URL・認証なし」の契約）。
// ⚠️ イベント名は `cg:*`。techops ネームスペースが本番進行に `cue:*` を使っており、
// 衝突させない（graphics.md §9）。

export function initGraphicsSocketIO(io: Server): void {
  const graphicsNs = io.of('/graphics');

  graphicsNs.on('connection', (socket: Socket) => {
    const projectId = parseInt(socket.handshake.query.projectId as string);
    if (!projectId || isNaN(projectId)) {
      socket.disconnect();
      return;
    }

    const room = `project:${projectId}`;
    socket.join(room);

    // 新規接続に現在の全スロット cue を push（操作画面・出力画面の初期同期）
    fetchCues(projectId)
      .then((cues) => socket.emit('cg:sync', { cues, timestamp: Date.now() }))
      .catch(() => {});

    // 操作画面 → 出力画面: スロット cue の更新（pageId null = クリア）
    socket.on('cg:set', async (data: { slot?: string; pageId?: number | null }) => {
      try {
        const slot = data?.slot as Slot;
        if (!SLOTS.includes(slot)) return;
        const pageId = typeof data?.pageId === 'number' ? data.pageId : null;
        if (pageId !== null) {
          // 他プロジェクトのページ id を流し込まれても無視する（handshake 認証なしのため）
          const page = await queryOne(
            `SELECT id FROM graphics_pages WHERE id = ? AND project_id = ?`,
            [pageId, projectId]
          );
          if (!page) return;
        }

        // 段6-4: TAKE 時はスロット間自動退出ルールも同じトランザクションで適用し、
        // cg:sync の同報を1回にまとめる（REST の POST /projects/:id/cue と同じ経路）
        const { cues, autoOutSlots } = await applyCueTake(projectId, slot, pageId);
        graphicsNs.to(room).emit('cg:sync', { cues, autoOutSlots, timestamp: Date.now() });
      } catch (err) {
        console.error('[graphics socket] cg:set error', err);
      }
    });

    // 操作画面 → 出力画面: 「続き」（段6-1・汎用機構）。対象スロットの reveal_phase を +1
    socket.on('cg:continue', async (data: { slot?: string }) => {
      try {
        const slot = data?.slot as Slot;
        if (!SLOTS.includes(slot)) return;
        const cues = await bumpRevealPhase(projectId, slot);
        graphicsNs.to(room).emit('cg:sync', { cues, timestamp: Date.now() });
      } catch (err) {
        console.error('[graphics socket] cg:continue error', err);
      }
    });

    socket.on('disconnect', () => {});
  });
}
