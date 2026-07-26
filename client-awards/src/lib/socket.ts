import { createSocketPool } from '@gmo-onair/shared/src/client/socketPool';

// イベント 1 件につき接続 1 本。使っているフックの数を数え、0 になったときだけ切る。
//
// **なぜそうしないといけないか (本番中に何が起きていたか) は
//   shared/src/client/socketPool.ts の冒頭に書いてある。**
// 要点だけ: 以前は「つながっていなければ捨てて作り直す」形だったので、
// 回線が一瞬揺れているときに TAKE を押すと**受け口を張った接続を捨てて**
// しまい、出ている絵は動いているのに「いま出ているもの」の表示だけが
// 止まっていた。さらにランキングCG と字幕スーパーが同じ 1 本を共有して
// いるのに、前者だけが片付けで無条件に切っていた。
//
// exclusive: 同時に 2 つのイベントを送出することは無いので、
// 別イベントの接続が残っていたら閉じる。
const pool = createSocketPool<number>({
  namespace: '/awards',
  exclusive: true,
  options: (eventId) => ({
    query: { eventId: String(eventId) },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  }),
});

/**
 * 接続を取り出す。**使用数は増やさない** — 送出 (`sendCue`) から毎回
 * 呼ばれるので、ここで数えると数が合わなくなる。
 */
export const getAwardsSocket = (eventId: number) => pool.get(eventId);

/** 「この画面が使い始めた」を数える。フックの effect の中で 1 回だけ呼ぶ。 */
export const acquireAwardsSocket = (eventId: number) => pool.acquire(eventId);

/** 借りた接続を返す。**最後のフックが離れたときだけ**本当に切る。 */
export const disconnectAwardsSocket = (eventId?: number) => pool.release(eventId);

/** 検証用: いま何本つながっていて、それぞれ何画面が使っているか */
export const awardsSocketDebugState = () => pool.debugState();
