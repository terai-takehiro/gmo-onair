/**
 * **版の要約の作り方**（`scripts/lib/changelog-summary.mjs`）
 *
 * ── なぜ試験を書くか ────────────────────────────────────────
 *
 * ここが間違っても**画面は普通に出ます**。出るのは「版の名前が変」だけで、
 * しかも**リリースのときにしか動かない**ので、次のリリースまで誰も踏みません。
 *
 * ⚠️ 実際に起きた形（`generate-version-history.mjs` 側）:
 *  ・**先頭の太字を見出しに切り出す**ので、太字で始めないと
 *    **本文の頭 90 文字が版の名前**になります
 *  ・要約とアーカイブで**同じ版が2つ**並ぶので、生成側は長いほうを本文に採り、
 *    **見出しは要約のもの**を残します。つまり**要約の見出しが画面の版名**です
 */
import { describe, it, expect } from 'vitest';
import {
  titleOf, buildSummaryBody, SUMMARY_FILE, isNoteFile, descriptionLengthOf,
} from '../../scripts/lib/changelog-summary.mjs';
import { parseVersionLine } from '../../scripts/generate-version-history.mjs';

describe('titleOf — 下書きの見出しを取り出す', () => {
  it('先頭の太字をそのまま使う', () => {
    expect(titleOf('**案件台帳の余白を直した**（ご指摘）。①…')).toBe('案件台帳の余白を直した');
  });

  /**
   * ⚠️ **貪欲に取らないこと。** 下書きは本文の中でも太字を多用するので、
   * `**(.+)**` だと**最後の太字まで**巻き込み、見出しが段落まるごとになります
   * （＝要約が全文と同じ長さになり、分けた意味が消えます）。
   */
  it('本文の中の太字まで巻き込まない', () => {
    const body = '**短い見出し**（ご指摘）。①⚠️ **ここも太字**です。②**ここも**。';
    expect(titleOf(body)).toBe('短い見出し');
  });

  it('太字で始まっていなければ最初の句点まで', () => {
    expect(titleOf('余白が無かったので直した。詳しくは…')).toBe('余白が無かったので直した');
  });

  it('太字で始まらず句点も無いときは丸ごと1文として扱う', () => {
    expect(titleOf('fix the padding')).toBe('fix the padding');
  });

  /** 長すぎる見出しは切る（版の一覧は1行で読むもの） */
  it('句点までが長すぎるときは 60 文字で切って … を付ける', () => {
    const t = titleOf(`${'あ'.repeat(80)}。次の文`);
    expect(t.length).toBe(61);
    expect(t.endsWith('…')).toBe(true);
  });

  /** 代用のときは太字の記号を残さない（画面にそのまま出る） */
  it('代用のときに ** を残さない', () => {
    expect(titleOf('先頭は素の字。**あとで太字**。')).toBe('先頭は素の字');
  });
});

describe('buildSummaryBody — 要約の本文', () => {
  const body = buildSummaryBody(['あああ', 'いいい', 'ううう']);

  /**
   * ⚠️ **先頭は必ず太字。** 画面の履歴は先頭の太字を見出しとして切り出すので、
   * ここを素の字にすると**本文の頭 90 文字が版の名前**になります。
   */
  it('先頭が太字で始まる', () => {
    expect(body.startsWith('**')).toBe(true);
  });

  it('本数を出す', () => {
    expect(body).toContain('**3 本ぶんの変更**');
  });

  it('全文の在りかを書く（要約しか読まない人が中身を探せるように）', () => {
    expect(body).toContain('アーカイブに全文あります');
  });

  it('収録した見出しを全部並べる', () => {
    for (const t of ['あああ', 'いいい', 'ううう']) expect(body).toContain(`「${t}」`);
  });

  /** 0 件で呼ばれることは無いが、呼ばれても壊れた文にしない */
  it('0 件でも文として成り立つ', () => {
    expect(buildSummaryBody([])).toContain('**0 本ぶんの変更**');
  });
});

describe('SUMMARY_FILE', () => {
  /**
   * ⚠️ **下書きと同じ拡張子**なので、集める側が名指しで外さないと
   * **要約が「収録した変更の1つ」として全文にも入ります**。
   */
  it('.md で、名前で見分けられる', () => {
    expect(SUMMARY_FILE).toBe('_summary.md');
  });
});

