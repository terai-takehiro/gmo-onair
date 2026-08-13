/**
 * 素のテキストの読み解き (`client-v4/noteText.ts`)
 *
 * **なぜここをテストするか**: この関数が取りこぼすと、**取り込んだ本文が
 * 画面から消える**。しかも消えたことは目で見ても気づけない（そもそも
 * 何が書かれていたか分からない）。だから「読み替えられない行も必ず出る」を
 * 機械で固定する。
 *
 * 題材は**本番で実際に取り込まれている形**（sales@ のメール取込）。
 */
import { describe, it, expect } from 'vitest';
import { parseNoteText } from '../src/client-v4/noteText';

describe('parseNoteText', () => {
  it('空・空白だけは空の配列（呼ぶ側が fallback を出す）', () => {
    expect(parseNoteText('')).toEqual([]);
    expect(parseNoteText('   \n  \n')).toEqual([]);
    expect(parseNoteText(null)).toEqual([]);
    expect(parseNoteText(undefined)).toEqual([]);
  });

  it('■ の行は見出しになり、印は落ちる', () => {
    const b = parseNoteText('■★読み取れること — 案件は「検討」から進んだ');
    expect(b).toEqual([{ type: 'heading', text: '★読み取れること — 案件は「検討」から進んだ' }]);
  });

  it('★ は消さない（どこまでが範囲かテキストから決められない）', () => {
    const b = parseNoteText('★これは実務照会です。');
    expect(b).toEqual([{ type: 'text', text: '★これは実務照会です。' }]);
  });

  it('・ の行は箇条書きになり、中黒は落ちる', () => {
    const b = parseNoteText('・背面/床面を1系統で扱うか\n・素材の本数と各尺');
    expect(b).toEqual([{ type: 'bullets', items: ['背面/床面を1系統で扱うか', '素材の本数と各尺'] }]);
  });

  it('番号つきは箇条書きになり、番号は文字として残る（本文が番号で参照する）', () => {
    const b = parseNoteText('1) これは実務照会。\n2) ただし諾否はまだ無い。');
    expect(b).toEqual([{ type: 'bullets', items: ['1) これは実務照会。', '2) ただし諾否はまだ無い。'] }]);
  });

  it('丸数字も箇条書きになる', () => {
    const b = parseNoteText('①入稿チェック\n②表示調整');
    expect(b).toEqual([{ type: 'bullets', items: ['①入稿チェック', '②表示調整'] }]);
  });

  it('印の無い行は、直前の箇条書きの「その項目の続き」として繋がる', () => {
    // 取り込んだ本文は文の途中で改行されている。和文なので**間に何も入れない**
    const b = parseNoteText('1) これは実務照会。\n納品仕様を聞く段階に入った。\n2) 次の項目');
    expect(b).toEqual([
      { type: 'bullets', items: ['1) これは実務照会。納品仕様を聞く段階に入った。', '2) 次の項目'] },
    ]);
  });

  it('→ の行は info の帯になり、1本ずつ分かれる', () => {
    const b = parseNoteText('→ 打合せは 8/24 しか残っていない。\n→ 本照会への回答が最後の打ち手。');
    expect(b).toEqual([
      { type: 'note', tone: 'info', text: '打合せは 8/24 しか残っていない。' },
      { type: 'note', tone: 'info', text: '本照会への回答が最後の打ち手。' },
    ]);
  });

  it('複数行の「」は引用になり、引用の中の印は読み替えない', () => {
    const b = parseNoteText('「お世話になっております。\n・これは引用の中の中黒\n溝口です。」');
    expect(b).toEqual([
      { type: 'quote', text: '「お世話になっております。\n・これは引用の中の中黒\n溝口です。」' },
    ]);
  });

  it('1行で閉じている引用も引用になる', () => {
    const b = parseNoteText('「確認したいことがあり、ご連絡しました。」');
    expect(b[0].type).toBe('quote');
    expect(b).toHaveLength(1);
  });

  it('空行は段落の区切りになる', () => {
    const b = parseNoteText('前の段落です。\n\n次の段落です。');
    expect(b).toEqual([
      { type: 'text', text: '前の段落です。' },
      { type: 'text', text: '次の段落です。' },
    ]);
  });

  it('文が終わっている行の改行は残す（書いた人の改行を潰さない）', () => {
    const b = parseNoteText('1行目です。\n2行目です。');
    expect(b).toEqual([{ type: 'text', text: '1行目です。\n2行目です。' }]);
  });

  it('文の途中で折り返された行は繋ぎ直す（和文なので間に何も入れない）', () => {
    // 取り込んだ本文は「…記録がなく、」で改行して次の行に続く
    const b = parseNoteText('ONAiR 上に記録がなく、\n本自動処理では確定できません。');
    expect(b).toEqual([{ type: 'text', text: 'ONAiR 上に記録がなく、本自動処理では確定できません。' }]);
  });

  it('「」や : で終わる行の改行も残す（前置きの行）', () => {
    const b = parseNoteText('原文全文:\nここから本文が続きます。');
    expect(b).toEqual([{ type: 'text', text: '原文全文:\nここから本文が続きます。' }]);
  });

  it('**強調** は文字のまま渡す（太字にするのは描く側）', () => {
    // ここで `**` を落とすと、描く側が強調を復元できない
    const b = parseNoteText('・**社内的に動き始めている**強いシグナル');
    expect(b).toEqual([{ type: 'bullets', items: ['**社内的に動き始めている**強いシグナル'] }]);
  });

  it('読み替えられない行を捨てない（取り込んだのに画面に無い、を作らない）', () => {
    const raw = 'sales@ CC の営業やり取り(増分反映)。直前ログ以来の先方新着1通。';
    expect(parseNoteText(raw)).toEqual([{ type: 'text', text: raw }]);
  });

  it('CRLF でも同じ結果になる', () => {
    expect(parseNoteText('■見出し\r\n・項目')).toEqual([
      { type: 'heading', text: '見出し' },
      { type: 'bullets', items: ['項目'] },
    ]);
  });

  it('本番で取り込まれている形をひとまとめに読み解ける', () => {
    const raw = [
      '■2026-08-13 17:52 JST 溝口様→寺井',
      '原文全文:',
      '「確認したいことがあり、ご連絡しました。」',
      '',
      '■★読み取れること',
      '1) ★これは先方が LED 素材の制作に着手するための実務照会。',
      '納品仕様を聞く段階に入った = **社内的に動き始めている**強いシグナル。',
      '2) ただし諾否は**依然として本文にない**。',
      '',
      '■回答時に必ず確定させたい事項',
      '・背面/床面を1系統で扱うか、2系統で扱うか',
      '・素材の**本数**と各**尺**',
      '→ 実質 8/24〜8/26 しか残っていない。',
    ].join('\n');

    const b = parseNoteText(raw);
    expect(b.map((x) => x.type)).toEqual([
      'heading', 'text', 'quote',
      'heading', 'bullets',
      'heading', 'bullets', 'note',
    ]);
    // 番号つきの続きが繋がっている
    expect(b[4]).toEqual({
      type: 'bullets',
      items: [
        '1) ★これは先方が LED 素材の制作に着手するための実務照会。納品仕様を聞く段階に入った = **社内的に動き始めている**強いシグナル。',
        '2) ただし諾否は**依然として本文にない**。',
      ],
    });
    expect(b[7]).toEqual({ type: 'note', tone: 'info', text: '実質 8/24〜8/26 しか残っていない。' });
  });
});
