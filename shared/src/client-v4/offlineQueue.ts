/**
 * 電波が弱いところで押した記録を、端末に溜めて後で送る
 *
 * ── モックの決めごと ────────────────────────────────────────
 *
 *   > **電波が弱い前提で作る** — 現場の記録は端末に溜めて後で送る。
 *   > 送信中も操作を止めない
 *   > やってはいけない例: **1件ごとに通信して失敗で止まる**
 *
 * スタジオの機材庫・搬入口・地下の現場は電波が届きません。
 * 1件ごとに通信して失敗で止まる作りだと、**そこで作業が終わります**。
 *
 * ── 二重登録をどう防ぐか（先に決めたこと） ──────────────────
 *
 * 溜めて後で送る仕組みのいちばんの危険は**同じことが2回起きる**ことです
 * （同じ機材を2回読む・送信が途中で切れて再送する）。
 *
 * **鍵（`key`）で上書きする形にして、そもそも2回起きないようにしました。**
 * 同じ鍵の記録は列に1つしか載りません（後から押したほうが残る）。
 * だから使えるのは**何回やっても結果が同じ操作**だけです:
 *
 *   ○ 棚卸しの「あった / 無かった」を付ける（同じ印を2回付けても同じ）
 *   ○ 返却を記録する（返ったものをもう一度返しても返ったまま）
 *   ✕ 貸出を作る（2回押すと2本できる）→ **この列には載せません**
 *
 * 数を数える操作・行を作る操作をここに載せてはいけません。
 * 載せるとこの仕組みが二重登録の原因になります。
 *
 * ── 送れたかどうかを画面に出せるようにする ────────────────
 *
 * `pending()` が残り件数を返します。**0 でないときは画面に出すこと** —
 * 「送ったつもりで送れていない」のが現場でいちばん困ります。
 */

export interface QueuedOp<T = unknown> {
  /** 同じ操作を表す鍵。**同じ鍵は上書き**（列に1つしか載らない） */
  key: string;
  /** 送るときに使う中身 */
  payload: T;
  /** 積んだ時刻（ミリ秒）。並び順と、古すぎるものを捨てる判断に使う */
  at: number;
}

/** 溜めておく上限。超えたら**古いものから捨てる**（端末の容量は有限） */
const MAX = 500;

function read<T>(name: string): QueuedOp<T>[] {
  try {
    const raw = localStorage.getItem(name);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (v): v is QueuedOp<T> => !!v && typeof v.key === 'string' && typeof v.at === 'number',
    );
  } catch {
    return [];
  }
}

function write<T>(name: string, list: QueuedOp<T>[]): void {
  try {
    localStorage.setItem(name, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* 容量切れ・プライベートモード。呼び出し側は pending() で気づける */
  }
}

/**
 * 端末に溜める列。`name` は `localStorage` の鍵なので、
 * **用途ごとに分ける**（混ぜると片方を送ったときに他方まで消える）。
 */
export function createQueue<T>(name: string) {
  return {
    /** 積む。**同じ鍵があれば置き換える**（二重登録を作らない） */
    push(key: string, payload: T, now: number): void {
      const rest = read<T>(name).filter((v) => v.key !== key);
      write(name, [...rest, { key, payload, at: now }]);
    },

    /** 溜まっているもの（積んだ順） */
    all(): QueuedOp<T>[] {
      return read<T>(name).slice().sort((a, b) => a.at - b.at);
    },

    /** 残り件数。**0 でなければ画面に出すこと** */
    pending(): number {
      return read<T>(name).length;
    },

    /** 送れたものを消す。**送れなかったものは残す**（次の機会に送る） */
    done(keys: string[]): void {
      const gone = new Set(keys);
      write(name, read<T>(name).filter((v) => !gone.has(v.key)));
    },

    clear(): void {
      try { localStorage.removeItem(name); } catch { /* 同上 */ }
    },
  };
}

/**
 * 溜まっているものを1つずつ送る。
 *
 * **1つ失敗しても止めません** — 1件の失敗で残り全部が送れないと、
 * 現場から戻っても記録が入らないままになります。
 * 送れたものだけ列から消し、失敗したものは次の機会に回します。
 */
export async function flushQueue<T>(
  queue: ReturnType<typeof createQueue<T>>,
  send: (payload: T) => Promise<void>,
): Promise<{ sent: number; failed: number }> {
  const items = queue.all();
  const ok: string[] = [];
  let failed = 0;
  for (const it of items) {
    try {
      await send(it.payload);
      ok.push(it.key);
    } catch {
      failed += 1;
    }
  }
  queue.done(ok);
  return { sent: ok.length, failed };
}
