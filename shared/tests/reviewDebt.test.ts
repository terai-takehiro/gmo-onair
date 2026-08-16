/**
 * **マージ済みの PR に残った指摘を数える道具**（`scripts/review-debt.mjs`）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * この道具の役目は「**見落としを数えられる形にする**」ことです。
 * ⚠️ **数え落とすと、何も無いように見えます** — つまり
 * **壊れても「0 件でした」と出る**、この製品がいちばん警戒している形です。
 *
 * 中身は GitHub に訊く部分（試験できない）と、
 * **返ってきたものをどう読むか**（試験できる）に分けてあります。ここは後者。
 *
 * 使っている形は**この作業で実際に返ってきたもの**です
 * （#147 の P1・#146 の P2・返信のあるスレッド）。
 */
import { describe, it, expect } from 'vitest';
import {
  isReviewerLogin, openThreadsOf, firstLineOf, isRecorded, recordedPrs,
  allThreadsOf, formatReport,
} from '../../scripts/review-debt.mjs';

/** #147 に実際に付いた P1 の書き出し */
const P1_BODY = '**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-orange?style=flat)'
  + '</sub></sub>  Preserve the release-branch bypass in PR checkouts**\n\nFor the version-bump…';
const P2_BODY = '**<sub><sub>![P2 Badge](https://img.shields.io/badge/P2-yellow?style=flat)'
  + '</sub></sub>  Handle failed lookup queries instead of waiting forever**\n\nWhen either…';

const thread = (over: Record<string, unknown> = {}) => ({
  isResolved: false,
  comments: {
    totalCount: 1,
    nodes: [{ body: P2_BODY, path: 'a/b.ts', author: { login: 'chatgpt-codex-connector' } }],
  },
  ...over,
});

const pr = (over: Record<string, unknown> = {}) => ({
  number: 147, title: '検査を直した', mergedAt: '2026-08-16T00:42:55Z',
  reviewThreads: { nodes: [thread()] },
  ...over,
});

describe('レビューを書く相手を見分ける', () => {
  it('Codex を拾う', () => {
    expect(isReviewerLogin('chatgpt-codex-connector')).toBe(true);
  });

  it('人の返信は拾わない（返信まで指摘として数えない）', () => {
    expect(isReviewerLogin('terai-takehiro')).toBe(false);
    expect(isReviewerLogin(undefined)).toBe(false);
  });
});

describe('返していない指摘だけ拾う', () => {
  it('未解決のものを拾う', () => {
    expect(openThreadsOf(pr())).toHaveLength(1);
  });

  it('解決済みは拾わない', () => {
    expect(openThreadsOf(pr({ reviewThreads: { nodes: [thread({ isResolved: true })] } }))).toHaveLength(0);
  });

  it('人が始めたスレッドは拾わない（1つ目の書き込みで見る）', () => {
    const human = thread({
      comments: { totalCount: 1, nodes: [{ body: 'ここ直しました', path: 'a.ts', author: { login: 'terai-takehiro' } }] },
    });
    expect(openThreadsOf(pr({ reviewThreads: { nodes: [human] } }))).toHaveLength(0);
  });

  it('P1 と P2 を見分ける（先に直すものが分かるように）', () => {
    const p1 = thread({
      comments: { totalCount: 1, nodes: [{ body: P1_BODY, path: 'x.mjs', author: { login: 'chatgpt-codex-connector' } }] },
    });
    expect(openThreadsOf(pr({ reviewThreads: { nodes: [p1] } }))[0].weight).toBe('P1');
    expect(openThreadsOf(pr())[0].weight).toBe('P2');
  });

  it('返信の有無を添える（`isResolved` だけでは足りない）', () => {
    // ⚠️ この製品は解決印を押す運用をしていないので、`isResolved` は当てにならない。
    // 「返信があるか」を出して、人が読んで決められるようにする
    expect(openThreadsOf(pr())[0].replied).toBe(false);
    const replied = thread({ comments: { totalCount: 2, nodes: thread().comments.nodes } });
    expect(openThreadsOf(pr({ reviewThreads: { nodes: [replied] } }))[0].replied).toBe(true);
  });

  it('レビューが1件も無い PR で落ちない', () => {
    expect(openThreadsOf({ number: 1, title: 'x', reviewThreads: { nodes: [] } })).toEqual([]);
    expect(openThreadsOf({ number: 1, title: 'x' })).toEqual([]);
  });
});

describe('見出しを取り出す', () => {
  it('バッジを飛ばして要点だけを出す', () => {
    expect(firstLineOf(P1_BODY)).toBe('Preserve the release-branch bypass in PR checkouts');
  });

  it('形が違っても空にしない（読む手がかりを残す）', () => {
    expect(firstLineOf('ふつうの文です\n2行目')).toBe('ふつうの文です');
    expect(firstLineOf('')).toBe('');
  });
});

