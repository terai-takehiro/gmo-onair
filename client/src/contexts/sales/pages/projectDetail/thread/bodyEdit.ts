/**
 * やり取りの本文を「その場で編集できる素のテキスト」と往復させる（v4・ご指摘4）
 *
 * ── 何を解いているか ────────────────────────────────────────
 *
 * やり取りの本文は3つの形で入っています（`ThreadCard.tsx` の3段）。
 *
 *   ① `body_struct` … AI が起こした構造（状態・事実・発言）
 *   ② `body_html`   … 許可タグ9つだけの HTML（AI が整えた文・v1 の行）
 *   ③ `description` … 打った原文（素のテキスト）
 *
 * 利用者のご指摘は「**AI が整形したあとでも手動で編集したい**」です。
 * ところが編集させるなら**素のテキスト**にするしかありません（構造や HTML を
 * そのまま編集させると、閉じ忘れた1件が画面全体を壊します）。
 * そこで **出ているもの → 素のテキスト → 許可タグだけの HTML** を往復させます。
 *
 * ── なぜ純関数で切り出すか ──────────────────────────────────
 *
 * ここを外すと **XSS になります**。材料は取引先が書いたメールの本文で、
 * 戻り値は `dangerouslySetInnerHTML` に渡る HTML です。画面を立てないと
 * 試せない場所に置くと、攻撃の形を書き足していけません
 * （`shared/tests/threadBodyEdit.test.ts` がこの3つを直接呼んで固定しています）。
 *
 * ⚠️ **サーバーでもう一度削ります**（`server/src/shared/services/html-sanitize.ts`）。
 * ここは「人が読める形に整える」係で、**守りの本体はサーバー側の1か所**です。
 * 画面側を守りの1本目と数えないこと（画面を通らない経路が必ずあります）。
 *
 * ── 往復の決めごと（試験で固定）──────────────────────────────
 *
 *   ・1行 = 1ブロック。空行は空の段落（`<p></p>`）として残す
 *   ・`- ` で始まる行は箇条書き（`<li>`）。続く `- ` 行と1つの `<ul>` にまとめる
 *   ・戻すときは `<li>` を必ず `- ` で書き出す（`<ol>` も `- ` になる = 片道）
 *   ・**1文字も落とさない。** 要約・言い換え・並べ替えは1つもしない
 */
import { readActivityStruct } from './struct';

/** 書き出してよいタグ。**サーバーの `ALLOWED` の部分集合**（増やさないこと） */
const EMIT_TAGS = ['p', 'ul', 'li', 'br'] as const;

/** 中身ごと落とすタグ。外側だけ落とすと、コードが本文の文字として出る */
const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'];

/** 名前付き実体参照。**HTML の全部ではなく、この製品の本文に出るものだけ** */
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/**
 * 実体参照を文字に戻す。
 *
 * ⚠️ **戻した文字列を HTML として扱わないこと。** ここが返すのは
 * `<textarea>` に入れる素のテキストで、React は値としてしか置きません。
 * 保存のときは `bodyHtmlFromText` が**必ずもう一度エスケープ**します
 * （`&lt;script&gt;` → `<script>` → `&lt;script&gt;` に戻る、という往復）。
 */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,10});/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      // 読めない符号位置はそのまま残す（勝手に消すと、壊れた値に気づけない）
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** 素のテキストにするときのエスケープ解除の対（`&` `<` `>` だけを作る） */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 許可タグの HTML → 素のテキスト。
 *
 * **知らないタグは中身だけ残します**（サーバーの `sanitizeBodyHtml` と同じ考え方）。
 * `script` / `style` は中身ごと落とします — 残すと、本文の文字として
 * コードが編集欄に並び、そのまま保存されます。
 */
export function textFromBodyHtml(html: string | null | undefined): string {
  if (typeof html !== 'string' || !html.trim()) return '';
  let src = html;
  for (const tag of DROP_WITH_CONTENT) {
    src = src.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    src = src.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'gi'), '');
  }
  src = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<![\s\S]*?>/g, '');

  /*
   * 行を組み立てる。**ブロックの切れ目で行を確定**する:
   *   `p` / `h4` / `li` / `ul` / `ol` の開始と終了、`br`
   * `strong` / `em` / `code` は行の中なので、文字だけ拾って印は落とす
   * （素のテキストに `**` を作ると、保存のときに `**` が本文の文字として残る）。
   */
  const lines: string[] = [];
  let buf = '';
  /** いま箇条書きの項目の中か（`- ` を頭に付けるのは `li` の1行目だけ） */
  let inItem = false;
  /**
   * いま段落（`p` / `h4`）を開いているか。
   *
   * ⚠️ **空の段落（`<p></p>`）を1行として残すために要ります**。前の版は
   * 「buf に文字があるときだけ行を確定する」形だったので、**空行が保存のたびに
   * 詰まっていき**、段落の区切りが3回編集すると消えていました。
   */
  let blockOpen = false;
  const flush = () => {
    const t = buf.replace(/[ \t\u3000]+$/u, '');
    lines.push(inItem ? `- ${t.replace(/^[ \t]+/, '')}` : t);
    buf = '';
  };

  const re = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?\/?\s*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    buf += decodeEntities(src.slice(last, m.index));
    last = m.index + m[0].length;
    const closing = m[1] === '/';
    const name = m[2].toLowerCase();

    if (name === 'br') { flush(); inItem = false; continue; }
    if (name === 'li') {
      if (!closing) { if (buf.trim() || inItem) flush(); inItem = true; } else { flush(); inItem = false; }
      continue;
    }
    if (name === 'p' || name === 'h4') {
      if (closing) {
        // **中身が空でも1行出す**（空行が段落の区切り）
        if (blockOpen || buf.trim() || inItem) flush();
        blockOpen = false;
      } else {
        // 閉じ忘れた前の段落を確定してから開く
        if (buf.trim() || inItem) flush();
        blockOpen = true;
      }
      inItem = false;
      continue;
    }
    if (name === 'ul' || name === 'ol') {
      if (buf.trim() || inItem) flush();
      inItem = false;
      blockOpen = false;
      continue;
    }
    // 知らないタグ・行の中の装飾は文字だけ拾う
  }
  buf += decodeEntities(src.slice(last));
  if (buf.trim() || inItem) flush();

  // 先頭・末尾の空行だけ落とす（中の空行は段落の区切りなので残す）
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

