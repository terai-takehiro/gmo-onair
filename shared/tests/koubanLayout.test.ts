import { describe, it, expect } from 'vitest';
import {
  minutesOnDate, minutesToSlot, assignColumns, getLocationTab, TOTAL_SLOTS,
} from '../../client/src/contexts/production/components/studio/koubanLayout';

describe('minutesOnDate（日またぎ予約を表示日から見た分に直す）', () => {
  it('表示日と同じ日なら時刻そのまま', () => {
    expect(minutesOnDate('2026-03-29T10:30:00', '2026-03-29', 0)).toBe(10 * 60 + 30);
  });
  it('**表示日より前に始まっていれば 0 分**（前日から続く予約を翌日側で「23時開始」に描かない）', () => {
    expect(minutesOnDate('2026-03-28T23:00:00', '2026-03-29', 0)).toBe(0);
  });
  it('**表示日より後まで続くなら 24:00**（当日の終わりまで埋める）', () => {
    expect(minutesOnDate('2026-03-30T02:00:00', '2026-03-29', 24 * 60)).toBe(24 * 60);
  });
  it('時刻部分が無ければ fallback', () => {
    expect(minutesOnDate('2026-03-29', '2026-03-29', 99)).toBe(99);
  });
});

describe('minutesToSlot（開始は切り捨て・終了は切り上げ）', () => {
  it('開始 10:15 は 10:00 の位置（切り捨て）', () => {
    expect(minutesToSlot(10 * 60 + 15, false)).toBe(20); // 10:00 = 20 コマ目 (30分刻み)
  });
  it('終了 10:15 は 10:30 の位置（切り上げ）— 四捨五入だと 10:00 に潰れて長さがずれる', () => {
    expect(minutesToSlot(10 * 60 + 15, true)).toBe(21); // 10:30
  });
  it('窓（0〜24:00）の外には出さない', () => {
    expect(minutesToSlot(-30, false)).toBe(0);
    expect(minutesToSlot(30 * 60, true)).toBe(TOTAL_SLOTS);
  });
});

describe('assignColumns（同室同時間帯の重なりを横に列分けする）', () => {
  it('重ならない2件はどちらも1列（cols=1）', () => {
    const out = assignColumns([
      { id: 'a', startSlot: 0, endSlot: 2 },
      { id: 'b', startSlot: 4, endSlot: 6 },
    ]);
    expect(out.every((x) => x.cols === 1 && x.col === 0)).toBe(true);
  });
  it('**同室・同時間帯にぴったり重なる2件は列を分ける**（以前は完全に重なり2件目が押せなかった）', () => {
    const out = assignColumns([
      { id: 'a', startSlot: 20, endSlot: 21 },
      { id: 'b', startSlot: 20, endSlot: 21 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.cols)).toEqual([2, 2]);
    expect(new Set(out.map((x) => x.col)).size).toBe(2);
  });
  it('3件重なっても1件も消えない（3列）', () => {
    const out = assignColumns([
      { id: 'a', startSlot: 0, endSlot: 6 },
      { id: 'b', startSlot: 1, endSlot: 4 },
      { id: 'c', startSlot: 2, endSlot: 8 },
    ]);
    expect(out).toHaveLength(3);
    expect(out.every((x) => x.cols === 3)).toBe(true);
    expect(new Set(out.map((x) => x.col)).size).toBe(3);
  });
});

describe('getLocationTab（用賀/青山を「サムライ」より先に判定する）', () => {
  it('新名称でも地名側に振り分ける', () => {
    expect(getLocationTab('GMOサムライスタジオ用賀')).toBe('yoga');
    expect(getLocationTab('GMOサムライスタジオ青山')).toBe('aoyama');
    expect(getLocationTab('GMOサムライスタジオ渋谷')).toBe('shibuya');
  });
  it('知らない拠点は other', () => {
    expect(getLocationTab('どこか')).toBe('other');
  });
});
