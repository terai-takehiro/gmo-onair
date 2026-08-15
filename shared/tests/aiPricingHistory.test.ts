/**
 * **単価を書き替えると過去の金額も変わる**（AI の使用量）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `ai_usage` に残しているのは**トークン数と録音の秒数だけ**で、呼んだ当時の
 * 値段は残していません。金額は**読むときに**いまの `AI_PRICING_JSON` を掛けて出します。
 * つまり:
 *
 * ・単価を書き替えると、**先月・先々月の金額も新しい単価で計算し直されます**。
 *   `.env.example` は「値は公開ページで確認して入れること」と言うだけだったので、
 *   **手順どおりにやると過去の費用が変わります**
 * ・モデルを乗り換えて古い鍵を落とすと、**そのぶんが合計から静かに消えます**。
 *   総額が下がるので「安くなった」と読めてしまいます
 *
 * **実測**（実 Postgres ＋ 実サーバー ＋ 実ブラウザ）: 4 モデルのうち
 * いちばん量の多い `gpt-5.4-old`（入力 90 万・出力 40 万）の鍵を落とすと、
 * その行は `cost_usd: null` になり、**合計 $3.08 に1セントも入りません**。
 * 前の版の画面は「（単価を入れていないモデルは合計に含めていません）」とだけ書き、
 * **どのモデルが落ちているかは出していませんでした**。
 *
 * v4 の PR で指摘された形です（#98）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ENV = read('.env.example');
const CARD = read('client', 'src', 'contexts', 'platform', 'pages', 'settings', 'AiUsageCard.tsx');
const USAGE = read('server', 'src', 'shared', 'services', 'ai-usage.service.ts');

describe('.env.example が「過去も変わる」と言う', () => {
  it('単価は読むときに掛けていると書いてある', () => {
    expect(ENV).toMatch(/単価は「読むときに」掛けている。過去の金額も一緒に変わる/);
  });

  it('⚠️ 差し替えではなく足すこと、と書いてある', () => {
    // 古い鍵を落とすと、そのモデルのぶんが**合計から静かに消える**
    expect(ENV).toMatch(/差し替えるのではなく「足す」こと/);
    expect(ENV).toMatch(/使わなくなったモデルの単価も\*\*残しておく\*\*/);
  });
});

describe('画面が「いまの単価で出した」と言い、落ちたモデルを名前で出す', () => {
  it('いつの単価かを書く', () => {
    // 書かないと「先月いくらだったか」の記録だと読まれる
    expect(CARD).toMatch(/いま設定してある単価/);
    expect(CARD).toMatch(/単価を変えると過去の金額も変わります/);
  });

  it('⚠️ 単価の無いモデルを名前で出す（「一部は出せません」で終わらせない）', () => {
    // どのモデルが落ちているか分からないと、鍵を落としたことに気づけない
    expect(CARD).toMatch(/const unpriced = \[\.\.\.new Set\(rows\.filter\(\(r\) => r\.cost_usd === null\)/);
    expect(CARD).toMatch(/\{unpriced\.join\('・'\)\}/);
    expect(CARD).toMatch(/単価を入れていない \{unpriced\.length\} 個のモデルは合計に含めていません/);
  });

  it('モデル名が無い行も数から漏らさない', () => {
    expect(CARD).toMatch(/r\.model \?\? '（モデル名なし）'/);
  });
});

describe('サーバーの数え方は変えていない', () => {
  it('単価の分かるものだけ足す（0 として混ぜない）', () => {
    expect(USAGE).toMatch(/const known = withCost\.filter\(\(r\) => r\.cost_usd !== null\);/);
    expect(USAGE).toMatch(/total_cost_usd: known\.length \? known\.reduce/);
  });

  it('単価が無いモデルは null（0 と区別する）', () => {
    expect(USAGE).toMatch(/if \(!p\) return null;/);
  });
});
