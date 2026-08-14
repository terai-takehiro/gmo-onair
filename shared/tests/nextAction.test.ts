/**
 * 「次にやること」の分け方（`projectDetail/thread/nextAction.ts`）
 *
 * **分け方を間違えると、やることが1件消えます** — しかも画面には「1件ぶん短い
 * 段落」が出るだけなので、目で見ても気づけません。だからここで固定します。
 *
 * ⚠️ **どの試験でも「繋ぎ直すと元に戻る」ことを確かめています。**
 * 見出しと項目を足して元の文字が全部残っているなら、少なくとも情報は落ちていません。
 */
import { describe, it, expect } from 'vitest';
import { parseNextAction } from '../../client/src/contexts/sales/pages/projectDetail/thread/nextAction';

/** 分けたものを繋ぎ直す（印と空白を除いて突き合わせるため） */
const rejoin = (raw: string): string => {
  const p = parseNextAction(raw);
  return (p.headline + p.items.map((i) => i.text).join('')).replace(/\s/g, '');
};
// **落ちてよいのは印と空白だけ。** `・` は落とさない — 「可否・金額」のように
// 本文の一部として使われるので、突き合わせから外すと消えたことに気づけなくなる
const bare = (s: string): string => s.replace(/[①-⑳\s]/g, '');

describe('parseNextAction — 本番データの形', () => {
  // 利用者からご指摘いただいた実際の値（1行の中に丸数字が埋まっている）
  const real = '★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する(発注期日 8/19 は夏季休暇 8/17-21 の中日／実働は 8/13・8/14 の2日のみ)。'
    + '①金子様からの★酒樽設置台2台(キャスター付き)の可否・金額の回答を確認し、発注内容に含める '
    + '②★パーテーション等の追加要否・数量を確定(車両サイズに影響) '
    + '③搬出時刻を一本化 — 備品「23:00頃」／警備「22:00頃〜」／8/4実務者MTG決定「22:00完全撤収」の齟齬を解消 '
    + '④8/14 中に回答が来ない場合は督促し、酒樽台を除いた本体分だけでも先に発注可否を判断すること';

  it('言い切りの1文と4件の並びに分かれる', () => {
    const p = parseNextAction(real);
    expect(p.headline.endsWith('2日のみ)。')).toBe(true);
    expect(p.items).toHaveLength(4);
    expect(p.items.map((i) => i.marker)).toEqual(['①', '②', '③', '④']);
    expect(p.items[1].text).toBe('★パーテーション等の追加要否・数量を確定(車両サイズに影響)');
  });

  it('★ を消さない（どこまでがその印の範囲かはテキストから決められない）', () => {
    const p = parseNextAction(real);
    expect(p.headline.startsWith('★')).toBe(true);
    expect(p.items[0].text).toContain('★酒樽設置台2台');
  });

  it('1文字も捨てない（繋ぎ直すと元に戻る）', () => {
    expect(rejoin(real)).toBe(bare(real));
  });
});

describe('parseNextAction — 分けないもの', () => {
  it('短い1文はそのまま（行を増やさない）', () => {
    const p = parseNextAction('見積書を送付する');
    expect(p).toEqual({ headline: '見積書を送付する', items: [] });
  });

  it('丸数字が1つだけなら分けない（本文が番号を参照しているだけのことがある）', () => {
    const p = parseNextAction('①の件について先方に確認する');
    expect(p.items).toHaveLength(0);
    expect(p.headline).toBe('①の件について先方に確認する');
  });

  it('丸数字が飛んでいる・戻っているものは分けない', () => {
    expect(parseNextAction('②の回答を待って③を進める').items).toHaveLength(0);
    expect(parseNextAction('まず①を確定し、③の見積を取る。①に戻る').items).toHaveLength(0);
  });

  it('長くても句点が1つなら分けない（途中で切らない）', () => {
    const one = '搬出時刻の齟齬（備品「23:00頃」／警備「22:00頃〜」／8/4実務者MTG決定「22:00完全撤収」）'
      + 'を備品業者・警備会社・先方の実務担当の三者に確認したうえで一本化し、関係者に共有する。';
    expect(one.length).toBeGreaterThan(80);
    expect(parseNextAction(one).items).toHaveLength(0);
  });

  it('空・空白だけなら空（「—」などを勝手に作らない）', () => {
    expect(parseNextAction(null)).toEqual({ headline: '', items: [] });
    expect(parseNextAction('   ')).toEqual({ headline: '', items: [] });
  });
});

describe('parseNextAction — 句点で分ける（印がまったく無い長い文）', () => {
  const long = '8/14 までに備品レンタルの発注可否を確定して発注する。'
    + '金子様からの酒樽設置台2台の可否・金額の回答を確認して発注内容に含める。'
    + '回答が来ない場合は督促し、本体分だけでも先に判断する。';

  it('1文目が見出し・残りが並び（印は付けない）', () => {
    const p = parseNextAction(long);
    expect(p.headline).toBe('8/14 までに備品レンタルの発注可否を確定して発注する。');
    expect(p.items).toHaveLength(2);
    expect(p.items.every((i) => i.marker === null)).toBe(true);
    expect(rejoin(long)).toBe(bare(long));
  });

  it('括弧の中の句点では切らない（補足が途中で切れると元に戻せない）', () => {
    const p = parseNextAction(
      '8/14 までに備品レンタルの発注可否を確定して発注する（発注期日 8/19 は夏季休暇の中日。実働は 8/13・8/14 の2日のみ）。'
      + '回答が来ない場合は督促する。',
    );
    expect(p.items).toHaveLength(1);
    expect(p.headline).toContain('実働は 8/13・8/14 の2日のみ）。');
  });
});

describe('parseNextAction — 複数行で書かれているとき', () => {
  it('行頭の印を読み取る（番号は残し、`・` は落とす＝画面が描く）', () => {
    const p = parseNextAction('8/14 までに発注可否を確定する\n・酒樽設置台の回答を確認\n2) パーテーションの数量を確定');
    expect(p.headline).toBe('8/14 までに発注可否を確定する');
    expect(p.items).toEqual([
      { marker: null, text: '酒樽設置台の回答を確認' },
      { marker: '2)', text: 'パーテーションの数量を確定' },
    ]);
  });

  it('印の無い行は直前の項目の続き（和文なので間に何も入れない）', () => {
    const p = parseNextAction('発注する\n・酒樽設置台の可否と\n金額の回答を確認');
    expect(p.items).toEqual([{ marker: null, text: '酒樽設置台の可否と金額の回答を確認' }]);
  });

  it('印が1つも無い複数行は、1行目を見出しにして残りを並びにする', () => {
    const p = parseNextAction('発注可否を確定する\n酒樽設置台の回答を確認\nパーテーションの数量を確定');
    expect(p.headline).toBe('発注可否を確定する');
    expect(p.items.map((i) => i.text)).toEqual(['酒樽設置台の回答を確認', 'パーテーションの数量を確定']);
  });
});
