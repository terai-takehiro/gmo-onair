import { Server, Socket } from 'socket.io';
import { queryOne } from '../../shared/db/connection';
import { canAccessDoc } from './access';
import { qsheetRooms } from './collab';
import { resolveSocketUser, type SocketUser } from '../../shared/collab/socketAuth';

/**
 * Qsheet Socket.IO namespace.
 *   - OnAir ↔ Rundown の cue 同期 (従来どおり)
 *   - 在席表示 (presence): このシートを今開いている人の一覧
 *
 * 認証モデル (Phase 1):
 *   - ハンドシェイクで JWT (prod) / userId (dev mockAuth) を検証し、
 *     この doc に canAccessDoc なユーザーだけを「編集参加者」として扱う。
 *   - 匿名/未認可でも room への join = リッスンは許可する
 *     (音声サポート公開URL / 単なる閲覧は cue:sync を受けるだけ)。
 *   - transport (cue:*) を **発火** できるのはアクセス権のあるユーザーのみ
 *     → docId さえ知れば誰でも進行を注入できた従来の穴を塞ぐ。
 *
 * room の分割 (実装設計 02-audio-share-token-impl.md §6-3):
 *   - `doc:<docId>`         … 匿名を含む全員が join。**cue:* だけ**を流す
 *   - `doc:<docId>:members` … canAccess なユーザーだけが join。
 *     yjs:update (台本の編集差分) / awareness:update / presence:sync はこちらへ。
 *   公開音声サポート URL (資料IDが分かれば誰でも開ける) は `doc:<docId>` にしか
 *   join しないので、台本本文の差分や在席者の氏名が公開URLの持ち主に届かなくなる。
 *   cue:* の5本は分割前と1文字も変えていない (07 §1-1「そのまま」)。
 */

// 認証解決とユーザー型は shared/collab/socketAuth.ts に移設した (案件の共同編集と共有)。
// 認証はコピーを残すと片方だけ緩くなるため、必ず 1 か所に置く。

// docId -> (socketId -> user) : 認証済み参加者のみ
const presenceByDoc = new Map<string, Map<string, SocketUser>>();

/** doc の在席一覧を userId で重複排除して返す (同一ユーザーの複数タブ = 1 件)。 */
function presenceList(docId: string): { userId: string; name: string }[] {
  const m = presenceByDoc.get(docId);
  if (!m) return [];
  const seen = new Map<string, string>();
  for (const u of m.values()) if (!seen.has(u.id)) seen.set(u.id, u.name);
  return Array.from(seen, ([userId, name]) => ({ userId, name }));
}

