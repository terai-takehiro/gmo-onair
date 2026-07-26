import { createSocketPool } from '@gmo-onair/shared/src/client/socketPool';

// クイズ 1 件につき接続 1 本。**なぜ「つながっていなければ作り直す」形を
// やめたかは shared/src/client/socketPool.ts の冒頭に書いてある。**
// ここでは投票数の受け口が失われると**本番中に票が伸びなくなる**形で出る
// (出ている絵は動いているので、票が本当に入っていないのか画面が止まって
//  いるのかオペレーターには区別が付かない)。
const pool = createSocketPool<number>({
  namespace: '/quiz',
  exclusive: true,
  options: (quizId) => ({
    query: { quizId: String(quizId) },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  }),
});

/** 接続を取り出す。**使用数は増やさない** (送信からも呼ばれる) */
export const getQuizSocket = (quizId: number) => pool.get(quizId);

/** 「この画面が使い始めた」を数える (フックの effect で1回だけ) */
export const acquireQuizSocket = (quizId: number) => pool.acquire(quizId);

/** 借りた接続を返す。**最後の利用者が離れたときだけ**切る。 */
export const disconnectQuizSocket = (quizId?: number) => pool.release(quizId);
