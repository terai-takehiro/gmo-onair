/**
 * 財務の一覧クエリ — **ビルダーが出す別名を、使う側の FROM が定義しているか**
 *
 * ⚠️ **型検査も lint も SQL の中身を見ません**（`client/CLAUDE.md`「SQL」の節）。
 * 実際、`list-query.ts` は `v.name` を出し続けていたのに、使う側の JOIN は
 * `companies vco` に直っており（Phase 3-3-9 で `vendors` 表を `companies` へ寄せた回）、
 * **`?search=` を付けた瞬間に `missing FROM-clause entry for table "v"` で 500**に
 * なっていました。仕入台帳の検索欄・仕入先での並べ替え・Excel 書き出し・
 * MCP の `list_purchases` が**全部落ちていて、誰も気づいていませんでした**。
 *
 * 落ちるのは「検索語を入れたとき」だけなので、**画面を開くだけでは再現しません**。
 * ここで固定します。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildPurchaseWhere, buildPurchaseOrder,
  buildRevenueWhere, buildRevenueOrder,
  buildSgaWhere, buildSgaOrder,
} from '../../server/src/contexts/finance/list-query';

const SERVER = join(__dirname, '../../server/src');
const read = (p: string) => readFileSync(join(SERVER, p), 'utf8');

/** SQL 断片から `別名.` を集める（`params.` のような JS の書き方は入らない） */
function aliasesUsed(...fragments: string[]): Set<string> {
  const found = new Set<string>();
  for (const f of fragments) {
    for (const m of f.matchAll(/\b([a-z][a-z0-9_]{0,4})\.[a-z_]+/g)) found.add(m[1]);
  }
  return found;
}

/** ソースの中の `FROM x a` / `JOIN y b` から定義済みの別名を集める */
function aliasesDefined(src: string): Set<string> {
  const found = new Set<string>();
  for (const m of src.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)\s+([a-z][a-z0-9_]*)\b/gi)) {
    if (m[2].toLowerCase() !== 'on') found.add(m[2]);
  }
  return found;
}

/** ビルダーが出しうる別名を、絞り込みを全部盛りにして集める */
const ALL_FILTERS = {
  search: 'x', project_id: 'p1', group_id: 'g1', recognition_month: '2026-08',
  recognition_from: '2026-08-01', recognition_to: '2026-08-31', fixed_cost: '0',
  state: 'fixed', status: 'confirmed', source: 'staff', expense_type: 'fixed',
  account_title_id: 'a1',
} as Record<string, string>;

const SORTS = ['vendor_asc', 'vendor_desc', 'gls_asc', 'project_asc', 'desc_asc', 'amount_desc'];

describe('財務の一覧クエリが使う別名', () => {
  const cases: { name: string; used: Set<string>; consumers: string[] }[] = [
    {
      name: '仕入',
      used: aliasesUsed(
        buildPurchaseWhere(ALL_FILTERS as never).where,
        ...SORTS.map((s) => buildPurchaseOrder({ ...ALL_FILTERS, sort: s } as never)),
      ),
      consumers: [
        'contexts/finance/routes/purchases.routes.ts',
        'contexts/finance/routes/excel.routes.ts',
        'contexts/mcp/tools/finance.tools.ts',
      ],
    },
    {
      name: '売上',
      used: aliasesUsed(
        buildRevenueWhere(ALL_FILTERS as never).where,
        ...SORTS.map((s) => buildRevenueOrder({ ...ALL_FILTERS, sort: s } as never)),
      ),
      consumers: [
        'contexts/finance/routes/revenues.routes.ts',
        'contexts/finance/routes/excel.routes.ts',
        'contexts/mcp/tools/finance.tools.ts',
      ],
    },
    {
      name: '販管費',
      used: aliasesUsed(
        buildSgaWhere(ALL_FILTERS as never).where,
        ...SORTS.map((s) => buildSgaOrder({ ...ALL_FILTERS, sort: s } as never)),
      ),
      consumers: ['contexts/finance/routes/sga.routes.ts'],
    },
  ];

  for (const { name, used, consumers } of cases) {
    it(`${name}: ビルダーが出す別名を、使う側がすべて定義している`, () => {
      expect(used.size).toBeGreaterThan(0); // 何も集められていないなら検査になっていない
      for (const file of consumers) {
        const defined = aliasesDefined(read(file));
        const missing = [...used].filter((a) => !defined.has(a));
        expect(missing, `${file} に無い別名: ${missing.join(', ')}`).toEqual([]);
      }
    });
  }

  it('仕入の検索は `vco.name` を見る（`v.name` に戻っていない）', () => {
    const { where } = buildPurchaseWhere({ search: 'x' } as never);
    expect(where).toContain('vco.name');
    expect(where).not.toMatch(/\bv\.name/);
  });

  it('仕入先での並べ替えも `vco.name`', () => {
    for (const sort of ['vendor_asc', 'vendor_desc']) {
      const order = buildPurchaseOrder({ sort } as never);
      expect(order).toContain('vco.name');
      expect(order).not.toMatch(/\bv\.name/);
    }
  });
});
