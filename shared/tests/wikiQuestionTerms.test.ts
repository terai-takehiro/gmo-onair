/**
 * 「AI に聞く」が質問を検索語に変えるところ（`questionTerms`）。
 *
 * ⚠️ **これは画面を見ても間違いに気づけない種類の計算です。** 実際、段E の実装では
 * 質問文をそのまま検索に渡していて、検索が語ごとの `ILIKE` を **AND** で当てる作りの
 * ため「機材の貸出は」が**必ず 0 件**になっていました。材料が 0 件だと呼ぶ側は
 * 「Wiki には書かれていません」に落とすので、
 *
 *   ①答えられるはずの質問に「書かれていません」と答える
 *   ②その質問が「足りないページ」に積まれる
 *
 * の2つが同時に起きます。②は**使うほど賢くなる経路の入口**なので、嘘の行で埋まると
 * 月1回の見直しで人が無駄に書き起こすことになります（検証用 Postgres で実測:
 * 直す前は3問すべてが誤登録、直したあとは本当に無い1問だけ）。
 *
 * だからここは**語の切り出しの結果そのもの**を固定します。
 */
import { describe, it, expect } from 'vitest';
import { questionTerms } from '../../server/src/contexts/wiki/services/wiki-ask-materials';

describe('questionTerms', () => {
  it('助詞と語尾を落として、内容の語だけを返す', () => {
    expect(questionTerms('機材の貸出は')).toEqual(['機材', '貸出']);
    expect(questionTerms('スタジオ収録の前にやることは？')).toEqual(['スタジオ', '収録']);
  });

  it('長い語を先に返す（検索は AND なので、濃い語から当てたい）', () => {
    const terms = questionTerms('配信の音声レベルの設定は？');
    expect(terms[0].length).toBeGreaterThanOrEqual(terms[terms.length - 1].length);
    expect(terms).toContain('音声');
  });

  it('1文字の語は捨てる（当たりすぎて上位が関係ない話で埋まる）', () => {
    // 「音」は1文字なので落ちるが、「収録」は残る
    expect(questionTerms('音の収録は')).toEqual(['収録']);
  });

  it('カタカナ・英数字も内容の語として拾う', () => {
    expect(questionTerms('OBS の配信設定を知りたい')).toEqual(expect.arrayContaining(['OBS', '配信設定']));
    expect(questionTerms('カメラのケーブルは？')).toEqual(['ケーブル', 'カメラ']);
  });

  it('多すぎる語は上限で切る（AND なので全部渡すと 0 件になる）', () => {
    const terms = questionTerms('配信 収録 機材 会場 進行 台本 音声 照明');
    expect(terms.length).toBeLessThanOrEqual(4);
  });

  it('同じ語は1回だけ', () => {
    expect(questionTerms('機材の機材の機材は')).toEqual(['機材']);
  });

  it('内容の語が無い質問では空を返す（呼ぶ側が質問そのもので最後に1回試す）', () => {
    expect(questionTerms('これはどうすればいいですか')).toEqual([]);
    expect(questionTerms('')).toEqual([]);
  });

  it('記号は区切りとして扱い、語に混ぜない', () => {
    expect(questionTerms('「配信」の手順（最新）は？')).toEqual(expect.arrayContaining(['配信', '手順', '最新']));
    expect(questionTerms('「配信」の手順は？').some((t) => t.includes('「'))).toBe(false);
  });
});
