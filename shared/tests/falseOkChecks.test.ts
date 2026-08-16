/**
 * **検査そのものが「大丈夫」と嘘をつかないか**（Codex のレビュー #126・#128・#130）
 *
 * ── なぜまとめて固定するか ──────────────────────────────────
 *
 * この5件は**門の側**の穴です。壊れているものを通すだけでなく、
 * **「見ました・大丈夫でした」と言う**ので、**誰も調べに行きません**。
 * 直したあとも、緩めるのは1行で済みます（`fetch-depth` を外す・
 * 名前だけの除外に戻す）。だから**ここで固定します**。
 *
 *  ① CI の浅い clone で `origin/main` が無く、**版の門がどの PR でも素通り**
 *  ② 下書きを**リポジトリ全体で数えて**おり、その PR が0件でも通る
 *  ③ `ONE_SIDED` を**名前だけ**で除外し、書いてある側に在るか見ない
 *  ④ BOX が `appAuth` を見ず、**壊れた設定ほど「つながっています」**
 *  ⑤ 途中で切れた woff2 が、**印と最小サイズを満たすので通る**
 *
 * ── 実測（この作業中に測ったもの）────────────────────────────
 *
 * ④ `appAuth` を丸ごと落とした設定で、**前の版は
 *    `[box] BOX client initialized` と出して `isBoxConfigured() = true`**。
 *    直した版は `BOX_CONFIG_JSON is incomplete: appAuth.publicKeyID, …` で false。
 *
 * ⑤ 8,252 バイトの断片を**末尾 100 バイトだけ落とす**と（印は残り、
 *    最小サイズも超える）**前の版は OK**。直した版は
 *    「頭には 8252 バイトと書いてあるのに 8152 バイトしかない」で止まる。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const CI_YML = read('.github/workflows/ci.yml');
const CHANGELOG = read('scripts/check-changelog.mjs');
const ENVPASS = read('scripts/check-env-passthrough.mjs');
const FONTS = read('scripts/vendor-fonts.mjs');
const BOX = read('server/src/shared/services/box.ts');

// ───────────────────────────────────────────────────────
// ① 版の門が動く状態にあるか
// ───────────────────────────────────────────────────────

describe('① 版の門は、比べる相手がある状態で走る', () => {
  it('checks ジョブの checkout が全履歴を取る', () => {
    /*
     * ⚠️ **ここを外すと門ごと黙ります。** 既定の浅い clone は PR の
     * マージ ref を1コミットしか持ってこないので `origin/main` が無く、
     * `check-changelog.mjs` は比べる相手を作れません。
     */
    const checks = CI_YML.slice(CI_YML.indexOf('  checks:'), CI_YML.indexOf('  build:'));
    expect(checks).toMatch(/uses: actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth: 0/);
  });

  it('CI では「読めないので飛ばす」を許さない', () => {
    expect(CHANGELOG).toMatch(/process\.env\.CI === 'true'/);
    // 比べる相手が無いとき、CI なら 1 で止める
    expect(CHANGELOG).toMatch(/if \(!base\) \{[\s\S]*?if \(inCI\) \{[\s\S]*?process\.exit\(1\)/);
  });

  it('GitHub が渡す PR の base を先に使う（main 以外を base にした PR でも動く）', () => {
    expect(CHANGELOG).toMatch(/GITHUB_BASE_REF/);
  });

  it('手元では今までどおり飛ばす（枝を切った直後に止めない）', () => {
    expect(CHANGELOG).toMatch(/手元なので止めません/);
  });
});

// ───────────────────────────────────────────────────────
// ② 下書きを置いたかを、その PR について見る
// ───────────────────────────────────────────────────────

describe('② 下書きは「この PR が足したもの」を数える', () => {
  it('足したものだけを見る（リポジトリ全体の数で判定しない）', () => {
    expect(CHANGELOG).toMatch(/--diff-filter=A/);
    expect(CHANGELOG).toMatch(/function addedNotes\(\)/);
  });

  it('まだ git add していないものも拾う（手元で「書いたのに怒られる」を作らない）', () => {
    expect(CHANGELOG).toMatch(/ls-files', '--others', '--exclude-standard/);
  });

  it('0 件なら止める', () => {
    expect(CHANGELOG).toMatch(/if \(touched && added\.length === 0\)[\s\S]*?process\.exit\(1\)/);
  });

  it('base と何も違わないときは要求しない（main の上で lint を回すだけで落ちない）', () => {
    expect(CHANGELOG).toMatch(/const touched = changed\.length > 0;/);
  });

  it('2 つ以上は止めずに警告（枝を取り込み直した回に直しようがなくなる）', () => {
    expect(CHANGELOG).toMatch(/if \(added\.length > 1\)[\s\S]*?console\.warn/);
    expect(CHANGELOG).not.toMatch(/added\.length > 1[\s\S]{0,400}?process\.exit\(1\)/);
  });
});

