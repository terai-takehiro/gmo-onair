// Wiki — 検索の点数付けと抜粋（§5-4）
//
// 点数は **Node 側**で付ける。重みを直すたびに migration が要らないようにするため
// （`similar.ts` と同じ作法）。React も DOM も持ち込まない。
// 元は markdown.ts にあり、1ファイル 400 行の上限で役割ごとに分けた。

import type { WikiSearchHit } from './types';
import { extractHeadings } from './markdown';

/* ── 検索の点数（§5-4。重みを直すたびに migration が要らないよう Node で） ── */

export interface WikiScoreInput {
  title: string;
  headings: string;
  body_md: string;
  updated_at: string;
}

/** 検索語を分ける。全角の空白も区切りに使う */
export function splitTerms(q: string): string[] {
  return q
    .trim()
    .split(/[\s　]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * タイトル×3・見出し×2・本文×1（§5-4）。
 * **2語以上は AND** — 1語でも当たらなければ 0（呼ぶ側が落とす）。
 * 同じ語が何度も出るほど少しだけ上がるが、上限を付ける（長い本文が勝ちすぎないため）。
 */
export function scorePage(page: WikiScoreInput, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = page.title.toLowerCase();
  const headings = page.headings.toLowerCase();
  const body = page.body_md.toLowerCase();
  let total = 0;
  for (const raw of terms) {
    const term = raw.toLowerCase();
    const inTitle = countOccurrences(title, term);
    const inHeadings = countOccurrences(headings, term);
    const inBody = countOccurrences(body, term);
    if (inTitle + inHeadings + inBody === 0) return 0; // AND
    total +=
      Math.min(inTitle, 3) * 3 + Math.min(inHeadings, 4) * 2 + Math.min(inBody, 6) * 1;
  }
  return total;
}

/** 当たった語の前後を切り出す。画面は当たった語を太くする */
export function makeExcerpt(body: string, terms: string[], width = 120): string {
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return body.slice(0, width).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, at - Math.floor(width / 3));
  const cut = body.slice(start, start + width).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + cut + (start + width < body.length ? '…' : '');
}

/** 一致した見出しのうち、いちばん上のもの。無ければ null */
export function matchedHeading(md: string, terms: string[]): string | null {
  const hs = extractHeadings(md);
  for (const h of hs) {
    const t = h.text.toLowerCase();
    if (terms.some((term) => t.includes(term.toLowerCase()))) return h.text;
  }
  return null;
}

/** 並べ替え: 点数が同じなら新しいほうを上に */
export function compareHits(a: WikiSearchHit, b: WikiSearchHit): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0;
}
