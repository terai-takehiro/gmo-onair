/**
 * 本文（Markdown の文字列）にツールバーの操作を当てる — **計算だけ**
 *
 * 画面の部品から切り離してあるのは、ここが編集画面でいちばん壊れやすいからです
 * （カーソルの位置・行の範囲・すでに付いている記号）。React を触らない純粋な関数に
 * しておけば、そのまま試験にかけられます。
 *
 * 約束:
 *  - 受け取るのも返すのも「本文」と「選んでいる範囲」だけ
 *  - **本文の正は Markdown の文字列そのもの**。打った文字をこちらで勝手に整えない
 *  - 記号は GitHub がそのまま描ける書き方だけを使う（設計 §4-2 の表）
 */

/** 本文と、いま選んでいる範囲（`<textarea>` の `selectionStart` / `selectionEnd`） */
export interface EditState {
  text: string;
  start: number;
  end: number;
}

export type Edit = (s: EditState) => EditState;

/* ── 行の扱い ─────────────────────────────────────────────── */

/** 選んでいる範囲にかかる行の、先頭と末尾の位置 */
function lineRangeOf(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  return [from, nl === -1 ? text.length : nl];
}

/** 行頭に付いている記号（見出し・箇条書き・番号・チェック）を外す */
function stripMarker(line: string): { indent: string; rest: string } {
  const m = /^(\s*)(?:#{1,6}[ \t]+|[-*][ \t]+\[[ xX]\][ \t]+|[-*][ \t]+|\d+\.[ \t]+)?(.*)$/.exec(line);
  return { indent: m?.[1] ?? '', rest: m?.[2] ?? line };
}

/**
 * 選んだ行の頭に記号を付ける／外す。
 * **全部の行にもう付いていれば外す**（同じボタンで戻せる）。
 */
function toggleLinePrefix(prefix: string): Edit {
  return ({ text, start, end }) => {
    const [from, to] = lineRangeOf(text, start, end);
    const lines = text.slice(from, to).split('\n');
    const has = (l: string) => l.trimStart().startsWith(prefix);
    const allHave = lines.every((l) => l.trim() === '' || has(l));
    const next = lines.map((l) => {
      if (l.trim() === '' && lines.length > 1) return l;
      const { indent, rest } = stripMarker(l);
      return allHave ? indent + rest : `${indent}${prefix}${rest}`;
    });
    const body = next.join('\n');
    return { text: text.slice(0, from) + body + text.slice(to), start: from, end: from + body.length };
  };
}

/** 見出し（`## `）。題は別に持っているので、本文の見出しは 2 段目から */
export const toggleHeading: Edit = toggleLinePrefix('## ');
/** 箇条書き */
export const toggleBullet: Edit = toggleLinePrefix('- ');
/** チェックリスト */
export const toggleCheck: Edit = toggleLinePrefix('- [ ] ');

/* ── 文字の装飾 ───────────────────────────────────────────── */

/** 太字。選んでいなければ `****` を置いて真ん中にカーソルを入れる */
export const toggleBold: Edit = ({ text, start, end }) => {
  const picked = text.slice(start, end);
  if (!picked) {
    const next = `${text.slice(0, start)}****${text.slice(end)}`;
    return { text: next, start: start + 2, end: start + 2 };
  }
  // すでに `**…**` なら外す（選び方が中か外かのどちらでも戻せるようにする）
  if (picked.startsWith('**') && picked.endsWith('**') && picked.length >= 4) {
    const inner = picked.slice(2, -2);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (text.slice(start - 2, start) === '**' && text.slice(end, end + 2) === '**') {
    const next = text.slice(0, start - 2) + picked + text.slice(end + 2);
    return { text: next, start: start - 2, end: end - 2 };
  }
  const wrapped = `**${picked}**`;
  return {
    text: text.slice(0, start) + wrapped + text.slice(end),
    start: start + 2,
    end: start + 2 + picked.length,
  };
};

/**
 * リンク。選んでいれば選んだ文字を名前にして、**URL のほうを選んだ状態で返す**
 * （そのまま貼り付けられる）。選んでいなければ名前のほうを選ぶ。
 */
export function insertLink(url = 'https://'): Edit {
  return ({ text, start, end }) => {
    const picked = text.slice(start, end);
    const label = picked || 'リンクの名前';
    const inserted = `[${label}](${url})`;
    const next = text.slice(0, start) + inserted + text.slice(end);
    if (picked) {
      const urlAt = start + label.length + 3;
      return { text: next, start: urlAt, end: urlAt + url.length };
    }
    return { text: next, start: start + 1, end: start + 1 + label.length };
  };
}

/* ── まとまり（ブロック）を差し込む ───────────────────────── */

/** いまの行に書きかけがあれば、1行空けてから差し込む（段落にくっつけない） */
function separatorBefore(text: string, start: number): string {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  return text.slice(lineStart, start).trim() === '' ? '' : '\n\n';
}

/**
 * ブロックを差し込む。`selectText` を渡すと、差し込んだ中のその文字を選んだ状態で返す
 * （打てばそのまま置き換わる）。
 */
export function insertBlock(snippet: string, selectText?: string): Edit {
  return ({ text, start, end }) => {
    const before = separatorBefore(text, start);
    const tail = text.slice(end);
    const after = tail.startsWith('\n') ? '' : '\n';
    const inserted = before + snippet + after;
    const next = text.slice(0, start) + inserted + tail;
    if (selectText) {
      const at = next.indexOf(selectText, start);
      if (at >= 0) return { text: next, start: at, end: at + selectText.length };
    }
    const caret = start + inserted.length;
    return { text: next, start: caret, end: caret };
  };
}

/** 画像。`![説明](URL)` を1行で差し込む（設計 §5-5） */
export function insertImage(alt: string, url: string): Edit {
  return insertBlock(`![${alt}](${url})`);
}

/** 表の雛形（GFM）。1行目を見出しにする */
export const TABLE_SNIPPET = '| 項目 | 内容 |\n| --- | --- |\n|  |  |';

/** 表を差し込み、最初のセルを選んだ状態にする */
export const insertTable: Edit = insertBlock(TABLE_SNIPPET, '項目');

/* ── 置き換え（「AI で整える」の結果を入れる・段E）─────────── */

/**
 * `from`〜`to` を丸ごと置き換える。**入れた文字を選んだ状態**で返すので、
 * 置き換えた範囲がそのまま目で分かります。
 *
 * ⚠️ 位置は**呼ぶ側が決めた値**をそのまま使います（いま選んでいる範囲ではない）。
 * AI を待っている間に選択が外れても、開いたときに見ていた場所へ入ります。
 */
export function replaceRange(from: number, to: number, next: string): Edit {
  return ({ text }) => {
    const start = Math.max(0, Math.min(from, text.length));
    const end = Math.max(start, Math.min(to, text.length));
    return {
      text: text.slice(0, start) + next + text.slice(end),
      start,
      end: start + next.length,
    };
  };
}

/** 本文を丸ごと置き換える（何も選ばずに「AI で整える」を押したとき） */
export function replaceAll(next: string): Edit {
  return () => ({ text: next, start: next.length, end: next.length });
}

/* ── `/` で開く一覧のための小物 ───────────────────────────── */

/**
 * いま打った1文字が「行頭の `/`」かどうか。
 * **行頭のときだけ**一覧を開く — 文の途中の `/`（日付や URL）で開くと邪魔になる。
 */
export function isSlashTrigger(text: string, caret: number): boolean {
  if (caret <= 0 || text[caret - 1] !== '/') return false;
  return caret === 1 || text[caret - 2] === '\n';
}

/** 一覧から選んだので、引き金になった `/` を消す */
export function removeSlash(state: EditState, slashAt: number): EditState {
  if (state.text[slashAt] !== '/') return state;
  return {
    text: state.text.slice(0, slashAt) + state.text.slice(slashAt + 1),
    start: slashAt,
    end: slashAt,
  };
}
