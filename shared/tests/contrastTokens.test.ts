/**
 * **淡い帯の上に「塗りの上の文字色」を載せると、文字はあるのに読めない**
 *
 * ── 何が起きていたか ────────────────────────────────────────
 *
 * `tokens.css` の接尾辞の文法（`shared/CLAUDE.md`）では
 *
 *   --<s>              塗りの色
 *   --<s>-foreground   **塗りの上に載る**文字の色  ← 明るい配色では **白**
 *   --<s>-surface      帯の背景                     ← **淡い面**（#fff7ed）
 *
 * なので `bg-warning-surface` に `text-warning-foreground` を当てると
 * **白地に白**になります。利用者から「黄色の囲いの文字が白くて読めない」と
 * 指摘されたのがこれで、探すと **6画面7か所**ありました。
 *
 * ⚠️ **型検査にも eslint にも出ません。** どちらも実在するクラス名で、
 * 名前は1文字違い（`text-warning` / `text-warning-foreground`）です。
 * `verify:ui` の「薄すぎる文字」は実ブラウザで拾えますが、
 * **開いていないダイアログの中は測れません** — 7か所のうち5か所が
 * ダイアログの中の注意書きでした（＝押す前にいちばん読んでほしい文）。
 *
 * ── 実測（この試験が固定している数） ───────────────────────
 *
 * | 前景 | 背景 (`--warning-surface` #fff7ed) | 比 | |
 * | --- | --- | --- | --- |
 * | `--warning-foreground` #ffffff | 淡い帯 | **1.07:1** | 読めない |
 * | `--warning` #c2410e（v4） | 淡い帯 | **4.88:1** | AA |
 *
 * 反証: `scripts/check-contrast-tokens.mjs` から `-surface` の除外を外すと
 * 淡い面を塗りと数えてしまい、この形を**素通し**します。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const TOKENS = read('shared', 'src', 'client', 'tokens.css');
const TOKENS_V4 = read('shared', 'src', 'client', 'tokens-v4.css');
const SCRIPT = read('scripts', 'check-contrast-tokens.mjs');

/**
 * `--name: r g b;` を拾う（明るい配色 = `.dark` の**規則**より前だけ）。
 *
 * ⚠️ 素の `indexOf('.dark')` で切らないこと — `tokens.css` の**注釈**に
 * 「暗い配色 (`.dark`) の値は作っていない」と書いてあり、そこに当たって
 * **`--warning-surface` より手前で切れます**（実際に踏んだ）。行頭で探す。
 */
