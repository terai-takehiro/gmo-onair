/**
 * 端末に溜めて後で送る列（⑨ 機材・現場で）
 *
 * **画面では確かめられない**ものばかりです（同じ鍵の上書き・1件失敗しても
 * 止まらない・送れたものだけ消える）。しかも間違えると
 * **二重登録**という取り返しのつかない壊れ方をするので、素で固定します。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createQueue, flushQueue } from '../src/client-v4/offlineQueue';

function installStorage(impl?: Partial<Storage>) {
  const map = new Map<string, string>();
  const base: Storage = {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => { map.delete(k); },
    setItem: (k, v) => { map.set(k, v); },
  };
  (globalThis as { localStorage?: Storage }).localStorage = { ...base, ...impl };
}

describe('端末に溜める列', () => {
  beforeEach(() => { installStorage(); });

  it('積んだ順に出る', () => {
    const q = createQueue<number>('t');
    q.push('a', 1, 100);
    q.push('b', 2, 200);
    expect(q.all().map((v) => v.key)).toEqual(['a', 'b']);
    expect(q.pending()).toBe(2);
  });

  it('**同じ鍵は上書きする**（二重登録を作らない）', () => {
    const q = createQueue<string>('t');
    q.push('item-1', 'found', 100);
    q.push('item-1', 'missing', 200);
    expect(q.pending()).toBe(1);
    expect(q.all()[0].payload).toBe('missing');
  });

  it('同じ鍵を積み直すと最後に回る（古い時刻で追い越されない）', () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 100);
    q.push('b', 'B', 200);
    q.push('a', 'A2', 300);
    expect(q.all().map((v) => v.key)).toEqual(['b', 'a']);
  });

  it('送れたものだけ消える', () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 100);
    q.push('b', 'B', 200);
    q.done([{ key: 'a', at: 100 }]);
    expect(q.all().map((v) => v.key)).toEqual(['b']);
  });

  it('**積み直したものは、古い印では消えない**（送信中の付け直しを守る）', () => {
    const q = createQueue<string>('t');
    q.push('a', '古い', 100);
    q.push('a', '新しい', 300);      // 送っている最中に付け直した
    q.done([{ key: 'a', at: 100 }]); // 送れたのは古いほう
    expect(q.pending()).toBe(1);
    expect(q.all()[0].payload).toBe('新しい');
  });

  it('壊れた値が入っていても落ちない', () => {
    localStorage.setItem('t', 'これは JSON ではない');
    const q = createQueue<string>('t');
    expect(q.all()).toEqual([]);
    expect(q.pending()).toBe(0);
  });

  it('書けない端末でも例外を投げない', () => {
    installStorage({ setItem: () => { throw new Error('QuotaExceededError'); } });
    const q = createQueue<string>('t');
    expect(() => q.push('a', 'A', 1)).not.toThrow();
    expect(q.pending()).toBe(0);
  });
});

describe('溜まったものを送る', () => {
  beforeEach(() => { installStorage(); });

  it('全部送れたら列は空になる', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 1); q.push('b', 'B', 2);
    const sent: string[] = [];
    const r = await flushQueue(q, async (p) => { sent.push(p); });
    expect(r).toMatchObject({ sent: 2, failed: 0, dropped: 0 });
    expect(sent).toEqual(['A', 'B']);
    expect(q.pending()).toBe(0);
  });

  it('**1件失敗しても残りを送る**（1件で止めない）', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 1); q.push('b', 'B', 2); q.push('c', 'C', 3);
    const sent: string[] = [];
    const r = await flushQueue(q, async (p) => {
      if (p === 'B') throw new Error('圏外');
      sent.push(p);
    });
    expect(sent).toEqual(['A', 'C']);
    expect(r).toMatchObject({ sent: 2, failed: 1, dropped: 0 });
    // 失敗した1件だけ残る（次の機会に送る）
    expect(q.all().map((v) => v.key)).toEqual(['b']);
  });

  it('全部失敗したら1件も消えない', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 1); q.push('b', 'B', 2);
    const r = await flushQueue(q, async () => { throw new Error('圏外'); });
    expect(r).toMatchObject({ sent: 0, failed: 2, dropped: 0 });
    expect(q.pending()).toBe(2);
  });

  /**
   * ⚠️ **前の版のこの試験は、送り終わってから積み直していました** —
   * つまり競合を1度も起こしておらず、「守れている」ように読めるだけでした。
   * 実際に**送っている最中に**付け直します。
   */
  it('**送っている最中に付け直した印は消えない**（古い値がサーバーに残らない）', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'あった', 1);
    const r = await flushQueue(q, async () => {
      // 送信の往復の間に、現場で「やっぱり無かった」を押した
      q.push('a', '無かった', 2);
    });
    expect(r.sent).toBe(1);
    expect(q.pending()).toBe(1);
    expect(q.all()[0].payload).toBe('無かった');
  });

  it('**断られたものは列から外す**（「送れていません」が永久に消えないのを防ぐ）', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 1); q.push('b', 'B', 2);
    const r = await flushQueue(
      q,
      async (p) => { throw p === 'A' ? { response: { status: 400 } } : new Error('圏外'); },
      { drop: (err) => (err as { response?: { status?: number } })?.response?.status === 400 },
    );
    expect(r).toMatchObject({ sent: 0, failed: 1, dropped: 1 });
    // 圏外のぶんは残す（次の機会に送る）
    expect(q.all().map((v) => v.key)).toEqual(['b']);
    // 断られた理由は呼ぶ側に渡す（画面に出すため）
    expect(r.dropErrors).toHaveLength(1);
  });
});
