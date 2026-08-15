/**
 * 素のテキストを「意味の単位」に読み解く (v4)
 *
 * ── 何を解いているか ────────────────────────────────────────
 *
 * やり取り (`activity_logs`) の本文は、**AI が整形した `body_html` があるとき**は
 * それを描きます。ところが**メール取込は素のテキストしか入れられません** —
 * MCP の `create_activity_log` が受け取るのは `description` だけで、
 * `body_html` も `key_points` も受け口がありません
 * (`server/src/contexts/mcp/tools/activities.tools.ts`)。
 *
 * つまり**毎日 sales@ から取り込まれる記録はすべて素のテキスト**で、
 * 画面はそれを `whitespace-pre-line` の段落1つに流し込んでいました。
 * 見出しも箇条書きも強調も同じ見た目になり、`**強調**` は
 * **アスタリスクのまま**表示されていました (利用者から「読みづらい」と指摘)。
 *
 * ── どう解くか ──────────────────────────────────────────────
 *
 * 取り込むテキストには**実際に使われている書き方**があります。
 * それを読み取って `RichBlock[]` に変換し、**描くのは `RichContent` に任せます**
 * (見た目を決めるのは1か所、という `richContent.tsx` の決めごとをそのまま守る)。
 *
 * | 書き方 | 読み替え先 |
 * | --- | --- |
 * | `■見出し` | `heading` |
 * | `・項目` | `bullets` (続く行はその項目の続き) |
 * | `1)` `2)` / `①②③` | `bullets` (**番号は文字として残す** — 本文が番号で参照する) |
 * | `→ 結論` | `note` (info) |
 * | `「…」` が複数行 | `quote` (引用した原文) |
 * | 空行 | 段落の区切り |
 * | `**強調**` | 太字 (`RichContent` の `InlineText` が描く) |
 *
 * ── 意図して「やらない」こと ────────────────────────────────
 *
 * - **`★` は消しません。** 取込側が付けている注意の印で、**どこまでが
 *   その印の範囲かはテキストから決められません**。消すと「AI がここを見てほしい」
 *   という情報だけが落ちます。印のまま残すほうが情報は失われません
 * - **読み替えられなかった行は捨てません。** 素の段落として必ず出します。
 *   捨てると**取り込んだのに画面に無い**ことになり、しかも誰も気づけません
 * - **文の意味は変えません。** 並べ替え・要約・言い換えは1つもしません
 *   (整形は AI の仕事で、ここは「書き方を読み取るだけ」)
 *
 * ⚠️ **純関数にしてあります。** 画面を立てずに試せるので
 * `shared/tests/noteText.test.ts` で固定してあります (取り込んだ本文が
 * 画面から消える壊れ方は、目で見ても気づけません)。
 */
import type { RichBlock } from './richContent';

/** 見出しの印。`■` は取込側が節の頭に使っている */
const HEADING = /^[■□◆◇▼]\s*/;

/** 箇条書きの印 (和文の中黒。半角の `･` も来る) */
const BULLET = /^[・･]\s*/;

/** 番号つきの項目。`1)` `1.` `1）` と丸数字 */
const NUMBERED = /^(?:\d{1,2}[).）.]|[①-⑳])\s*/;

/** 結論・帰結の印 */
const ARROW = /^[→⇒]\s*/;

/** 引用の開き / 閉じ */
const QUOTE_OPEN = /^[「『]/;
const QUOTE_CLOSE = /[」』]\s*$/;

/**
 * 行の終わりで鉤括弧がいくつ開いたままか。
 *
 * ⚠️ **開いたかどうかだけで引用を始めないこと**（レビューでの指摘 #90）。
 * 前の版は「行頭が `「` で、行末が `」` でなければ複数行の引用」と決めていたので、
 *
 *   「至急」対応をお願いします。詳細は明日ご連絡します。
 *
 * のように**行の途中で閉じている**文が引用の始まりと読まれ、
 * **そのあとの行が全部その引用に飲まれて**いました（閉じる行が現れるまで、
 * ふつうは本文の最後まで）。読む側には**1件の記録がまるごと引用の帯**に見え、
 * 決定事項も次にやることも帯の中に埋まります。
 *
 * 開いた数と閉じた数を数え、**行の終わりでまだ開いているときだけ**引用にします。
 */
function openDepth(line: string, start = 0): number {
  let depth = start;
  for (const ch of line) {
    if (ch === '「' || ch === '『') depth += 1;
    else if (ch === '」' || ch === '』') depth = Math.max(0, depth - 1);
  }
  return depth;
}

/**
 * 文が終わっている行末。ここで終わっていない行は**文の途中で折り返されている**
 * （取り込んだ本文は読みやすさのために途中で改行されている）
 */
const SENTENCE_END = /[。．.!?！？」』：:；;]$/;

