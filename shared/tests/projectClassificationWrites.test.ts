/**
 * **案件分類を「旧種類だけ」書いている SQL が無いか**を見る検査
 *
 * ── なぜこれが要るか（実際に起きたこと）────────────────────────
 *
 * 案件分類は**2つの持ち方**が併存しています（migration 182 の冒頭）:
 *
 *   旧 `projects.project_type`（1段・7種）          … 一覧・Excel・標準工程・集計が読む
 *   `projects.audience` / `project_category`（2段） … v4 の画面が読む
 *
 * 決めごとは「**書くのはサーバーの1か所**（`project-classification.ts` で導く）」ですが、
 * **通らない口が残っていました** — Excel 取込とシードが `project_type` だけを
 * INSERT / UPDATE していたので、その口から入った案件は2段が空のまま残ります。
 *
 * すると:
 *   ・**案件詳細の概要タブ**は旧種類を案件分類として出す ＝ **登録済みに見える**
 *   ・**案件を直す画面**は2段しか見ない ＝ **「選ぶ」＝未登録に見える**
 *
 * ＝ **同じ案件が、画面によって登録済みと未登録に見えます。**
 * 実際に「すでに案件分類を登録していても、案件を直すを開くと未登録状態になる」と
 * 報告されました。⚠️ **型検査にも lint にも出ません**（SQL の中身は見ない）し、
 * エラーも出ないので、画面を突き合わせた人しか気づけません。
 *
 * ── 何を見ているか ──────────────────────────────────────────
 *
 * `projects` に **`project_type` を書く** SQL（INSERT の列の並び / UPDATE の SET）は、
 * **同じ文の中で `audience` と `project_category` も書いていること**。
 *
 * **空でよいときは `NULL` と書く**（GLS-B の行・投入口のネタ案件）。列ごと
 * 書かないでいると「2段を持たないと決めた」のか「書き忘れた」のかが
 * 読んでも分からず、そこが今回の壊れ方の入口でした。
 *
 * 読むだけの SQL（`SELECT p.project_type` など）は対象外です。
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

/** バッククォートで囲まれた文字列のうち、SQL に見えるものだけ */
function sqlLiterals(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/`([^`]*)`/g)) {
    if (/\b(INSERT\s+INTO|UPDATE)\b/i.test(m[1])) out.push(m[1]);
  }
  return out;
}

/** `--` の注釈を落とす（説明文で落ちない／説明文で通らないようにする） */
const stripComments = (sql: string): string =>
  sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * `projects` に `project_type` を書いている文を取り出す。
 *
 * 返すのは**書いている列の並び**（INSERT なら括弧の中、UPDATE なら SET の中）。
 * SQL を本気で解析しない — 解析器を持つと検査そのものが読めなくなる。
 */
function projectTypeWrites(sql: string): string[] {
  const s = stripComments(sql);
  const out: string[] = [];

  for (const m of s.matchAll(/INSERT\s+INTO\s+projects\s*\(([\s\S]*?)\)/gi)) {
    const cols = m[1].split(',').map((c) => c.trim().toLowerCase());
    if (cols.includes('project_type')) out.push(m[1]);
  }

  for (const m of s.matchAll(/UPDATE\s+projects\s+(?:\w+\s+)?SET\s+([\s\S]*?)(?:\bWHERE\b|$)/gi)) {
    if (/(^|,)\s*project_type\s*=/i.test(m[1])) out.push(m[1]);
  }

  return out;
}

describe('案件分類（旧種類 × 2段）を書く SQL', () => {
  const files = tsFiles(SERVER_SRC);

  it('検査が対象を1つ以上見つけている（見つからないなら正規表現が古い）', () => {
    const found = files.flatMap((f) => sqlLiterals(readFileSync(f, 'utf8')).flatMap(projectTypeWrites));
    // いまの代表は `project.service.ts` の create / update とシード。
    // 0 件になったら、書き方が変わって検査が空振りしている
    expect(found.length).toBeGreaterThan(0);
  });

  it('project_type を書く文は audience / project_category も書いている', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const sql of sqlLiterals(readFileSync(file, 'utf8'))) {
        for (const written of projectTypeWrites(sql)) {
          const missing = ['audience', 'project_category']
            .filter((col) => !new RegExp(`\\b${col}\\b`).test(written));
          if (missing.length > 0) {
            offenders.push(`${file.slice(ROOT.length + 1)} — ${missing.join(' / ')} を書いていない`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
