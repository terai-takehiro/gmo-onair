/**
 * **Wiki の YAML の見出しは2か所にある — 同じであることを固定する**（段D）
 *
 * サーバーは `shared/`（`@gmo-onair/shared`）を import できないため
 * （`server/tsconfig.json` の `rootDir: "./src"`）、`.md` の先頭に置く
 * **YAML の見出しの書き出しと読み取り**が**サーバーと画面の2か所**にあります
 * （`docs/design/v4/wiki.md` §5-2 の約束3）。
 *
 * 片方だけ直すと、**書き出した `.md` を取り込み直したときに担当・期限・タグが黙って落ちます**。
 * 本文は合っているので、取り込んだ人は気づきません。両方を import して突き合わせます
 * （`wikiMarkdownParity.test.ts` と同じ形）。
 */
import { describe, it, expect } from 'vitest';
import * as client from '../src/wiki/frontMatter';
import * as server from '../../server/src/contexts/wiki/wiki-front-matter';
import type { WikiFrontMatter } from '../src/wiki/types';

/** 実際に書き出す形（空・全部入り・記号・データベースの行） */
const CASES: Array<{ fm: WikiFrontMatter; body: string }> = [
  { fm: { title: '機材の貸出ルール' }, body: '# 機材の貸出ルール\n\n台帳に書く。' },
  {
    fm: {
      id: 'wp-11111111', title: '経費の申請手順', space: 'ga', parent: 'wp-22222222',
      tags: ['経費', '総務'], owner: '寺井 岳宏', review_by: '2026-12-31',
      status: 'published', updated: '2026-09-22T01:23:45.000Z',
    },
    body: '本文',
  },
  { fm: { title: '記号: を含む題' }, body: '本文' },
  { fm: { title: '- 先頭が記号' }, body: '本文' },
  { fm: { title: '' }, body: '題が空' },
  { fm: { title: '引用符 " と \\ を含む' }, body: '本文' },
  { fm: { title: '末尾に空白 ' }, body: '本文' },
  { fm: { title: 'タグが空', tags: [] }, body: '本文' },
  { fm: { title: '本文の先頭に空行', tags: ['a'] }, body: '\n\n\n本文' },
  {
    fm: {
      title: 'データベースの行', status: 'published',
      props: {
        it_text: 'あ', it_num: 12.5, it_check: true, it_date: '2026-09-22',
        it_multi: ['甲', '乙'], it_link: { kind: 'project', id: 'prj_1', label: 'GLS-0001' },
        it_empty: '', it_null: null,
      },
    },
    body: '行の本文',
  },
  { fm: { title: '項目が空', props: {} }, body: '本文' },
  // ⚠️ コンマを含む値（Codex の指摘・P2）。往復でタグが割れていた
  { fm: { title: 'コンマ入りのタグ', tags: ['R&D, Japan', '通常'] }, body: '本文' },
  {
    fm: {
      title: 'コンマ入りの項目',
      props: { it_text: 'あ, い', it_multi: ['甲, 乙', '丙'] },
    },
    body: '本文',
  },
];

/** 取り込みで受ける形（書き出したもの・Obsidian・Notion・壊れたもの） */
const MD_INPUTS: string[] = [
  '',
  '本文だけ。見出しは無い。',
  '---\ntitle: 機材\ntags: [a, b]\n---\n\n本文',
  '---\r\ntitle: 改行が CRLF\r\ntags: [a, b]\r\n---\r\n本文',
  '---\ntitle: "引用符つき: コロン"\n---\n本文',
  '---\ntitle: 閉じが無い\n\n本文',
  '---\n# コメント行\ntitle: コメントを飛ばす\n---\n本文',
  '---\nprops:\n  it_text: あ\n  it_num: 12.5\n  it_check: true\n  it_multi: [甲, 乙]\n  it_link: { kind: project, id: prj_1, label: GLS-0001 }\ntitle: 行\n---\n本文',
  '---\n読めない行\ntitle: それでも読む\n---\n本文',
  '---\ntitle: 数字と真偽\nreview_by: 2026-12-31\nstatus: published\n---\n本文',
  '---\n---\n本文だけ（見出しが空）',
  '本文の途中に\n---\ntitle: これは見出しではない\n---\nがある',
  // 引用符の中のコンマで割らない（Codex の指摘・P2）
  '---\ntitle: コンマ\ntags: ["R&D, Japan", 通常]\n---\n本文',
  '---\ntitle: コンマ（単引用）\ntags: [\'A, B\', C]\n---\n本文',
  '---\nprops:\n  it_text: "x, y"\n  it_multi: ["甲, 乙", 丙]\n  it_link: { kind: project, id: prj_1, label: "GLS-0001, 追加" }\ntitle: 行\n---\n本文',
];

describe('サーバーと画面で同じ答えを出す（Wiki の YAML の見出し）', () => {
  it('書き出し（serializeFrontMatter）', () => {
    for (const { fm, body } of CASES) {
      expect(server.serializeFrontMatter(fm, body), fm.title).toBe(
        client.serializeFrontMatter(fm, body),
      );
    }
  });

  it('読み取り（parseFrontMatter）', () => {
    for (const md of MD_INPUTS) {
      expect(server.parseFrontMatter(md), JSON.stringify(md.slice(0, 30))).toEqual(
        client.parseFrontMatter(md),
      );
    }
  });

  it('書き出して読み直すと同じ値が戻る（担当・期限・タグを落とさない）', () => {
    for (const { fm, body } of CASES) {
      const md = server.serializeFrontMatter(fm, body);
      const back = server.parseFrontMatter(md);
      expect(back).toEqual(client.parseFrontMatter(md));
      if (fm.tags && fm.tags.length > 0) expect(back.data.tags).toEqual(fm.tags);
      if (fm.review_by) expect(back.data.review_by).toBe(fm.review_by);
      if (fm.owner) expect(back.data.owner).toBe(fm.owner);
      if (fm.title) expect(back.data.title).toBe(fm.title);
    }
  });

  it('引用符の中のコンマで配列を割らない（往復でタグが増えない）', () => {
    const md = '---\ntitle: コンマ\ntags: ["R&D, Japan", 通常]\n---\n本文';
    const { data } = client.parseFrontMatter(md);
    expect(data.tags).toEqual(['R&D, Japan', '通常']);
    expect(server.parseFrontMatter(md).data.tags).toEqual(data.tags);

    // 書き出して読み直しても増えない（書き出しも同じインラインの形）
    const round = client.parseFrontMatter(
      client.serializeFrontMatter({ title: 'コンマ', tags: ['R&D, Japan', '通常'] }, '本文'),
    );
    expect(round.data.tags).toEqual(['R&D, Japan', '通常']);
  });

  it('サーバー側に余分な関数を置いていない（どちらが正か分からなくなる）', () => {
    // 写したのは `.md` の口が使う2つだけ。値の検査（isValidPropValue / sanitizeProps）は
    // `wiki-props.ts` にある。ここが増えたら、増やしたものの突き合わせも上に足すこと。
    expect(Object.keys(server).sort()).toEqual(['parseFrontMatter', 'serializeFrontMatter']);
  });
});
