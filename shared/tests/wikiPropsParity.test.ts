/**
 * **データベースの項目の値の検査も2か所にある — 同じであることを固定する**（段C）
 *
 * サーバーは `shared/`（`@gmo-onair/shared`）を import できないため
 * （`server/tsconfig.json` の `rootDir: "./src"`）、**保存のたびに走る値の検査**
 * （`docs/design/v4/wiki.md` §5-3-6）が**サーバーと画面の2か所**にあります。
 *
 * 片方だけ直すと、**画面では入れられた値がサーバーで黙って消えます**。
 * 消えたことは画面に出ないので、**誰も間違いとして報告しません**
 * （`wikiMarkdownParity.test.ts` と同じ理由・同じ形）。両方を import して突き合わせます。
 */
import { describe, it, expect } from 'vitest';
import * as client from '../src/wiki/frontMatter';
import type { WikiItem, WikiPropValue } from '../src/wiki/types';
import * as server from '../../server/src/contexts/wiki/wiki-props';

/** 9つの型をひと通り。選択肢つき・必須つきの形も入れる */
const ITEMS: WikiItem[] = [
  { id: 'text', name: '説明', type: 'text' },
  { id: 'textReq', name: '必須の説明', type: 'text', required: true },
  { id: 'sel', name: '状態', type: 'select', options: [{ value: '未対応' }, { value: '対応中' }] },
  { id: 'selFree', name: '選択（選択肢なし）', type: 'select' },
  { id: 'multi', name: '分類', type: 'multi_select', options: [{ value: 'A' }, { value: 'B' }] },
  { id: 'multiFree', name: '複数選択（選択肢なし）', type: 'multi_select' },
  { id: 'date', name: '発生日', type: 'date' },
  { id: 'person', name: '担当', type: 'person' },
  { id: 'check', name: '確認済み', type: 'checkbox' },
  { id: 'num', name: '件数', type: 'number' },
  { id: 'url', name: '参考リンク', type: 'url' },
  { id: 'onair', name: '案件', type: 'onair_link' },
  { id: 'onairReq', name: '必須の案件', type: 'onair_link', required: true },
];

/** 画面・API・`.md` の取り込みから実際に来る値（正しいものと、間違っているもの） */
const VALUES: WikiPropValue[] = [
  null,
  '',
  '文字',
  '   ',
  '2026-09-22',
  '2026-9-2',
  '2026-09-22T10:00:00Z',
  '未対応',
  '対応中',
  '知らない選択肢',
  'A',
  0,
  1,
  -3.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  true,
  false,
  [],
  ['A'],
  ['A', 'B'],
  ['A', '知らない選択肢'],
  ['A', 1 as unknown as string],
  ['文字'],
  { kind: 'project', id: 'prj_1' },
  { kind: 'project', id: 'prj_1', label: '運動会の配信' },
  { kind: 'equipment', id: 'eq_1' },
  { kind: 'room', id: 'rm_1' },
  { kind: 'page', id: 'wp-abc12345' },
  { kind: 'video', id: 'v1' } as unknown as WikiPropValue,
  { kind: 'project', id: '' } as unknown as WikiPropValue,
  { kind: 'project' } as unknown as WikiPropValue,
  { id: 'prj_1' } as unknown as WikiPropValue,
  {} as unknown as WikiPropValue,
];

describe('サーバーと画面で同じ答えを出す（Wiki の項目の値の検査）', () => {
  it('値1つの判定（isValidPropValue）— 全ての項目 × 全ての値', () => {
    for (const item of ITEMS) {
      for (const value of VALUES) {
        expect(
          server.isValidPropValue(item as server.WikiItem, value as server.WikiPropValue),
          `${item.type}（${item.id}） に ${JSON.stringify(value)}`,
        ).toBe(client.isValidPropValue(item, value));
      }
    }
  });

  it('行1本の絞り込み（sanitizeProps）', () => {
    const CASES: Array<Record<string, WikiPropValue> | null | undefined> = [
      null,
      undefined,
      {},
      { text: 'あ', num: 3, check: true },
      // 知らない項目は落ちる
      { text: 'あ', しらない: 'のこらない', another_unknown: 1 },
      // 型違いは落ちる（他の項目は残る）
      { text: 'あ', num: '3' as unknown as number, date: '2026-09-22' },
      // 必須が空
      { textReq: '', onairReq: null },
      { textReq: 'ある', onairReq: { kind: 'project', id: 'prj_1' } },
      // 選択肢に無い値
      { sel: '知らない選択肢', multi: ['A', '知らない選択肢'] },
      // 選択肢を決めていない項目は何でも通る
      { selFree: '好きな文字', multiFree: ['なんでも'] },
      // undefined は「触らない」（キーごと消える）
      { text: undefined as unknown as WikiPropValue, num: 1 },
      // 9つ全部入り
      {
        text: 'あ', textReq: 'い', sel: '対応中', selFree: 'x', multi: ['A', 'B'], multiFree: ['y'],
        date: '2026-09-22', person: 'v-sales', check: false, num: 12, url: 'https://example.com',
        onair: { kind: 'equipment', id: 'eq_1', label: 'カメラ' },
        onairReq: { kind: 'page', id: 'wp-abc12345' },
      },
    ];
    for (const props of CASES) {
      expect(
        server.sanitizeProps(ITEMS as server.WikiItem[], props as Record<string, server.WikiPropValue>),
        JSON.stringify(props),
      ).toEqual(client.sanitizeProps(ITEMS, props));
    }
  });

  it('項目の一覧が空なら、何を渡しても空が返る', () => {
    const props = { text: 'あ', num: 1 };
    expect(server.sanitizeProps([], props)).toEqual(client.sanitizeProps([], props));
    expect(client.sanitizeProps([], props)).toEqual({});
  });

  it('サーバー側に余分な関数を置いていない（どちらが正か分からなくなる）', () => {
    // 写したのは保存のたびに走る分だけ（`wiki-props.ts` の冒頭の注意書き）。
    // YAML の見出し（serializeFrontMatter / parseFrontMatter）は段E で写す。
    // ここが増えたら、増やしたものの突き合わせも上に足すこと。
    expect(Object.keys(server).sort()).toEqual([
      'WIKI_ITEM_TYPES', 'WIKI_ONAIR_KINDS', 'isValidPropValue', 'sanitizeProps',
    ]);
  });

  it('項目の型の一覧が shared と同じ9つ', () => {
    // `WikiItemType` は型なので実行時に比べられない。**画面が実際に作る項目**と
    // 同じ並びを定数で持ち、増えたらここで気づけるようにする
    expect([...server.WIKI_ITEM_TYPES]).toEqual([
      'text', 'select', 'multi_select', 'date', 'person', 'checkbox', 'number', 'url', 'onair_link',
    ]);
    expect([...server.WIKI_ONAIR_KINDS]).toEqual(['project', 'equipment', 'room', 'page']);
  });
});
