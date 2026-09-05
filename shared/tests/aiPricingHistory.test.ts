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

/**
 * ⚠️ **「出せない理由」が2つあるのに、片方の言葉しか書いていなかった**
 * （#98 を直しているときに実測して見つけたもの）。
 *
 * `usdPerRow` が `null` になるのは ①単価そのものが入っていない ②単価は入っているが
 * **この仕事の実績がまだ無い**（新しい環境・初めて流すとき）の2通りです。
 * 前の版はどちらも「単価が未設定です」と書いていたので、②の人は `.env` を直しに行き、
 * **すでに入っている**のを見て途方に暮れます。
 *
 * **実測**（実ブラウザ）: 単価を入れて実績が無いとき
 * 「費用の目安はまだ出せません（この仕事の実績がまだ無いためです）」／
 * 単価が無いとき「費用の目安は出せません（AI の単価をまだ設定していません）」
 * （2026-09-05 に変数名を画面から外した。理由の書き分けは3通りのまま）。
 */
describe('費用の目安が出せない理由を書き分ける', () => {
  const FORMAT_CARD = read('client', 'src', 'contexts', 'platform', 'pages', 'settings', 'ActivityFormatCard.tsx');
  const FORMAT_SVC = read('server', 'src', 'contexts', 'sales', 'services', 'activity-format.service.ts');
  const SHORT_SVC = read('server', 'src', 'contexts', 'sales', 'services', 'next-action-short.service.ts');

  const USAGE_SVC = read('server', 'src', 'shared', 'services', 'ai-usage.service.ts');

  it('数え方は1か所（2つの仕事が同じ関数を呼ぶ）', () => {
    // 書き写すと、片方だけ直した日に「同じ理由なのに文言が違う」が起きる
    expect(USAGE_SVC).toMatch(/export async function perRowCost\(kind: string, days = 90\): Promise<PerRowCost>/);
    expect(FORMAT_SVC).toMatch(/const cost = await perRowCost\('activity'\);/);
    expect(SHORT_SVC).toMatch(/const cost = await perRowCost\('activity_short'\);/);
    for (const svc of [FORMAT_SVC, SHORT_SVC]) {
      expect(svc).toMatch(/costReason: CostReason;/);
      expect(svc).toMatch(/costReason: cost\.reason,/);
      expect(svc).toMatch(/unpricedModels: cost\.unpricedModels,/);
    }
  });

  /**
   * ⚠️ **この PR のレビューで指摘された P2**。鍵が1つでもあれば「単価はある」と
   * 見なすと、**`whisper-1` しか入っていない環境**や**モデルを乗り換えて古い鍵を
   * 落とした環境**で「実績がまだありません」と出ます。実績はあるので
   * **待っても永久に出ません** — 直すのは単価の側です。
   * **実測**（実ブラウザ）: `whisper-1` だけ入れた環境で
   * 「費用の目安は出せません（gpt-5.6-luna の単価が入っていません）」。
   */
  it('⚠️ 「実績が無い」と「そのモデルの単価が無い」を分ける', () => {
    expect(USAGE_SVC).toMatch(/'ok' \| 'no_pricing' \| 'no_history' \| 'no_model_price'/);
    expect(USAGE_SVC).toMatch(/if \(priced\.length === 0\) \{/);
    expect(USAGE_SVC).toMatch(/reason: 'no_model_price',/);
    // どの鍵を足せばよいか分からないと、理由だけ分かっても直せない
    expect(USAGE_SVC).toMatch(/unpricedModels: \[\.\.\.new Set\(rows\.map\(\(r\) => r\.model \?\? '（モデル名なし）'\)\)\]/);
  });

  it('画面は理由を1か所で決め、3通りとも書く', () => {
    expect(FORMAT_CARD).toMatch(/function noCostReason\(s: Pick<Status, 'costReason' \| 'unpricedModels'>\): string/);
    // 2026-09-05: 変数名 `AI_PRICING_JSON` は画面から外した（`docs/wording.md` ルール5・
    // `scripts/check-ui-tokens.mjs` の `forbidden-wording`）。**3通り書き分けること自体は変えていない**
    expect(FORMAT_CARD).toMatch(/AI の単価をまだ設定していません/);
    expect(FORMAT_CARD).toMatch(/の単価が入っていません/);
    expect(FORMAT_CARD).toMatch(/この仕事の実績がまだ無いためです/);
  });

  it('2か所とも同じ関数を通す（片方だけ直らないように）', () => {
    expect((FORMAT_CARD.match(/noCostReason\(s\)/g) ?? []).length).toBe(2);
  });
});

