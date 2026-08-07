/**
 * 最近見たもの（⑪ 探す）
 *
 * **画面では確かめにくい**もの（同じものが2つ並ばないか・上限で切れるか・
 * 壊れた値が入っていても落ちないか）なので素で固定します。
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readRecent, pushRecent, clearRecent } from '../src/client-v4/recent';

/** テスト用の `localStorage`（Node には無い） */
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
  return map;
}

describe('最近見たもの', () => {
  beforeEach(() => { installStorage(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('何も無いときは空', () => {
    expect(readRecent()).toEqual([]);
  });

  it('積んだものが先頭に来る', () => {
    pushRecent({ to: '/a', label: 'A', kind: 'project' });
    pushRecent({ to: '/b', label: 'B', kind: 'customer' });
    expect(readRecent().map((r) => r.to)).toEqual(['/b', '/a']);
  });

  it('同じ行き先を2回開いても1つにまとまる（先頭に上がる）', () => {
    pushRecent({ to: '/a', label: 'A', kind: 'project' });
    pushRecent({ to: '/b', label: 'B', kind: 'project' });
    pushRecent({ to: '/a', label: 'A（名前が変わった）', kind: 'project' });
    const r = readRecent();
    expect(r.map((v) => v.to)).toEqual(['/a', '/b']);
    // **新しいほうの名前を採用する**（案件名を直した直後に古い名前が出ない）
    expect(r[0].label).toBe('A（名前が変わった）');
  });

  it('8件を超えたら古いものから落ちる', () => {
    for (let i = 0; i < 12; i++) pushRecent({ to: `/p${i}`, label: `P${i}`, kind: 'project' });
    const r = readRecent();
    expect(r).toHaveLength(8);
    expect(r[0].to).toBe('/p11');
    expect(r[7].to).toBe('/p4');
  });

  it('行き先か名前が空のものは積まない（押せない行を作らない）', () => {
    pushRecent({ to: '', label: 'A', kind: 'project' });
    pushRecent({ to: '/a', label: '', kind: 'project' });
    expect(readRecent()).toEqual([]);
  });

  it('壊れた値が入っていても落ちない', () => {
    localStorage.setItem('gmo_onair_recent', '{壊れている');
    expect(readRecent()).toEqual([]);
  });

  it('形の違う要素は捨てる（古い版が書いた値が残っていても画面を壊さない）', () => {
    localStorage.setItem('gmo_onair_recent', JSON.stringify([
      { to: '/ok', label: 'OK', kind: 'project', at: 1 },
      { label: '行き先が無い', kind: 'project', at: 2 },
      null,
    ]));
    expect(readRecent().map((r) => r.to)).toEqual(['/ok']);
  });

  it('書けない端末でも例外を投げない（プライベートモード・容量切れ）', () => {
    installStorage({ setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(() => pushRecent({ to: '/a', label: 'A', kind: 'project' })).not.toThrow();
    expect(readRecent()).toEqual([]);
  });

  it('読めない端末でも例外を投げない', () => {
    installStorage({ getItem: () => { throw new Error('SecurityError'); } });
    expect(readRecent()).toEqual([]);
  });

  it('消せる', () => {
    pushRecent({ to: '/a', label: 'A', kind: 'project' });
    clearRecent();
    expect(readRecent()).toEqual([]);
  });
});
