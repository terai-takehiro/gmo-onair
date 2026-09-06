/**
 * **本番の MCP と検証の MCP は違う名前を名乗る**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 検証環境にも同じ MCP が立っている（`https://dev.gmo-onair.jp/api/v1/mcp`）のに、
 * **どちらも `gmo-onair` と名乗っていました**。コネクタを2本つなぐと
 * **見分けの付かない同名の口が2つ**並び、呼ぶ側は
 * **検証のつもりで本番に書けてしまいます**。
 *
 * ⚠️ **これは画面にも型にも lint にも出ません。** 気づけるのは
 * 「返ってきたデータが実在の社員だった」ときだけで、
 * **書いたあとにしか分かりません**（会社の決めごとの最上位である
 * 「本番と検証は絶対に干渉させない」に正面からぶつかる）。
 *
 * だから**名乗りの分岐そのもの**を機械に見させます。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SERVER = readFileSync(
  join(ROOT, 'server', 'src', 'contexts', 'mcp', 'server.ts'), 'utf8',
);

describe('MCP は環境を名乗る', () => {
  it('本番は gmo-onair・検証は gmo-onair-dev', () => {
    expect(SERVER).toMatch(/name: isProd \? 'gmo-onair' : 'gmo-onair-dev'/);
    // 判定は config（`NODE_ENV`）。docker-compose は app_prod に production・
    // app_dev に development を渡している
    expect(SERVER).toMatch(/const isProd = config\.isProduction/);
    // 名前を1つに戻していないか（戻すと2本つないだとき区別できない）
    expect(SERVER).not.toMatch(/name: 'gmo-onair',/);
  });

  it('名前を見落としても気づけるように instructions にも書く', () => {
    // MCP クライアントは `instructions` をモデルに渡す。名前は一覧で
    // 見落とせるが、こちらは呼ぶ前に必ず読まれる
    expect(SERVER).toMatch(/instructions: isProd \? PROD_INSTRUCTIONS : DEV_INSTRUCTIONS/);
    expect(SERVER).toContain('検証環境');
    expect(SERVER).toContain('本番環境');
    // **どちらの文にも行き先が書いてある**（「ここは検証です」だけだと
    // 本番を触りたい人がどこへ行けばよいか分からない）
    expect(SERVER).toContain('本番のデータを見たい・直したいときは');
    expect(SERVER).toContain('試し打ちは検証環境');
  });

  it('検証と本番で DB が分かれていることを docker-compose でも保つ', () => {
    // 名乗りだけ分けても、同じ DB を見ていたら意味がない
    const compose = readFileSync(join(ROOT, 'docker-compose.yml'), 'utf8');
    expect(compose).toMatch(/app_dev:[\s\S]*?onair_dev/);
    expect(compose).toMatch(/NODE_ENV: development/);
    expect(compose).toMatch(/MCP_API_KEY: \$\{MCP_API_KEY_DEV:-\}/);
  });
});
