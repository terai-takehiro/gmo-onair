/**
 * Wiki — 検索の点数付けと抜粋（`docs/design/v4/wiki.md` §5-4・段D）。
 *
 * ⚠️ **`shared/src/wiki/search.ts` の意図的な複製です。**
 * サーバーはルートの `shared/`（`@gmo-onair/shared`）を import できません
 * （`server/tsconfig.json` の `rootDir: ./src`）。`wiki-markdown.ts`・`wiki-props.ts` と
 * まったく同じ理由で、**同じ答えが要るものだけ**をここに写しています。
 *
 * ⚠️ **なぜ `wiki-markdown.ts` に足さず別ファイルにしたか。**
 * あちらは「保存のたびにサーバーが走らせる導出値」の置き場で、
 * `shared/tests/wikiMarkdownParity.test.ts` が**その4つしか無いこと**を固定しています
 * （増やすと「どちらが正か分からなくなる」）。検索の点数付けは役目が違う（読むときだけ走る）ので、
 * 同じ作法のまま**ファイルを分けて**写し、突き合わせも別に置きました
 * （`shared/tests/wikiSearchParity.test.ts`）。1ファイル 400 行の上限にも効きます。
 *
 * ⚠️ **画面と答えが食い違うと、同じ語で検索しても並び順と抜粋が変わります。**
 * しかも「そういうものか」と読まれるので、**誰も間違いとして報告しません**。片方だけ直さないこと。
 */
import { extractHeadings } from './wiki-markdown';

/* ── 検索の点数（§5-4。重みを直すたびに migration が要らないよう Node で） ── */

export interface WikiScoreInput {
  title: string;
  headings: string;
  body_md: string;
  updated_at: string;
}

/**
 * 検索結果の1件（`shared/src/wiki/types.ts` の `WikiSearchHit` と同じ形）。
 * 並べ替え（`compareHits`）が見るのは `score` と `updated_at` の2つだけです。
 */
export interface WikiSearchHit {
  id: string;
  title: string;
  space_id: string;
  space_name: string;
  space_color: string | null;
  /** スペース ＞ 親 ＞ … の道 */
  path: string;
  /** 一致した見出し（無ければ null） */
  heading: string | null;
  /** 本文からの抜粋。当たった語の前後 */
  excerpt: string;
  updated_at: string;
  owner_name: string | null;
  score: number;
}

/** 検索語を分ける。全角の空白も区切りに使う */
export function splitTerms(q: string): string[] {
  return q
    .trim()
    // 全角スペース（U+3000）は JS の `\s` に含まれるので、正規表現に直に書かない
    .split(/\s+/)
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

/**
 * 抜粋に出す前に、Markdown の印を落として素の文にする。
 *
 * ⚠️ **抜粋に `![配置図](/api/v1/internal/wiki/files/wf-…)` や `> [!CAUTION]` が
 * そのまま出ていました**（実ブラウザで見つけた）。URL は1行の半分を食べるので、
 * 当たった語の前後が読めません。**落とすのは印だけ**で、文字は消しません
 * （画像は代替文を残し、リンクは文字を残す）。
 *
 * ⚠️ これは**抜粋のためだけ**の処理です。本文の正は `body_md` のままで、
 * ここを通した文字を保存に使わないこと。
 */
export function toPlainText(md: string): string {
  return md
    // コードの柵（``` ~~~ の行）は落とし、中の文字は残す
    .replace(/^[ \t]*(?:```|~~~).*$/gm, ' ')
    // 画像は代替文だけ（URL は読めないうえ長い）
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // リンクは文字だけ
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 生の HTML（折りたたみの <details> など）
    .replace(/<[^>]+>/g, ' ')
    // 注意書きの印（`> [!NOTE]` ほか）
    .replace(/\[![A-Za-z]+\]/g, '')
    // 見出し・引用
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    // 箇条書き（チェックの印を含む）・番号
    .replace(/^[ \t]*[-*+][ \t]+(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    // 区切り線
    .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, ' ')
    // 表の区切りの行（`| --- | --- |`）は、縦棒を落とす**前に**消す
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, ' ')
    // 表の縦棒
    .replace(/\|/g, ' ')
    // 強調・取り消し・行内のコード
    .replace(/\*|__|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 当たった語の前後を切り出す。画面は当たった語を太くする */
export function makeExcerpt(body: string, terms: string[], width = 120): string {
  const text = toPlainText(body);
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, width).trim();
  const start = Math.max(0, at - Math.floor(width / 3));
  const cut = text.slice(start, start + width).trim();
  return (start > 0 ? '…' : '') + cut + (start + width < text.length ? '…' : '');
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