/**
 * `isNoteFile` — **門（`check-changelog.mjs`）と集める側（`collect-changelog.mjs`）が
 * 同じ判定を使う**ための1か所（レビューでの指摘・P2）。
 *
 * ⚠️ 片方だけが `_summary.md` を外していると、**それだけを足した PR が門を通り抜け**、
 * **版の履歴に1行も載らないまま**マージされます。しかも 12,000 バイトを超えなければ
 * 要約は使われないまま消されるので、**どこにも残りません**（黙って消える）。
 */
describe('isNoteFile — この PR の下書きか', () => {
  it('ふつうの下書きは下書き', () => {
    expect(isNoteFile('fix-something.md')).toBe(true);
    expect(isNoteFile('docs/changelog.d/fix-something.md')).toBe(true);
  });

  it('README.md は下書きではない（説明の文書）', () => {
    expect(isNoteFile('README.md')).toBe(false);
    expect(isNoteFile('docs/changelog.d/README.md')).toBe(false);
  });

  /** ⚠️ ここが反証。外し忘れると門が「下書きあり」と嘘をつく */
  it('_summary.md は下書きではない（版の要約）', () => {
    expect(isNoteFile('_summary.md')).toBe(false);
    expect(isNoteFile('docs/changelog.d/_summary.md')).toBe(false);
  });

  it('.md でないものは下書きではない', () => {
    expect(isNoteFile('docs/changelog.d/notes.txt')).toBe(false);
    expect(isNoteFile('')).toBe(false);
  });

  /** `_summary.md` を名前の一部に含むだけのものは、ふつうの下書き */
  it('名前に summary を含むだけの下書きは外さない', () => {
    expect(isNoteFile('docs/changelog.d/fix-summary-panel.md')).toBe(true);
  });
});

/**
 * `descriptionLengthOf` — **画面がその版の本文として数える長さ**。
 *
 * ⚠️ **物差しが2つあることが問題の芯です**（レビューでの指摘・P2）。
 * 書き込む側の上限は**バイト**（`CLAUDE.md` が毎ターン文脈に載る費用はバイトで効く）、
 * 画面が同じ版の2つを見比べるのは**文字数**（`description.length`）。
 * 日本語は 1文字 3バイトなので、**全文が日本語ばかり・要約が英数字ばかり**だと
 * 「バイトでは要約が小さいのに、文字数では要約のほうが長い」を作れます。
 * そうなると画面は**要約を本文に採り、アーカイブの全文を捨てます**（エラーは出ません）。
 *
 * ⚠️ **一切パースし直しません。** 同じ場所を手で一部だけ写して実装していたときは、
 * **6件連続でレビュー指摘**が付きました — バイトと文字数の取り違え／版の行の前置き
 * （`vX.Y.Z — `）を外していない／本文が空のときの `|| body` を落としている／
 * 句点を2つ落とすのを1つしか落としていない／`stripOuterWrap`（歴史的な閉じ括弧）を
 * 経由していない。**いまは `generate-version-history.mjs` の `parseVersionLine`
 * （1行から version・title・description を取り出す唯一の入口）をそのまま呼ぶだけ**です。
 * この節は「本当に同じ関数を呼んでいるか」を、**生成側と直接突き合わせて**固定します。
 */
