/**
 * 計時・視聴者（liveops）— `/liveops` Socket.IO 名前空間への接続。
 *
 * ⚠️ **`client-live/src/lib/socket.ts`（表示画面 `TimerDisplayPage.tsx` 専用）の複製です。**
 * `docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` §4-2 の決定どおり、
 * 表示画面が使う実装には一切触れず（1文字も変えない・GROUND_RULES）、運用画面
 * （`client-techops` に移植したダッシュボード・タイマー管理）だけがこちらを使います。
 *
 * ロジックは複製元と同一（namespace `/liveops`・`path: '/socket.io/'`・
 * JWT の渡し方）。**変えているのはこの説明コメントだけ**です。
 *
 * `shared/src/client/` 直下に置いていますが、JSX・Tailwind クラス名は
 * 一切含みません（純粋な socket.io-client ラッパー）。凍結アプリの CSS が
 * 増えることはありません（`shared/CLAUDE.md`「クラス名を1つも書かない純データ・
 * 純関数である限り、ここに置いても凍結アプリの CSS には1バイトも影響しない」）。
 */
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getLiveopsSocket(): Socket {
  // `.active` = 接続済みまたは再接続待ち。`.connected` で見ると、初回接続が
  // 確立する前に呼ばれるたびに新しいソケットを作って前のを放置してしまう
  if (socket?.active) return socket;

  // JWTトークンをhandshakeに渡す (本番認証用)
  const token = localStorage.getItem('gmo_onair_token');

  socket = io('/liveops', {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    // 表示画面は本番中に無人で開きっぱなしになる。回数の上限があると
    // デプロイや長い網の断で再接続を諦めて永久に固まる
    reconnectionAttempts: Infinity,
    auth: token ? { token } : {},
  });

  return socket;
}

export function disconnectLiveopsSocket() {
  if (socket) { socket.disconnect(); socket = null; }
}
