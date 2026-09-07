/**
 * 計上会社（GJV / GSS / GMO）— 隔週キープの計上会社別の収支（keep-report.md §4）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * 2026年10月の事業再編（docs/reorg-2026-10-plan.md）で、計上会社の値は main の
 * `legal_entities.code`（`server/src/contexts/platform/services/legal-entity.service.ts` の
 * `LegalEntityCode`）に決まった。隔週キープはこの3文字をパックの鍵（`landing.GSS`）・
 * 絞り込み（`?entity_code=GJV`）・ヨミ表の行（`entity_code`）にそのまま使う。
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

/** `export type LegalEntityCode = 'GJV' | 'GSS' | 'GMO';` の右辺を読む */
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

  it('legal_entities の CHECK 制約（migration 284）とも一致する', () => {
    const sql = read('server', 'src', 'shared', 'db', 'migrations', '284_legal_entities.sql');
    const m = /code\s+TEXT PRIMARY KEY CHECK \(code IN \(([^)]+)\)\)/.exec(sql);
    expect(m, '284_legal_entities.sql に code の CHECK が無い').toBeTruthy();
    const codes = [...m![1].matchAll(/'([A-Z]+)'/g)].map((x) => x[1]).sort();
    expect([...BUSINESS_ENTITIES].sort()).toEqual(codes);
  });

  it('表示名は legal_entities.name から「株式会社」を落としたもの（画面に出す名前が seed と食い違わない）', () => {
    const sql = read('server', 'src', 'shared', 'db', 'migrations', '284_legal_entities.sql');
    for (const code of BUSINESS_ENTITIES) {
      expect(sql, `${code} の名前 ${ENTITY_LABELS[code]}株式会社 が seed に無い`).toContain(`'${code}', '${ENTITY_LABELS[code]}株式会社'`);
    }
  });

  it('並びは親会社 GJV → GSS → GMO（legal_entities.sort_order）', () => {
    expect([...BUSINESS_ENTITIES]).toEqual(['GJV', 'GSS', 'GMO']);
  });
});

describe('isBusinessEntity / isEntityScope', () => {
  it('3つの計上会社だけ通す（小文字・旧語彙 gss/gscs/gig は通さない）', () => {
    expect(isBusinessEntity('GJV')).toBe(true);
    expect(isBusinessEntity('GSS')).toBe(true);
    expect(isBusinessEntity('GMO')).toBe(true);
    for (const bad of ['all', 'gss', 'gscs', 'gig', 'gjv', 'GLS', '', null, undefined, 1, {}, 'internal']) {
      expect(isBusinessEntity(bad), `${String(bad)} を通してはいけない`).toBe(false);
    }
  });

  it('絞り込みは all も通す', () => {
    expect(isEntityScope('all')).toBe(true);
    expect(isEntityScope('GJV')).toBe(true);
    expect(isEntityScope('everything')).toBe(false);
    expect(isEntityScope('ALL')).toBe(false);
  });
});

describe('表示名', () => {
  it('types.ts の表そのもの（2つ持たない）', () => {
    expect(ENTITY_LABELS).toBe(BUSINESS_ENTITY_LABELS);
    expect(ENTITY_LABELS).toEqual({
      GJV: 'GMOサムライコンテンツスタジオ',
      GSS: 'GMOサムライスタジオ',
      GMO: 'GMOインターネットグループ',
    });
  });

  it('entityLabel: all は「全体（統合）」、それ以外は会社名', () => {
    expect(entityLabel('all')).toBe('全体（統合）');
    expect(entityLabel('GJV')).toBe('GMOサムライコンテンツスタジオ');
    expect(entityLabel('GSS')).toBe('GMOサムライスタジオ');
    expect(entityLabel('GMO')).toBe('GMOインターネットグループ');
  });
});
