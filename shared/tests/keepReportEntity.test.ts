/**
 * 事業主体（gss / gscs / gig）の決め方 — 隔週キープの主体別の収支（keep-report.md §4）
 *
 * ── ①: server と画面の写しが同じ答えを出すこと ────────────────
 *
 * この製品は **server が `shared/` を import しない構成**（`rootDir` が
 * `server/src`）なので、同じ関数が2か所にあります:
 *
 *   server … `server/src/contexts/sales/services/project-entity.ts`（保存する値を決める）
 *   画面   … `shared/src/keepReport/entity.ts`（お客様を選んだその場で主体を見せる）
 *
 * **食い違うと、画面に出た主体と保存された主体が違います**（型検査にも lint にも出ない）。
 * `gmoGroup.test.ts` と同じやり方で、両方を読んで固定します。
 *
 * ── ②: 人の上書き（entity_manual）が黙って消えないこと ─────────
 *
 * 案件は欄を持たない呼び出し（MCP・ステージ変更のついでの保存）からも更新されます。
 * `customer_type` と同じく「渡されなければ今の印を保つ」を守らないと、
 * gig に上書きした案件が次の保存で gss に戻り、資料の数字が主体ごと動きます。
 */
import { describe, it, expect } from 'vitest';
import {
  deriveEntity as sharedDerive, isBusinessEntity as sharedIs, isEntityScope as sharedIsScope,
  BUSINESS_ENTITIES as sharedList, ENTITY_LABELS, entityLabel,
} from '../src/keepReport/entity';
import { BUSINESS_ENTITY_LABELS } from '../src/keepReport/types';
import {
  deriveEntity as serverDerive, isBusinessEntity as serverIs, isEntityScope as serverIsScope,
  BUSINESS_ENTITIES as serverList, BUSINESS_ENTITY_LABELS as serverLabels,
  parseEntityInput, resolveProjectEntity,
} from '../../server/src/contexts/sales/services/project-entity';

const DERIVE_CASES: { input: 'internal' | 'external' | null | undefined; expected: 'gss' | 'gscs'; why: string }[] = [
  { input: 'internal', expected: 'gss', why: 'グループ内 → GMOサムライスタジオ' },
  { input: 'external', expected: 'gscs', why: '外部 → GMOサムライコンテンツスタジオ' },
  { input: null, expected: 'gscs', why: '分からないときは外部（customer_type の既定と同じ側）' },
  { input: undefined, expected: 'gscs', why: '同上' },
];

describe('deriveEntity（お客様の区分 → 事業主体）', () => {
  for (const c of DERIVE_CASES) {
    it(`${String(c.input)} → ${c.expected}（${c.why}）`, () => {
      expect(serverDerive(c.input)).toBe(c.expected);
    });
  }

  it('gig は自動では付かない（人が上書きしたときだけ）', () => {
    for (const c of DERIVE_CASES) expect(serverDerive(c.input)).not.toBe('gig');
  });
});

describe('isBusinessEntity / isEntityScope', () => {
  it('3つの主体だけ通す', () => {
    expect(serverIs('gss')).toBe(true);
    expect(serverIs('gscs')).toBe(true);
    expect(serverIs('gig')).toBe(true);
    for (const bad of ['all', 'GSS', '', null, undefined, 1, {}, 'internal']) {
      expect(serverIs(bad), `${String(bad)} を通してはいけない`).toBe(false);
    }
  });

  it('絞り込みは all も通す', () => {
    expect(serverIsScope('all')).toBe(true);
    expect(serverIsScope('gscs')).toBe(true);
    expect(serverIsScope('everything')).toBe(false);
  });
});

describe('server と画面の写しが食い違っていない', () => {
  it('deriveEntity が同じ答え', () => {
    for (const c of DERIVE_CASES) expect(sharedDerive(c.input), `${String(c.input)} で食い違い`).toBe(serverDerive(c.input));
  });

  it('isBusinessEntity / isEntityScope が同じ答え', () => {
    for (const v of ['gss', 'gscs', 'gig', 'all', 'x', '', null, undefined, 0]) {
      expect(sharedIs(v)).toBe(serverIs(v));
      expect(sharedIsScope(v)).toBe(serverIsScope(v));
    }
  });

  it('主体の並びと表示名が同じ', () => {
    expect([...sharedList]).toEqual([...serverList]);
    expect(ENTITY_LABELS).toEqual(serverLabels);
    expect(ENTITY_LABELS).toBe(BUSINESS_ENTITY_LABELS);
    expect(entityLabel('all')).toBe('全体');
    expect(entityLabel('gscs')).toBe('GMOサムライコンテンツスタジオ');
  });
});

describe('parseEntityInput（案件の登録・更新で受け取った entity の読み方）', () => {
  it('渡されなければ unset、null / 空文字は reset、主体は set、それ以外は invalid', () => {
    expect(parseEntityInput(undefined)).toEqual({ kind: 'unset' });
    expect(parseEntityInput(null)).toEqual({ kind: 'reset' });
    expect(parseEntityInput('')).toEqual({ kind: 'reset' });
    expect(parseEntityInput('gig')).toEqual({ kind: 'set', entity: 'gig' });
    expect(parseEntityInput('all')).toEqual({ kind: 'invalid', value: 'all' });
    expect(parseEntityInput('GSS')).toEqual({ kind: 'invalid', value: 'GSS' });
    expect(parseEntityInput(1)).toEqual({ kind: 'invalid', value: 1 });
  });
});

describe('resolveProjectEntity（保存する entity / entity_manual）', () => {
  it('新規: 渡さなければお客様から導き、印は付かない', () => {
    expect(resolveProjectEntity({ kind: 'unset' }, 'internal', null)).toEqual({ entity: 'gss', entity_manual: false });
    expect(resolveProjectEntity({ kind: 'unset' }, 'external', null)).toEqual({ entity: 'gscs', entity_manual: false });
  });

  it('上書き: 渡した主体で印が付く（お客様の区分と食い違っていても）', () => {
    expect(resolveProjectEntity({ kind: 'set', entity: 'gig' }, 'external', null)).toEqual({ entity: 'gig', entity_manual: true });
    expect(resolveProjectEntity({ kind: 'set', entity: 'gss' }, 'external', { entity: 'gscs', entity_manual: false }))
      .toEqual({ entity: 'gss', entity_manual: true });
  });

  it('更新で渡さなければ、人の上書きはそのまま保つ（お客様を変えても戻らない）', () => {
    expect(resolveProjectEntity({ kind: 'unset' }, 'internal', { entity: 'gig', entity_manual: true }))
      .toEqual({ entity: 'gig', entity_manual: true });
  });

  it('更新で渡さなければ、印が無い案件はお客様から引き直す（お客様を差し替えたら主体も変わる）', () => {
    expect(resolveProjectEntity({ kind: 'unset' }, 'internal', { entity: 'gscs', entity_manual: false }))
      .toEqual({ entity: 'gss', entity_manual: false });
  });

  it('null で自動に戻す（印を外す）', () => {
    expect(resolveProjectEntity({ kind: 'reset' }, 'external', { entity: 'gig', entity_manual: true }))
      .toEqual({ entity: 'gscs', entity_manual: false });
  });

  it('印が付いていても保存値が壊れていれば（知らない値）お客様から引き直す', () => {
    expect(resolveProjectEntity({ kind: 'unset' }, 'internal', { entity: 'old', entity_manual: true }))
      .toEqual({ entity: 'gss', entity_manual: false });
  });
});