describe('descriptionLengthOf — 画面が数える本文の長さ', () => {
  it('先頭の太字と直後の句点を本文に数えない', () => {
    expect(descriptionLengthOf('v9.9.9 — **みだし**。あいう')).toBe(3);
  });

  it('太字で始まらないときは丸ごと本文', () => {
    expect(descriptionLengthOf('v9.9.9 — あいうえお')).toBe(5);
  });

  /**
   * ⚠️ **これが反証。** バイトで比べていると通ってしまう組み合わせ。
   * 日本語 5,000 文字 = 15,000 バイト（上限超え）に対し、
   * 英数字 11,000 文字 = 11,000 バイト（上限内）。
   * **バイトなら要約のほうが小さいのに、文字数では倍以上長い。**
   */
  it('バイト数と文字数で大小が逆転する組み合わせを見分けられる', () => {
    const full = `v9.9.9 — **み**。${'あ'.repeat(5000)}`;
    const summary = `v9.9.9 — **s**。${'a'.repeat(11000)}`;

    // バイトで比べると「要約のほうが小さい」＝ 上限の検査は通ってしまう
    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThan(Buffer.byteLength(full, 'utf8'));

    // 文字数（＝画面の物差し）で比べると要約のほうが長い ＝ 全文が消える組み合わせ
    expect(descriptionLengthOf(summary)).toBeGreaterThan(descriptionLengthOf(full));
  });

  /** ふつうの要約は全文よりずっと短い（止められない） */
  it('ふつうの組み合わせでは要約のほうが短い', () => {
    const full = `v9.9.9 — **み**。${'あ'.repeat(5000)}`;
    const summary = `v9.9.9 — ${buildSummaryBody(['あああ', 'いいい'])}`;
    expect(descriptionLengthOf(summary)).toBeLessThan(descriptionLengthOf(full));
  });
});

/**
 * ⚠️ **版の行（`vX.Y.Z — …`）を渡す前提であること**。
 *
 * `collect-changelog.mjs` が実際に渡すのは常に `v${version} — ${body}` の形の
 * **版の行まるごと**です。ここではその前提が壊れていないかを確かめます。
 */
describe('descriptionLengthOf — 版の行から本文だけを取り出す', () => {
  it('`vX.Y.Z — ` の前置きを外して本文だけを数える', () => {
    expect(descriptionLengthOf('v4.1.3 — **みだし**。あいう')).toBe(3);
  });

  /**
   * ⚠️ **これが反証。** 全文の見出しだけを長くすると、
   * **行の長さでは全文のほうが長い**のに **本文では要約のほうが長い**。
   * 前置きを外さない実装だと**素通り**し、画面から全文が消える。
   */
  it('見出しの長さで逆転する組み合わせを見分けられる', () => {
    const full = `v9.9.9 — **${'長'.repeat(300)}**。${'あ'.repeat(1000)}`;
    const summary = `v9.9.9 — **短**。${'あ'.repeat(1100)}`;

    // 行まるごとで比べると「要約のほうが短い」＝ 前置きを外さない実装は通してしまう
    expect(summary.length).toBeLessThan(full.length);

    // 本文（＝画面の物差し）で比べると要約のほうが長い ＝ 全文が消える組み合わせ
    expect(descriptionLengthOf(summary)).toBeGreaterThan(descriptionLengthOf(full));
  });
});

/**
 * ⚠️ **見出しだけの版は、見出しを本文として数えること**（レビューでの指摘・P2・3度目）。
 *
 * 生成側は `description || body` と書いているので、**見出しを外すと空になる版**では
 * **見出しを含む丸ごと**が本文になります。ここで 0 を返すと、
 * **見出しだけの長い要約**が「本文 0 文字」として検査を通り、
 * 画面では全文に勝って**アーカイブの全文が消えます**。
 */
describe('descriptionLengthOf — 見出しだけのとき', () => {
  it('見出しを外すと空になるなら、見出しを含めて数える', () => {
    expect(descriptionLengthOf('v9.9.9 — **あいうえお**')).toBe(9); // ** + 5 + **
  });

  /**
   * ⚠️ **これが反証。** 見出しだけの英数字 6,000 文字の要約は、
   * 落とし方を合わせないと「本文 0 文字」として素通りし、
   * 画面では 6,004 文字として日本語 5,000 文字の全文に勝ちます。
   */
  it('見出しだけの長い要約が全文に勝つ組み合わせを見分けられる', () => {
    const full = `v9.9.9 — **み**。${'あ'.repeat(5000)}`;
    const summary = `v9.9.9 — **${'a'.repeat(6000)}**`;

    // 落とし方を合わせないと 0 になり、素通りしてしまう
    expect(descriptionLengthOf(summary)).toBe(6004);

    // 画面の物差しでは要約のほうが長い ＝ 全文が消える組み合わせ
    expect(descriptionLengthOf(summary)).toBeGreaterThan(descriptionLengthOf(full));
  });

  it('見出しのあとの句点が2つでも、生成側と同じく丸ごとを本文にする', () => {
    const summary = `v9.9.9 — **${'a'.repeat(6000)}**。。`;
    // 句点を1つしか落とさない実装なら 1（残った「。」）になる
    expect(descriptionLengthOf(summary)).toBe(6006);
  });
});

