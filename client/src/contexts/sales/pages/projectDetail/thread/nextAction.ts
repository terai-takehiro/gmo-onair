/**
 * 「次にやること」を読める形に分ける（`projectDetail/thread/`）
 *
 * ── 何を解いているか ────────────────────────────────────────
 *
 * `activity_logs.next_action` は**1本の自由文**です。ところが実際に入っている値は
 * 自由文ではなく、**言い切り1文 ＋ 付随してやること数件**という構造を持っています。
 *
 *   ★8/14(金)までに 8/28分の備品レンタル発注可否を確定し発注する(…)。①金子様からの
 *   ★酒樽設置台2台(キャスター付き)の可否・金額の回答を確認し、発注内容に含める
 *   ②★パーテーション等の追加要否・数量を確定(車両サイズに影響) ③搬出時刻を一本化 …
 *
 * これを1つの段落として太字で流し込むと、**画面 10 行ぶんの塊**になります
 * （利用者から「読みづらい」とご指摘。実際の本番データ）。**丸数字は原文に
 * 書かれている区切り**なので、読み取って行に分ければそれだけで読めます。
 *
 * ── なぜ画面側で解くのか ────────────────────────────────────
 *
 * この文を書いているのは**AI とは限りません**。メール取込は MCP の
 * `create_activity_log` が `next_action` を直接書き、**整形（`activity-format.service`）は
 * すでに値がある行の `next_action` を上書きしません**。つまり
 * **プロンプトを直しても、いま入っている値は1文字も変わりません**。
 * すでに溜まっている記録を読めるようにできるのは画面側だけです。
 *
 * ── 意図して「やらない」こと（`noteText.ts` と同じ決めごと）──────
 *
 * - **`★` を消しません。** 取込側が付けている注意の印で、どこまでがその範囲かは
 *   テキストから決められません。消すと「ここを見てほしい」だけが落ちます
 * - **番号は文字として残します。** 本文が「②で書いたとおり」と参照します
 * - **文の意味を変えません。** 並べ替え・要約・言い換えは1つもしません
 * - **1文字も捨てません。** 見出しと項目を繋ぎ直せば必ず元の情報に戻ります
 *
 * ⚠️ **純関数にしてあります。** 画面を立てずに試せるので
 * `shared/tests/nextAction.test.ts` で固定しています（分け方を間違えると
 * **やることが1件消える**という、目で見ても気づけない壊れ方をします）。
 */

/** 並びの1件 */
export interface NextActionItem {
  /**
   * 原文に書かれていた印（`①` `2)`）。**印が無い並びは `null`**で、
   * そのときは画面が `・` を描く（原文に無い番号を作らない）
   */
  marker: string | null;
  text: string;
}

export interface ParsedNextAction {
  /** 言い切りの1文。**一覧・概要はここだけを出す**（続きは詳細で読む） */
  headline: string;
  items: NextActionItem[];
}

/** 丸数字 `①`(U+2460) 〜 `⑳`(U+2473)。**連続した符号位置**なので数に戻せる */
const CIRCLED = /[①-⑳]/g;
const circledValue = (ch: string): number => (ch.codePointAt(0) ?? 0) - 0x245f;

/**
 * 行頭の印。`・` `-` は**印そのものに意味が無い**ので落とし（画面が `・` を描く）、
 * 番号は残す。`→` は `noteText` では帯にするが、ここは1件の「やること」の中なので
 * 並びの1件として扱う
 */
const LINE_MARKER = /^(?:([・･‐-―-])|(\d{1,2}[).）.]|[①-⑳]|[→⇒]))\s*/;

/**
 * ⚠️ **数の頭のマイナスを印として食わない**（レビューでの指摘 #97）。
 *
 * `-` は行頭の印（`- 見積を送る`）でもありますが、**`-10万円` の `-` は数の一部**です。
 * 前の版は区別せずに落としていたので、**「-10万円で調整」が「10万円で調整」**になり、
 * **符号が逆の金額が画面に出て**いました（原文には残っているので、
 * 読んだ人はそれが正しいと思います）。
 *
 * 印として落とすのは**うしろに数字が続かないとき**だけにします。
 */
const MINUS_NUMBER = /^[-‐−ー]\s*\d/;

/**
 * 文で分けるかどうかの下限。**短い文は分けません** —
 * 「見積書を送付する。」を2行にしても読みやすくならず、行だけが増えます。
 */
const SENTENCE_MIN = 80;

const clean = (s: string): string => s.trim();

/**
 * 複数行で書かれているとき。行頭の印を読み取る。
 *
 * **印の無い行は直前の項目の続きとして繋ぎます**（取り込んだ本文は
 * 文の途中で折り返されている）。和文は単語の区切りが無いので**間に何も入れません**。
 */
