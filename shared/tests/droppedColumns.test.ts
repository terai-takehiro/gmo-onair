/**
 * **落とした列を SQL がまだ読んでいないか**を見る検査
 *
 * ── なぜこれが要るか（実際に起きたこと）────────────────────────
 *
 * migration 184 が `projects.notes` を落としたとき、案件管理側は
 * やり取りへ移して直しましたが、**プロジェクト管理（GPM）が取り残されました**。
 * `gpm.service.ts` の SELECT / INSERT / UPDATE が `notes` を触りつづけていたので、
 * プロジェクト管理は**一覧・詳細・作る・直すの4つとも 500 で落ちていました**
 * （`column "notes" of relation "projects" does not exist`）。
 *
 * これは**型検査にも lint にも出ません** — TypeScript は SQL の中身を見ないので、
 * 実 Postgres に当てるまで気づけません。画面には「サーバー内部エラー」とだけ出るので、
 * 使う人からは「プロジェクト管理が開かない」に見えます。
 *
 * ── 何を見ているか ──────────────────────────────────────────
 *
 * ① migration の `DROP COLUMN IF EXISTS` を集める（あとで足し直された列は外す）
 * ② サーバーの SQL 文字列だけを取り出す（`--` の注釈は落とす —
 *    「migration 184 で projects.notes を落とした」という**説明文は正しい**ので、
 *    素の文字列検索にすると注釈で落ちる）
 * ③ その表を触っている SQL が、落ちた列を読み書きしていないかを見る
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const MIGRATIONS = join(ROOT, 'server', 'src', 'shared', 'db', 'migrations');
const SERVER_SRC = join(ROOT, 'server', 'src');

/** `<表>.<列>` の組。落ちた列の集合を作るのに使う */
type ColRef = `${string}.${string}`;

function droppedColumns(): Set<ColRef> {
  const dropped = new Set<ColRef>();
  // **番号の順に読む。** 落としたあとに足し直された列は「いま無い」とは言えない
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)) {
      dropped.add(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
    }
    for (const m of sql.matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi)) {
      dropped.delete(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`);
    }
  }
  return dropped;
}

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/** バッククォートで囲まれた文字列のうち、SQL に見えるものだけ */
function sqlLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/`([^`]*)`/g)) {
    const body = m[1];
    if (/\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\b/i.test(body)) out.push(body);
  }
  return out;
}

/** `-- ...` の注釈を落とす（説明文で落ちないようにする） */
const stripComments = (sql: string): string => sql.replace(/--[^\n]*/g, ' ');

/**
 * その SQL が `table` の落ちた列 `col` を触っているか。
 *
 * 見るのは3か所だけ（SQL を本気で解析しない — 解析器を持つと、
 * 検査そのものが読めなくなって誰も直せなくなる）:
 *   ・`表.列` と `別名.列`（`FROM 表 別名` / `JOIN 表 別名` から別名を拾う）
 *   ・`INSERT INTO 表 (…列…)` の列の並び
 *   ・`UPDATE 表 SET …列 = …`
 */
function touchesColumn(sql: string, table: string, col: string): boolean {
  const s = stripComments(sql);
  if (!new RegExp(`\\b${table}\\b`, 'i').test(s)) return false;

  if (new RegExp(`\\b${table}\\.${col}\\b`, 'i').test(s)) return true;

  const aliases = new Set<string>();
  for (const m of s.matchAll(new RegExp(`\\b(?:FROM|JOIN|UPDATE|INTO)\\s+${table}\\s+(?:AS\\s+)?(\\w+)`, 'gi'))) {
    const a = m[1].toLowerCase();
    // `SET` / `WHERE` などの語を別名と取り違えない
    if (!['set', 'where', 'on', 'values', 'select', 'using', 'group', 'order', 'left', 'inner', 'join'].includes(a)) {
      aliases.add(a);
    }
  }
  for (const a of aliases) {
    if (new RegExp(`\\b${a}\\.${col}\\b`, 'i').test(s)) return true;
  }

  const ins = s.match(new RegExp(`INSERT\\s+INTO\\s+${table}\\s*\\(([^)]*)\\)`, 'i'));
  if (ins && ins[1].split(',').some((c) => c.trim().toLowerCase() === col)) return true;

  const upd = s.match(new RegExp(`UPDATE\\s+${table}\\s+SET\\s+([\\s\\S]*?)(?:\\bWHERE\\b|$)`, 'i'));
  if (upd && new RegExp(`(^|,)\\s*${col}\\s*=`, 'i').test(upd[1])) return true;

  return false;
}

describe('落とした列を SQL がまだ読んでいないか', () => {
  const dropped = [...droppedColumns()];

  it('migration から落ちた列を拾えている', () => {
    // いま落ちている代表が `projects.notes`（migration 184）。
    // ここが空になったら、上の正規表現が migration の書き方に付いていけていない
    expect(dropped).toContain('projects.notes');
  });

  it('サーバーの SQL が落ちた列を触っていない', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(SERVER_SRC)) {
      const source = readFileSync(file, 'utf8');
      const literals = sqlLiterals(source);
      if (literals.length === 0) continue;
      for (const ref of dropped) {
        const [table, col] = ref.split('.');
        for (const sql of literals) {
          if (touchesColumn(sql, table, col)) {
            offenders.push(`${file.slice(ROOT.length + 1)} — ${ref}`);
            break;
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
