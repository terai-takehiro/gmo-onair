/**
 * **Wiki の検索の点数付けは2か所にある — 同じであることを固定する**（段D）
 *
 * サーバーは `shared/`（`@gmo-onair/shared`）を import できないため
 * （`server/tsconfig.json` の `rootDir: "./src"`）、**検索の点数付けと抜粋**が
 * **サーバーと画面の2か所**にあります（`docs/design/v4/wiki.md` §5-4）。
 *
 * サーバーが返した `score` の順に画面が並べ、画面も「もう一度絞り込む」ときに同じ関数を使います。
 * 片方だけ直すと、**同じ語で検索しても並び順と抜粋が変わります**。しかも画面は
 * 「そういうものか」と読まれるので、**誰も間違いとして報告しません**。両方を import して
 * 結果を突き合わせます（`wikiMarkdownParity.test.ts` と同じ形）。
 */
import { describe, it, expect } from 'vitest';
import * as client from '../src/wiki/search';
import * as server from '../../server/src/contexts/wiki/wiki-search-score';

/** 実際に打たれる語（1語・2語・全角空白・大小文字・記号・英数字） */
const QUERIES: string[] = [
  '',
  '   ',
  '機材',
  '機材 貸出',
  '機材　貸出',            // 全角スペース
  '  前後に空白  ',
  'Wiki ONAiR',
  'wiki onair',
  'ONAiR',
  'a b c d e f g h i j',   // 8語で切る
  '見つからない語',
  '記号 & 数字 123',
  'ぜんぶ ひらがな かたかな 漢字',
];

/** 実際の本文に出る形（見出しの有無・長文・コードの柵・語が何度も出る） */
const PAGES = [
  { title: '機材の貸出ルール', headings: '借りる前に\n返すとき', body_md: '機材を借りるときは台帳に書く。機材は返却日を守る。', updated_at: '2026-09-01T00:00:00.000Z' },
  { title: '経費の申請手順', headings: '申請\n承認', body_md: '経費は月末までに申請する。', updated_at: '2026-09-02T00:00:00.000Z' },
  { title: 'ONAiR の使い方', headings: 'ログイン\n機材管理\n機材の貸出', body_md: 'ONAiR の機材管理は /equipment から。機材 機材 機材 機材 機材 機材 機材 機材', updated_at: '2026-09-03T00:00:00.000Z' },
  { title: '', headings: '', body_md: '', updated_at: '2026-09-04T00:00:00.000Z' },
  { title: '機材 機材 機材 機材', headings: '機材 機材 機材 機材 機材', body_md: '機材', updated_at: '2026-09-05T00:00:00.000Z' },
  { title: 'Wiki の書き方', headings: 'Markdown\nWiki の拡張', body_md: '# 見出し\n\n本文に [貸出ルール](/wiki/p/wp-11111111) を貼る。\n\n```\n# 柵の中\n```', updated_at: '2026-09-06T00:00:00.000Z' },
  { title: 'A'.repeat(300), headings: '', body_md: 'x'.repeat(5000) + '機材' + 'y'.repeat(5000), updated_at: '2026-09-07T00:00:00.000Z' },
];

const BODIES: string[] = [
  '',
  '機材を借りるときは台帳に書く。',
  'x'.repeat(200) + '機材' + 'y'.repeat(200),
  '機材',
  '  改行と\n空白\tが\r\n混ざる 機材 の前後  ',
  '先頭に機材がある本文。あとはずっと続く。'.repeat(10),
  '機材'.repeat(100),
  // ⚠️ ここから下は**抜粋に印がそのまま出ていた**形（実ブラウザで見つけた）
  '# 機材の貸出ルール\n\n機材を借りるときは台帳に書きます。\n\n![配置図](/api/v1/internal/wiki/files/wf-ba3a21bb)',
  '## 借りる前に\n\n- [ ] 機材台帳で空き状況を確かめる\n- [x] 返却予定日を入れて貸出登録する',
  '> [!CAUTION]\n> 機材を黙って持ち出さないこと。\n\n**太字**と`行内のコード`と~~取り消し~~。',
  '| 機材 | 台数 |\n| --- | --- |\n| カメラ | 3 |',
  '機材 | 台数\n--- | ---\nカメラ | 3',
  '引き算は 3 - 2 で、機材の数は変わらない。',
  '1. 機材を出す\n2. 数える\n\n---\n\n<details><summary>畳んだ中</summary>\n\n機材の続き\n\n</details>',
  '本文に [貸出ルール](/wiki/p/wp-11111111) を貼る。機材の話。',
  '```\n# 柵の中の機材\n```\n\n# 柵の外の機材',
  'snake_case や wiki_pages の下線は消さない。機材。',
];

const MARKDOWNS: string[] = [
  '',
  '# 機材の貸出\n\n本文\n\n## 返すとき',
  '## 返却\n\n### 機材の点検',
  '```\n# 機材（柵の中は見出しにしない）\n```\n\n# 本物の機材',
  '#### 4つは見出しにしない\n\n# 機材',
  '本文だけで見出しが無い',
];

