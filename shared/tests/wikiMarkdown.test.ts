/**
 * Wiki — Markdown を扱う純関数の試験（`shared/src/wiki/` の markdown・frontMatter・search）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この5つは**画面を見ても間違いに気づけない**:
 *
 *  1. **見出しの抜き出し** … 検索の重み付け（タイトルの次）とバックリンクの元。
 *     コードの柵の中の `# コメント` を見出しに数えると、**検索の順位が静かに狂う**。
 *     順位は「そういうものか」と読まれるので、誰も間違いとして報告しない。
 *  2. **リンクの抜き出し** … バックリンク（「このページを指しているページ」）。
 *     取り漏らすと**空のまま**出る。空は「無い」と読めてしまい、間違いに見えない。
 *  3. **質問をまとめる鍵** … 「足りないページ」の回数。丸めすぎると
 *     **別々の質問が1件に潰れて回数が嘘になる**（回数順で並べるので、
 *     嘘の回数はそのまま「先に書くページ」の判断を間違えさせる）。
 *  4. **YAML の見出しの往復** … 書き出した `.md` を取り込み直したときに
 *     担当・期限・タグが落ちると、**取り込んだ人は気づかない**（本文は合っているので）。
 *  5. **項目の値の検査** … 型違いを保存すると、次に開いた人の画面でセルが描けない。
 *     保存した本人の画面は（打った値がそのまま出るので）正常に見える。
 */
import { describe, it, expect } from 'vitest';
import {
  extractHeadings,
  headingsText,
  headingSlug,
  extractPageLinks,
  extractOnairRefs,
  normalizeQuestion,
} from '../src/wiki/markdown';
import {
  serializeFrontMatter,
  parseFrontMatter,
  isValidPropValue,
  sanitizeProps,
} from '../src/wiki/frontMatter';
import {
  splitTerms,
  scorePage,
  makeExcerpt,
  matchedHeading,
} from '../src/wiki/search';
import type { WikiItem } from '../src/wiki/types';

describe('見出しの抜き出し', () => {
  it('# / ## / ### を拾い、#### 以下は拾わない', () => {
    const md = '# 大\n## 中\n### 小\n#### もっと小\n本文';
    expect(extractHeadings(md).map((h) => [h.level, h.text])).toEqual([
      [1, '大'],
      [2, '中'],
      [3, '小'],
    ]);
  });

  it('コードの柵の中の # は見出しにしない', () => {
    const md = ['## 設定', '```bash', '# これはコメント', 'ls -la', '```', '## 次'].join('\n');
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['設定', '次']);
  });

  it('~~~ の柵も閉じるまで中扱いにする', () => {
    const md = ['~~~', '# 中', '~~~', '# 外'].join('\n');
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['外']);
  });

  it('同じ見出しが2つあるとリンク先に番号を足す', () => {
    const md = '## 手順\n本文\n## 手順';
    expect(extractHeadings(md).map((h) => h.slug)).toEqual(['手順', '手順-2']);
  });

  it('見出しだけを並べた写しは1行1見出し', () => {
    expect(headingsText('# A\n本文\n## B')).toBe('A\nB');
  });

  it('リンク先は記号を落とす', () => {
    expect(headingSlug('1. まず確かめる3つ')).toBe('1.-まず確かめる3つ');
    expect(headingSlug('**太字** の見出し')).toBe('太字-の見出し');
  });

  it('本文が空でも落ちない', () => {
    expect(extractHeadings('')).toEqual([]);
    expect(headingsText('')).toBe('');
  });
});

describe('リンクの抜き出し', () => {
  it('/wiki/p/<id> を拾い、重複を落とす', () => {
    const md = '[A](/wiki/p/abc) と [B](/wiki/p/xyz) と [A再び](/wiki/p/abc)';
    expect(extractPageLinks(md).sort()).toEqual(['abc', 'xyz']);
  });

  it('見出しへのリンク（#付き）も同じページとして拾う', () => {
    expect(extractPageLinks('[A](/wiki/p/abc#手順)')).toEqual(['abc']);
  });

  it('Wiki 以外のリンクは拾わない', () => {
    expect(extractPageLinks('[案件](/sales/projects/p1) [外](https://example.com)')).toEqual([]);
  });

  it('ONAiR のリンクは種類ごとに拾う', () => {
    const md = '[サイエンス](/sales/projects/p1) [ATEM](/equipment/items/e9) [第2](/calendar/rooms/r3)';
    expect(extractOnairRefs(md)).toEqual([
      { kind: 'project', id: 'p1', label: 'サイエンス' },
      { kind: 'equipment', id: 'e9', label: 'ATEM' },
      { kind: 'room', id: 'r3', label: '第2' },
    ]);
  });

  it('同じ相手を2回貼っても1件にする', () => {
    const md = '[A](/equipment/items/e9) [B](/equipment/items/e9)';
    expect(extractOnairRefs(md)).toHaveLength(1);
  });
});

