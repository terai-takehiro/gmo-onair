/**
 * **検査の例外が広すぎて、いちばん使う色の欠落を見逃す**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `check-tokens.mjs` は「暗い配色に定義が無いトークン」を止めますが、
 * v4 で足した一群だけは例外にしています。その例外が
 *
 *   /-surface(-weak)?$/   /-border(-strong)?$/
 *
 * と**頭を留めずに**書いてあったので、**`--surface` と `--border` そのもの**まで
 * 例外になっていました（`--border` は `-border` で終わる文字列なので当たります）。
 *
 * `--border` は**カードと行の罫線ほぼ全部**が参照する色で、暗い配色から抜けると
 * **放送中の画面（Qシートの OnAir / ランダウン）が明るい配色の罫線で描かれます**。
 * それを見逃すための検査ではありません。
 *
 * **実測**: `.dark` から `--border` を1行だけ落として `check-tokens` を回すと —
 *
 * | | 結果 |
 * | --- | --- |
 * | 前の版（頭を留めない） | **OK で通る**（暗い配色の数だけ 38 → 37 に減る） |
 * | この版 | **`--border` が暗い配色に無い` で止まる**（exit 1） |
 *
 * v4 の PR で指摘された形です（#43）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const SCRIPT = read('scripts', 'check-tokens.mjs');

/** 検査に入っている例外を、そのまま組み立て直して試す */
const STATE = 'success|warning|destructive|info|primary|ai';
const LIGHT_ONLY = [
  new RegExp(`^--(${STATE})-surface(-weak)?$`),
  new RegExp(`^--(${STATE})-border(-strong)?$`),
  /^--border-(subtle|faint|disabled)$/,
  /^--surface-subtle$/,
  /^--fg-disabled$/,
  /^--ai(-foreground)?$/,
  /^--cat-[1-8]$/,
];
const exempt = (t: string) => LIGHT_ONLY.some((re) => re.test(t));

describe('検査の例外は名前を数え上げる', () => {
  it('⚠️ いちばん使う色を例外にしない', () => {
    // 前の版はこの2つが例外になっていた（頭を留めていなかったため）
    expect(exempt('--border')).toBe(false);
    expect(exempt('--surface')).toBe(false);
    // 巻き添えになっていたもの（実害は出ていなかったが、守られていなかった）
    expect(exempt('--sidebar-border')).toBe(false);
  });

  it('v4 で足した一群は今までどおり例外', () => {
    for (const t of ['--success-surface', '--warning-border', '--primary-border-strong',
                     '--primary-surface-weak', '--ai-surface', '--border-subtle',
                     '--surface-subtle', '--fg-disabled', '--cat-3']) {
      expect(exempt(t)).toBe(true);
    }
  });

  it('検査そのものが頭を留めた形になっている', () => {
    expect(SCRIPT).toMatch(/new RegExp\(`\^--\(\$\{STATE\}\)-surface\(-weak\)\?\$`\)/);
    expect(SCRIPT).toMatch(/new RegExp\(`\^--\(\$\{STATE\}\)-border\(-strong\)\?\$`\)/);
    // 頭を留めない形が残っていないこと
    expect(SCRIPT).not.toMatch(/^\s*\/-surface\(-weak\)\?\$\/,/m);
    expect(SCRIPT).not.toMatch(/^\s*\/-border\(-strong\)\?\$\/,/m);
  });
});

describe('下タブが無いときも主アクションがホームバーに重ならない', () => {
  const SHELL = read('shared', 'src', 'client', 'shell', 'AppShell.tsx');
  it('タブが 0 本のときは差し込み口が自分で逃げる', () => {
    // 逃げを持っているのは `MobileTabs` だが、タブが 0 本だと `null` を返すので
    // **いちばん下に来るのは差し込み口**になる
    expect(SHELL).toMatch(/mobileTabs\.length === 0/);
    expect(SHELL).toMatch(/paddingBottom: 'calc\(0\.75rem \+ env\(safe-area-inset-bottom\)\)'/);
  });
});