function rgb(css: string, name: string): [number, number, number] {
  const at = css.search(/^\.dark\s*\{/m);
  const light = at >= 0 ? css.slice(0, at) : css;
  const m = light.match(new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`));
  if (!m) throw new Error(`${name} が見つかりません`);
  return [+m[1], +m[2], +m[3]];
}

const lin = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]: [number, number, number]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('「塗りの上の文字色」は淡い帯の上では読めない', () => {
  it('⚠️ 前提: `-foreground` は明るい配色で白', () => {
    // ここが白でなくなったら、この試験の前提ごと見直すこと
    for (const s of ['warning', 'success', 'info', 'destructive', 'primary']) {
      expect(rgb(TOKENS, `${s}-foreground`)).toEqual([255, 255, 255]);
    }
  });

  it('白を淡い帯に載せると読めない（1.1:1 を下回る）', () => {
    const white = rgb(TOKENS, 'warning-foreground');
    const surface = rgb(TOKENS, 'warning-surface');
    expect(ratio(white, surface)).toBeLessThan(1.1);
  });

  it('直し先（`text-warning`）は淡い帯の上で AA を満たす', () => {
    // v4 の3アプリは `tokens-v4.css` が `--warning` を #c2410e に上書きしている
    const warn = rgb(TOKENS_V4, 'warning');
    const surface = rgb(TOKENS, 'warning-surface');
    expect(ratio(warn, surface)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('直した7か所が戻っていない', () => {
  // 利用者の指摘（案件分類の確認ダイアログ）と、同じ形で見つかった残り
  const FIXED = [
    'client/src/contexts/sales/pages/projectForm/dialogs/CategorySwitchDialog.tsx',
    'client/src/contexts/sales/pages/projectForm/dialogs/RelinkDialog.tsx',
    'client/src/contexts/platform/pages/notify/TemplateDialog.tsx',
    'client/src/contexts/platform/pages/notify/NotifyPage.tsx',
    'client/src/contexts/platform/pages/hours/ClosedDayDialog.tsx',
    'client/src/contexts/platform/pages/members/RoleDialog.tsx',
  ];
  for (const f of FIXED) {
    it(f.split('/').pop()!, () => {
      expect(read(...f.split('/'))).not.toMatch(/text-warning-foreground/);
    });
  }
});

describe('検査そのものが機能する形になっている', () => {
  it('`npm run lint` から呼ばれている', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.lint).toContain('check-contrast-tokens.mjs');
  });

  it('白かどうかは tokens.css から読む（コードに焼き込まない）', () => {
    expect(SCRIPT).toContain('tokens.css');
    expect(SCRIPT).toMatch(/lum\s*>\s*0\.5/);
  });
});

/**
 * **検査を実際に走らせて確かめる**（レビュー #159・Codex の2件）。
 *
 * 字面を読むだけの試験だと、書き方を変えたときに**通ってしまう**。
 * 仕込みのファイルを作って `node scripts/…` を回し、**止まるか通るか**で見る。
 * 仕込みは一時ディレクトリに置く（`client/src` に置くと失敗した回に消し残る）。
 */
describe('反証: 読めない書き方で実際に止まるか', () => {
  const run = (files: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), 'contrast-'));
    try {
      for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
      const r = spawnSync('node', [join(ROOT, 'scripts/check-contrast-tokens.mjs'), dir], { encoding: 'utf8' });
      return { code: r.status, out: r.stdout + r.stderr };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('素の「淡い帯 ＋ 白い文字」で止まる', () => {
    const r = run({ 'a.tsx': '<div className="bg-warning-surface text-warning-foreground">x</div>' });
    expect(r.code).toBe(1);
  });

  it('⚠️ `.ts` の**クラス地図**でも止まる（Codex ①）', () => {
    // この製品はクラス名を .ts の地図に置く形が多い（hoursTypes.ts / state.ts …）。
    // `.tsx` だけ見ていると、地図に1行足すだけで画面に出るのに検査は OK と言う
    const r = run({ 'm.ts': "export const T = { late: 'bg-warning-surface text-warning-foreground' };" });
    expect(r.code).toBe(1);
  });

  it('⚠️ `hover:` だけの塗りは塗りと数えない（Codex ②）', () => {
    // 押していないときは淡い帯のまま = ふだんは読めない
    const r = run({ 'a.tsx': '<div className="bg-warning-surface text-warning-foreground hover:bg-warning">x</div>' });
    expect(r.code).toBe(1);
  });

  it('⚠️ 半透明（`/10`）の塗りは塗りと数えない（Codex ②）', () => {
    const r = run({ 'a.tsx': '<div className="bg-warning/10 text-warning-foreground">x</div>' });
    expect(r.code).toBe(1);
  });

  it('本物の塗りの上なら通る', () => {
    const r = run({ 'a.tsx': '<div className="bg-warning text-warning-foreground">x</div>' });
    expect(r.code).toBe(0);
  });

  it('⚠️ `/100` は不透明なので通る（Codex ③・締めすぎの害）', () => {
    // `bg-warning/100` は `bg-warning` と同じ。撥ねると lint が落ちて何も進められない
    const r = run({ 'a.tsx': '<div className="bg-warning/100 text-warning-foreground">x</div>' });
    expect(r.code).toBe(0);
  });

  it('`/100` を通しても、半透明は撥ねたまま', () => {
    // `/100` を通す書き方にしたせいで `/10` まで通ってしまわないこと
    for (const cls of ['bg-warning/10', 'bg-warning/50', 'bg-warning/1000']) {
      const r = run({ 'a.tsx': `<div className="${cls} text-warning-foreground">x</div>` });
      expect(r.code, cls).toBe(1);
    }
  });

  it('濃い段（`bg-primary-800`）も塗りとして通る', () => {
    const r = run({ 'a.tsx': '<div className="bg-primary-800 text-primary-foreground">x</div>' });
    expect(r.code).toBe(0);
  });

  it('塗りが**親のタグ**にあるときは通る（チェックの四角）', () => {
    const r = run({
      'a.tsx': '<span className="bg-success">\n  <Check className="text-success-foreground" />\n</span>',
    });
    expect(r.code).toBe(0);
  });

  it('条件つきでも、文字色と塗りが**同じ条件**なら通る', () => {
    // `data-[state=checked]:` の2つは必ず一緒に効くので白が淡い面に載ることはない
    const r = run({
      'a.tsx': '<div className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground" />',
    });
    expect(r.code).toBe(0);
  });
});