describe('サーバーと画面で同じ答えを出す（Wiki の検索）', () => {
  it('検索語の分け方（splitTerms。全角の空白・8語で切る）', () => {
    for (const q of QUERIES) {
      expect(server.splitTerms(q)).toEqual(client.splitTerms(q));
    }
  });

  it('点数（scorePage。題×3・見出し×2・本文×1・2語以上は AND）', () => {
    for (const q of QUERIES) {
      const terms = client.splitTerms(q);
      for (const page of PAGES) {
        expect(
          server.scorePage(page, terms),
          `${JSON.stringify(q)} / ${page.title.slice(0, 20)}`,
        ).toBe(client.scorePage(page, terms));
      }
    }
  });

  it('抜粋（makeExcerpt。当たった語の前後・幅を変えても同じ）', () => {
    for (const q of QUERIES) {
      const terms = client.splitTerms(q);
      for (const body of BODIES) {
        expect(server.makeExcerpt(body, terms)).toBe(client.makeExcerpt(body, terms));
        expect(server.makeExcerpt(body, terms, 40)).toBe(client.makeExcerpt(body, terms, 40));
      }
    }
  });

  it('Markdown の印を落とす（toPlainText。文字は消さない）', () => {
    for (const body of BODIES) {
      expect(server.toPlainText(body)).toBe(client.toPlainText(body));
    }
  });

  it('抜粋に Markdown の印が残らない（画像の URL・注意書きの印・表の縦棒）', () => {
    const md = [
      '# 機材の貸出ルール',
      '',
      '![配置図](/api/v1/internal/wiki/files/wf-ba3a21bb)',
      '',
      '> [!CAUTION]',
      '> **機材**を黙って持ち出さないこと。',
      '',
      '- [ ] 機材台帳で空き状況を確かめる',
      '',
      '| 機材 | 台数 |',
      '| --- | --- |',
      '| カメラ | 3 |',
    ].join('\n');
    const out = client.makeExcerpt(md, ['機材'], 200);
    expect(out).toBe(server.makeExcerpt(md, ['機材'], 200));
    // 印は出ない
    for (const mark of ['![', '](', '/api/v1/', '[!CAUTION]', '**', '- [ ]', '|', '#', '---']) {
      expect(out, `${mark} が抜粋に残っている: ${out}`).not.toContain(mark);
    }
    // 文字は消えない（代替文・引用の中身・箇条書きの中身）
    for (const word of ['配置図', '貸出ルール', '黙って持ち出さないこと', '空き状況', '台数']) {
      expect(out, `${word} が抜粋から消えた: ${out}`).toContain(word);
    }
  });

  it('下線（snake_case）は消さない', () => {
    const md = 'wiki_pages の props に入れる。機材。';
    expect(client.toPlainText(md)).toContain('wiki_pages');
    expect(server.toPlainText(md)).toBe(client.toPlainText(md));
  });

  it('一致した見出し（matchedHeading。柵の中は見出しにしない）', () => {
    for (const q of QUERIES) {
      const terms = client.splitTerms(q);
      for (const md of MARKDOWNS) {
        expect(server.matchedHeading(md, terms)).toBe(client.matchedHeading(md, terms));
      }
    }
  });

  it('並べ替え（compareHits。点数が同じなら新しいほうを上に）', () => {
    const hits = [
      { score: 10, updated_at: '2026-09-01T00:00:00.000Z' },
      { score: 10, updated_at: '2026-09-05T00:00:00.000Z' },
      { score: 3, updated_at: '2026-09-09T00:00:00.000Z' },
      { score: 0, updated_at: '2026-09-09T00:00:00.000Z' },
      { score: 10, updated_at: '2026-09-05T00:00:00.000Z' },
    ].map((h, i) => ({
      id: `wp-${i}`, title: `題${i}`, space_id: 'wsp_all', space_name: '全社',
      space_color: null, path: '全社', heading: null, excerpt: '', owner_name: null, ...h,
    }));
    // 実装は比較関数なので、同じ配列を同じ手順で並べて突き合わせる
    expect([...hits].sort(server.compareHits).map((h) => h.id))
      .toEqual([...hits].sort(client.compareHits).map((h) => h.id));
    for (const a of hits) {
      for (const b of hits) {
        expect(Math.sign(server.compareHits(a, b))).toBe(Math.sign(client.compareHits(a, b)));
      }
    }
  });

  it('2語以上は AND（片方しか当たらなければ 0）', () => {
    const page = PAGES[0];
    expect(client.scorePage(page, ['機材', '貸出'])).toBeGreaterThan(0);
    expect(server.scorePage(page, ['機材', '貸出'])).toBe(client.scorePage(page, ['機材', '貸出']));
    expect(client.scorePage(page, ['機材', '経費'])).toBe(0);
    expect(server.scorePage(page, ['機材', '経費'])).toBe(0);
  });

  it('サーバー側に余分な関数を置いていない（どちらが正か分からなくなる）', () => {
    // 写したのは検索が使う5つだけ。ここが増えたら、増やしたものの突き合わせも上に足すこと。
    expect(Object.keys(server).sort()).toEqual([
      'compareHits', 'makeExcerpt', 'matchedHeading', 'scorePage', 'splitTerms', 'toPlainText',
    ]);
  });
});
