#!/usr/bin/env node
/**
 * `.env` に書いたのにコンテナへ届かない環境変数を止める
 *
 * ── なぜ要るのか（実際に踏んだ）────────────────────────────────
 *
 * `docker-compose.yml` は `env_file:` ではなく **`environment:` の許可リスト**で
 * 変数を渡します。つまり **ここに書いていない変数は `.env` にあっても
 * コンテナに届きません**。
 *
 * v4.0.2 の時点で、コードが読むのに渡されていない変数が **7つ**ありました:
 *   AI_PRICING_JSON / ACTIVITY_FORMAT_NIGHTLY / ACTIVITY_AI_MODEL /
 *   KPT_AI_MODEL / MINUTES_AI_MODEL / MINUTES_STT_MODEL / INTAKE_AI_MODEL_LIGHT
 *
 * どれも `.env.example` には書き方まで説明してあり、**入れれば効くつもりで
 * 案内していました**。実際には
 *   ・費用の金額がいつまでも出ない（単価を入れたのに）
 *   ・毎晩の整形を `off` にしても止まらない
 * という形になり、**画面にもログにも「届いていない」とは出ません**。
 *
 * ── 何を照合するか ──────────────────────────────────────────
 *
 * `server/src` の `process.env.X` を集めて、`docker-compose.yml` の
 * `environment:` に X があるかを見ます。**無ければ落とします。**
 *
 * ⚠️ **「渡さないのが正しい」変数がある**ので、下の表で名指しして除きます。
 * ここに足すときは**理由を必ず書くこと** — 理由の無い除外が増えると、
 * この検査は「いつも通る」だけの飾りになります。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 渡さないのが正しい変数。**理由を書くこと** */
const INTENTIONAL = {
  NODE_ENV: 'compose が別途 environment に持っている（値も prod/dev で固定）',
  PORT: '同上（コンテナ内は固定ポート）',
  DB_NAME: '接続は DATABASE_URL 1本。決算取込が「いまどちらの DB か」を見るための保険で、'
    + '未設定なら DATABASE_URL から判定する（渡すと2つの正が生まれる）',
  RUN_SEED_ON_STARTUP: '本番は SKIP_SEED=true で止めている。渡すと本番にシードを入れる道ができる',
  HTTPS_ENABLED: '本番判定（NODE_ENV=production）で自動的に有効。手で上書きさせない',
  MCP_ACTOR_ID: '既定 `mcp-claude` のまま運用している。変えると監査ログの主体が過去と食い違う',
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const used = new Set();
for (const file of walk(path.join(root, 'server', 'src'))) {
  const src = fs.readFileSync(file, 'utf-8');
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
}

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf-8');
// `environment:` の下の `NAME: ...`（コメント行は取らない）
const passed = new Set(
  [...compose.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map((m) => m[1]),
);

const missing = [...used].filter((v) => !passed.has(v) && !(v in INTENTIONAL)).sort();

if (missing.length) {
  console.error('[env-passthrough] docker-compose.yml が渡していない環境変数があります:\n');
  for (const v of missing) console.error(`  - ${v}`);
  console.error(`
**.env に書いてもコンテナに届きません**（"入れたのに効かない" になります）。
docker-compose.yml の app_prod と app_dev の environment: に足してください。

  ${'$'}{${missing[0]}:-}                       # 本番
  ${'$'}{${missing[0]}_DEV:-${'$'}{${missing[0]}:-}}   # 検証（分けたいときだけ _DEV を作る）

渡さないのが正しいときは scripts/check-env-passthrough.mjs の INTENTIONAL に
**理由つきで**足してください。`);
  process.exit(1);
}

console.log(`[env-passthrough] OK (${used.size} 変数中 ${Object.keys(INTENTIONAL).length} 件は意図的に非公開)`);
