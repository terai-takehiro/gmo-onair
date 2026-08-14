/**
 * **SQL の中で jsonb の存在演算子（疑問符）を使っていないか**を見る検査
 *
 * ── なぜこれが要るか（実際に踏んだ）────────────────────────────
 *
 * この製品の DB 層は SQL の `?` を**プレースホルダとして数えて `$1, $2 …` に置き換えます**
 * （`server/src/shared/db/connection.ts`）。ところが Postgres の jsonb には
 * 「その鍵を持っているか」を見る演算子として**同じ記号**があります。
 *
 * 議事録の持ち帰りが追いかけられたかを数えるとき素直にそれを書いたところ、
 * `syntax error at or near "$1"` で落ちました。**型検査にも lint にも出ません**
 * （SQL は文字列なので）。しかも読んで気づくのが難しく、置き換えたあとの SQL を
 * 見ないと理由が分かりません。
 *
 * 同じことは `->>` で書けます（鍵が無ければ NULL が返る）。
 *
 * ── 何を見ているか ──────────────────────────────────────────
 *
 * SQL に見える文字列だけを取り出し、**`${…}` の中（JS の三項演算子）と
 * `--` の注釈を落として**から、`? '` の形を探します。落とさないと
 * `${cond ? 'AND x = 1' : ''}` のような**正しい書き方**が全部引っかかります。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SERVER_SRC = join(ROOT, 'server', 'src');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** `${…}`（JS の式）と `--` の注釈を落とした SQL 本体 */
function sqlBody(literal: string): string {
  return literal.replace(/\$\{[^}]*\}/g, ' ').replace(/--[^\n]*/g, ' ');
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of tsFiles(SERVER_SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/`([^`]*)`/g)) {
      const body = m[1];
      if (!/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(body)) continue;
      const hit = sqlBody(body).match(/\?\s*'[^']*'/);
      if (hit) found.push(`${file.slice(ROOT.length + 1)} — ${hit[0]}`);
    }
  }
  return found;
}

describe('SQL の中で jsonb の存在演算子を使っていないか', () => {
  it('該当する書き方が1つも無い', () => {
    expect(offenders()).toEqual([]);
  });

  it('検査そのものが働いている（`${…}` の三項演算子を誤検知しない）', () => {
    // 正しい書き方: JS の式の中の三項演算子。**引っかかってはいけない**
    const ok = 'SELECT * FROM t WHERE a = ? ${cond ? \'AND b = 1\' : \'\'}';
    expect(sqlBody(ok)).not.toMatch(/\?\s*'/);
    // 落とすべき書き方: jsonb の存在演算子
    const ng = "SELECT * FROM t WHERE payload ? 'task_id'";
    expect(sqlBody(ng)).toMatch(/\?\s*'/);
  });
});
