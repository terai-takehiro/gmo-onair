import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let socketDocId: string | null = null;
// 参照カウント: EditorPage は同じ mount 中に2つの effect (useCollabDoc と presence) が
// 同じ docId のソケットを共用する。最後の1人が離れたときだけ実際に切断する —
// 途中で切ると、collab の8秒フォールバック (useCollabDoc だけが cleanup される) が
// presence 側のソケットまで殺し、以後の在席表示が黙って止まる。
let refCount = 0;

// ハンドシェイク認証用の資格情報を localStorage から読む。
// prod: JWT (gmo_onair_token) / dev mockAuth: user.id (x-user-id 相当)。
// 匿名 (公開音声サポート等) では両方 null になり得るが、その場合はリッスン専用で接続できる。
// graphicsSocket.ts（テロップCG の /graphics ネームスペース）も同じ資格情報を使う。
export function readSocketAuth(): { token?: string; userId?: string } {
  try {
    const token = localStorage.getItem('gmo_onair_token');
    const rawUser = localStorage.getItem('gmo_onair_user');
    const userId = rawUser ? (JSON.parse(rawUser)?.id as string | undefined) : undefined;
    const auth: { token?: string; userId?: string } = {};
    if (token && token !== 'undefined' && token !== 'null') auth.token = token;
    if (userId) auth.userId = userId;
    return auth;
  } catch {
    return {};
  }
}

// qsheet→techops移行 Phase 3（2026-08-22）: 新規ビルドは `/techops` ネームスペースに繋ぐ。
// サーバー側（server/src/contexts/qsheet/socket.ts）が `/qsheet`・`/techops` の両方を
// 同じルームへブリッジしているため、旧ビルドをまだ開いているタブ（`/qsheet` に接続したまま）
// とも yjs:update / awareness:update / presence:sync / cue:* が引き続き同期する。
export function getQsheetSocket(docId: string): Socket {
  // 同じ docId なら接続確立前 (connecting) でも同じソケットを共用する。
  // `connected` で判定すると、同じ mount 中の2人目の消費者がハンドシェイク完了前に
  // 必ず2本目を張り、1本目がモジュール変数から外れて切断されないまま残る
  // (ゴースト在席・タブが生きている限り漏れる)。emit は socket.io がバッファし、
  // 各消費者は 'connect' イベントで再送する前提になっている。
  if (socket && socketDocId === docId) {
    refCount += 1;
    // 再接続を諦めたあと (reconnectionAttempts 超過) の再取得は繋ぎ直す。接続中なら no-op
    if (socket.disconnected) socket.connect();
    return socket;
  }

  // 別の docId のソケットが残っていたら先に切る (張りっぱなしにしない)
  if (socket) {
    socket.disconnect();
  }

  socket = io('/techops', {
    path: '/socket.io/',
    query: { docId },
    auth: readSocketAuth(),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });
  socketDocId = docId;
  refCount = 1;

  return socket;
}

export function disconnectQsheetSocket() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && socket) {
    socket.disconnect();
    socket = null;
    socketDocId = null;
  }
}