/**
 * 段落の中で、**文の途中で折り返された行だけを繋ぎ直す**。
 *
 * 取り込んだ本文は「…記録がなく、」で改行して次の行に続きます。改行をそのまま
 * 残すと**文の途中で折れて見え**、逆に全部繋ぐと**書いた人が意図した改行**
 * （箇条書きになっていない並列の行など）まで潰れます。
 * そこで**行末で文が終わっているかどうか**で決めます。
 *
 * 和文は単語の区切りが無いので、繋ぐときは**間に何も入れません**。
 */
function joinWrapped(lines: string[]): string {
  let out = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (!out) { out = line; continue; }
    out += SENTENCE_END.test(out) ? `\n${line}` : line;
  }
  return out.trim();
}

type Pending =
  | { kind: 'para'; lines: string[] }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'arrows'; items: string[] }
  /** `depth` = いま開いたままの鉤括弧の数。0 に戻った行で閉じる */
  | { kind: 'quote'; lines: string[]; depth: number }
  | null;

/**
 * 素のテキストを `RichBlock[]` にする。
 *
 * @param raw 取り込んだ本文。`null` / 空白だけなら空の配列を返す
 *            (呼ぶ側は `RichContent` の `fallback` に素の文字列を渡しておくこと)
 */
export function parseNoteText(raw: string | null | undefined): RichBlock[] {
  if (!raw || !raw.trim()) return [];

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const blocks: RichBlock[] = [];
  let pending: Pending = null;

  /** 溜めていたものを1つの塊にして確定する */
  const flush = () => {
    if (!pending) return;
    if (pending.kind === 'para') {
      const text = joinWrapped(pending.lines);
      if (text) blocks.push({ type: 'text', text });
    } else if (pending.kind === 'bullets') {
      const items = pending.items.map((s) => s.trim()).filter(Boolean);
      if (items.length) blocks.push({ type: 'bullets', items });
    } else if (pending.kind === 'arrows') {
      // **1本ずつ帯にする。** まとめると「どれが結論か」が読み取れない
      for (const t of pending.items) {
        const text = t.trim();
        if (text) blocks.push({ type: 'note', tone: 'info', text });
      }
    } else {
      const text = pending.lines.join('\n').trim();
      if (text) blocks.push({ type: 'quote', text });
    }
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');

    // 引用の中は印を読み取らない (引用の中の `・` は引用元の文字)
    if (pending?.kind === 'quote') {
      pending.lines.push(line);
      pending.depth = openDepth(line, pending.depth);
      // **閉じたら終わり。** 行末が `」` かどうかではなく、開いた数が 0 に戻ったか
      if (pending.depth === 0 || QUOTE_CLOSE.test(line)) flush();
      continue;
    }

    if (!line.trim()) {                       // 空行 = 塊の区切り
      flush();
      continue;
    }

    if (HEADING.test(line)) {
      flush();
      const text = line.replace(HEADING, '').trim();
      if (text) blocks.push({ type: 'heading', text });
      continue;
    }

    if (QUOTE_OPEN.test(line)) {
      const depth = openDepth(line);
      // **行の中で閉じているものは引用の塊にしない**（上の `openDepth` の説明）。
      // 「至急」対応をお願いします … は引用ではなく、鉤括弧で始まる普通の文
      if (depth === 0 && !QUOTE_CLOSE.test(line)) {
        // 段落として扱う（この下の段落の処理に落とす）
        if (pending?.kind !== 'para') flush();
        if (pending?.kind === 'para') pending.lines.push(line);
        else pending = { kind: 'para', lines: [line] };
        continue;
      }
      flush();
      pending = { kind: 'quote', lines: [line], depth };
      // 1行で閉じている引用もある
      if (depth === 0 || QUOTE_CLOSE.test(line)) flush();
      continue;
    }

    if (ARROW.test(line)) {
      if (pending?.kind !== 'arrows') flush();
      const text = line.replace(ARROW, '').trim();
      if (pending?.kind === 'arrows') pending.items.push(text);
      else pending = { kind: 'arrows', items: [text] };
      continue;
    }

    const isBullet = BULLET.test(line);
    const isNumbered = !isBullet && NUMBERED.test(line);
    if (isBullet || isNumbered) {
      if (pending?.kind !== 'bullets') flush();
      // 番号は**残す**（本文が「2) で書いたとおり」と参照する）。中黒は印なので落とす
      const text = isBullet ? line.replace(BULLET, '').trim() : line.trim();
      if (pending?.kind === 'bullets') pending.items.push(text);
      else pending = { kind: 'bullets', items: [text] };
      continue;
    }

    // 印の無い行。箇条書きの途中なら**その項目の続き**として繋ぐ
    if (pending?.kind === 'bullets' && pending.items.length > 0) {
      // 和文は単語の区切りが無いので**間に何も入れずに繋ぐ**
      // （取り込んだ本文は文の途中で改行されているため、空白を入れると語間が開く）
      pending.items[pending.items.length - 1] += line.trim();
      continue;
    }
    if (pending?.kind === 'arrows') flush();   // 帯のあとの素の行は段落に戻す

    if (pending?.kind === 'para') pending.lines.push(line);
    else pending = { kind: 'para', lines: [line] };
  }

  flush();
  return blocks;
}