describe('質問をまとめる鍵', () => {
  it('記号と丁寧語の語尾を落とす', () => {
    expect(normalizeQuestion('配信の設定は？')).toBe(normalizeQuestion('配信の設定は'));
    expect(normalizeQuestion('どうやりますか')).toBe(normalizeQuestion('どうやり'));
  });

  it('**別の質問は別の鍵にする**（丸めすぎない）', () => {
    expect(normalizeQuestion('配信の設定は？')).not.toBe(normalizeQuestion('収録の設定は？'));
    expect(normalizeQuestion('鍵はどこ')).not.toBe(normalizeQuestion('鍵はいつ'));
  });

  it('長すぎる質問は切るが、短いものは変えない', () => {
    expect(normalizeQuestion('あ'.repeat(300)).length).toBe(200);
    expect(normalizeQuestion('短い')).toBe('短い');
  });
});

describe('YAML の見出しの往復', () => {
  it('書き出して取り込み直すと、項目が落ちない', () => {
    const fm = {
      id: 'p1',
      title: '新人が初日にやること',
      space: 'all',
      tags: ['新人', '入退室'],
      owner: 'u1',
      review_by: '2027-09-22',
      status: 'draft' as const,
    };
    const md = serializeFrontMatter(fm, '## 午前\n\n- ONAiR のアカウント');
    const back = parseFrontMatter(md);
    expect(back.data.title).toBe('新人が初日にやること');
    expect(back.data.space).toBe('all');
    expect(back.data.tags).toEqual(['新人', '入退室']);
    expect(back.data.owner).toBe('u1');
    expect(back.data.review_by).toBe('2027-09-22');
    expect(back.data.status).toBe('draft');
    expect(back.body).toContain('## 午前');
  });

  it('本文だけの .md も読める（見出しが無くても落ちない）', () => {
    const r = parseFrontMatter('# ただの本文\n\n続き');
    expect(r.data).toEqual({});
    expect(r.body).toBe('# ただの本文\n\n続き');
  });

  it('コロンを含むタイトルを引用して書き、読み戻せる', () => {
    const md = serializeFrontMatter({ title: '配信: 音が出ない' }, '本文');
    expect(parseFrontMatter(md).data.title).toBe('配信: 音が出ない');
  });

  it('空の項目は書き出さない（読む人に意味のない行を作らない）', () => {
    const md = serializeFrontMatter({ title: 'A', tags: [], owner: undefined }, '本文');
    expect(md).not.toContain('tags:');
    expect(md).not.toContain('owner:');
  });

  it('データベースの行の値も往復する', () => {
    const md = serializeFrontMatter(
      { title: '事例1', props: { it_kind: '音声', it_done: true, it_n: 3 } },
      '本文',
    );
    const back = parseFrontMatter(md).data.props as Record<string, unknown>;
    expect(back.it_kind).toBe('音声');
    expect(back.it_done).toBe(true);
    expect(back.it_n).toBe(3);
  });
});

