/**
 * **外から電話をかけたいのに、お客様の番号だけ辿り着けない**（探す）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * ⚠️ **この段落は当時の記録。** 着手時点はお客様の詳細（`/sales/customers/:id`）が
 * スマホでは PC 専用の案内に差し替わっていた（`pcOnlyScreens.ts`・まだ作り直して
 * いない画面だったため）。**その後 2026-08、「PC専用画面もスマホ対応していく」という
 * 方針転換を受けて `CLIENT_MOBILE_OK` へ移した**（v4作り直しは別途・今回はレイアウトの
 * 最小対応のみ）。探すの行に番号を出す仕組み自体は、開けるようになった今も
 * 「画面を開かずに答えになる」という価値をそのまま持つので、そのぶんの試験は残す。
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

  it('⚠️ お客様の画面は2026-08にスマホへ開放した（当時の記録の更新）', () => {
    // 方針転換（PC専用画面もスマホ対応していく）を受けて CLIENT_PC_ONLY から外し、
    // CLIENT_MOBILE_OK へ移した。番号を探すの行に出す仕組み自体は
    // （開けるようになった今も）「画面を開かずに答えになる」ままなので、そのまま残す
    expect(PC_ONLY).not.toMatch(/path: '\/sales\/customers\/:id'/);
    expect(PC_ONLY).toMatch(/'\/sales\/customers\/:id',/);
  });
});
