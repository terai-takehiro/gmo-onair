/**
 * **新規行を作る INSERT が `entity_code` を明示しているか**を見る検査
 *
 * ── なぜこれが要るか ────────────────────────────────────────────
 *
 * 2026年10月の事業再編（docs/reorg-2026-10-plan.md §4.3・§4.5・§4.11・§13）で
 * `projects` / `revenues` / `purchases` / `sga_expenses` / `estimates` に
 * `entity_code` 列を足した（migration 283）。列はまだ NULL 可で足しただけなので、
 * 書き込み側が明示しなくてもエラーにはならない —
 * **書き忘れても気づけない**まま NULL の行が増え続ける。
 *
 * migration 284 でこの列を NOT NULL にする前に、**全ての INSERT が
 * 明示的に書いているか**をここで固定する。落ちたらそれは「新しい書き込み口が
 * 増えたのに `entity_code` を書いていない」ということなので、
 * `shared/constants/entity-default.ts` の `CURRENT_ENTITY_CODE` を import して
 * 列とパラメータに足すこと（P1 で `resolveEntity()` に置き換わるまでの仮の値）。
 *
 * ── 何を見ているか ──────────────────────────────────────────────
 *
 * `droppedColumns.test.ts` と同じ走査（バッククォート文字列だけを SQL とみなす）を
 * 借りて、`INSERT INTO <対象表> (...)` の列の並びに `entity_code` が
 * （大文字小文字を問わず）含まれているかを見るだけ。SQL を本気で解析しない —
 * 解析器を持つと検査そのものが読めなくなる。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SERVER_SRC = join(ROOT, 'server', 'src');

/** 対象は「書いた時の計上会社」を持たせた5表だけ（§4.5・283番）。 */
const TARGET_TABLES = ['projects', 'revenues', 'purchases', 'sga_expenses', 'estimates'] as const;

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** バッククォートで囲まれた文字列のうち、SQL に見えるものだけ（droppedColumns.test.ts と同じ） */
function sqlLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/`([^`]*)`/g)) {
    const body = m[1];
    if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(body)) out.push(body);
  }
  return out;
}

interface InsertMatch {
  table: string;
  columns: string[];
}

/** SQL 文字列から `INSERT INTO <対象表> (...)` を全部拾い、表名と列の並びを返す */
function findInserts(sql: string): InsertMatch[] {
  const out: InsertMatch[] = [];
  const re = new RegExp(`INSERT\\s+INTO\\s+(${TARGET_TABLES.join('|')})\\s*\\(([^)]*)\\)`, 'gi');
  for (const m of sql.matchAll(re)) {
    out.push({
      table: m[1].toLowerCase(),
      columns: m[2].split(',').map((c) => c.trim().toLowerCase()),
    });
  }
  return out;
}

describe('新規行を作る INSERT が entity_code を書いているか', () => {
  // ファイルの読み込みは1回だけにして、2つの it() で使い回す
  const allInserts: { file: string; table: string; columns: string[] }[] = [];
  for (const file of tsFiles(SERVER_SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const sql of sqlLiterals(source)) {
      for (const ins of findInserts(sql)) {
        allInserts.push({ file: file.slice(ROOT.length + 1), table: ins.table, columns: ins.columns });
      }
    }
  }

  it('対象5表それぞれ、INSERT を1件以上見つけられている', () => {
    // ここが空になったら、上の正規表現がコードの書き方に付いていけていない
    // （＝以下の「entity_code が無い」が0件でも安心できない）
    for (const table of TARGET_TABLES) {
      const found = allInserts.filter((i) => i.table === table);
      expect(found.length, `INSERT INTO ${table} が1件も見つからない`).toBeGreaterThan(0);
    }
  });

  it('全ての INSERT が entity_code を列に持つ', () => {
    const offenders: string[] = [];
    for (const ins of allInserts) {
      if (!ins.columns.includes('entity_code')) {
        offenders.push(`${ins.file} — INSERT INTO ${ins.table} is missing entity_code`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
