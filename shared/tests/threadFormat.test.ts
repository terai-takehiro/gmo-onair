/**
 * やり取りの日付と頭文字（`projectDetail/thread/`）
 *
 * **画面を見ても間違いに気づけない計算**なのでここで固定します。
 * 期限の年を落としすぎると「2027-01-05」が「1/5」になり、
 * **年をまたいだ期限が、もう過ぎた日に見えます**。
 */
import { describe, it, expect } from 'vitest';
import { shortYmd } from '../../client/src/contexts/sales/pages/projectDetail/thread/format';
import { initialOf, readActivityStruct } from '../../client/src/contexts/sales/pages/projectDetail/thread/struct';

describe('shortYmd', () => {
  it('基準と同じ年なら M/D（0 を落とす）', () => {
    expect(shortYmd('2026-08-01', '2026-07-31')).toBe('8/1');
    expect(shortYmd('2026-12-25', '2026-01-02')).toBe('12/25');
  });

  it('年が違えば年も出す（年をまたいだ期限を「過ぎた日」に見せない）', () => {
    expect(shortYmd('2027-01-05', '2026-12-28')).toBe('2027/1/5');
  });

  it('基準が無ければ年を出す（省いてよいか判断できない）', () => {
    expect(shortYmd('2026-08-01')).toBe('2026/8/1');
    expect(shortYmd('2026-08-01', null)).toBe('2026/8/1');
  });

  it('空は空（「—」などを勝手に作らない）', () => {
    expect(shortYmd(null)).toBe('');
    expect(shortYmd('')).toBe('');
  });

  it('読めない形はそのまま出す（壊れた値が入っていることに気づけるように）', () => {
    expect(shortYmd('来週', '2026-07-31')).toBe('来週');
    expect(shortYmd('2026/08/01', '2026-07-31')).toBe('2026/08/01');
  });
});

describe('initialOf', () => {
  it('敬称を落としてから1文字（「様」だけのアバターにしない）', () => {
    expect(initialOf('露崎様')).toBe('露');
    expect(initialOf('田中さん')).toBe('田');
    expect(initialOf('掛田')).toBe('掛');
  });

  it('空白を挟んだ氏名でも姓の1文字', () => {
    expect(initialOf('寺井 岳弘')).toBe('寺');
  });

  it('絵文字・サロゲートペアで割れない', () => {
    expect(initialOf('𠮷田')).toBe('𠮷');
  });

  it('名前が無ければ null（丸ごと出さない側で決める）', () => {
    expect(initialOf(null)).toBeNull();
    expect(initialOf('   ')).toBeNull();
    expect(initialOf('様')).toBeNull();
  });
});

describe('readActivityStruct — 画面側でも読み直す', () => {
  it('サーバーが検査した形をそのまま読める', () => {
    const s = readActivityStruct({
      v: 1, subtitle: '副題', statuses: [{ label: '決定', tone: 'decided' }],
      facts: [{ icon: 'date', value: '8/10' }], lead: '要約',
      turns: [{ side: 'us', name: '掛田', org: '当社', at: '7/31', quote: null, note: 'あり', fields: [] }],
    })!;
    expect(s.lead).toBe('要約');
    expect(s.turns[0].side).toBe('us');
  });

  it('`RichBlock[]` を渡されても読まない（`details` と取り違えたときに落ちない）', () => {
    expect(readActivityStruct([{ type: 'text', text: 'あ' }])).toBeNull();
  });

  it('中身が薄ければ null（呼ぶ側は body_html → 素のテキストへ落ちる）', () => {
    expect(readActivityStruct({ subtitle: '副題だけ' })).toBeNull();
    expect(readActivityStruct(null)).toBeNull();
  });
});
