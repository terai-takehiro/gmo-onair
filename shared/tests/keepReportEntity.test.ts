/**
 * 計上会社（SCS / GSS / GMO）— 隔週キープの計上会社別の収支（keep-report.md §4）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 2026年10月の事業再編（docs/reorg-2026-10-plan.md）で、計上会社の値は main の
 * `legal_entities.code`（`server/src/contexts/platform/services/legal-entity.service.ts` の
 * `LegalEntityCode`）に決まった。隔週キープはこの3文字をパックの鍵（`landing.GSS`）・
 * 絞り込み（`?entity_code=SCS`）・ヨミ表の行（`entity_code`）にそのまま使う。
 *
 * この製品は **server が `shared/` を import しない構成**（`rootDir` が `server/src`）なので、
 * 画面が読む `shared/src/keepReport/entity.ts` の3文字と server の `LegalEntityCode` は
 * 型で結べない。**1文字でもずれると、サーバーが返した `GSS` の表を画面が「無い」と読んで
 * 全体の表にすり替わる**（型検査にも lint にも出ない）。ここでファイルの文面を読んで固定する
 * （`keepReportCalc.test.ts` が型の鍵を突き合わせるのと同じやり方）。
 *
 * ⚠️ 以前ここにあった `deriveEntity`（お客様の区分 → 主体）の parity は消した。
 * どの会社になるかの規則は main の `sales/services/entity-resolution.service.ts` が持ち
 * （実施日・切替日・取引先の `is_gmo_group` を見る）、shared には写しを置かない。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUSINESS_ENTITIES, ENTITY_LABELS, entityLabel, isBusinessEntity, isEntityScope,
} from '../src/keepReport/entity';
import { BUSINESS_ENTITY_LABELS } from '../src/keepReport/types';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

/** `export type LegalEntityCode = 'SCS' | 'GSS' | 'GMO';` の右辺を読む */
function legalEntityCodes(): string[] {
  const src = read('server', 'src', 'contexts', 'platform', 'services', 'legal-entity.service.ts');
  const m = /export type LegalEntityCode\s*=\s*([^;]+);/.exec(src);
  expect(m, 'legal-entity.service.ts に LegalEntityCode が無い').toBeTruthy();
  return [...m![1].matchAll(/'([A-Z]+)'/g)].map((x) => x[1]).sort();
}

describe('main の LegalEntityCode と同じ3文字', () => {
  it('legal-entity.service.ts の型と一致する', () => {
    expect([...BUSINESS_ENTITIES].sort()).toEqual(legalEntityCodes());
  });

  it('legal_entities の CHECK 制約（migration 284 の seed → 293 の改名を経た最終形）とも一致する', () => {
    // 284 は GJV/GSS/GMO で作った当時のまま変えていない（「マイグレーションは追加のみ」原則）。
    // 293 が GJV→SCS の改名（CHECK 制約の締め直しを含む）を行うので、そちらの最終形を見る。
    const sql = read('server', 'src', 'shared', 'db', 'migrations', '293_rename_gjv_to_scs.sql');
    const matches = [...sql.matchAll(/code IN \(([^)]+)\)/g)];
    expect(matches.length, '293_rename_gjv_to_scs.sql に code の CHECK が無い').toBeGreaterThan(0);
    // 最後（締め直した最終形）の CHECK を見る
    const codes = [...matches[matches.length - 1][1].matchAll(/'([A-Z]+)'/g)].map((x) => x[1]).sort();
    expect([...BUSINESS_ENTITIES].sort()).toEqual(codes);
  });

  it('表示名は legal_entities.name から「株式会社」を落としたもの（284 の seed の名前 + 293 の改名と食い違わない）', () => {
    // 284 は旧コード（GJV/GSS/GMO）のまま作った当時の seed。293 が GJV だけを SCS へ
    // 改名し、name/short_name はコピーするだけで変えていない（`SELECT name, ... FROM
    // legal_entities WHERE code = 'GJV'`）ので、名前の正は今も 284 の seed のまま。
    const seedSql = read('server', 'src', 'shared', 'db', 'migrations', '284_legal_entities.sql');
    const renameSql = read('server', 'src', 'shared', 'db', 'migrations', '293_rename_gjv_to_scs.sql');
    const SEED_CODE_OF: Record<string, string> = { SCS: 'GJV', GSS: 'GSS', GMO: 'GMO' };
    for (const code of BUSINESS_ENTITIES) {
      const seedCode = SEED_CODE_OF[code];
      expect(seedSql, `${code} の名前 ${ENTITY_LABELS[code]}株式会社 が seed（旧コード ${seedCode}）に無い`)
        .toContain(`'${seedCode}', '${ENTITY_LABELS[code]}株式会社'`);
    }
    // 293 が GJV→SCS を正しく改名していることも確認する（name 列自体は動的コピーなので
    // 文字列としては出てこない。'GJV' → 'SCS' への UPDATE/SELECT を行っていることだけ見る）
    expect(renameSql, '293_rename_gjv_to_scs.sql が GJV→SCS の改名を行っていない').toContain("WHERE code = 'GJV'");
    expect(renameSql).toContain("'SCS', name, short_name");
  });

  it('並びは親会社 SCS → GSS → GMO（legal_entities.sort_order）', () => {
    expect([...BUSINESS_ENTITIES]).toEqual(['SCS', 'GSS', 'GMO']);
  });
});

describe('isBusinessEntity / isEntityScope', () => {
  it('3つの計上会社だけ通す（小文字・旧語彙 gss/gscs/gig は通さない）', () => {
    expect(isBusinessEntity('SCS')).toBe(true);
    expect(isBusinessEntity('GSS')).toBe(true);
    expect(isBusinessEntity('GMO')).toBe(true);
    for (const bad of ['all', 'gss', 'gscs', 'gig', 'scs', 'GLS', '', null, undefined, 1, {}, 'internal']) {
      expect(isBusinessEntity(bad), `${String(bad)} を通してはいけない`).toBe(false);
    }
  });

  it('絞り込みは all も通す', () => {
    expect(isEntityScope('all')).toBe(true);
    expect(isEntityScope('SCS')).toBe(true);
    expect(isEntityScope('everything')).toBe(false);
    expect(isEntityScope('ALL')).toBe(false);
  });
});

describe('表示名', () => {
  it('types.ts の表そのもの（2つ持たない）', () => {
    expect(ENTITY_LABELS).toBe(BUSINESS_ENTITY_LABELS);
    expect(ENTITY_LABELS).toEqual({
      SCS: 'GMOサムライコンテンツスタジオ',
      GSS: 'GMOサムライスタジオ',
      GMO: 'GMOインターネットグループ',
    });
  });

  it('entityLabel: all は「全体（統合）」、それ以外は会社名', () => {
    expect(entityLabel('all')).toBe('全体（統合）');
    expect(entityLabel('SCS')).toBe('GMOサムライコンテンツスタジオ');
    expect(entityLabel('GSS')).toBe('GMOサムライスタジオ');
    expect(entityLabel('GMO')).toBe('GMOインターネットグループ');
  });
});
