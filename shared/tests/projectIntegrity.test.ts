/**
 * 案件の整合性チェック（案件台帳の上に出る札）を固定する検査
 *
 * ── ここで守りたいこと ──────────────────────────────────────
 *
 * この機能の値打ちは**「12 件おかしい」と出したら、押すとその 12 件が並ぶ**ことだけです。
 * 数えるところと絞るところが別の式になると、**どちらが本当か画面からは分かりません**
 * （しかも数字はそれらしく出るので、突き合わせるまで誰も気づけません）。
 *
 *  ・**数える式と絞る式が同じ1つ**であること（`sql` を両方が読む）
 *  ・**知らない鍵は 0 件に倒す**こと。素通りさせると「絞ったのに全件」になり、
 *    整合性が取れていると読まれます
 *  ・**画面に出す文に印付けの記号を書かない**こと。`why` / `how` は素の文字として
 *    描かれるので、`**` や バッククォート は**そのまま画面に出ます**
 *    （実際に2度やり直したので、ここで止めます）
 *  ・**旧「案件種類」の導き方が、SQL と TypeScript で一致している**こと。
 *    ずれると「ずれている」と数える側が壊れ、**正しい行を直させる**ことになります
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INTEGRITY_CHECKS, buildIntegrityCountSql, findCheck,
} from '../../server/src/contexts/sales/services/project-integrity';
import { projectTypeOf, projectTypeSqlCase } from '../../server/src/contexts/sales/services/project-classification';

const ROOT = join(__dirname, '../..');
const readSrc = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('チェックの並び', () => {
  it('鍵は重複しない', () => {
    const keys = INTEGRITY_CHECKS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('4つとも書いてある（label / why / how / sql）', () => {
    for (const c of INTEGRITY_CHECKS) {
      expect(c.label.length, c.key).toBeGreaterThan(0);
      expect(c.why.length, c.key).toBeGreaterThan(0);
      expect(c.how.length, c.key).toBeGreaterThan(0);
      expect(c.sql.length, c.key).toBeGreaterThan(0);
    }
  });

  it('画面に出す文に印付けの記号を書かない（素の文字として描かれるため）', () => {
    for (const c of INTEGRITY_CHECKS) {
      expect(c.why, `${c.key} の why`).not.toMatch(/\*\*|`/);
      expect(c.how, `${c.key} の how`).not.toMatch(/\*\*|`/);
      expect(c.label, `${c.key} の label`).not.toMatch(/\*\*|`/);
    }
  });

  it('条件は projects の別名 p を使う（数える SQL に埋め込むため）', () => {
    for (const c of INTEGRITY_CHECKS) {
      // 相関サブクエリだけのものもあるので、p. か SELECT のどちらかを持つ
      expect(/\bp\.|SELECT/.test(c.sql), c.key).toBe(true);
    }
  });
});

describe('数える式と絞る式が同じ1つ', () => {
  const sql = buildIntegrityCountSql();

  it('数える SQL は全チェックの条件をそのまま埋め込む', () => {
    for (const c of INTEGRITY_CHECKS) {
      expect(sql, c.key).toContain(`FILTER (WHERE ${c.sql})`);
      expect(sql, c.key).toContain(`AS "${c.key}"`);
    }
  });

  it('数えるのは1回の問い合わせ（チェックが増えても増やさない）', () => {
    expect((sql.match(/\bFROM projects p\b/g) ?? []).length).toBe(1);
  });

  it('消した案件は数えない', () => {
    expect(sql).toContain('p.deleted_at IS NULL');
  });

  it('全件も同じ1回で数える', () => {
    expect(sql).toContain('AS "_total"');
  });
});

describe('知らない鍵', () => {
  it('findCheck は null を返す', () => {
    expect(findCheck('no_classification')?.key).toBe('no_classification');
    expect(findCheck('__ありません__')).toBeNull();
    expect(findCheck(undefined)).toBeNull();
    expect(findCheck(123)).toBeNull();
  });

  it('絞り込みは 0 件に倒す（素通りさせない）', () => {
    // **素通りさせると「絞ったのに全件」**になり、整合性が取れていると読まれる
    const src = readSrc('server/src/contexts/sales/services/project.service.ts');
    expect(src).toMatch(/findCheck\(filter\.issue\)/);
    // **その行そのもの**を見る。`AND FALSE` はステージの絞り込みでも使っているので、
    // 素の文字列で探すと、ここを素通りに変えても気づけない
    expect(src).toMatch(/check\s*\?\s*` AND \(\$\{check\.sql\}\)`\s*:\s*' AND FALSE'/);
  });
});

describe('旧「案件種類」の導き方が SQL と TypeScript で一致する', () => {
  const AUDIENCES = ['with_audience', 'no_audience'];
  const CATEGORIES = ['broadcast', 'recording', 'event'];
  const caseSql = projectTypeSqlCase('p.audience', 'p.project_category');

  it('6通りとも、SQL の CASE に TypeScript と同じ答えが書いてある', () => {
    for (const a of AUDIENCES) {
      for (const c of CATEGORIES) {
        const expected = projectTypeOf(a, c);
        expect(expected, `${a} × ${c}`).toBeTruthy();
        expect(caseSql, `${a} × ${c}`).toContain(
          `WHEN p.audience = '${a}' AND p.project_category = '${c}' THEN '${expected}'`,
        );
      }
    }
  });

  it('当てはまらない組み合わせは NULL（勝手な種類を作らない）', () => {
    expect(caseSql).toContain('ELSE NULL END');
  });

  it('CASE の枝は6通りちょうど（表を書き写していない）', () => {
    expect((caseSql.match(/WHEN /g) ?? []).length).toBe(AUDIENCES.length * CATEGORIES.length);
  });
});

describe('口（ルート）', () => {
  const routes = readSrc('server/src/contexts/sales/routes/projects.routes.ts');

  it('/integrity は /:id より前に置く（うしろだと案件の id として読まれる）', () => {
    const integrity = routes.indexOf("'/integrity'");
    const byId = routes.indexOf("router.get('/:id'");
    expect(integrity).toBeGreaterThan(-1);
    expect(byId).toBeGreaterThan(-1);
    expect(integrity).toBeLessThan(byId);
  });

  it('issue を絞り込みとして受け取る', () => {
    expect(routes).toMatch(/issue:\s*req\.query\.issue/);
  });
});

describe('画面は件数を書き写さない', () => {
  const panel = readSrc('client/src/contexts/sales/pages/projectLedger/IntegrityPanel.tsx');

  it('why / how はサーバーが持つものをそのまま出す', () => {
    expect(panel).toContain('{current.why}');
    expect(panel).toContain('{current.how}');
  });

  it('0 件のチェックも並べる（消すと「無い」のか「0 件」か分からない）', () => {
    expect(panel).toContain('disabled={empty}');
  });
});
