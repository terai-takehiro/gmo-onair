/**
 * 「最近見たもの」は**いま入っている人のものだけ**を出す。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `localStorage` は**ログアウトしても残ります**。持ち主を書いていなかったので、
 * 1台の端末を別の人が使ったとき（共用の PC・引き継いだ端末）に
 * **前の人が見た案件名・お客様名・GLS 番号がそのまま出ていました**
 * （開けば 403 になりますが、**名前はもう読まれています**）。
 *
 * 画面を見ても分かりません — 前の人と同じ端末で、同じ見た目のまま出るからです。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readRecent, pushRecent, clearRecent, removeRecent } from '../src/client-v4/recent';

/** `localStorage` の代わり（Node には無い） */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    get size() { return map.size; },
    raw: (k: string) => map.get(k),
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal('localStorage', store);
});

const item = (to: string, label: string) => ({ to, label, kind: 'project' as const });

describe('最近見たもの', () => {
  it('自分が見たものは出る', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    expect(readRecent('u1').map((v) => v.label)).toEqual(['GH IR説明会']);
  });

  // ⚠️ ここが壊れていた側
  it('別の人には出さない（同じ端末に前の人の分が残っていても）', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    expect(readRecent('u2')).toEqual([]);
  });

  it('持ち主が分からない古い形は出さない', () => {
    store.setItem('gmo_onair_recent', JSON.stringify([
      { to: '/sales/projects/1', label: '前の版が書いた案件', kind: 'project', at: 1 },
    ]));
    expect(readRecent('u1')).toEqual([]);
  });

  it('人が変わって積み直すと、前の人の分は消える', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    pushRecent(item('/sales/projects/2', 'PW 動画'), 'u2');
    expect(readRecent('u2').map((v) => v.label)).toEqual(['PW 動画']);
    expect(readRecent('u1')).toEqual([]);
    // 端末に前の人の案件名が**文字として残っていない**こと
    expect(store.raw('gmo_onair_recent')).not.toContain('GH IR説明会');
  });

  it('ログインしていない（uid が空）ときは読まない・書かない', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), '');
    expect(store.size).toBe(0);
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    expect(readRecent('')).toEqual([]);
  });

  it('同じ行き先は1つにまとまり、新しいほうが先に来る', () => {
    pushRecent(item('/sales/projects/1', '古い名前'), 'u1');
    pushRecent(item('/sales/projects/2', 'ほか'), 'u1');
    pushRecent(item('/sales/projects/1', '新しい名前'), 'u1');
    expect(readRecent('u1').map((v) => v.label)).toEqual(['新しい名前', 'ほか']);
  });

  it('8件を超えたら古いものから落ちる', () => {
    for (let i = 0; i < 10; i++) pushRecent(item(`/sales/projects/${i}`, `案件${i}`), 'u1');
    const got = readRecent('u1');
    expect(got).toHaveLength(8);
    expect(got[0].label).toBe('案件9');
  });

  it('消せる（ログアウトで呼ぶ）', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    clearRecent();
    expect(readRecent('u1')).toEqual([]);
  });

  it('1件だけ消せる（他は残る）', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    pushRecent(item('/sales/projects/2', 'PW 動画'), 'u1');
    removeRecent('/sales/projects/1', 'u1');
    expect(readRecent('u1').map((v) => v.label)).toEqual(['PW 動画']);
  });

  it('to / uid が空なら何もしない', () => {
    pushRecent(item('/sales/projects/1', 'GH IR説明会'), 'u1');
    removeRecent('', 'u1');
    removeRecent('/sales/projects/1', '');
    expect(readRecent('u1').map((v) => v.label)).toEqual(['GH IR説明会']);
  });

  it('消しても、書けないときは例外を出さない', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    });
    expect(() => removeRecent('/x', 'u1')).not.toThrow();
  });

  // `localStorage` が使えない端末（プライベートモード・容量切れ）でも画面を壊さない
  it('読めない・書けないときは何も無かったことにする', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    });
    expect(readRecent('u1')).toEqual([]);
    expect(() => pushRecent(item('/x', 'y'), 'u1')).not.toThrow();
    expect(() => clearRecent()).not.toThrow();
  });
});
