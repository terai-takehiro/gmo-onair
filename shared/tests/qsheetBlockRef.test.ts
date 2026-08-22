// 制作資料 (Qシート) — blockRef (`blk.<type>#<n>`) の固定。
//
// 同じ型の列が2本あるとき (例: シナリオ列2本) を `blk.scenario#1` / `blk.scenario#2`
// として区別できること、そして列を並べ替えると ref が変わる (= 保存してはいけない
// その場限りの識別子であること) を固定する。
import { describe, it, expect } from 'vitest';
import { blockRefTable, blockRefOf, resolveBlockRef } from '../src/qsheet/blockRef';

const blocks = [
  { id: 'scenario', type: 'scenario', label: '台本' },
  { id: 'blk_a', type: 'scenario', label: '台本2' },
  { id: 'video', type: 'video', label: '映像' },
];

describe('blockRefTable / blockRefOf', () => {
  it('同型2本が #1 / #2 になる', () => {
    const table = blockRefTable(blocks);
    expect(table.get('scenario')).toBe('blk.scenario#1');
    expect(table.get('blk_a')).toBe('blk.scenario#2');
  });

  it('型が1本しかない列は #1', () => {
    expect(blockRefOf('video', blocks)).toBe('blk.video#1');
  });

  it('存在しない blockId は null', () => {
    expect(blockRefOf('nope', blocks)).toBeNull();
  });
});

describe('resolveBlockRef', () => {
  it('ref から blockId を逆引きできる', () => {
    expect(resolveBlockRef('blk.scenario#2', blocks)).toBe('blk_a');
    expect(resolveBlockRef('blk.video#1', blocks)).toBe('video');
  });

  it('範囲外の番号は null', () => {
    expect(resolveBlockRef('blk.scenario#3', blocks)).toBeNull();
  });

  it('不正な形式・未知の型は null', () => {
    expect(resolveBlockRef('scenario#1', blocks)).toBeNull();
    expect(resolveBlockRef('blk.not_a_type#1', blocks)).toBeNull();
  });

  it('並べ替えると ref が変わる (保存してはいけないその場限りの識別子)', () => {
    const reordered = [blocks[2], blocks[0], blocks[1]];
    expect(blockRefOf('scenario', reordered)).toBe('blk.scenario#1');
    // 並べ替え前は blk.scenario#1 だった 'scenario' の id 自体は変わらないが、
    // ref という文字列は blocks[] の並びに依存するため保存対象にしてはいけない。
    expect(resolveBlockRef('blk.scenario#2', reordered)).toBe('blk_a');
  });
});
