#!/usr/bin/env node
/**
 * 変更のあったワークスペースだけビルドする (v2.9.298)
 *
 * `npm run build` は9本すべてを作り直すので **2分前後**かかる。
 * 1アプリだけ直したときに毎回2分待つのは、確認の回数そのものを減らしてしまう。
 * `shared/` を触ったときは**全部**作り直す (共通部品なので影響が全体に出る)。
 *
 *   node scripts/build-changed.mjs            # HEAD との差分
 *   node scripts/build-changed.mjs --base dev # 指定した参照との差分
 */
import { execSync } from 'node:child_process';

const APPS = [
  'client', 'client-qsheet', 'client-equipment', 'client-techsheet',
  'client-live', 'client-awards', 'client-daily', 'server',
];

const baseArg = process.argv.indexOf('--base');
const base = baseArg >= 0 ? process.argv[baseArg + 1] : 'HEAD';

const changed = execSync(`git diff --name-only ${base}; git ls-files -mo --exclude-standard`, {
  encoding: 'utf8',
}).split('\n').filter(Boolean);

const touchesShared = changed.some((f) =>
  f.startsWith('shared/') || f === 'package.json' || f.endsWith('tailwind.preset.ts'));

const targets = touchesShared
  ? APPS
  : APPS.filter((a) => changed.some((f) => f.startsWith(`${a}/`)));

if (targets.length === 0) {
  console.log('[build:changed] 変更のあったワークスペースはありません。');
  process.exit(0);
}
console.log(`[build:changed] ${touchesShared ? 'shared を触ったので全部' : '変更のあった分だけ'}: ${targets.join(', ')}`);
for (const t of targets) {
  execSync(`npm run build -w ${t}`, { stdio: 'inherit' });
}
