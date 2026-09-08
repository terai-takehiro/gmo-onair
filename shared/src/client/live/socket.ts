/**
 * 計時・視聴者（liveops）— `/liveops` Socket.IO 名前空間への接続。
 *
 * ⚠️ **`client-live/src/lib/socket.ts`（表示画面 `TimerDisplayPage.tsx` 専用）の複製です。**
 * `docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` §4-2 の決定どおり、
 * 表示画面が使う実装には一切触れず（1文字も変えない・GROUND_RULES）、運用画面
 * （`client-techops` に移植したダッシュボード・タイマー管理）だけがこちらを使います。
 *
 * 運用画面では再接続時にも現在の認証情報を送り、開発時の mock 認証にも対応します。
 *
 * `shared/src/client/` 直下に置いていますが、JSX・Tailwind クラス名は
 * 一切含みません（純粋な socket.io-client ラッパー）。凍結アプリの CSS が
 * 増えることはありません（`shared/CLAUDE.md`「クラス名を1つも書かない純データ・
 * 純関数である限り、ここに置いても凍結アプリの CSS には1バイトも影響しない」）。
 */
import { io, Socket } from 'socket.io-client';
import { useUiStore } from '../uiStore';

let socket: Socket | null = null;

export function getLiveopsSocket(): Socket {
  // `.active` = 接続済みまたは再接続待ち。`.connected` で見ると、初回接続が
  // 確立する前に呼ばれるたびに新しいソケットを作って前のを放置してしまう
  if (socket?.active) return socket;

  socket = io('/liveops', {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    // 表示画面は本番中に無人で開きっぱなしになる。回数の上限があると
    // デプロイや長い網の断で再接続を諦めて永久に固まる
    reconnectionAttempts: Infinity,
    auth: (callback) => {
      let token: string | null = null;
      try { token = localStorage.getItem('gmo_onair_token'); } catch { /* cookie 認証を利用 */ }
      callback({ ...(token ? { token } : {}), userId: useUiStore.getState().currentUserId });
    },
  });

  return socket;
}

export function disconnectLiveopsSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
