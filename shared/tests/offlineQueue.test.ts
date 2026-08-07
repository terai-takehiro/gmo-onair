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
    q.done(['a']);
    expect(q.all().map((v) => v.key)).toEqual(['b']);
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
    expect(r).toEqual({ sent: 2, failed: 0 });
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
    expect(r).toEqual({ sent: 2, failed: 1 });
    // 失敗した1件だけ残る（次の機会に送る）
    expect(q.all().map((v) => v.key)).toEqual(['b']);
  });

  it('全部失敗したら1件も消えない', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 1); q.push('b', 'B', 2);
    const r = await flushQueue(q, async () => { throw new Error('圏外'); });
    expect(r).toEqual({ sent: 0, failed: 2 });
    expect(q.pending()).toBe(2);
  });

  it('送っている間に同じ鍵を積み直しても、送れた印で消えるのは送ったぶんだけ', async () => {
    const q = createQueue<string>('t');
    q.push('a', 'A', 1);
    await flushQueue(q, async () => { /* 送れた */ });
    expect(q.pending()).toBe(0);
    q.push('a', 'A2', 2);
    expect(q.pending()).toBe(1);
  });
});