/**
 * ⚠️ **歴史的な閉じ括弧（`)`）を経由していない版**（レビューでの指摘・P2・6度目）。
 *
 * `parseEntries` は `stripOuterWrap` で**開き括弧の無い末尾の `)`** を先に落とします
 * （「現在のバージョン」欄の値がのちに historical 化されるとき、前もって閉じ括弧だけ
 * 付いていることがある、という歴史的な形）。**この正規化を経由しないまま見出しを
 * 切り出すと、末尾の `)` が本文に混ざって「本文1文字」と誤判定**し、
 * 見出しを長くするだけで検査を素通りできます。
 */
describe('descriptionLengthOf — 歴史的な閉じ括弧を正しく外す', () => {
  it('末尾の閉じ括弧だけの行から、括弧を外して見出しを本文として数える', () => {
    // 開き括弧が無いのに閉じ括弧だけ付いている歴史的な形
    expect(descriptionLengthOf('v9.9.9 — **あいうえお**)')).toBe(9);
  });

  /**
   * ⚠️ **これが反証。** 括弧を外さない実装だと、末尾の `)` が本文に残って
   * 「本文1文字」（`)` そのもの）になり、見出しをいくら長くしても検査を素通りする。
   */
  it('括弧を外さないと素通りしてしまう組み合わせを見分けられる', () => {
    const full = `v9.9.9 — **み**。${'あ'.repeat(5000)}`;
    const summary = `v9.9.9 — **${'a'.repeat(6000)}**)`;

    // 括弧を外さない実装なら 1（残った「)」）になり、全文よりずっと短く見える
    expect(descriptionLengthOf(summary)).toBe(6004);

    // 実際には見出しごと本文として画面に採られるので、全文より長い
    expect(descriptionLengthOf(summary)).toBeGreaterThan(descriptionLengthOf(full));
  });

  /** アーカイブの形（開き括弧つき）も同じように扱う */
  it('開き括弧つきの行（アーカイブの形）も同じ長さになる', () => {
    const plain = 'v9.9.9 — **みだし**。あいう';
    const archived = '(v9.9.9 — **みだし**。あいう)';
    expect(descriptionLengthOf(archived)).toBe(descriptionLengthOf(plain));
  });
});

/**
 * ⚠️ **生成側の `parseVersionLine` と本当に同じ関数を呼んでいること。**
 *
 * 数え方を手で一部だけ写す形をやめ、`generate-version-history.mjs` の
 * `parseVersionLine`（1行から version・title・description を取り出す唯一の入口）を
 * そのまま呼ぶ構造にしました。**写しが1つも無い**ことを、生成側の出力と
 * 直接突き合わせて固定します（生成側の切り出し方が変わっても、ここは自動で追従します）。
 */
describe('descriptionLengthOf — 生成側の parseVersionLine と完全に一致する', () => {
  it('さまざまな版の行で、生成側が返す description と同じ長さになる', () => {
    const lines = [
      'v9.9.9 — **みだし**。あいうえお',
      'v9.9.9 — **みだし**あいうえお',
      'v9.9.9 — **みだしだけ**',
      'v9.9.9 — **みだし**。。あいう',
      'v9.9.9 — 太字で始まらない本文です。つづき',
      'v9.9.9 — **みだしだけ**)',
      '(v9.9.9 — **みだし**。あいう)',
    ];
    for (const line of lines) {
      const parsed = parseVersionLine(line);
      expect(parsed).not.toBeNull();
      expect(descriptionLengthOf(line)).toBe(parsed.description.length);
    }
  });

  /** 版の行の形に一致しない入力は、素の長さで代用する（0 を返して安全と誤解させない） */
  it('版の行の形でない入力は素の長さで代用する', () => {
    expect(parseVersionLine('見出し外の雑記です')).toBeNull();
    expect(descriptionLengthOf('見出し外の雑記です')).toBe('見出し外の雑記です'.length);
  });
});
