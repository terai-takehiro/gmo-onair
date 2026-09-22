import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// migration 305（通知のひな形に残っていた「過ぎています」系の言い方を揃える）を固定する。
//
// ── なぜ DB を使わずに文字列で確かめるか ─────────────────────────
// 305 の UPDATE は「本文が migration 177 で入れた元の文字列と**完全に一致する**行だけ」を書き換える
// （人が「知らせと文面」で直した文面を上書きしないため）。この形の弱点は、
// **条件側の文字列を1文字でも写し間違えると、エラーにならずに0行更新で黙って終わる**こと。
// 本番で「流したのに何も変わっていない」に気づくのは、利用者がまた「過ぎています」を見つけたときになる。
// そこで条件側の文字列が 177 の INSERT と1バイト違わないことを、CI（`npm run test`）で毎回確かめる。
// 実 DB での①書き換わる ②手で直した行は変わらない ③2回目は0行 は、PR 作成時に検証用 Postgres で実測した。

const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = path.join(here, '../src/shared/db/migrations');
const read = (name) => readFileSync(path.join(migrations, name), 'utf8');
const m177 = read('177_notifications.sql');
const m305 = read('305_notification_template_overdue_wording.sql');

/** `E'...'` の中身を取り出す（ひな形の本文に `'` は入っていないので、次の `'` までで足りる） */
function eLiteralAfter(sql, from) {
  const start = sql.indexOf("E'", from);
  assert.notEqual(start, -1, 'E\'…\' が見つかりません');
  const end = sql.indexOf("'", start + 2);
  return sql.slice(start + 2, end);
}

/** 177 の INSERT で、その id の行に入れた本文（行の中で最初の E'…' が本文） */
function body177(id) {
  const at = m177.indexOf(`('${id}',`);
  assert.notEqual(at, -1, `177 に ${id} の行がありません`);
  return eLiteralAfter(m177, at);
}

/** 305 のその id の UPDATE から、新しい本文（SET 側）と元の本文（WHERE 側）を取り出す */
function update305(id) {
  const where = m305.indexOf(`WHERE id = '${id}'\n   AND body = `);
  assert.notEqual(where, -1, `305 に ${id} の本文の UPDATE がありません`);
  const set = m305.lastIndexOf('SET body = ', where);
  return { next: eLiteralAfter(m305, set), prev: eLiteralAfter(m305, where) };
}

const IDS = ['inv_late', 'eq_return', 'inv_send_todo'];

// `scripts/check-ui-tokens.mjs` の `overdue-wording` と同じ語（画面の検査はコードの文字列だけを見るので、
// SQL の中の文面は検査の外にある。ここで同じ規則を当てる）
const OVERDUE_COLLOQUIAL = /過ぎ|期限ぎれ|あと[ \u3000]*(?:\{[^}]*\}|[0-9０-９]+)[ \u3000]*日|今日が期限|今日まで|今日期限|明日が期限|本日返却|日[ \u3000]+超過/;

for (const id of IDS) {
  test(`305 ${id}: 条件の文字列が 177 で入れた本文と完全に一致する（写し間違いで0行更新にならない）`, () => {
    assert.equal(update305(id).prev, body177(id));
  });

  test(`305 ${id}: 新しい本文に口語の期限表現が無い（docs/wording.md ルール8）`, () => {
    const { next } = update305(id);
    assert.doesNotMatch(next, OVERDUE_COLLOQUIAL);
    assert.notEqual(next, body177(id), '本文が変わっていない');
  });
}

test('305: 部分一致・置換で書き換えない（人が直した文の中の語まで機械が触らないため）', () => {
  const code = m305.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /\bLIKE\b|\breplace\s*\(|regexp_replace/i);
  // 本文の UPDATE はどれも「元の文字列と一致」を条件に持つ
  const bodyUpdates = code.match(/SET body = /g) ?? [];
  const guarded = code.match(/AND body = E'/g) ?? [];
  assert.equal(bodyUpdates.length, IDS.length);
  assert.equal(guarded.length, IDS.length);
});

test('305 eq_return: 新しい本文が使う {遅延日数} を vars に足し、足す条件で2回目を0行にしている', () => {
  assert.match(update305('eq_return').next, /\{遅延日数\}/);
  assert.match(m305, /SET vars = vars \|\| '\["\{遅延日数\}"\]'::jsonb\n WHERE id = 'eq_return'\n {3}AND NOT \(vars @> '\["\{遅延日数\}"\]'::jsonb\);/);
});

test('305 eq_return: 実際に届く通知（scheduler.service.ts）と同じ言い方「N 日超過しています」', () => {
  const scheduler = readFileSync(
    path.join(here, '../src/contexts/platform/services/scheduler.service.ts'), 'utf8');
  assert.match(scheduler, /\{遅延日数\} 日超過しています/);
  assert.match(update305('eq_return').next, /\{遅延日数\} 日超過しています/);
});
