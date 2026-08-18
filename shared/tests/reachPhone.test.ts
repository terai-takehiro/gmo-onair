/**
 * **外から電話をかけたいのに、お客様の番号だけ辿り着けない**（探す）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * お客様の詳細（`/sales/customers/:id`）は**スマホでは PC 専用の案内に
 * 差し替わります**（`pcOnlyScreens.ts`・まだ作り直していない画面なので妥当）。
 * ところが**仕入先は `/budget/vendors` を開けます**（「電話の前に相手を調べる」と
 * 書いて M10 で開放した5枚の1つ）。つまり**お客様だけ道がありません**。
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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** 説明文を外してから探す（前の版の形が注釈に書いてあるため） */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SEARCH_API = code(read('server', 'src', 'contexts', 'platform', 'routes', 'search.routes.ts'));
const SEARCH_PAGE = code(read('client', 'src', 'contexts', 'platform', 'pages', 'SearchPage.tsx'));
const PC_ONLY = read('client', 'src', 'pcOnlyScreens.ts');

describe('お客様の電話番号に辿り着ける', () => {
  it('探すの口が電話番号と担当者を返す', () => {
    // Phase 3-2a: 顧客の id 空間を companies.id に揃えたので、customers ではなく
    // companies（is_customer=TRUE）から返す
    expect(SEARCH_API).toMatch(/SELECT id, name, short_name, phone, contact_name FROM companies/);
  });

  it('行に押せる番号を出す', () => {
    expect(SEARCH_PAGE).toMatch(/href=\{`tel:\$\{c\.phone\.replace\(\/\[\^0-9\+\]\/g, ''\)\}`\}/);
  });

  it('⚠️ 番号を押しても行の遷移を起こさない', () => {
    // 押すと `/sales/customers/:id` へ飛び、スマホでは PC 専用の案内に着く
    // （電話をかけようとしただけなのに、行き止まりに連れて行かれる）
    expect(SEARCH_PAGE).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('お客様の画面は PC 専用のまま（開放していない）', () => {
    // まだ作り直していない画面なので、開くと指で押しにくい形のまま。
    // **番号だけを届ける**のがこの直し方の要点
    expect(PC_ONLY).toMatch(/path: '\/sales\/customers\/:id'/);
  });
});
