/**
 * **Wiki の導出値は2か所にある — 同じであることを固定する**（migration 303）
 *
 * サーバーは `shared/`（`@gmo-onair/shared`）を import できないため
 * （`server/tsconfig.json` の `rootDir: "./src"`）、**保存のたびに走る2つの導出**
 * （検索用の見出し列とバックリンク）が**サーバーと画面の2か所**にあります。
 *
 * 片方だけ直すと、**保存した瞬間に目次とバックリンクが変わって見えます**。
 * しかも画面は「そういうものか」と読まれるので、**誰も間違いとして報告しません**
 * （`docs/design/v4/wiki.md` §5-3）。両方を import して結果を突き合わせます。
 */
import { describe, it, expect } from 'vitest';
import * as client from '../src/wiki/markdown';
import * as server from '../../server/src/contexts/wiki/wiki-markdown';

/** 実際の本文に出る形を並べる（コードの柵・見出しの深さ・リンクの種類） */
const BODIES: string[] = [
  '',
  'ただの段落。見出しも柵も無い。',
  '# 見出し1\n\n本文\n\n## 見出し2\n\n本文\n\n### 見出し3',
  '#見出しに見えるが空白が無い\n\n# 本物の見出し',
  '```\n# 柵の中のコメント\n```\n\n# 柵の外の見出し',
  '```sh\n# コメント\n```\n~~~\n## これも柵の中\n~~~\n### 柵の外',
  '`````\n# 5本の柵\n`````\n# 外',
  '  # 字下げした見出し\n\n# ふつうの見出し',
  '#### 4つは見出しにしない\n\n# 1つは見出し',
  '本文に [貸出ルール](/wiki/p/wp_demo_lend) を貼った。',
  '[a](/wiki/p/p1) と [b](/wiki/p/p2) と [同じ](/wiki/p/p1)',
  '[案件](/sales/projects/prj_1) は Wiki のページではない。',
  '[機材](/equipment/items/eq_1)・[部屋](/calendar/rooms/rm_1)・[ページ](/wiki/p/p9)',
  '![画像](/api/v1/wiki/files/f1) はリンクではない。',
  '> [!WARNING]\n> 注意書き\n\n# そのあとの見出し',
  '| 列 | 列 |\n| --- | --- |\n| # 表の中 | [x](/wiki/p/p3) |',
  '<details><summary># 畳んだ中の見出し</summary>\n\n# 中の見出し\n\n</details>',
  '# 記号と空白  \t \n\n##   前に空白がある見出し',
  '# 日本語の見出し（かっこ・記号 & 数字 123）',
  '---\n\n# 区切り線のあと',
  // ここから追記（2026-09-22 の突き合わせで足した分）
  '# 同じ見出し\n\n## 手順\n\n## 手順\n\n## 手順',            // -2 / -3 が付く
  '# 行末の井桁 #\n\n## 行末に3つ ###',                         // 閉じの # を落とす
  '#\n\n#   \n\n# 中身あり',                                    // 空の見出しは作らない
  '# 題\r\n\r\n## 改行が CRLF\r\n',                           // .md の取り込みで来る
  '```\n# 中\n~~~\n## まだ中\n```\n\n## 柵の外',              // 柵の種類が違うと閉じない
  '見て → [あ](/wiki/p/wp-11111111) と [い](/wiki/p/wp-22222222)', // 1行に複数
  '[題つき](/wiki/p/wp-abc12345 "ヒント")',                        // title 属性つき
  '括弧が無い /wiki/p/wp-33333333 は拾わない',
  '# 🔑 絵文字つきの見出し\n\n## 返却が遅れたとき',
];

describe('サーバーと画面で同じ答えを出す（Wiki の導出値）', () => {
  it('検索用の見出し列（headingsText）', () => {
    for (const md of BODIES) {
      expect(server.headingsText(md)).toBe(client.headingsText(md));
    }
  });

  it('見出しの抜き出し（extractHeadings。目次と検索の重み付けの元）', () => {
    for (const md of BODIES) {
      expect(server.extractHeadings(md)).toEqual(client.extractHeadings(md));
    }
  });

  it('バックリンクの元（extractPageLinks）', () => {
    for (const md of BODIES) {
      expect(server.extractPageLinks(md)).toEqual(client.extractPageLinks(md));
    }
  });

  it('見出しの id（headingSlug）', () => {
    const TEXTS = ['借りる前に', 'Heading With Spaces', '記号 & 数字 123', '（かっこ）', 'a  b', '', '---',
      '  前後に空白  ', 'Mixed CASE Text', '`コード` と **強調**', '[リンク](/wiki/p/wp-aaaaaaaa)', '#井桁# <タグ> |縦棒| !感嘆'];
    for (const t of TEXTS) {
      expect(server.headingSlug(t)).toBe(client.headingSlug(t));
    }
  });

  it('検証データの実物（コードの柵つき）で見出しとリンクが同じ', () => {
    // `wp-rules001` の本文そのもの。柵の中の `#` を見出しに数えないことを実値で固定する
    const md = [
      '# 社内ルール', '', '会社の決まりをここにまとめます。', '',
      '## 経費', '', '手順は [経費の申請手順](/wiki/p/wp-keihi002) を見てください。', '',
      '```', '# これは見出しではない（コードの中）', '```', '',
      '## 問い合わせ先', '', '総務まで。',
    ].join('\n');
    expect(server.headingsText(md)).toBe(client.headingsText(md));
    expect(client.headingsText(md)).toBe('社内ルール\n経費\n問い合わせ先');
    expect(server.extractPageLinks(md)).toEqual(client.extractPageLinks(md));
    expect(client.extractPageLinks(md)).toEqual(['wp-keihi002']);
  });

  it('足りないページの鍵（normalizeQuestion）が同じ', () => {
    /*
     * 段E で写した3つめ（`wiki_ai_gaps.normalized` は UNIQUE）。
     * 片方だけ直すと、**画面が「同じ質問」と見せているものがサーバーでは別の行**になり、
     * 何回聞かれたかが数えられなくなります（`docs/design/v4/wiki.md` §7-2）。
     */
    const QUESTIONS = [
      'スタジオ収録の前にやることは？',
      '  スタジオ収録の前にやること は ？  ',
      '機材を借りるにはどうすればいいですか',
      '機材を借りるにはどうすればいいでしょうか',
      '（至急）LED ウォールの電源は・どこ「ですか」',
      'How Do I Book A Studio?',
      '',
      '手順'.repeat(150),
    ];
    for (const q of QUESTIONS) {
      expect(server.normalizeQuestion(q)).toBe(client.normalizeQuestion(q));
    }
    // 丸めすぎない（別の質問が1件に潰れると回数が嘘になる）
    expect(client.normalizeQuestion('配信の設定は？'))
      .not.toBe(client.normalizeQuestion('収録の設定は？'));
  });

  it('サーバー側に余分な関数を置いていない（どちらが正か分からなくなる）', () => {
    // 写したのは保存のたびに走る分と、段E の足りないページの鍵だけ
    // （wiki-markdown.ts の冒頭の注意書き）。検索の点数付けは `wiki-search-score.ts`、
    // YAML の見出しは `wiki-md.service.ts` が持つ。
    // ここが増えたら、増やした関数の突き合わせも上に足すこと。
    expect(Object.keys(server).sort()).toEqual([
      'extractHeadings', 'extractPageLinks', 'headingSlug', 'headingsText', 'normalizeQuestion',
    ]);
  });
});
