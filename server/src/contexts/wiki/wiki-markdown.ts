/**
 * Wiki — 本文（Markdown）から導出値を取り出す純関数。
 *
 * ⚠️ **`shared/src/wiki/markdown.ts` の意図的な複製です。**
 * サーバーはルートの `shared/`（`@gmo-onair/shared`）を import できません
 * （`server/tsconfig.json` の `rootDir: ./src`）。`server/src/shared/production/miniapps.ts`
 * などと同じ理由で、同じ答えが要るものだけをここに写しています。
 *
 * 写したのは **保存のたびにサーバーが走らせるもの**（`docs/design/v4/wiki.md` §5-3）だけです:
 *   - `headingsText` … 検索でタイトルの次に重く見る `wiki_pages.headings` を作る
 *   - `extractPageLinks` … バックリンク（`wiki_links`）を作り直す
 * 検索の点数付け（`scorePage` ほか）は段D、YAML の見出しは段E で要るので、
 * そのとき必要な分だけ写してください（使わない関数をここに置くと、
 * どちらが正か分からなくなります）。
 *
 * ⚠️ **画面（`shared/src/wiki/markdown.ts`）と答えが食い違うと、保存した瞬間に
 * 目次とバックリンクが変わって見えます。** 片方だけ直さないこと。
 * 一致の固定は `shared/tests/` の parity テストで行う想定です（未作成・報告に記載）。
 */

/** コードの柵（``` … ```）の中の行を true にした表を返す */
function codeFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let inFence = false;
  let fence = '';
  for (const line of lines) {
    const m = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (m) {
      if (!inFence) {
        inFence = true;
        fence = m[1][0];
      } else if (m[1][0] === fence) {
        inFence = false;
        fence = '';
        mask.push(true); // 閉じの行そのものは柵の中扱い
        continue;
      }
    }
    mask.push(inFence);
  }
  return mask;
}

export interface WikiHeading {
  /** 1〜3。`####` 以下は作らない（§4-2） */
  level: number;
  text: string;
  /** 目次のリンク先。同じ文字列が2つあれば -2, -3 … を足す */
  slug: string;
  /** 本文の何行目か（0 始まり） */
  line: number;
}

/** 見出しの文字から目次のリンク先を作る。記号を落として小文字にする */
export function headingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[`*_~[\]()<>#!|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 本文から見出し（`#` `##` `###`）を抜く。
 * **コードの柵の中は見出しにしない**（`# コメント` を拾わないため）。
 */
export function extractHeadings(md: string): WikiHeading[] {
  const lines = md.split('\n');
  const inCode = codeFenceMask(lines);
  const out: WikiHeading[] = [];
  const seen = new Map<string, number>();
  lines.forEach((line, i) => {
    if (inCode[i]) return;
    const m = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!m) return;
    const text = m[2].trim();
    if (!text) return;
    const base = headingSlug(text) || 'h';
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ level: m[1].length, text, slug: n === 1 ? base : `${base}-${n}`, line: i });
  });
  return out;
}

/**
 * 検索用の「見出しだけを並べた写し」（`wiki_pages.headings`）。
 * タイトルの次に重く見る（§5-4）ので、1行1見出しで持つ。
 */
export function headingsText(md: string): string {
  return extractHeadings(md).map((h) => h.text).join('\n');
}

/** `/wiki/p/<id>` を指すリンクの id（重複を落とす）。バックリンクの元（§5-3） */
export function extractPageLinks(md: string): string[] {
  const out = new Set<string>();
  // [文](/wiki/p/xxxx) と素の <(/wiki/p/xxxx)> の両方
  const re = /\((\/wiki\/p\/[A-Za-z0-9_-]+)[^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) {
    const id = m[1].slice('/wiki/p/'.length);
    if (id) out.add(id);
  }
  return [...out];
}