describe('棚卸しに書いたかを見る', () => {
  const doc = '| #146 | P2 | `x` | … | ⭕️ |\n| #147 | P1 | `y` | … | ⭕️ |';

  it('書いてあれば記録あり', () => {
    expect(isRecorded(146, doc)).toBe(true);
  });

  it('書いていなければ未記載', () => {
    expect(isRecorded(149, doc)).toBe(false);
  });

  it('番号の一部に当たらない（#14 が #146 に当たらない）', () => {
    expect(isRecorded(14, doc)).toBe(false);
  });

  it('⚠️ 「どの PR で直したか」の欄に当たらない（レビューでの指摘 #150）', () => {
    /*
     * 実際にこうなっていました: 棚卸しには `| #149 | … | ⭕️ #150 |` という行があり、
     * **#150 は「#149 を直した PR」としてしか出てこない**のに、素の検索だと当たります。
     * すると **#150 自身の指摘が「記録あり」**と出て、出た人は**書かなくてよい**と
     * 読みます — **見落としを数えるための道具が、見落としを作る**形でした。
     */
    const real = '| #149 | P2 | `useLedgerLookups` | … | ⭕️ #150 |';
    expect(isRecorded(150, real)).toBe(false);   // 直した側としてしか出ていない
    expect(isRecorded(149, real)).toBe(true);    // 指摘の側としては出ている

    // 反証: 本文のどこかに番号があるかで見る版だと当たってしまう
    expect(/#150\b/.test(real)).toBe(true);
  });

  it('本文（表以外）の番号にも当たらない', () => {
    expect(isRecorded(150, '**未解決だったものは #146〜#150 で片づきました。**')).toBe(false);
  });

  it('1列目の番号だけを集める', () => {
    expect([...recordedPrs(doc)]).toEqual([146, 147]);
    // `| — | P2 | …` の行（PR 番号を持たない指摘）は数えない
    expect([...recordedPrs('| — | P2 | `x` | … | ❌ |')]).toEqual([]);
  });
});

describe('報告の出し方', () => {
  it('⚠️ 0 件でも「0 件」と言う（黙って終わらない）', () => {
    // 黙って終わると、動いたのか動いていないのか分からない
    expect(formatReport([], '')).toContain('0 件');
  });

  it('棚卸しに無い PR は名指しする', () => {
    const out = formatReport(openThreadsOf(pr({ number: 149 })), '');
    expect(out).toContain('#149');
    expect(out).toContain('棚卸しに未記載');
  });

  it('棚卸しにあれば「記録あり」と出す', () => {
    const out = formatReport(openThreadsOf(pr({ number: 149 })), '| #149 | P2 |');
    expect(out).toContain('記録あり');
    expect(out).not.toContain('未記載');
  });

  it('「決めたものも消さない」を毎回書く（この文書の要点そのもの）', () => {
    expect(formatReport(openThreadsOf(pr()), '')).toContain('表から消さないこと');
  });
});

describe('⚠️ 全部のページを見る（レビューでの指摘 #150）', () => {
  /*
   * 前の版は `first: 50` を1回引くだけで、**51 件目から先を黙って落として**いました。
   * 落ちたぶんに未解決の指摘があると、この道具が**「0 件でした」**と言います —
   * **見落としを数えるための道具が、いちばんやってはいけない嘘をつく**形です。
   */
  const page = (n: number, next = false, cursor = 'c1') => ({
    nodes: Array.from({ length: n }, () => thread()),
    pageInfo: { hasNextPage: next, endCursor: cursor },
  });

  it('続きが無ければそのまま', async () => {
    const out = await allThreadsOf({ number: 1, reviewThreads: page(2) }, async () => null);
    expect(out.reviewThreads.nodes).toHaveLength(2);
  });

  it('続きがあれば足して集める', async () => {
    const out = await allThreadsOf(
      { number: 1, reviewThreads: page(100, true) },
      async () => page(30),
    );
    expect(out.reviewThreads.nodes).toHaveLength(130);
  });

  it('何ページでも追う', async () => {
    let left = 3;
    const out = await allThreadsOf(
      { number: 1, reviewThreads: page(100, true) },
      async () => page(100, --left > 0),
    );
    expect(out.reviewThreads.nodes).toHaveLength(400);
  });

  it('⚠️ 続きが読めなければ止める（少なく数えない）', async () => {
    await expect(allThreadsOf({ number: 7, reviewThreads: page(100, true) }, async () => null))
      .rejects.toThrow(/少なく数えないため/);
  });

  it('終わらない続きで回り続けない（上限で止める）', async () => {
    await expect(allThreadsOf({ number: 7, reviewThreads: page(100, true) }, async () => page(100, true)))
      .rejects.toThrow(/多すぎます/);
  });

  it('反証: 1ページで切ると、続きにあった指摘が 0 件に化ける', async () => {
    // 1ページ目に指摘が無く、2ページ目にある PR
    const first = { nodes: [], pageInfo: { hasNextPage: true, endCursor: 'c1' } };
    const rest = { nodes: [thread()], pageInfo: { hasNextPage: false } };
    const pr1 = { number: 9, title: 'x', reviewThreads: first };

    expect(openThreadsOf(pr1)).toHaveLength(0);                       // ← 前の版はここで終わり
    const all = await allThreadsOf(pr1, async () => rest);
    expect(openThreadsOf(all)).toHaveLength(1);                       // ← いまは拾える
  });
});
