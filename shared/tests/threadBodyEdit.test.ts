/**
 * やり取りの本文を手動で編集する — 往復とエスケープを固定する（v4・ご指摘4）
 *
 * ── なぜ試験で固定するか（実際に起きること）────────────────
 *
 * ① **情報が落ちても誰も気づけない。** 編集欄に出す文は「いま画面に出ているもの」から
 *    作ります。ここで空行や箇条書きの印が落ちると、**保存するたびに本文が少しずつ
 *    詰まっていき**、3回編集したころに「書いたはずの段落が無い」になります。
 *    目で見て気づけない壊れ方なので、往復を機械で押さえます。
 *
 * ② **抜けると XSS です。** `bodyHtmlFromText` の戻り値は
 *    `dangerouslySetInnerHTML` に渡る HTML で、材料は**取引先が書いたメールの本文**です。
 *    「属性つきのタグ」「`<script>`」「実体参照の二度戻し」を必ず試します。
 *
 * ⚠️ サーバー側（`server/src/shared/services/html-sanitize.ts`）が守りの本体で、
 * `shared/tests/htmlSanitize.test.ts` がそちらを固定しています。**両方要ります** —
 * 画面を通らない経路（MCP・取込）があるのでサーバーが要り、
 * 画面側が壊れたタグを作ると保存できても表示が消えるので画面側も要ります。
 */
import { describe, it, expect } from 'vitest';
import {
  textFromBodyHtml, bodyHtmlFromText, textFromActivityStruct, editableBodyText, EMITTED_TAGS,
} from '../../client/src/contexts/sales/pages/projectDetail/thread/bodyEdit';

/** 書き出すタグの一覧（HTML に現れたタグ名を全部拾う） */
const tagsIn = (html: string): string[] =>
  [...html.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());

describe('素のテキスト → HTML → 素のテキスト（往復で1文字も落とさない）', () => {
  const roundTrip = (t: string) => textFromBodyHtml(bodyHtmlFromText(t));

  it('段落が1つ', () => {
    expect(roundTrip('打合せの結果をまとめました。')).toBe('打合せの結果をまとめました。');
  });

  it('空行は段落の区切りとして残る（詰まらない）', () => {
    const t = '見積を送付しました。\n\n先方の確認待ちです。';
    expect(roundTrip(t)).toBe(t);
  });

  it('空行が連続しても数が変わらない', () => {
    const t = 'a\n\n\nb';
    expect(roundTrip(t)).toBe(t);
  });

  it('箇条書きの印が残る（`- ` のまま戻る）', () => {
    const t = '決まったこと\n- 収録日は 10/24\n- 会場は WORLD STUDIO';
    expect(roundTrip(t)).toBe(t);
  });

  it('箇条書きと段落が混ざっても順番が変わらない', () => {
    const t = '前段\n- x\n- y\n\n後段';
    expect(roundTrip(t)).toBe(t);
  });

  it('記号（`&` `<` `>`）が文字として残り、二重にエスケープされない', () => {
    const t = 'A&B は <重要> です。予算は 10>5 万円。';
    expect(roundTrip(t)).toBe(t);
    // 往復を2回しても増えない（`&amp;amp;` にならない）
    expect(roundTrip(roundTrip(t))).toBe(t);
  });

  it('数の頭のマイナスを箇条書きの印と読み違えない（符号が消えない）', () => {
    const t = '-10万円で調整';
    expect(roundTrip(t)).toBe(t);
    expect(bodyHtmlFromText(t)).toContain('-10万円');
  });

  it('前後の空行だけは落とす（本文の中の空行は残す）', () => {
    expect(roundTrip('\n\n本文\n\n')).toBe('本文');
  });

  it('空の入力は `null`（保存を止める合図）', () => {
    expect(bodyHtmlFromText('')).toBeNull();
    expect(bodyHtmlFromText('   \n  \n')).toBeNull();
    expect(bodyHtmlFromText(null)).toBeNull();
  });
});