describe('項目の値の検査', () => {
  const items: WikiItem[] = [
    { id: 'i_text', name: 'タイトル', type: 'text', required: true },
    { id: 'i_date', name: '日付', type: 'date' },
    { id: 'i_sel', name: '症状', type: 'select', options: [{ value: '音声' }, { value: '映像' }] },
    { id: 'i_multi', name: 'タグ', type: 'multi_select', options: [{ value: 'a' }, { value: 'b' }] },
    { id: 'i_chk', name: '再発防止', type: 'checkbox' },
    { id: 'i_num', name: '件数', type: 'number' },
    { id: 'i_link', name: '機材', type: 'onair_link' },
  ];
  const by = (id: string) => items.find((i) => i.id === id)!;

  it('型が合っていれば通す', () => {
    expect(isValidPropValue(by('i_text'), 'あ')).toBe(true);
    expect(isValidPropValue(by('i_date'), '2026-09-22')).toBe(true);
    expect(isValidPropValue(by('i_sel'), '音声')).toBe(true);
    expect(isValidPropValue(by('i_multi'), ['a', 'b'])).toBe(true);
    expect(isValidPropValue(by('i_chk'), false)).toBe(true);
    expect(isValidPropValue(by('i_num'), 3)).toBe(true);
    expect(isValidPropValue(by('i_link'), { kind: 'equipment', id: 'e9' })).toBe(true);
  });

  it('選択肢に無い値は通さない', () => {
    expect(isValidPropValue(by('i_sel'), '回線')).toBe(false);
    expect(isValidPropValue(by('i_multi'), ['a', 'z'])).toBe(false);
  });

  it('日付の形が違えば通さない', () => {
    expect(isValidPropValue(by('i_date'), '2026/09/22')).toBe(false);
    expect(isValidPropValue(by('i_date'), '今日')).toBe(false);
  });

  it('数でないものを数の項目に入れない', () => {
    expect(isValidPropValue(by('i_num'), '3')).toBe(false);
    expect(isValidPropValue(by('i_num'), Number.NaN)).toBe(false);
  });

  it('ONAiR リンクは種類と id の両方が要る', () => {
    expect(isValidPropValue(by('i_link'), { kind: 'equipment' } as never)).toBe(false);
    expect(isValidPropValue(by('i_link'), { kind: 'unknown', id: 'x' } as never)).toBe(false);
  });

  it('必須の項目は空を通さない。任意なら通す', () => {
    expect(isValidPropValue(by('i_text'), null)).toBe(false);
    expect(isValidPropValue(by('i_date'), null)).toBe(true);
  });

  it('知らない項目は落とす（型違いも落とす）', () => {
    const out = sanitizeProps(items, {
      i_text: 'あ',
      i_num: 'ダメ' as never,
      i_unknown: 'これは知らない' as never,
    });
    expect(out).toEqual({ i_text: 'あ' });
  });
});

describe('検索の点数', () => {
  const page = {
    title: '配信トラブル時の切り分け手順',
    headings: '症状ごとの確認と対処\n音が出ない',
    body_md: '配信中に音が出ないときは、ミキサーの MAIN を見る。配信は止めない。',
    updated_at: '2026-09-18T16:22:00Z',
  };

  it('語を空白で分ける（全角も）', () => {
    expect(splitTerms('配信　音が出ない')).toEqual(['配信', '音が出ない']);
  });

  it('タイトルに当たると本文だけより高い', () => {
    const inTitle = scorePage(page, ['配信']);
    const inBodyOnly = scorePage(
      { ...page, title: 'ほかの話', headings: '' },
      ['配信'],
    );
    expect(inTitle).toBeGreaterThan(inBodyOnly);
  });

  it('見出しに当たると本文だけより高い', () => {
    const inHeading = scorePage({ ...page, title: 'ほかの話' }, ['音が出ない']);
    const bodyOnly = scorePage({ ...page, title: 'ほかの話', headings: '' }, ['音が出ない']);
    expect(inHeading).toBeGreaterThan(bodyOnly);
  });

  it('**2語以上は AND** — 1語でも当たらなければ 0', () => {
    expect(scorePage(page, ['配信', '音が出ない'])).toBeGreaterThan(0);
    expect(scorePage(page, ['配信', '存在しない語'])).toBe(0);
  });

  it('語が無ければ 0（空の検索で全件が並ばない）', () => {
    expect(scorePage(page, [])).toBe(0);
  });

  it('同じ語が何度も出ても上限で頭打ちにする（長い本文が勝ちすぎない）', () => {
    const many = { ...page, title: '', headings: '', body_md: '配信'.repeat(100) };
    const few = { ...page, title: '', headings: '', body_md: '配信 配信' };
    expect(scorePage(many, ['配信'])).toBeLessThanOrEqual(scorePage(few, ['配信']) * 4);
  });

  it('抜粋は当たった語の前後を出す', () => {
    const ex = makeExcerpt(page.body_md, ['音が出ない']);
    expect(ex).toContain('音が出ない');
  });

  it('当たらなければ先頭を出す（空にしない）', () => {
    expect(makeExcerpt(page.body_md, ['無い語']).length).toBeGreaterThan(0);
  });

  it('一致した見出しを返す。無ければ null', () => {
    expect(matchedHeading('## 音が出ない\n本文', ['音が'])).toBe('音が出ない');
    expect(matchedHeading('## 別の話\n本文', ['音が'])).toBeNull();
  });
});
