/**
 * **外から電話をかけたいのに、お客様の番号だけ辿り着けない**（探す）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * お客様の詳細（`/sales/customers/:id`）は当初**スマホでは PC 専用の案内に
 * 差し替わっていた**（まだ作り直していない画面だったため）。ところが
 * **仕入先は `/budget/vendors` を開けた**（「電話の前に相手を調べる」と
 * 書いて M10 で開放した5枚の1つ）。つまり**お客様だけ道が無かった**。
 *
 * 現場から「いまからかけたい」ときに要るのは**番号のひとつ**で、
 * 画面を開くことではありません。**探すの行に番号を出せば、
 * 画面を開かずに答えになります**（日常業務の「入ってきた情報」で
 * 「要約まで出せば答えになっている」としたのと同じ考え方）。
 *
 * **実測**（実 Postgres ＋ 実ブラウザ・375px）: 「グローバル」で探すと
 * **`tel:` のリンクが 2 本**・`tel:0312345678`（表示は `03-1234-5678`）・
 * **横はみ出し 0px**。
 *
 * v4 の PR で指摘された形です（#73）。
 *
 * ⚠️ **お客様の詳細を v4 で作り直し、スマホにも開放した**（2026-08・
 * v4ネイティブUI化）。それでも探すの行の番号タップは**残す** — 電話は
 * 「詳細を読みに行く」操作ではなく「いますぐかける」操作なので、開いてから
 * もう一段タップするより、行から直接 `tel:` に飛べるほうが速い。番号を押しても
 * 行の遷移を起こさない、という決めごとは開放後も変わらない。
 *
 * ⚠️ **PC / スマホで見た目のファイルが分かれた**（v4ネイティブUI監査
 * 2026-08-20・search-sales）。番号のリンクは**両方に**要る —
 * PC は `search/SearchPageDesktop.tsx`、スマホは `search/SearchCards.tsx`
 * の `CustomerResultCards`（カード化した結果セクション）が持つ。
 * 薄い親 `SearchPage.tsx` はどちらも呼ぶだけで、番号の描画そのものは持たない。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SEARCH_API = code(read('server', 'src', 'contexts', 'platform', 'routes', 'search.routes.ts'));
// PC 版とスマホ版の両方を1本にして探す（どちらかにしか無いと、そのほうが壊れていても気づけない）
const SEARCH_PAGE = code(
  read('client', 'src', 'contexts', 'platform', 'pages', 'search', 'SearchPageDesktop.tsx')
  + read('client', 'src', 'contexts', 'platform', 'pages', 'search', 'SearchCards.tsx'),
);
const PC_ONLY = read('client', 'src', 'pcOnlyScreens.ts');

describe('お客様の電話番号に辿り着ける', () => {
  it('探すの口が電話番号と担当者を返す', () => {
    // Phase 3-2a: 顧客の id 空間を companies.id に揃えたので、customers ではなく
    // companies（is_customer=TRUE・生きている customers 行がある会社に限る。
    // PR #199 P2 の2巡目）から返す
    expect(SEARCH_API).toMatch(/SELECT co\.id, co\.name, co\.short_name, co\.phone, co\.contact_name FROM companies co/);
  });

  it('行に押せる番号を出す', () => {
    expect(SEARCH_PAGE).toMatch(/href=\{`tel:\$\{c\.phone\.replace\(\/\[\^0-9\+\]\/g, ''\)\}`\}/);
  });

  it('⚠️ 番号を押しても行の遷移を起こさない', () => {
    // 押すと `/sales/customers/:id` へ飛び、スマホでは PC 専用の案内に着く
    // （電話をかけようとしただけなのに、行き止まりに連れて行かれる）
    expect(SEARCH_PAGE).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('お客様の画面は v4 で作り直され、スマホにも開放されている', () => {
    // 2026-08・v4ネイティブUI化で `CLIENT_PC_ONLY` から外れ `CLIENT_MOBILE_OK` へ
    // 移った。それでも探すの行の番号タップ（上のテスト群）は削らない —
    // 「詳細を開いてから電話をかける」より「行から直接かける」ほうが速い
    expect(PC_ONLY).not.toMatch(/path: '\/sales\/customers\/:id'/);
    expect(PC_ONLY).toMatch(/'\/sales\/customers\/:id',/);
  });
});