function splitByLines(text: string): ParsedNextAction | null {
  const lines = text.split('\n').map(clean).filter(Boolean);
  if (lines.length < 2) return null;

  const head: string[] = [];
  const items: NextActionItem[] = [];
  for (const line of lines) {
    // 数の頭のマイナスは印ではない（`MINUS_NUMBER` の説明）。
    // **1件として立てる**（前の行にくっつけると2件が1件に減る）が、
    // **印は付けない** — 原文の `-` は数の一部なので、文字として本文に残す
    if (MINUS_NUMBER.test(line) && (items.length > 0 || head.length > 0)) {
      items.push({ marker: null, text: clean(line) });
      continue;
    }
    const m = MINUS_NUMBER.test(line) ? null : LINE_MARKER.exec(line);
    if (m) {
      items.push({ marker: m[2] ?? null, text: clean(line.slice(m[0].length)) });
    } else if (items.length > 0) {
      items[items.length - 1].text += line;
    } else {
      head.push(line);
    }
  }

  const kept = items.filter((it) => it.text);
  // 印が1つも無い複数行は、1行目を見出しにして残りを並びにする
  if (kept.length === 0) {
    return { headline: head[0], items: head.slice(1).map((t) => ({ marker: null, text: t })) };
  }
  return { headline: head.join(''), items: kept };
}

/**
 * 1行の中に埋まっている丸数字の並びを読み取る（本番データでいちばん多い形）。
 *
 * **`①` から始まり1つずつ増えるものだけ**を並びと見なします。
 * `②の件は…` のように**本文が番号を参照しているだけ**のときに分けてしまうと、
 * 文が途中で切れた項目ができます（1つしか無い・飛んでいる・戻っているものは分けない）。
 */
function splitByCircled(text: string): ParsedNextAction | null {
  const marks = [...text.matchAll(CIRCLED)].map((m) => ({ index: m.index ?? 0, ch: m[0] }));
  if (marks.length < 2 || circledValue(marks[0].ch) !== 1) return null;
  for (let i = 1; i < marks.length; i += 1) {
    if (circledValue(marks[i].ch) !== circledValue(marks[i - 1].ch) + 1) return null;
  }

  const items = marks
    .map((m, i) => ({
      marker: m.ch,
      text: clean(text.slice(m.index + m.ch.length, marks[i + 1]?.index ?? text.length)),
    }))
    .filter((it) => it.text);
  if (items.length < 2) return null;
  return { headline: clean(text.slice(0, marks[0].index)), items };
}

/**
 * 印がまったく無い長い文。**句点で行に分けるだけ**（記号は付けない）。
 *
 * 括弧の中の `。` では切りません — 「(発注期日 8/19 は…の中日。実働は2日)」のような
 * 補足が途中で切れて、**元の文に戻せなくなります**。
 */
function splitBySentence(text: string): ParsedNextAction | null {
  if (text.length <= SENTENCE_MIN) return null;

  const parts: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of text) {
    if ('（(「『［[【'.includes(ch)) depth += 1;
    else if ('）)」』］]】'.includes(ch)) depth = Math.max(0, depth - 1);
    buf += ch;
    if (ch === '。' && depth === 0) { parts.push(clean(buf)); buf = ''; }
  }
  if (clean(buf)) parts.push(clean(buf));

  const kept = parts.filter(Boolean);
  if (kept.length < 2) return null;
  return { headline: kept[0], items: kept.slice(1).map((t) => ({ marker: null, text: t })) };
}

/**
 * 狭い枠（案件詳細の事実の帯・一覧）に出す1行。
 *
 * **AI が作った短い一文（`next_action_short`・migration 190）があればそれを使い、
 * 無ければ規則で作った見出しに落ちます。**
 *
 * ── なぜ落ち先が要るのか ────────────────────────────────────
 *
 * 短い一文は**毎晩の定時実行で作られる**ので、**取り込まれた直後の記録には
 * まだ入っていません**。ここで空を返すと、いちばん新しい「次にやること」だけが
 * 画面から消えます（いちばん見たい行が消える、といういやな壊れ方）。
 *
 * ⚠️ **短い一文を「原文の代わり」にしないこと。** 全文は必ず読める場所
 * （やり取りタブ・`title`）に残します。AI が要約を間違えた日に、
 * **やることが1件消えたことに誰も気づけなくなる**ためです。
 */
export function nextActionLine(
  a: { next_action?: string | null; next_action_short?: string | null },
): string {
  const short = String(a.next_action_short ?? '').trim();
  if (short) return short;
  return parseNextAction(a.next_action).headline;
}

/**
 * 「次にやること」を見出しと並びに分ける。
 *
 * **分けられなければ全文が `headline`** になります（呼ぶ側は今までどおり1行で描ける）。
 */
export function parseNextAction(raw: string | null | undefined): ParsedNextAction {
  const text = clean((raw ?? '').replace(/\r\n?/g, '\n'));
  if (!text) return { headline: '', items: [] };

  /*
   * ⚠️ **改行があっても、行の中の丸数字を見にいく**（レビューでの指摘 #97）。
   *
   * 本番データは**改行と行中の丸数字が混ざります**（この文書の頭の例がそれです）。
   * 前の版は「改行があれば行ごとに分ける」で打ち切っていたので、
   * **`①②③` が1行に並んでいる回はまるごと1件**になり、
   * 画面には「やることが1つ」に見えていました（**残りは行の中に埋まったまま**）。
   *
   * 行で分けた結果が**1件しか無いとき**（＝行頭の印が実質1つも無かったとき）だけ、
   * 丸数字での分け方を試します。**行で分けられているものは触りません**。
   */
  const byLine = text.includes('\n') ? splitByLines(text) : null;
  if (byLine && byLine.items.length >= 2) return byLine;

  const byCircled = splitByCircled(text.replace(/\n/g, ''));
  if (byCircled) return byCircled;

  return byLine
    ?? splitBySentence(text)
    ?? { headline: text, items: [] };
}
