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
 */
describe('descriptionLengthOf — 画面が数える本文の長さ', () => {
  /** 生成側は先頭の太字を見出しとして切り出し、本文からは外す */
  it('先頭の太字と直後の句点を本文に数えない', () => {
    expect(descriptionLengthOf('**みだし**。あいう')).toBe(3);
  });

  it('太字で始まらないときは丸ごと本文', () => {
    expect(descriptionLengthOf('あいうえお')).toBe(5);
  });

  /**
   * ⚠️ **これが反証。** バイトで比べていると通ってしまう組み合わせ。
   * 日本語 5,000 文字 = 15,000 バイト（上限超え）に対し、
   * 英数字 11,000 文字 = 11,000 バイト（上限内）。
   * **バイトなら要約のほうが小さいのに、文字数では倍以上長い。**
   */
  it('バイト数と文字数で大小が逆転する組み合わせを見分けられる', () => {
    const full = `**み**。${'あ'.repeat(5000)}`;
    const summary = `**s**。${'a'.repeat(11000)}`;

    // バイトで比べると「要約のほうが小さい」＝ 上限の検査は通ってしまう
    expect(Buffer.byteLength(summary, 'utf8')).toBeLessThan(Buffer.byteLength(full, 'utf8'));

    // 文字数（＝画面の物差し）で比べると要約のほうが長い ＝ 全文が消える組み合わせ
    expect(descriptionLengthOf(summary)).toBeGreaterThan(descriptionLengthOf(full));
  });

  /** ふつうの要約は全文よりずっと短い（止められない） */
  it('ふつうの組み合わせでは要約のほうが短い', () => {
    const full = `**み**。${'あ'.repeat(5000)}`;
    const summary = buildSummaryBody(['あああ', 'いいい']);
    expect(descriptionLengthOf(summary)).toBeLessThan(descriptionLengthOf(full));
  });
});

/**
 * ⚠️ **版の行（`vX.Y.Z — …`）で渡しても本文だけを数えること**（レビューでの指摘・P2・2度目）。
 *
 * 呼ぶ側が持っているのは版の行です。前置きを外さないと `^**` に当たらないので、
 * **見出しごと本文として数え**、比べているのは**行まるごとの長さ**になります。
 * ⚠️ **見出しの長さが違うと逆転します** — 下の反証がその組み合わせです。
 */
describe('descriptionLengthOf — 版の行で渡されても本文だけを数える', () => {
  it('`vX.Y.Z — ` の前置きを外す', () => {
    expect(descriptionLengthOf('v4.1.3 — **みだし**。あいう')).toBe(3);
    expect(descriptionLengthOf('**みだし**。あいう')).toBe(3);
  });

  /**
   * ⚠️ **これが反証。** 全文の見出しだけを長くすると、
   * **行の長さでは全文のほうが長い**のに **本文では要約のほうが長い**。
   * 前置きを外さない実装だと**素通り**し、画面から全文が消えます。
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
