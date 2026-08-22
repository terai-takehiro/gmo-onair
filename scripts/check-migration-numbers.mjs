#!/usr/bin/env node
/**
 * **DB マイグレーションの番号が重複していないか**を見る（`npm run lint` の1つ）。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * マイグレーションは `server/src/shared/db/migrations/*.sql` をファイル名順に
 * 流します。並行して開いた PR が同じ番号を取ると、**どちらか一方の環境でしか
 * 流れていない**・**流れる順が環境で違う**が起こり得ます。PR テンプレートに
 * 「番号がぶつかっていないか」の目視チェックはありますが、人が見るだけでは
 * 実際に3組の重複が既に入っています（下の GRANDFATHERED）。機械で止めます。
 *
 * ── 既に入ってしまった重複（grandfathered）─────────────────
 *
 * 087 / 095 / 206 は**既に本番まで流れ終わった歴史**なので、いま改名すると
 * 適用記録と食い違ってかえって危険です。**そのままの組だけ**を許し、
 * 同じ番号に**新しいファイルを足すのは許しません**（組が変わったら止まる）。
 *
 * 番号の飛び（欠番）は見ません — 欠番は流す順に影響しないためです。
 *
 * 使い方: node scripts/check-migration-numbers.mjs   （`npm run lint` から呼ばれる）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'server/src/shared/db/migrations');

/** 歴史として許す重複: 番号 → その番号を名乗ってよいファイル名の**完全な組** */
const GRANDFATHERED = new Map([
  ['087', ['087_awards_oneshot_countdown.sql', '087_project_tasks.sql']],
  ['095', ['095_liveops_zoom_teams.sql', '095_quiz_modes_and_stack.sql']],
  ['206', ['206_drop_untracked_drift_tables.sql', '206_weekly_unreviewed_notification.sql']],
]);

const names = fs.readdirSync(DIR).filter((n) => n.endsWith('.sql')).sort();
if (names.length < 100) {
  // ディレクトリを動かした・読み間違えたのに「重複0件で OK」と出すのが最悪なので数で守る
  console.error(`[migrations] ${DIR} に ${names.length} 件しかありません（場所が変わった？）`);
  process.exit(1);
}

/* ── 先頭の番号でまとめる（`001b_…` のような枝付きは番号部分だけを見る）── */
const byNumber = new Map();
for (const n of names) {
  const m = n.match(/^(\d+)/);
  if (!m) continue; // 番号で始まらないものは流す順の取り合いにならないので見ない
  (byNumber.get(m[1]) ?? byNumber.set(m[1], []).get(m[1])).push(n);
}

const bad = [];
for (const [num, group] of byNumber) {
  if (group.length === 1) continue;
  const allowed = GRANDFATHERED.get(num);
  // 組が完全一致のときだけ歴史として通す。1つでも増減・改名されたら止める
  if (allowed && allowed.length === group.length && allowed.every((n, i) => n === group[i])) continue;
  bad.push([num, group]);
}

if (bad.length) {
  console.error(`[migrations] 番号が重複しています（${bad.length} 組）`);
  for (const [num, group] of bad) {
    console.error(`\n  ${num}:`);
    for (const n of group) console.error(`      ${n}`);
  }
  console.error(`
  直し方: 新しく足した側のファイルを、いまの最大番号 +1 に改名してください。
          （既に検証・本番で流れてしまった歴史の組は GRANDFATHERED に載っています。
            そこに**新しく足すのは不可** — 適用記録と食い違う環境が生まれます）
`);
  process.exit(1);
}
console.log(`[migrations] OK (${names.length} ファイル / 番号 ${byNumber.size} 種、新しい重複なし)`);
