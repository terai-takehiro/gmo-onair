/**
 * **版の履歴の見出しの探し方**（`scripts/generate-version-history.mjs`）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * ここは**2 回続けて間違えた**ところです（どちらも Codex の指摘）:
 *
 *  ・素の `indexOf` … `docs/version-history.md` は前置きの中で
 *    「## 過去のバージョン」直下へ、と**引用として書いています**。素の検索だと
 *    その引用に当たるので、**見出しより前に置いた版まで拾えて**しまい、
 *    **置き場所を間違えているのに動く**状態になっていました（実際にそうでした）。
 *  ・改行を `\n` と決め打ち … Windows で `core.autocrlf=true` のまま clone すると
 *    `.md` は `\r\n` になります。決め打ちだと**どの見出しにも当たらず**、
 *    `predev` / `prebuild` が毎回落ちます — **その環境の人だけ、何も始められません**。
 *
 * ⚠️ **どちらも、この環境（Linux・LF）では気づけません。**
 */
import { describe, it, expect } from 'vitest';
import { headingIndex } from '../../scripts/generate-version-history.mjs';

const H = '## 過去のバージョン';

describe('見出しは行頭で探す', () => {
  it('本当の見出しを指す', () => {
    const md = `# 題\n\n本文\n\n${H}\n\n(v1.0.0 — x)\n`;
    expect(md.slice(headingIndex(md, H), headingIndex(md, H) + H.length)).toBe(H);
  });

  it('⚠️ 前置きの中の引用には当たらない', () => {
    // 実物にこの1文があります（「この下の『## 過去のバージョン』直下へ移してください」）
    const md = `> 4件目を「${H}」直下へ移してください。\n\n${H}\n\n(v1.0.0 — x)\n`;
    const at = headingIndex(md, H);
    expect(at).toBeGreaterThan(md.indexOf('直下へ'));   // 引用より後ろ
    expect(md.slice(at, at + H.length)).toBe(H);

    // 反証: 素の検索だと引用に当たる（＝見出しより前の版まで拾えてしまう）
    expect(md.indexOf(H)).toBeLessThan(md.indexOf('直下へ'));
  });

  it('先頭が見出しでも見つかる', () => {
    const md = `${H}\n\n(v1.0.0 — x)\n`;
    expect(headingIndex(md, H)).toBe(0);
  });

  it('無ければ -1（呼ぶ側が止められるように）', () => {
    expect(headingIndex('本文だけ\n', H)).toBe(-1);
  });
});

describe('⚠️ 改行が CRLF でも見つかる（Windows の clone）', () => {
  it('CRLF の本文で見つかる', () => {
    const md = `# 題\r\n\r\n${H}\r\n\r\n(v1.0.0 — x)\r\n`;
    expect(md.slice(headingIndex(md, H), headingIndex(md, H) + H.length)).toBe(H);
  });

  it('CRLF でも前置きの引用には当たらない', () => {
    const md = `> 「${H}」直下へ。\r\n\r\n${H}\r\n\r\n(v1.0.0 — x)\r\n`;
    expect(headingIndex(md, H)).toBeGreaterThan(md.indexOf('直下へ'));
  });

  it('CRLF で先頭が見出しでも見つかる', () => {
    expect(headingIndex(`${H}\r\n\r\n(v1.0.0 — x)\r\n`, H)).toBe(0);
  });

  it('反証: `\\n` 決め打ちだと CRLF で見つからない', () => {
    const md = `# 題\r\n\r\n${H}\r\n\r\n(v1.0.0 — x)\r\n`;
    // 前の版の書き方（`\n${H}\n` を探す）
    expect(md.indexOf(`\n${H}\n`)).toBe(-1);
    expect(md.startsWith(`${H}\n`)).toBe(false);
  });
});
