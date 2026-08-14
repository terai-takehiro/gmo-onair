/**
 * 「次にやること」の短い一文（`next-action-short.service` / `thread/nextAction`）
 *
 * ここで固定するのは**AI を呼ばずに決めている2つの判断**です。どちらも
 * 間違えても画面はそれらしく出るので、**目で見て気づけません**:
 *
 *  1. `normalizeShort` … AI が返した一文を**採るか捨てるか**。
 *     ゆるくすると、28字を超えた文が「AI が作った要約」として保存され、
 *     結局画面で切れます（規則で切るのと同じことになる）
 *  2. `nextActionLine` … **まだ短い一文が無い行で何を出すか**。
 *     ここで空を返すと、取り込んだ直後の記録＝いちばん見たい行だけが画面から消えます
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeShort, needsShort, SHORT_MAX_CHARS, SHORT_MIN_SOURCE_CHARS,
} from '../../server/src/contexts/sales/services/next-action-short.service';
import { nextActionLine } from '../../client/src/contexts/sales/pages/projectDetail/thread/nextAction';

/** 本番データ（利用者からご指摘いただいた実際の値） */
const REAL = '★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する'
  + '(発注期日 8/19 は盆明けの中日。実働は2日)。①金子様からの酒樽設置台2台の可否・金額の回答を確認'
  + '②パーテーション等の追加要否・数量を確定③搬出時刻を一本化';

describe('needsShort — AI を呼ぶかどうか', () => {
  it('もともと収まっている文では呼ばない', () => {
    expect(needsShort('見積書を送付する')).toBe(false);
    expect(needsShort('あ'.repeat(SHORT_MAX_CHARS))).toBe(false);
  });

  it('上限を超えていたら呼ぶ', () => {
    expect(needsShort('あ'.repeat(SHORT_MIN_SOURCE_CHARS))).toBe(true);
    expect(needsShort(REAL)).toBe(true);
  });

  it('空・null では呼ばない', () => {
    expect(needsShort(null)).toBe(false);
    expect(needsShort('')).toBe(false);
    expect(needsShort('   ')).toBe(false);
  });
});

describe('normalizeShort — 採るか捨てるか', () => {
  it('収まっている一文はそのまま採る（句点だけ落とす）', () => {
    expect(normalizeShort('備品レンタルの発注可否を確定して発注', REAL))
      .toBe('備品レンタルの発注可否を確定して発注');
    expect(normalizeShort('備品レンタルの発注可否を確定。', REAL))
      .toBe('備品レンタルの発注可否を確定');
  });

  it('改行と連続した空白は1つに詰める（1行に出す値なので）', () => {
    expect(normalizeShort('備品レンタルの\n発注可否を  確定', REAL)).toBe('備品レンタルの 発注可否を 確定');
  });

  /*
   * **切り詰めない。** 途中で切れた文を「AI が作った要約」として保存すると、
   * ①画面で切れる ②直したのに直っていないことが分からない、の2つが起きる
   */
  it('上限を超えた一文は採らない（切り詰めない）', () => {
    expect(normalizeShort('あ'.repeat(SHORT_MAX_CHARS + 1), REAL)).toBeNull();
    expect(normalizeShort('あ'.repeat(SHORT_MAX_CHARS), REAL)).toBe('あ'.repeat(SHORT_MAX_CHARS));
  });

  it('原文と同じ・原文より長いものは採らない（短くなっていない）', () => {
    expect(normalizeShort(REAL, REAL)).toBeNull();
    expect(normalizeShort('見積書を送付する', '見積書を送付')).toBeNull();
  });

  it('空・空白だけ・null は採らない', () => {
    expect(normalizeShort('', REAL)).toBeNull();
    expect(normalizeShort('   \n ', REAL)).toBeNull();
    expect(normalizeShort(null, REAL)).toBeNull();
    expect(normalizeShort(undefined, REAL)).toBeNull();
  });

  // 絵文字・丸数字は1文字として数える（`length` で数えると2文字になり、通るはずの文が落ちる）
  it('サロゲートペアを1文字として数える', () => {
    expect(normalizeShort('🎥'.repeat(SHORT_MAX_CHARS), REAL)).toBe('🎥'.repeat(SHORT_MAX_CHARS));
    expect(normalizeShort('🎥'.repeat(SHORT_MAX_CHARS + 1), REAL)).toBeNull();
  });
});

describe('nextActionLine — 画面に出す1行', () => {
  it('短い一文があればそれを出す', () => {
    expect(nextActionLine({ next_action: REAL, next_action_short: '備品レンタルの発注可否を確定' }))
      .toBe('備品レンタルの発注可否を確定');
  });

  /*
   * **まだ作られていない行で空を返さない。** 短い一文は毎晩の定時実行で作るので、
   * 取り込んだ直後の記録には入っていない（＝いちばん見たい行）
   */
  it('無ければ規則で作った見出しに落ちる', () => {
    const line = nextActionLine({ next_action: REAL });
    expect(line).not.toBe('');
    expect(line.startsWith('★8/14(金)までに')).toBe(true);
    expect(nextActionLine({ next_action: REAL, next_action_short: null })).toBe(line);
    expect(nextActionLine({ next_action: REAL, next_action_short: '  ' })).toBe(line);
  });

  it('「次にやること」自体が無ければ空', () => {
    expect(nextActionLine({ next_action: null })).toBe('');
  });
});