// ───────────────────────────────────────────────────────
// ③ 片方だけに渡す変数を、書いてあるとおりに見る
// ───────────────────────────────────────────────────────

describe('③ ONE_SIDED は名前だけで素通りさせない', () => {
  it('理由文から「どちらのサービスか」を読み取って突き合わせる', () => {
    expect(ENVPASS).toMatch(/\/\^\(app_prod\|app_dev\)\\b\/\.exec\(why\)/);
  });

  it('書いてある側に在ることを見る（消しても通る状態にしない）', () => {
    expect(ENVPASS).toMatch(/!byService\.get\(declared\)\.has\(name\)/);
  });

  it('反対側に無いことも見る（検証から本物のメール・SMS を飛ばさない）', () => {
    expect(ENVPASS).toMatch(/byService\.get\(other\)\.has\(name\)/);
  });

  it('理由文の形が違えば、それ自体を止める（読み取れないものを黙って通さない）', () => {
    expect(ENVPASS).toMatch(/理由が「app_prod — 」「app_dev — 」で始まっていません/);
  });

  it('一覧の理由文がすべて app_prod / app_dev で始まっている', () => {
    // 上の検査が効くための前提。ここが崩れると `npm run lint` が止まる
    const block = ENVPASS.slice(ENVPASS.indexOf('const ONE_SIDED = {'), ENVPASS.indexOf('/** そのサービスの'));
    const values = [...block.matchAll(/^\s{2}([A-Z0-9_]+):\s*'([^']*)'/gm)];
    expect(values.length).toBeGreaterThan(5);
    for (const [, name, why] of values) {
      expect(`${name}: ${why}`).toMatch(/: (app_prod|app_dev) /);
    }
  });
});

// ───────────────────────────────────────────────────────
// ④ BOX は「使えるか」まで見る
// ───────────────────────────────────────────────────────

describe('④ BOX は JWT の鍵まで見てから「つながっています」と言う', () => {
  it('appAuth の3つを見る', () => {
    expect(BOX).toMatch(/appAuth\.publicKeyID/);
    expect(BOX).toMatch(/appAuth\.privateKey/);
    expect(BOX).toMatch(/appAuth\.passphrase/);
  });

  it('秘密鍵が PEM の形かも見る（1行 JSON の貼り付けで欠ける）', () => {
    expect(BOX).toMatch(/includes\('PRIVATE KEY'\)/);
  });

  it('欠けていたら null を返す（クライアントを作れることを「使える」と読まない）', () => {
    expect(BOX).toMatch(/BOX_CONFIG_JSON is incomplete[\s\S]{0,200}?return null;/);
  });

  it('型は全部 optional（貼り付けた文字に型の保証は無い）', () => {
    const iface = BOX.slice(BOX.indexOf('interface BoxConfigJson'), BOX.indexOf('let cachedClient'));
    // 必須（`?` の無い）フィールドが1つも無いこと
    expect(iface).not.toMatch(/^\s+(clientID|clientSecret|publicKeyID|privateKey|passphrase|appAuth):/m);
  });
});

// ───────────────────────────────────────────────────────
// ⑤ 途中で切れた woff2 を通さない
// ───────────────────────────────────────────────────────

describe('⑤ 書体の断片は、頭に書いてある大きさと突き合わせる', () => {
  it('WOFF2 の頭の length（8〜11 バイト目）を読んで実サイズと比べる', () => {
    expect(FONTS).toMatch(/readUInt32BE\(8\)/);
    expect(FONTS).toMatch(/declared !== size/);
  });

  it('最小サイズと印だけで通していない', () => {
    // 最小サイズの門は残す（0 バイトを分かりやすく断るため）が、それだけにしない
    expect(FONTS).toMatch(/MIN_WOFF2_BYTES/);
    expect(FONTS).toMatch(/途中で切れている/);
  });

  it('頭が 12 バイト読めないものも断る', () => {
    expect(FONTS).toMatch(/read < 12/);
  });

  it('反証: 前の版の規則（200 バイト以上 かつ 先頭が wOF2）は途中切れを通す', () => {
    // 実際の壊れ方を作って、2つの規則を突き合わせる
    const body = Buffer.alloc(8252);
    body.write('wOF2', 0, 'latin1');
    body.writeUInt32BE(8252, 8);            // 頭には 8252 バイトと書いてある
    const cut = body.subarray(0, 8152);     // 末尾 100 バイトが届かなかった

    const oldRule = cut.length >= 200 && cut.toString('latin1', 0, 4) === 'wOF2';
    const newRule = cut.readUInt32BE(8) === cut.length;

    expect(oldRule).toBe(true);    // ← 前の版は「OK」と言っていた
    expect(newRule).toBe(false);   // ← いまは止まる
  });
});