describe('bodyHtmlFromText は許可タグしか作らない（XSS の入口を塞ぐ）', () => {
  it('`<script>` は文字になる（タグとして出ない）', () => {
    const html = bodyHtmlFromText('<script>alert(1)</script>') ?? '';
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });

  it('属性つきのタグも文字になる（`onerror` がタグの属性として残らない）', () => {
    const html = bodyHtmlFromText('<img src=x onerror=alert(1)>') ?? '';
    expect(html).not.toContain('<img');
    // `onerror=alert(1)` という**文字**は残ってよい（原文を1文字も捨てない決めごと）。
    // 危ないのは「タグの属性として残る」ことなので、`<` が必ずエスケープ済みかを見る
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(tagsIn(html).every((t) => (EMITTED_TAGS as string[]).includes(t))).toBe(true);
  });

  it('`javascript:` を書いてもリンクにならない（`a` を作らない）', () => {
    const html = bodyHtmlFromText('<a href="javascript:alert(1)">押す</a>') ?? '';
    expect(tagsIn(html).every((t) => (EMITTED_TAGS as string[]).includes(t))).toBe(true);
  });

  it('どんな入力でも `p` / `ul` / `li` / `br` 以外のタグを作らない', () => {
    const inputs = [
      '<p onclick="x">a</p>', '<svg/onload=alert(1)>', '<iframe src=//evil></iframe>',
      '<style>body{display:none}</style>', '普通の文\n- 箇条書き', '&lt;b&gt;太字&lt;/b&gt;',
    ];
    for (const s of inputs) {
      const tags = tagsIn(bodyHtmlFromText(s) ?? '');
      expect(tags.filter((t) => !(EMITTED_TAGS as string[]).includes(t))).toEqual([]);
    }
  });

  it('実体参照で書かれたタグを、往復で本物のタグに戻さない', () => {
    // `&lt;script&gt;` → 素のテキスト `<script>` → 保存で `&lt;script&gt;` に戻る
    const text = textFromBodyHtml('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(text).toBe('<script>alert(1)</script>');
    const html = bodyHtmlFromText(text) ?? '';
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('HTML → 素のテキスト（AI が整えた本文を編集できる形にする）', () => {
  it('段落・箇条書き・改行を行に落とす', () => {
    const html = '<p>先方から返信がありました。</p><ul><li>収録は 10/24</li><li>会場は未定</li></ul>'
      + '<p>次回<br>打合せを設定します。</p>';
    expect(textFromBodyHtml(html)).toBe(
      '先方から返信がありました。\n- 収録は 10/24\n- 会場は未定\n次回\n打合せを設定します。',
    );
  });

  it('`<ol>` も `- ` になる（番号は戻せないが、文は1文字も落ちない）', () => {
    expect(textFromBodyHtml('<ol><li>見積</li><li>発注</li></ol>')).toBe('- 見積\n- 発注');
  });

  it('装飾（`strong` / `em` / `code`）は文字だけ残し、印を作らない', () => {
    expect(textFromBodyHtml('<p><strong>重要</strong>：<em>至急</em> <code>GLS-1234</code></p>'))
      .toBe('重要：至急 GLS-1234');
  });

  it('知らないタグは中身だけ残す（`div` の中の文が消えない）', () => {
    expect(textFromBodyHtml('<div class="x">本文</div>')).toBe('本文');
  });

  it('`<script>` は中身ごと落とす（編集欄にコードを並べない）', () => {
    expect(textFromBodyHtml('<p>本文</p><script>alert(1)</script>')).toBe('本文');
    // 閉じタグが無い壊れた形でも、末尾までを落とす
    expect(textFromBodyHtml('<p>本文</p><script>alert(1)')).toBe('本文');
  });

  it('空の入力は空文字（呼ぶ側は次の段に落ちる）', () => {
    expect(textFromBodyHtml('')).toBe('');
    expect(textFromBodyHtml(null)).toBe('');
    expect(textFromBodyHtml(undefined)).toBe('');
  });
});

describe('body_struct → 素のテキスト（発言者名を落とさない）', () => {
  const struct = {
    v: 2,
    subtitle: 'LED 映像の納品仕様',
    statuses: [{ label: '先方確認待ち', tone: 'waiting' }],
    facts: [{ icon: 'date', value: '10/24（金）' }, { icon: 'people', value: '3名' }],
    lead: '納品仕様について照会がありました。',
    turns: [
      {
        side: 'them', name: '金子 様', org: 'GMO インターネット', at: '10:00',
        quote: '解像度の指定をお願いします。', note: null,
        fields: [{ label: '希望納期', value: '10/20' }],
      },
      { side: 'us', name: '寺井', org: null, at: '11:30', quote: null, note: '確認して折り返す', fields: [] },
    ],
  };

  it('話者・所属・時刻・引用・補足・項目を1つも捨てない', () => {
    const t = textFromActivityStruct(struct);
    for (const needle of [
      'LED 映像の納品仕様', '先方確認待ち', '10/24（金）', '3名', '納品仕様について照会がありました。',
      '金子 様', 'GMO インターネット', '10:00', '解像度の指定をお願いします。',
      '- 希望納期: 10/20', '寺井', '11:30', '確認して折り返す',
    ]) {
      expect(t).toContain(needle);
    }
  });

  it('当社と先方を文字で書き分ける（名前があっても `side` を落とさない）', () => {
    const t = textFromActivityStruct(struct);
    expect(t).toContain('先方 金子 様');
    expect(t).toContain('当社 寺井');
  });

  it('読めない構造は空文字（呼ぶ側は `body_html` → 原文に落ちる）', () => {
    expect(textFromActivityStruct(null)).toBe('');
    expect(textFromActivityStruct({ v: 1 })).toBe('');
    expect(textFromActivityStruct('こわれた値')).toBe('');
  });
});

describe('editableBodyText — いま画面に出ているものから作る', () => {
  it('`body_struct` があればそれを使う（画面の1段目と同じ）', () => {
    const t = editableBodyText({
      body_struct: { v: 1, lead: '構造の本文', turns: [] },
      body_html: '<p>HTML の本文</p>',
      description: '原文',
    });
    expect(t).toBe('構造の本文');
  });

  it('構造が無ければ `body_html`（2段目）', () => {
    expect(editableBodyText({ body_html: '<p>HTML の本文</p>', description: '原文' }))
      .toBe('HTML の本文');
  });

  it('どちらも無ければ原文（3段目）', () => {
    expect(editableBodyText({ description: '打った文\nそのまま' })).toBe('打った文\nそのまま');
  });

  it('何も無ければ空文字（編集欄は空で開く）', () => {
    expect(editableBodyText({})).toBe('');
  });
});
