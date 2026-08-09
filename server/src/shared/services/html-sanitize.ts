/**
 * AI が整えた本文（HTML）を、DB に入れる前に安全な形へ削る
 *
 * ── どこから来る文字列か ────────────────────────────────────
 *
 * 中身は **AI が組み立てたもの**で、その材料は**人が打った文**、さらにその材料は
 * **取引先から来たメールや打合せの発言**です。どれも信用できません。
 * ここを通さずに `dangerouslySetInnerHTML` に渡すと、取引先の書いた文字列が
 * そのまま実行されます（XSS）。
 *
 * ── なぜ「AI に HTML を書かせる」形にしたか ──────────────────
 *
 * この製品はふだん **AI に HTML を書かせません**（メールの取込は
 * `rich-content.ts` の「意味の単位」で受けます）。やり取りの本文だけ HTML なのは、
 * **人が書いた文章そのもの**を段落・箇条書き・強調のまま残したいからです。
 * 意味の単位に潰すと、書いた人の文が組み替えられて「自分が書いたものと違う」
 * になります。そのぶん**通す形をきつく絞ります**:
 *
 *   ・許可タグは **9 つだけ**（`p / strong / em / ul / ol / li / br / h4 / code`）
 *   ・**属性は1つも通さない**。`href` も通さない = リンクは作れない
 *     （文中の URL は素の文字として残るので、情報は消えません）
 *   ・知らないタグは**中身だけ残して外側を落とす**（`div` の中の文が消えない）
 *   ・`script` / `style` は**中身ごと落とす**（残すとコードが本文として画面に出る）
 *
 * ── 素で試せるようにしてある ────────────────────────────────
 *
 * ネットワークにも DB にも触りません。`shared/tests/htmlSanitize.test.ts` が
 * この関数を直接呼んで固定しています。**攻撃の形は書き足していくもの**なので、
 * 試験に足せる形にしておくことが要点です。
 */

/** 通すタグ。**増やすときは、その1つで何ができるようになるかを考えてから** */
const ALLOWED = new Set(['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'h4', 'code']);

/** 中身ごと落とすタグ。外側だけ落とすと、コードが本文として画面に出る */
const DROP_WITH_CONTENT = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript'];

/** 閉じタグを書かないタグ */
const VOID_TAGS = new Set(['br']);

/** 本文の上限。**切るときは切ったと分かる形で切る**（黙って消すと書いた人が気づけない） */
export const MAX_BODY_HTML = 20_000;

/**
 * 許可タグだけの HTML に削る。
 *
 * 返すのは**必ず閉じ切った**HTML です。閉じていないと、後ろの画面の要素まで
 * 中に飲み込まれてレイアウトが崩れます（1件の壊れた行が一覧全体を壊す）。
 */
export function sanitizeBodyHtml(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let html = input;

  // ① 中身ごと落とすもの。閉じタグが無い壊れた形も想定して、末尾までを落とす
  for (const tag of DROP_WITH_CONTENT) {
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    html = html.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*$`, 'gi'), '');
  }
  // ② コメントを落とす（条件付きコメントでスクリプトを通す形があるため）
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  // ③ DOCTYPE / 処理命令
  html = html.replace(/<![\s\S]*?>/g, '').replace(/<\?[\s\S]*?\?>/g, '');

  const open: string[] = [];
  let out = '';

  // タグらしきものを1つずつ見る。**属性は読まずに捨てる**ので、
  // 属性の中に何が書いてあっても出口には出ない
  const re = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)\s*>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out += escapeText(html.slice(last, m.index));
    last = m.index + m[0].length;

    const closing = m[1] === '/';
    const name = m[2].toLowerCase();
    const selfClosed = m[3] === '/';
    if (!ALLOWED.has(name)) continue;      // 知らないタグは中身だけ残す

    if (VOID_TAGS.has(name)) { out += `<${name}>`; continue; }
    if (selfClosed) continue;              // <p/> のような形は無視する（空の段落を作らない）

    if (closing) {
      // **開いていないタグは閉じない。** 閉じると、外側の要素を1つ閉じてしまう
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      // 途中で開いたままのものを内側から閉じる（入れ子の順を守る）
      for (let i = open.length - 1; i >= at; i--) out += `</${open[i]}>`;
      open.length = at;
    } else {
      out += `<${name}>`;
      open.push(name);
    }
  }
  out += escapeText(html.slice(last));
  for (let i = open.length - 1; i >= 0; i--) out += `</${open[i]}>`;

  const trimmed = out.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_BODY_HTML) return trimmed;
  // 長すぎるときは**切ったと分かる形で**返す（閉じ切るために素の段落にする）
  return `${trimmed.slice(0, MAX_BODY_HTML)}<p>（ここから先は長すぎるため省きました。原文は残っています）</p>`;
}

/** 本文の素のテキスト。`&` `<` `>` だけを実体参照にする（引用符は属性を通さないので不要） */
function escapeText(s: string): string {
  return s.replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 要点。**短く・件数を絞る** — 画面ではチップになるので、長いと折り返して読めない */
export function sanitizeKeyPoints(input: unknown, max = 6): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;   // 文字列以外は落とす（`[object Object]` を出さない）
    const t = v.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
