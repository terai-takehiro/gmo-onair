/**
 * 役務提供完了日を、書き出し・取り込み・MCP に通す
 *
 * ⚠️ **この列だけ `DATE` 型**（migration `060_purchase_service_date.sql`）。
 * 仕入の他の日付列（`recognition_date` / `inspection_date` / `payment_due_date`）は
 * TEXT なので `2026-08-31` がそのまま返るのに、ここだけ `node-pg` が JS の `Date` にします。
 * 素で SELECT すると、
 *
 * - CSV: `String(Date)` されて **`Mon Aug 31 2026 00:00:00 GMT+0000 (…)`**
 * - Excel: `2026-08-31 00:00:00`（他の日付列と形が揃わない）
 * - MCP: `"2026-08-31T00:00:00.000Z"`
 *
 * になります。SQL 側で `TO_CHAR` して**文字列で取り出す**のが唯一、
 * 時間帯にも `types.setTypeParser` の有無にも依存しない形です。ここで固定します。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVER = join(__dirname, '../../server/src');
const read = (p: string) => readFileSync(join(SERVER, p), 'utf8');

const EXCEL = read('contexts/finance/routes/excel.routes.ts');
const PURCHASES = read('contexts/finance/routes/purchases.routes.ts');
const MCP = read('contexts/mcp/tools/finance.tools.ts');

/** `service_completed_date` を素で SELECT していないか（必ず TO_CHAR を通す） */
function rawSelects(src: string): string[] {
  return [...src.matchAll(/\bpu\.service_completed_date\b/g)]
    .map((m) => src.slice(Math.max(0, m.index! - 40), m.index! + 30))
    .filter((ctx) => !/TO_CHAR\([^)]*$/.test(ctx.slice(0, 40 + 'pu.service_completed_date'.length))
                  && !ctx.includes('TO_CHAR'));
}

describe('書き出しは必ず TO_CHAR を通す', () => {
  for (const [name, src] of [['Excel', EXCEL], ['CSV', PURCHASES], ['MCP', MCP]] as const) {
    it(`${name}: 素の \`pu.service_completed_date\` を SELECT していない`, () => {
      expect(rawSelects(src)).toEqual([]);
    });
    it(`${name}: TO_CHAR で YYYY-MM-DD にしている`, () => {
      expect(src).toMatch(/TO_CHAR\(\s*pu\.service_completed_date\s*,\s*'YYYY-MM-DD'\s*\)/);
    });
  }

  it('Excel は書き出しの SQL が2か所あるので、両方に入っている', () => {
    // `exportQuery`（絞り込みなし）と `buildExportQuery`（画面の絞り込みつき）。
    // ⚠️ 実際に使われるのは後者なので、前者だけ直すと画面からの書き出しに列が出ない
    const hits = [...EXCEL.matchAll(/TO_CHAR\(\s*pu\.service_completed_date/g)];
    expect(hits.length).toBe(2);
  });
});

describe('Excel の列', () => {
  it('列定義に `役務提供完了日` がある（取り込みはヘッダー名で照合する）', () => {
    expect(EXCEL).toContain("{ key: 'service_completed_date', header: '役務提供完了日'");
  });

  it('取り込みで `asDate` を通している（日付セル・シリアル値・文字列を吸収する）', () => {
    expect(EXCEL).toContain('service_completed_date: asDate(raw.service_completed_date)');
  });

  /*
   * ⚠️ **書き出したファイルをそのまま戻すと、仕入が二重に登録されます。**
   * 仕入の取り込みは `duplicate` も `update` も設定しておらず、毎回すべての行を
   * 新規に足すためです（実測で確認済み）。列を足したことで
   * 「書き出す → Excel で埋める → 取り込む」を自然に思いつく形になったので、
   * **入力ガイドの断り書きは機能の一部**です。
   */
  it('入力ガイドに「取り込みは常に新規追加」と書いてある', () => {
    expect(EXCEL).toMatch(/取り込みは常に新規追加/);
  });

  it('仕入の取り込みは重複を見ていない（断り書きの前提が変わっていないこと）', () => {
    const purchasesConfig = EXCEL.slice(
      EXCEL.indexOf('const PURCHASES_CONFIG'),
      EXCEL.indexOf('const SGA_CONFIG'),
    );
    expect(purchasesConfig.length).toBeGreaterThan(100);
    // ここが変わったら、断り書きも一緒に見直すこと
    expect(purchasesConfig).not.toMatch(/^\s*duplicate:/m);
    expect(purchasesConfig).not.toMatch(/^\s*update:/m);
  });
});

describe('Excel 取り込みの INSERT', () => {
  /*
   * ⚠️ **列・プレースホルダ・値の3つが揃っていないと、静かに違う列へ書き込みます。**
   * 列を1つ足すときに `$18` を `$19` にし忘れる／値の並びだけずらす、という壊し方は
   * 型検査にも lint にも出ません（`notes` に user id が入る、など）。
   */
  it('列の数・プレースホルダの数・値の数が一致している', () => {
    const stmt = EXCEL.slice(EXCEL.indexOf('INSERT INTO purchases'));
    const cols = stmt.slice(stmt.indexOf('(') + 1, stmt.indexOf(')'))
      .split(',').map((c) => c.trim()).filter(Boolean);
    const placeholders = (stmt.slice(0, stmt.indexOf('`,')).match(/\$\d+/g) ?? []);
    const valuesBlock = stmt.slice(stmt.indexOf('[newId()'), stmt.indexOf('],'));
    const values = valuesBlock.split(',').map((v) => v.trim()).filter(Boolean);

    expect(cols).toContain('service_completed_date');
    expect(placeholders.length).toBe(cols.length);
    expect(values.length).toBe(cols.length);
    // 並びも一致していること（列名 `x` に対して値が `d.x`）
    const i = cols.indexOf('service_completed_date');
    expect(values[i]).toBe('d.service_completed_date');
  });
});

describe('CSV の列', () => {
  it('列の並びの **末尾** に足してある（既存の列位置をずらさない）', () => {
    const m = PURCHASES.match(/const columns = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const cols = m![1].split(',').map((c) => c.trim().replace(/'/g, '')).filter(Boolean);
    expect(cols[cols.length - 1]).toBe('service_completed_date');
  });
});
