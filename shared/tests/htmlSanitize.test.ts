/**
 * AI が整えたやり取りの本文を削る検査（`server/src/shared/services/html-sanitize.ts`）。
 *
 * **画面に届く前の最後の関門**なので、通ってはいけない形を1つずつ固定します。
 * 材料は取引先から来たメールや打合せの発言なので、
 * 「うちの AI はそんなものを出さない」は理由になりません
 * （AI に渡す入力そのものが外から来ています）。
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeBodyHtml, sanitizeKeyPoints, MAX_BODY_HTML,
} from '../../server/src/shared/services/html-sanitize';

describe('sanitizeBodyHtml — 通すもの', () => {
  it('許可した9つのタグはそのまま残る', () => {
    const html = '<p>本文</p><h4>見出し</h4><ul><li><strong>強い</strong><em>斜め</em></li></ul>'
      + '<ol><li>1つめ</li></ol><code>ATEM</code><br>';
    expect(sanitizeBodyHtml(html)).toBe(html);
  });

  it('入れ子はそのまま保つ', () => {
    expect(sanitizeBodyHtml('<ul><li><p>中の段落</p></li></ul>')).toBe('<ul><li><p>中の段落</p></li></ul>');
  });

  it('文字列でないものは null', () => {
    expect(sanitizeBodyHtml(null)).toBeNull();
    expect(sanitizeBodyHtml(undefined)).toBeNull();
    expect(sanitizeBodyHtml(123)).toBeNull();
    expect(sanitizeBodyHtml({ p: 'x' })).toBeNull();
  });

  it('中身が無ければ null（空の枠を保存しない）', () => {
    expect(sanitizeBodyHtml('   ')).toBeNull();
    expect(sanitizeBodyHtml('<div></div>')).toBeNull();
  });
});

describe('sanitizeBodyHtml — 属性は1つも通さない', () => {
  it('onerror / onclick が落ちる', () => {
    expect(sanitizeBodyHtml('<p onclick="alert(1)">本文</p>')).toBe('<p>本文</p>');
  });

  it('style / class / id も落ちる（見た目はアプリが決める）', () => {
    expect(sanitizeBodyHtml('<p style="color:red" class="x" id="y">本文</p>')).toBe('<p>本文</p>');
  });

  it('リンクは作れない。**文字は残る**ので情報は消えない', () => {
    expect(sanitizeBodyHtml('<a href="https://example.com">見積書</a>')).toBe('見積書');
    expect(sanitizeBodyHtml('<a href="javascript:alert(1)">押して</a>')).toBe('押して');
  });

  it('img は残らない（属性を通さないので置いても意味を持たない）', () => {
    expect(sanitizeBodyHtml('<p>前<img src=x onerror=alert(1)>後</p>')).toBe('<p>前後</p>');
  });
});

describe('sanitizeBodyHtml — 中身ごと落とすもの', () => {
  it('script は中身ごと消える（外側だけ落とすとコードが本文として出る）', () => {
    expect(sanitizeBodyHtml('<p>前</p><script>alert(1)</script><p>後</p>')).toBe('<p>前</p><p>後</p>');
  });

  it('閉じていない script も末尾まで落とす', () => {
    expect(sanitizeBodyHtml('<p>前</p><script>alert(1)')).toBe('<p>前</p>');
  });

  it('style / iframe / object / embed も同じ', () => {
    expect(sanitizeBodyHtml('<style>p{}</style><p>本文</p>')).toBe('<p>本文</p>');
    expect(sanitizeBodyHtml('<iframe src="x"></iframe><p>本文</p>')).toBe('<p>本文</p>');
    expect(sanitizeBodyHtml('<p>本文</p><object data="x"></object>')).toBe('<p>本文</p>');
  });

  it('コメントは落とす', () => {
    expect(sanitizeBodyHtml('<p>本文</p><!-- <script>alert(1)</script> -->')).toBe('<p>本文</p>');
  });
});

describe('sanitizeBodyHtml — 知らないタグは中身だけ残す', () => {
  it('div / span は外側だけ落ちて文が残る', () => {
    expect(sanitizeBodyHtml('<div><span>大事な話</span></div>')).toBe('大事な話');
  });

  it('table の中の文も消えない', () => {
    expect(sanitizeBodyHtml('<table><tr><td>金額</td><td>10万</td></tr></table>')).toBe('金額10万');
  });
});

describe('sanitizeBodyHtml — 壊れた形でも閉じ切って返す', () => {
  it('閉じ忘れたタグは末尾で閉じる', () => {
    expect(sanitizeBodyHtml('<p>本文')).toBe('<p>本文</p>');
    expect(sanitizeBodyHtml('<ul><li>1つめ')).toBe('<ul><li>1つめ</li></ul>');
  });

  it('開いていないタグを閉じようとしても、外側を閉じない', () => {
    // 余分な </p> で外側の <ul> が閉じてしまうと、後ろの画面が中に飲み込まれる
    expect(sanitizeBodyHtml('<ul><li>1つめ</p></li></ul>')).toBe('<ul><li>1つめ</li></ul>');
    expect(sanitizeBodyHtml('</p>本文')).toBe('本文');
  });

  it('入れ子が交差していても内側から閉じる', () => {
    expect(sanitizeBodyHtml('<p><strong>強い</p></strong>')).toBe('<p><strong>強い</strong></p>');
  });

  it('br は閉じない', () => {
    expect(sanitizeBodyHtml('<p>1行目<br/>2行目</p>')).toBe('<p>1行目<br>2行目</p>');
  });
});

describe('sanitizeBodyHtml — 素のテキスト', () => {
  it('< > は実体参照にする（後から差し込めないように）', () => {
    expect(sanitizeBodyHtml('5 < 10 かつ 20 > 15')).toBe('5 &lt; 10 かつ 20 &gt; 15');
  });

  it('もともとの実体参照は二重に変換しない', () => {
    expect(sanitizeBodyHtml('<p>A&amp;B</p>')).toBe('<p>A&amp;B</p>');
    expect(sanitizeBodyHtml('<p>&#65;</p>')).toBe('<p>&#65;</p>');
  });

  it('裸の & は実体参照にする', () => {
    expect(sanitizeBodyHtml('<p>A & B</p>')).toBe('<p>A &amp; B</p>');
  });
});

describe('sanitizeBodyHtml — 長さ', () => {
  it('上限を超えたら、切ったと分かる形で切る', () => {
    const long = `<p>${'あ'.repeat(MAX_BODY_HTML + 100)}</p>`;
    const out = sanitizeBodyHtml(long)!;
    expect(out.length).toBeLessThan(MAX_BODY_HTML + 200);
    expect(out).toContain('省きました');
  });
});

describe('sanitizeKeyPoints', () => {
  it('文字列だけを通し、前後の空白と改行を畳む', () => {
    expect(sanitizeKeyPoints([' 見積を出す ', '会場は\n未定'])).toEqual(['見積を出す', '会場は 未定']);
  });

  it('文字列以外は落とす（画面に [object Object] を出さない）', () => {
    expect(sanitizeKeyPoints(['ok', { text: 'x' }, 42, null])).toEqual(['ok']);
  });

  it('配列でなければ空', () => {
    expect(sanitizeKeyPoints('見積を出す')).toEqual([]);
    expect(sanitizeKeyPoints(null)).toEqual([]);
  });

  it('同じ要点は1つにする', () => {
    expect(sanitizeKeyPoints(['見積を出す', '見積を出す'])).toEqual(['見積を出す']);
  });

  it('件数と長さに上限がある', () => {
    expect(sanitizeKeyPoints(['1', '2', '3', '4', '5', '6', '7'])).toHaveLength(6);
    expect(sanitizeKeyPoints(['あ'.repeat(200)])[0]).toHaveLength(120);
  });
});
