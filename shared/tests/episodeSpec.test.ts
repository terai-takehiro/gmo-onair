import { describe, it, expect } from 'vitest';
import {
  parseEpisodeSpec, groupConsecutive, describeEpisodeNumbers,
  EpisodeSpecError, MAX_EPISODES_PER_BATCH,
} from '../../server/src/shared/production/episodeSpec';

describe('parseEpisodeSpec — 件数（後方互換）', () => {
  it('純粋な数字だけは件数として読む', () => {
    expect(parseEpisodeSpec('2')).toEqual({ mode: 'count', count: 2 });
  });

  it('前後の空白は無視する', () => {
    expect(parseEpisodeSpec('  5  ')).toEqual({ mode: 'count', count: 5 });
  });

  it('0件は弾く', () => {
    expect(() => parseEpisodeSpec('0')).toThrow(EpisodeSpecError);
  });

  it(`上限（${MAX_EPISODES_PER_BATCH}件）を超えたら弾く`, () => {
    expect(() => parseEpisodeSpec(String(MAX_EPISODES_PER_BATCH + 1))).toThrow(EpisodeSpecError);
  });

  it('上限ちょうどは通る', () => {
    expect(parseEpisodeSpec(String(MAX_EPISODES_PER_BATCH))).toEqual({
      mode: 'count', count: MAX_EPISODES_PER_BATCH,
    });
  });

  it('空欄は弾く', () => {
    expect(() => parseEpisodeSpec('')).toThrow(EpisodeSpecError);
    expect(() => parseEpisodeSpec('   ')).toThrow(EpisodeSpecError);
  });

  it('数字以外（件数の形のとき）は弾く', () => {
    expect(() => parseEpisodeSpec('abc')).toThrow(EpisodeSpecError);
  });
});

describe('parseEpisodeSpec — 範囲・明示指定', () => {
  it('"1-2" は話数1・2を明示指定', () => {
    expect(parseEpisodeSpec('1-2')).toEqual({ mode: 'explicit', numbers: [1, 2] });
  });

  it('先頭の # は無視する（"#1-2" は "1-2" と同じ）', () => {
    expect(parseEpisodeSpec('#1-2')).toEqual({ mode: 'explicit', numbers: [1, 2] });
  });

  it('# 単体の話数（"#3"）も明示指定として読む（件数の3ではない）', () => {
    expect(parseEpisodeSpec('#3')).toEqual({ mode: 'explicit', numbers: [3] });
  });

  it('カンマ区切りの複数レンジ "1,3,5-8" をまとめて読む', () => {
    expect(parseEpisodeSpec('1,3,5-8')).toEqual({ mode: 'explicit', numbers: [1, 3, 5, 6, 7, 8] });
  });

  it('全角カンマ・読点でも区切れる', () => {
    expect(parseEpisodeSpec('1、3、5-8')).toEqual({ mode: 'explicit', numbers: [1, 3, 5, 6, 7, 8] });
  });

  it('順序を保証せず昇順に整列する', () => {
    expect(parseEpisodeSpec('8,3,5')).toEqual({ mode: 'explicit', numbers: [3, 5, 8] });
  });

  it('範囲の順序が逆（"5-2"）はエラー', () => {
    expect(() => parseEpisodeSpec('5-2')).toThrow(EpisodeSpecError);
  });

  it('0以下の話数はエラー', () => {
    expect(() => parseEpisodeSpec('0-2')).toThrow(EpisodeSpecError);
  });

  it('重複した話数の指定はエラー（"1,1"）', () => {
    expect(() => parseEpisodeSpec('1,1')).toThrow(EpisodeSpecError);
  });

  it('範囲とかぶる重複もエラー（"1-3,3-5"）', () => {
    expect(() => parseEpisodeSpec('1-3,3-5')).toThrow(EpisodeSpecError);
  });

  it('読み取れない指定はエラー（"a-b"）', () => {
    expect(() => parseEpisodeSpec('a-b')).toThrow(EpisodeSpecError);
  });

  it('要素の欠けたカンマ区切り（"1,,3"）はエラーにならず空要素を無視する', () => {
    expect(parseEpisodeSpec('1,,3')).toEqual({ mode: 'explicit', numbers: [1, 3] });
  });

  it(`明示指定でも上限（${MAX_EPISODES_PER_BATCH}件）を超えたら弾く`, () => {
    expect(() => parseEpisodeSpec(`1-${MAX_EPISODES_PER_BATCH + 1}`)).toThrow(EpisodeSpecError);
  });
});

describe('groupConsecutive', () => {
  it('連続する話数は1区間にまとまる', () => {
    expect(groupConsecutive([1, 2, 3])).toEqual([{ start: 1, end: 3 }]);
  });

  it('非連続は区間ごとに分かれる（episode_orders の start/end 用）', () => {
    expect(groupConsecutive([1, 3, 5, 6, 7, 8])).toEqual([
      { start: 1, end: 1 },
      { start: 3, end: 3 },
      { start: 5, end: 8 },
    ]);
  });

  it('順不同の入力でも昇順に整列してからまとめる', () => {
    expect(groupConsecutive([5, 1, 2])).toEqual([{ start: 1, end: 2 }, { start: 5, end: 5 }]);
  });

  it('単一の話数は start === end の1区間', () => {
    expect(groupConsecutive([7])).toEqual([{ start: 7, end: 7 }]);
  });
});

describe('describeEpisodeNumbers', () => {
  it('連続区間は「〜」でまとめる', () => {
    expect(describeEpisodeNumbers([3, 4, 5, 6, 7, 8])).toBe('#3〜#8');
  });

  it('非連続は読点で区切る', () => {
    expect(describeEpisodeNumbers([1, 3, 5, 6, 7, 8])).toBe('#1、#3、#5〜#8');
  });

  it('単一の話数は「〜」を付けない', () => {
    expect(describeEpisodeNumbers([4])).toBe('#4');
  });
});
