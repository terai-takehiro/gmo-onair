/**
 * 資料の構成の「人の直し」の差分（`deckDiff.ts`）。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 * 差分は `keep_deck_edits` に入り、「よく消されるページ」「よく直される注記」の集計（§10 条件4）の
 * 材料になる。取りこぼすと**人が直したのに記録が無い**（AI を使い捨てにしない原則の穴）が、
 * 画面には何も出ないので気づけない。逆に、変えていない所を「直した」と数えると集計が嘘になる。
 */
import { describe, it, expect } from 'vitest';
import { diffDecks, stableJson } from '../src/keepReport/deckDiff';
import type { SlidePage, SlidePart } from '../src/keepReport/types';

const part = (id: string, o: Partial<SlidePart> = {}): SlidePart =>
  ({ id, type: 'text', binding: null, x: 0, y: 0, w: 10, h: 10, text_override: null, options: { label: 'x' }, ...o });
const page = (id: string, o: Partial<SlidePage> = {}): SlidePage =>
  ({ id, template: 'free', title: `題 ${id}`, auto: false, parts: [part(`${id}:p0`)], removed: false, notes: null, agenda: null, ...o });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('構成の差分（diffDecks）', () => {
  it('同じ構成なら差分は無い（label の有無・鍵の順は無視）', () => {
    const a = [page('a'), page('b')];
    const b = clone(a);
    b[0].parts[0].options = { label: '別のラベル' };
    expect(diffDecks(a, b)).toEqual([]);
  });

  it('並べ替えは1行（両方にあるページの id の並び）', () => {
    const prev = [page('a'), page('b'), page('c')];
    const next = [page('c'), page('a'), page('b')];
    const d = diffDecks(prev, next);
    expect(d).toEqual([{ page_id: null, part_id: null, field: 'order', before_value: 'a,b,c', after_value: 'c,a,b', kind: 'reorder' }]);
  });

  it('消す・戻す（removed の印）', () => {
    const prev = [page('a'), page('b', { removed: true })];
    const next = [page('a', { removed: true }), page('b')];
    expect(diffDecks(prev, next).map((e) => [e.kind, e.page_id])).toEqual([['remove', 'a'], ['restore', 'b']]);
  });

  it('ページを足す・ページそのものが無くなる', () => {
    const prev = [page('a'), page('b')];
    const next = [page('a'), page('new', { template: 'copied', title: '前回から' })];
    const d = diffDecks(prev, next);
    expect(d).toContainEqual({ page_id: 'new', part_id: null, field: 'page', before_value: null, after_value: 'copied: 前回から', kind: 'add' });
    expect(d).toContainEqual({ page_id: 'b', part_id: null, field: 'page', before_value: 'free: 題 b', after_value: null, kind: 'remove' });
    expect(d.filter((e) => e.kind === 'reorder')).toEqual([]); // 残った a の並びは同じ
  });

  it('題・注記・アジェンダ・部品の文と設定と位置の上書き', () => {
    const prev = [page('a', { parts: [part('a:p0', { options: { label: 'l', photos: ['1'] } })] })];
    const next = clone(prev);
    next[0].title = '直した題';
    next[0].notes = 'メモ';
    next[0].agenda = { category: '報告', priority: '3×3', minutes: 5 };
    next[0].parts[0].text_override = '上書きした文';
    next[0].parts[0].options = { label: 'l', photos: ['1', '2'] };
    next[0].parts[0].x = 5;
    const d = diffDecks(prev, next);
    expect(d.map((e) => e.field).sort()).toEqual(['agenda', 'notes', 'options', 'position', 'text_override', 'title']);
    expect(d.every((e) => e.kind === 'override')).toBe(true);
    const opt = d.find((e) => e.field === 'options')!;
    expect(opt.before_value).toBe(stableJson({ photos: ['1'] }));
    expect(opt.after_value).toBe(stableJson({ photos: ['1', '2'] }));
    expect(d.find((e) => e.field === 'position')).toMatchObject({ before_value: '0,0,10,10', after_value: '5,0,10,10', part_id: 'a:p0' });
  });

  it('部品を足す・消す', () => {
    const prev = [page('a', { parts: [part('a:p0'), part('a:p1', { type: 'image' })] })];
    const next = [page('a', { parts: [part('a:p0'), part('a:human', { type: 'photos' })] })];
    const d = diffDecks(prev, next);
    expect(d).toContainEqual({ page_id: 'a', part_id: 'a:human', field: 'part', before_value: null, after_value: 'photos', kind: 'add' });
    expect(d).toContainEqual({ page_id: 'a', part_id: 'a:p1', field: 'part', before_value: 'image', after_value: null, kind: 'remove' });
  });

  it('上書きを消す（null に戻す）も override として残る', () => {
    const prev = [page('a', { parts: [part('a:p0', { text_override: '文' })] })];
    const next = [page('a', { parts: [part('a:p0', { text_override: null })] })];
    expect(diffDecks(prev, next)).toEqual([{ page_id: 'a', part_id: 'a:p0', field: 'text_override', before_value: '文', after_value: null, kind: 'override' }]);
  });
});