/**
 * 素のテキスト → 許可タグだけの HTML。
 *
 * ⚠️ **必ずエスケープします。** 材料は取引先が書いた文字列なので、
 * ここを抜けると `dangerouslySetInnerHTML` にそのまま届きます。
 * 書き出すタグは `EMIT_TAGS` の4つだけで、**属性は1つも付けません**。
 *
 * 返り値が `null` なのは**中身が空のとき**だけです（呼ぶ側は保存を止める）。
 */
export function bodyHtmlFromText(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // 先頭・末尾の空行は落とす（`textFromBodyHtml` の出口と同じ形にそろえる）
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (lines.length === 0) return null;

  let out = '';
  let listOpen = false;
  const closeList = () => { if (listOpen) { out += '</ul>'; listOpen = false; } };

  for (const raw of lines) {
    const line = raw.replace(/[ \t\u3000]+$/u, '');
    // 箇条書きの印は `- ` `・` `･`。**印そのものに意味は無い**ので `<li>` に移す
    const item = /^\s*(?:[-‐−]|[・･])\s+(.*)$/u.exec(line);
    if (item && !/^\s*[-‐−]\s*\d/u.test(line)) {
      // 数の頭のマイナス（`-10万円`）は印ではない（`nextAction.ts` と同じ決めごと）
      if (!listOpen) { out += '<ul>'; listOpen = true; }
      out += `<li>${escapeHtml(item[1])}</li>`;
      continue;
    }
    closeList();
    out += `<p>${escapeHtml(line.replace(/^\s+/, ''))}</p>`;
  }
  closeList();
  const trimmed = out.trim();
  if (!trimmed || trimmed === '<p></p>') return null;
  return trimmed;
}

/** 発言の頭に置く話者の行（**誰の発言かを落とさない**） */
function turnHeadline(t: {
  side: 'us' | 'them'; name: string | null; org: string | null; at: string | null;
}): string {
  // `side` は名前があっても落とさない。当社の回答が先方の発言として
  // 残るのがこの構造でいちばん重い壊れ方なので、必ず文字で書く
  const parts = [t.side === 'us' ? '当社' : '先方'];
  if (t.name) parts.push(t.name);
  if (t.org) parts.push(`（${t.org}）`);
  if (t.at) parts.push(t.at);
  return parts.join(' ');
}

/**
 * `body_struct` → 素のテキスト（**片道**）。
 *
 * 構造には HTML に無い区分（状態・事実・話者）があるので、**戻せません**。
 * 戻せないことは画面が先に伝えます（保存前の注意書き）。ここでやるのは
 * **1つも捨てずに文字にする**ことだけです — 捨てると、編集を始めた瞬間に
 * AI が読み取った内容が消え、それに誰も気づけません。
 */
export function textFromActivityStruct(raw: unknown): string {
  const s = readActivityStruct(raw);
  if (!s) return '';
  const lines: string[] = [];
  if (s.subtitle) lines.push(s.subtitle);
  if (s.statuses.length > 0) lines.push(s.statuses.map((x) => x.label).join(' / '));
  if (s.facts.length > 0) lines.push(s.facts.map((f) => f.value).join(' / '));
  if (s.lead) { if (lines.length) lines.push(''); lines.push(s.lead); }

  for (const t of s.turns) {
    lines.push('');
    lines.push(turnHeadline(t));
    if (t.quote) lines.push(...t.quote.split('\n'));
    if (t.note) lines.push(...t.note.split('\n'));
    for (const f of t.fields) lines.push(`- ${f.label}: ${f.value}`);
  }
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}

/**
 * 編集欄の初期値。**いま画面に出ているものから作る**（ご指示）。
 *
 * 順番は `ThreadCard` の3段と同じ（`body_struct` → `body_html` → `description`）。
 * ここがずれると、**編集を押した瞬間に画面と違う文が出て**、
 * 「AI が勝手に書き換えた」と読まれます。
 */
export function editableBodyText(a: {
  body_struct?: unknown; body_html?: string | null; description?: string | null;
}): string {
  const fromStruct = textFromActivityStruct(a.body_struct);
  if (fromStruct) return fromStruct;
  const fromHtml = textFromBodyHtml(a.body_html);
  if (fromHtml) return fromHtml;
  return (a.description ?? '').replace(/\r\n?/g, '\n');
}

/** 書き出すタグの一覧（試験が「増えていないか」を見るために公開している） */
export const EMITTED_TAGS: readonly string[] = EMIT_TAGS;
