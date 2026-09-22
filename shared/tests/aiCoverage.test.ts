/**
 * まとめの網羅量（`server/src/shared/services/ai-coverage.ts`）
 *
 * **なぜここをテストするか**: 目安と下限は**画面を見ても分かりません**。
 * 出てくるのは「短い議事録」だけで、それが
 * 「材料に何も無かった」のか「AI が落とした」のかは読む人に区別できません
 * （利用者からのご指摘「きわめて短いテキストでしか残らず、議事録の意味をなしていない」）。
 *
 * 特に固定したいのは **短い材料では測らない**ことです。ここが緩むと、
 * 3行の電話メモから 200 字を出させる＝**水増しの強制**になり、
 * この製品がいちばん避けたい「言っていないことが書かれた記録」を自分で作ります。
 *
 * server は `shared` を import しない構成なので、**server のファイルを直接読みます**。
 */
import { describe, it, expect } from 'vitest';
import {
  coverageTarget, isTooThin, coverageBrief, coverageRetryNote, classifyTextCorrection,
} from '../../server/src/shared/services/ai-coverage';

describe('coverageTarget', () => {
  it('1時間の打合せ（約25,000字）では、まとめの目安が数千字になる', () => {
    const t = coverageTarget('minutes', 25_000);
    // 着手前は「3〜5行で」の固定だった。長い打合せほど落ちる情報が増えていた
    expect(t.guideChars).toBe(3_000);
    expect(t.minChars).toBe(1_500);
    expect(t.enforced).toBe(true);
  });

  it('材料が短ければ測らない（水増しを強制しない）', () => {
    const t = coverageTarget('minutes', 300);
    expect(t.enforced).toBe(false);
    // 測らないので、どれだけ短くても「足りない」にはしない
    expect(isTooThin(0, t)).toBe(false);
  });

  it('床が効く長さでも、材料に対する割合で頭打ちにする', () => {
    // 床（200字）をそのまま当てると 800字の材料から 200字＝25%。
    // それ以上は求めない（`inputShareCap`）
    const t = coverageTarget('minutes', 800);
    expect(t.minChars).toBe(200);
    expect(t.minChars).toBeLessThanOrEqual(Math.round(800 * 0.25));
  });

  it('天井がある（材料がいくら長くても青天井にしない）', () => {
    const t = coverageTarget('minutes', 60_000);
    expect(t.guideChars).toBe(5_000);
    expect(t.minChars).toBe(2_500);
  });

  it('やり取りは議事録より高い比率（メールは署名・引用返信が多いぶん密度が高い）', () => {
    const a = coverageTarget('activity', 4_000);
    const m = coverageTarget('minutes', 4_000);
    expect(a.guideChars).toBeGreaterThan(m.guideChars);
  });

  it('やり取りの短い走り書きは測らない', () => {
    expect(coverageTarget('activity', 200).enforced).toBe(false);
    expect(coverageTarget('activity', 500).enforced).toBe(true);
  });

  it('壊れた値でも落ちない（NaN・負の数は 0 として扱う）', () => {
    expect(coverageTarget('minutes', Number.NaN).inputChars).toBe(0);
    expect(coverageTarget('minutes', -100).inputChars).toBe(0);
    expect(coverageTarget('minutes', -100).minChars).toBe(0);
  });
});

describe('isTooThin', () => {
  const t = coverageTarget('minutes', 20_000);

  it('下限を下回れば足りない', () => {
    expect(isTooThin(100, t)).toBe(true);
    expect(isTooThin(t.minChars - 1, t)).toBe(true);
  });

  it('下限ちょうどは足りている（境目で毎回やり直させない）', () => {
    expect(isTooThin(t.minChars, t)).toBe(false);
  });

  it('壊れた値では足りない側に倒す（0 として測る）', () => {
    expect(isTooThin(Number.NaN, t)).toBe(true);
  });
});

describe('coverageBrief / coverageRetryNote', () => {
  it('測らないときは何も足さない（プロンプトを無駄に長くしない）', () => {
    expect(coverageBrief(coverageTarget('minutes', 300), '今回の文字起こし', '引用を除いたまとめ')).toBe('');
  });

  it('目安には「書き足すな」を必ず添える', () => {
    const brief = coverageBrief(coverageTarget('minutes', 20_000), '今回の文字起こし', '引用を除いたまとめ');
    expect(brief).toContain('今回の文字起こし');
    // **ここが緩むと水増しになる。** 文字数だけを渡してはいけない
    expect(brief).toContain('文字数を満たすために書き足さないでください');
  });

  it('やり直しの指示は「長く書け」ではなく「拾い直せ」', () => {
    const note = coverageRetryNote(120, coverageTarget('minutes', 20_000), '引用を除いたまとめ');
    expect(note).toContain('拾い直してください');
    expect(note).toContain('材料に無いことは書かないこと');
    expect(note).not.toContain('長く書いて');
  });
});

describe('classifyTextCorrection', () => {
  const ai = 'ロゴの掲載位置を確認する。';

  it('同じなら修正ではない', () => {
    expect(classifyTextCorrection(ai, ` ${ai} `)).toBe('none');
  });

  it('空 → 値 は書き足し（今までどおり）', () => {
    expect(classifyTextCorrection('', ai)).toBe('enrich');
    expect(classifyTextCorrection(null, ai)).toBe('enrich');
  });

  it('AI の文を残したまま足したものは書き足し（＝まとめが短かった信号）', () => {
    // ここが `fix` に落ちていたので「短すぎる」がどの数字にも出なかった
    expect(classifyTextCorrection(ai, `${ai}あわせて搬入経路と当日の立ち会い人数も確認する。`)).toBe('enrich');
  });

  it('書き換えは誤り（AI の文が残っていない）', () => {
    expect(classifyTextCorrection(ai, 'ロゴは先方支給。掲載位置の確認は不要。')).toBe('fix');
  });

  it('句読点1つ足しただけを書き足しに数えない', () => {
    expect(classifyTextCorrection(ai, `${ai}（済）`)).toBe('fix');
  });

  it('丸ごと消したものは書き足しではない', () => {
    expect(classifyTextCorrection(ai, '')).toBe('fix');
  });
});