export function initQsheetSocketIO(io: Server): void {
  const qsheetNs = io.of('/qsheet');

  // connection ハンドラは **同期関数** にしてある。
  //
  // async にして先に await すると、認証解決の間はまだ socket.on(...) が登録されておらず、
  // **接続直後にクライアントが送る最初の 'yjs:sync' が捨てられる**
  // (Socket.IO は未登録イベントをバッファしない)。
  // クライアント (useCollabDoc) は connect 時に 1 度だけ yjs:sync を送り、
  // その後は再送しないので、取りこぼすと再接続まで同期されない
  // = 共同編集が黙って HTTP 保存モードに縮退する。
  // ハンドラは即座に張り、各ハンドラ側で「準備完了」を待つ形にする。
  qsheetNs.on('connection', (socket: Socket) => {
    const docId = socket.handshake.query.docId as string;
    if (!docId) {
      socket.disconnect();
      return;
    }

    const room = `doc:${docId}`;
    const memberRoom = `doc:${docId}:members`;
    socket.join(room);

    // 認証 + アクセス判定 (匿名も join してリッスンは可能)
    const ready: Promise<void> = (async () => {
      const user = await resolveSocketUser(socket);
      let canAccess = false;
      if (user) {
        try {
          const doc = (await queryOne(
            'SELECT created_by FROM qsheet_documents WHERE id = $1 AND deleted_at IS NULL',
            [docId]
          )) as { created_by: string | null } | undefined;
          if (doc) canAccess = await canAccessDoc(user, docId, doc.created_by ?? null);
        } catch {
          /* DB not ready — アクセス不可扱い */
        }
      }
      socket.data.user = user;
      socket.data.canAccess = canAccess;

      // 在席登録: 認証済み & アクセス権のあるユーザーのみ
      if (user && canAccess) {
        socket.join(memberRoom);
        let m = presenceByDoc.get(docId);
        if (!m) {
          m = new Map();
          presenceByDoc.set(docId, m);
        }
        m.set(socket.id, user);
        // 在席者の氏名は members だけに流す (匿名の公開音声サポート URL には出さない)
        qsheetNs.to(memberRoom).emit('presence:sync', { users: presenceList(docId) });
      } else {
        // リッスン専用 (匿名/未認可) には在席情報を渡さない — 空配列を返す
        socket.emit('presence:sync', { users: [] });
      }
    })();
    void ready.catch((e) => console.error('[qsheet] socket 初期化に失敗', e));

    socket.on('presence:query', async () => {
      await ready;
      socket.emit('presence:sync', { users: socket.data.canAccess ? presenceList(docId) : [] });
    });

    // ── 同時共同編集 (Phase 2.2): Yjs 更新の同期・中継 ──
    // アクセス権のあるユーザーのみ参加可 (匿名/未認可は cue:sync リッスンのみ)。
    let collabAcquired = false;
    socket.on('yjs:sync', async () => {
      await ready;
      if (!socket.data.canAccess) return;
      if (!collabAcquired) {
        collabAcquired = true;
        try {
          await qsheetRooms.acquire(docId);
        } catch (e) {
          collabAcquired = false;
          console.error('[qsheet-collab] acquire error', e);
          return;
        }
      }
      const state = qsheetRooms.getState(docId);
      if (state) socket.emit('yjs:state', Buffer.from(state));
    });

    socket.on('yjs:update', async (update: ArrayBuffer | Buffer | Uint8Array) => {
      await ready;
      if (!socket.data.canAccess || !collabAcquired) return;
      const u = update instanceof Uint8Array ? update : new Uint8Array(update as ArrayBuffer);
      qsheetRooms.applyUpdate(docId, u);
      // 他の参加者 (members のみ) へ増分を中継。台本の編集差分なので room 全体には出さない。
      socket.to(memberRoom).emit('yjs:update', Buffer.from(u));
    });

    // awareness (ライブカーソル/選択) — ephemeral、永続化せず members へ中継のみ
    socket.on('awareness:update', async (update: ArrayBuffer | Buffer | Uint8Array) => {
      await ready;
      if (!socket.data.canAccess) return;
      const u = update instanceof Uint8Array ? update : new Uint8Array(update as ArrayBuffer);
      socket.to(memberRoom).emit('awareness:update', Buffer.from(u));
    });

    // ── transport (cue:*) — 発火はアクセス権のあるユーザーのみ、匿名/未認可はリッスンのみ ──
    socket.on('cue:update', async (data: { currentCue: number; elapsed: number; isPlaying: boolean }) => {
      await ready;
      if (!socket.data.canAccess) return;
      socket.to(room).emit('cue:sync', {
        currentCue: data.currentCue,
        elapsed: data.elapsed,
        isPlaying: data.isPlaying,
        timestamp: Date.now(),
      });
    });
    socket.on('cue:next', async () => {
      await ready;
      if (socket.data.canAccess) socket.to(room).emit('cue:next');
    });
    socket.on('cue:prev', async () => {
      await ready;
      if (socket.data.canAccess) socket.to(room).emit('cue:prev');
    });
    socket.on('cue:jump', async (data: { cueIndex: number }) => {
      await ready;
      if (socket.data.canAccess) socket.to(room).emit('cue:jump', { cueIndex: data.cueIndex });
    });
    socket.on('cue:play', async () => {
      await ready;
      if (socket.data.canAccess) socket.to(room).emit('cue:play');
    });
    socket.on('cue:pause', async () => {
      await ready;
      if (socket.data.canAccess) socket.to(room).emit('cue:pause');
    });
    socket.on('cue:reset', async () => {
      await ready;
      if (socket.data.canAccess) socket.to(room).emit('cue:reset');
    });

    socket.on('disconnect', () => {
      if (collabAcquired) {
        qsheetRooms.release(docId);
        collabAcquired = false;
      }
      const m = presenceByDoc.get(docId);
      if (m && m.delete(socket.id)) {
        if (m.size === 0) presenceByDoc.delete(docId);
        qsheetNs.to(memberRoom).emit('presence:sync', { users: presenceList(docId) });
      }
    });
  });

  console.log('Socket.IO initialized for qsheet sync (auth + presence)');
}
