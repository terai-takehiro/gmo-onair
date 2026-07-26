// shared/src/client/socketPool.ts — Socket.IO 接続を「鍵ごとに1本・使っている数を数える」形で持つ
//
// ── なぜ共通化したか ────────────────────────────────────────────
//
// v2.9.288 時点で、同じ作りの接続モジュールが 4 か所にあった
// (Qシート / リアルタイムCG / クイズ / クイズスタック)。**4つとも同じ2つの誤り**を
// 持っていて、どれも本番中にだけ症状が出る形だった:
//
//  誤り1: 「つながっているときだけ再利用し、そうでなければ捨てて作り直す」
//         → 回線が一瞬揺れているときに操作すると、**受け口を張った接続を捨てる**。
//           socket.io は自分で再接続するので送信は届くが、受け口は捨てた側に
//           付いていたので**画面の表示だけが止まる**。
//           出ている絵は動いているので、壊れたのか自分が押せていないのか
//           オペレーターには区別が付かない。
//           しかも送信関数 (sendCue 等) が毎回この関数を呼ぶので、
//           **押した操作そのものが受け口を壊す**という順序になっていた。
//
//  誤り2: 「片付けで無条件に切る」
//         → 同じ接続を 2 つの画面 / 2 つのフックが共有しているのに、
//           片方が離れると**もう片方の同期も黙って止まる**。
//
// 直し方は 1 つで足りる: **鍵 (シート番号・イベント番号) ごとに 1 本**持ち、
// **使っている数を数え、0 になったときだけ切る**。つながっているかは見ない
// (socket.io の再接続に任せる。捨ててはいけない)。
//
// 4 か所に同じものを書くと、また 1 か所だけ直し忘れる。ここに 1 本置く。
import { io, Socket } from 'socket.io-client';

export interface SocketPool<K extends string | number> {
  /**
   * 接続を取り出す (無ければ作る)。**使用数は増やさない。**
   * 送信 (emit) のたびに呼ばれる想定なので、ここで数えると数が合わなくなる。
   */
  get(key: K): Socket;
  /** 「この画面が使い始めた」を数える。フックの effect の中で 1 回だけ呼ぶ。 */
  acquire(key: K): Socket;
  /** 借りたものを返す。**最後の利用者が離れたときだけ**本当に切る。 */
  release(key?: K): void;
  /** 検証用: いま何本つながっていて、それぞれ何画面が使っているか */
  debugState(): { key: K; users: number }[];
}

export interface SocketPoolConfig<K extends string | number> {
  /** Socket.IO の namespace (例 '/qsheet') */
  namespace: string;
  /** 鍵から接続オプションを作る (query / auth はここで組む) */
  options: (key: K) => Parameters<typeof io>[1];
  /**
   * 別の鍵の接続が残っていたら閉じるか (既定 false)。
   * 「同時に2つのイベントを送出することは無い」ようなアプリで true にする。
   */
  exclusive?: boolean;
}

export function createSocketPool<K extends string | number>(
  config: SocketPoolConfig<K>,
): SocketPool<K> {
  const entries = new Map<K, { socket: Socket; users: number }>();

  const closeEntry = (key: K) => {
    const entry = entries.get(key);
    if (!entry) return;
    entry.socket.removeAllListeners();
    entry.socket.disconnect();
    entries.delete(key);
  };

  const get = (key: K): Socket => {
    const found = entries.get(key);
    // **つながっているかは見ない。** つないでいる最中でも同じものを返す
    // (作り直すと、既に張られている受け口が全部失われる)。
    if (found) return found.socket;

    if (config.exclusive) {
      for (const other of [...entries.keys()]) closeEntry(other);
    }

    const socket = io(config.namespace, config.options(key));
    entries.set(key, { socket, users: 0 });
    return socket;
  };

  return {
    get,
    acquire(key) {
      const socket = get(key);
      const entry = entries.get(key);
      if (entry) entry.users += 1;
      return socket;
    },
    release(key) {
      const keys = key !== undefined ? [key] : [...entries.keys()];
      for (const k of keys) {
        const entry = entries.get(k);
        if (!entry) continue;
        entry.users -= 1;
        if (entry.users > 0) continue;
        closeEntry(k);
      }
    },
    debugState() {
      return [...entries.entries()].map(([key, e]) => ({ key, users: e.users }));
    },
  };
}
