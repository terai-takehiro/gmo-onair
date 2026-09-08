import { Server, Socket } from 'socket.io';
import { queryOne } from '../../shared/db/connection';
import { parseCookie, resolveSocketUser } from '../../shared/collab/socketAuth';
import { config } from '../../config';
import { canControlProduction } from '../../shared/collab/controlPermission';
import { applyCueTake, bumpRevealPhase, fetchCues, SLOTS, Slot } from './store';

// テロップCG の Socket.IO ネームスペース。liveops/socket.ts と同じ2段構え —
// 匿名接続はリッスン専用（出力画面 = OBS ブラウザソースが繋ぐため。
// graphics.md §7「公開URL・認証なし」の契約）で、操作系（cg:set / cg:continue）は
// handshake で認証した qsheet 権限のユーザーだけが送れる。
// ⚠️ イベント名は `cg:*`。techops ネームスペースが本番進行に `cue:*` を使っており、
// 衝突させない（graphics.md §9）。

export function initGraphicsSocketIO(io: Server): void {
  const graphicsNs = io.of('/graphics');

  // handshake 認証: 資格情報なし = リッスン専用で許可（userId を付けない）。
  // 資格情報が提示されたのに無効なら拒否。有効なら qsheet 権限
  // （system_admin は無条件）を確認して userId を印付けする（liveops/socket.ts と同型）。
  graphicsNs.use(async (socket, next) => {
    try {
      const auth = (socket.handshake.auth || {}) as { token?: string; userId?: string };
      const hasCredentials = Boolean(
        (auth.token && auth.token !== 'undefined' && auth.token !== 'null') ||
          parseCookie(socket.handshake.headers.cookie, 'gmo_onair_token') ||
          (config.authMode !== 'password' && auth.userId)
      );
      const user = await resolveSocketUser(socket);
      if (!user) {
        if (hasCredentials) return next(new Error('Unauthorized'));
        return next();
      }
      if (user.role !== 'system_admin') {
        const perm = await queryOne(
          'SELECT access_level FROM user_permissions WHERE user_id = $1 AND module = $2',
          [user.id, 'qsheet']
        );
        if (!perm) return next(new Error('Forbidden: qsheet permission required'));
      }
      (socket as any).userId = user.id;
      next();
    } catch {
      next(new Error('Auth error'));
    }
  });

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
      // 操作系は handshake 認証済みのユーザー限定（匿名接続はリッスン専用）
      if (!await canControlProduction((socket as any).userId)) return;
      try {
        const slot = data?.slot as Slot;
        if (!SLOTS.includes(slot)) return;
        const pageId = typeof data?.pageId === 'number' ? data.pageId : null;
        if (pageId !== null) {
          // 他プロジェクトのページ id を流し込まれても無視する（認証済みでも越境は防ぐ）
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
      // 操作系は handshake 認証済みのユーザー限定（匿名接続はリッスン専用）
      if (!await canControlProduction((socket as any).userId)) return;
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
