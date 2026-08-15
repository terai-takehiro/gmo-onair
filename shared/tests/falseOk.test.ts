/**
 * **壊れているのに「大丈夫」と出る**のを止める
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 検査が通ってしまうと、**壊れていることを誰も知りません**:
 *
 * ・設定画面の BOX は、**環境変数が空でなければ「つながっています」**でした。
 *   `BOX_CONFIG_JSON` は1行に潰した JSON なので**貼り付けで欠けるのが普通**に起き、
 *   欠けていると `box.ts` はクライアントを作りません（＝BOX は全部落ちる）。
 *   **壊れた設定ほど「大丈夫」と出て**、フォルダが作られない理由を追えませんでした
 * ・書体の同梱の検査は **woff2 が1つ以上あるか**しか見ていませんでした。
 *   取得が途中で切れた1つ・プロキシのエラーページが `.woff2` として保存された1つ・
 *   CSS が参照しているのに無い1つ、どれも通ります。壊れると
 *   **その `unicode-range` の文字だけ**が代替書体になり、画面では気づけません
 * ・`shared` の参照の検査は、**引用符が `"` だと「alias が無い」と嘘の理由**を出しました
 *
 * v4 の PR で指摘された形です（#76 / #84 / #39）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
/** 説明文を外してから探す（前の版の形を注釈に残す決めごとのため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('BOX は「使えるか」で判定する', () => {
  const src = code(read('server', 'src', 'contexts', 'platform', 'routes', 'integrations.routes.ts'));

  it('環境変数が入っているかではなく、クライアントが作れるかを見る', () => {
    expect(src).toMatch(/ok: isBoxConfigured\(\)/);
    // 前の版は `has('BOX_CONFIG_JSON')`（空でなければ OK）だった
    expect(src).not.toMatch(/ok: has\('BOX_CONFIG_JSON'\)/);
  });

  it('「壊れている」と「入れていない」を分けて出す（次にやることが違う）', () => {
    expect(src).toMatch(/!isBoxConfigured\(\) && has\('BOX_CONFIG_JSON'\)/);
    expect(src).toMatch(/読み取れません/);
  });
});

describe('書体は断片1つの壊れも見つける', () => {
  const src = code(read('scripts', 'vendor-fonts.mjs'));

  it('CSS が参照しているファイルを1つずつ当たる', () => {
    expect(src).toMatch(/matchAll\(\/url\\\(\(\[\^\)\]\+\)\\\)\/g\)/);
    expect(src).toMatch(/CSS が参照しているのに無い/);
  });

  it('中身が woff2 であることまで見る（エラーページを保存していないか）', () => {
    expect(src).toMatch(/'wOF2'/);
    expect(src).toMatch(/const MIN_WOFF2_BYTES = 200;/);
  });
});

describe('shared の参照の検査は引用符を選ばない', () => {
  it('`\'` でも `"` でも読む', () => {
    const src = read('scripts', 'check-shared-wiring.mjs');
    // 前の版は `'` のときしか当たらず、`"` の設定では
    // **「alias が無い」という嘘の理由**で落ちていた（実測で確認）
    expect(src).toMatch(/\['"\]\$\{PKG\}\['"\]/);
  });
});
