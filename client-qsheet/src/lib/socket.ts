import { createSocketPool } from '@gmo-onair/shared/src/client/socketPool';

// ハンドシェイク認証用の資格情報を localStorage から読む。
// prod: JWT (gmo_onair_token) / dev mockAuth: user.id (x-user-id 相当)。
// 匿名 (公開音声サポート等) では両方 null になり得るが、その場合はリッスン専用で接続できる。
function readSocketAuth(): { token?: string; userId?: string } {
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

// Qシート 1 件につき接続 1 本。使っている画面の数を数え、0 になったときだけ切る。
// **なぜそうしないといけないか (本番中に何が起きていたか) は
//   shared/src/client/socketPool.ts の冒頭に書いてある。**
const pool = createSocketPool<string>({
  namespace: '/qsheet',
  options: (docId) => ({
    path: '/socket.io/',
    query: { docId },
    auth: readSocketAuth(),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  }),
});

/**
 * Qシート用の接続を借りる。同じ docId なら**同じ 1 本**を返す
 * (つないでいる最中でも同じものを返す)。
 * 使い終わったら必ず `disconnectQsheetSocket(docId)` を呼ぶ。
 */
export const getQsheetSocket = (docId: string) => pool.acquire(docId);

/** 借りた接続を返す。**最後の画面が閉じたときだけ**本当に切る。 */
export const disconnectQsheetSocket = (docId?: string) => pool.release(docId);

/** 検証用: いま何本つながっていて、それぞれ何画面が使っているか */
export const qsheetSocketDebugState = () => pool.debugState();
