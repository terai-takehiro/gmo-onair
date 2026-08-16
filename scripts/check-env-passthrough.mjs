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

/**
 * コメントを落としてから数える。
 *
 * **説明文の中に `process.env.FOO` と書いただけで検査が止まる**のを避けるため
 * （実際に踏んだ: この検査の使い方を説明したコメントで `process.env.X` と書き、
 * 「X という変数が渡されていない」と言われた）。Tailwind がコメントの中の
 * クラス名まで拾うのと同じ踏み方なので、**数える前に落とす**。
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const used = new Set();
for (const file of walk(path.join(root, 'server', 'src'))) {
  const src = stripComments(fs.readFileSync(file, 'utf-8'));
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
}

const compose = fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf-8');

/*
 * ⚠️ **サービスごとに数える**（レビューでの指摘 #95）。
 *
 * 前の版はファイル全体から `NAME:` を集めた**1つの集合**と突き合わせていたので、
 * **`app_prod` にだけ足して `app_dev` に足し忘れても通って**いました。
 * ところが検証環境（`app_dev`）は**最初に試す場所**なので、そこに届いていないと
 * 「入れたのに効かない」を**いちばん確かめたい環境で**踏みます
 * （しかもこの検査の文面自身が「app_prod と app_dev の environment: に足して」と
 * 言っているので、通ったら両方に入っていると読まれます）。
 */
const SERVICES = ['app_prod', 'app_dev'];

/**
 * **片方だけが正しい変数**。⚠️ **理由を必ず書くこと** —
 * 理由の無い除外が増えると、この検査は「いつも通る」だけの飾りになります。
 */
const ONE_SIDED = {
  // 本番だけ
  ADMIN_EMAIL: 'app_prod — 本番だけマスター管理者を自動で作る（検証は mockAuth のユーザーカード）',
  ENCRYPTION_KEY: 'app_prod — 本番のみ必須。検証は NODE_ENV=development なので JWT secret から導く（contexts/liveops/crypto.ts）',
  SKIP_SEED: 'app_prod — 本番だけシード投入を止める（検証は毎回入れて自由に壊せるようにする）',
  SMTP_HOST: 'app_prod — ⚠️ 検証から送ると取引先に本物のメールが届く',
  SMTP_PORT: 'app_prod — 同上',
  SMTP_SECURE: 'app_prod — 同上',
  SMTP_USER: 'app_prod — 同上',
  SMTP_PASS: 'app_prod — 同上',
  SMTP_FROM: 'app_prod — 同上',
  TWILIO_ACCOUNT_SID: 'app_prod — ⚠️ 検証から送ると本物の SMS が飛ぶ（2FA）',
  TWILIO_AUTH_TOKEN: 'app_prod — 同上',
  TWILIO_PHONE_NUMBER: 'app_prod — 同上',
  // 検証だけ
  AUTH_MODE: 'app_dev — 検証だけ mockAuth に切り替える（本番は Google / パスワード固定）',
};

/** そのサービスの `environment:` に並んでいる変数名 */
function envOf(service) {
  const head = new RegExp(`^  ${service}:\\s*$`, 'm');
  const at = compose.search(head);
  if (at < 0) return null;                       // サービスごと無い（構成が変わった）
  const rest = compose.slice(at + 1);
  const end = rest.search(/^ {2}[a-z0-9_-]+:\s*$/m);
  const block = end < 0 ? rest : rest.slice(0, end);
  return new Set([...block.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map((m) => m[1]));
}

const byService = new Map(SERVICES.map((s) => [s, envOf(s)]));
for (const [s, set] of byService) {
  if (!set) {
    console.error(`[env-passthrough] docker-compose.yml に ${s} が見つかりません（構成が変わった？）`);
    process.exit(1);
  }
}

/*
 * ⚠️ **除外した変数も、書いてあるとおりに置かれているか見る**
 * （レビューでの指摘 #128）。
 *
 * 前の版は `ONE_SIDED` を**名前だけで素通り**させており、値に書いた
 * 「どちらのサービスか」を**一度も確かめていませんでした**。そのため:
 *
 *  ・`SMTP_HOST` を `app_prod` から**消しても**この検査は通る
 *    （本番のメールが黙って止まり、検査は「OK」と言う）
 *  ・`SMTP_HOST` を `app_dev` に**移しても**通る
 *    ⚠️ これは**検証環境から取引先に本物のメールが飛ぶ**ということです
 *    （まさにこの除外の理由文が「危ないから片方だけ」と言っている当のもの）
 *
 * **書いてある側に在ること・反対側に無いこと**の両方を見ます。
 * 反対側まで見るのは、この一覧の大半（SMTP / Twilio / AUTH_MODE）が
 * **「片方に無いこと」が安全の理由**だからです。
 */
const oneSidedProblems = [];
for (const [name, why] of Object.entries(ONE_SIDED)) {
  const m = /^(app_prod|app_dev)\b/.exec(why);
  if (!m) {
    oneSidedProblems.push(`${name} … 理由が「app_prod — 」「app_dev — 」で始まっていません`
      + `（どちらに置くのか読み取れないので検査できません）`);
    continue;
  }
  const declared = m[1];
  const other = declared === 'app_prod' ? 'app_dev' : 'app_prod';
  if (!byService.get(declared).has(name)) {
    oneSidedProblems.push(`${name} … ${declared} に置くと書いてあるのに、そこにありません`
      + `（"${why}"）`);
  }
  if (byService.get(other).has(name)) {
    oneSidedProblems.push(`${name} … ${declared} だけのはずが ${other} にもあります`
      + `（"${why}"）`);
  }
}

if (oneSidedProblems.length) {
  console.error('[env-passthrough] ✗ 片方だけに渡すと決めた変数が、そのとおりになっていません:\n');
  for (const p of oneSidedProblems) console.error(`  - ${p}`);
  console.error(`
**この一覧は「検査から外す」ためのものではなく「片方だけが正しい」という決めごと**です。
docker-compose.yml を直すか、決めごとのほうが変わったのなら
scripts/check-env-passthrough.mjs の ONE_SIDED の理由文を直してください。
`);
  process.exit(1);
}

/** どちらか一方にでも欠けていたら足りない扱い */
const missing = [...used]
  .filter((v) => !(v in INTENTIONAL) && !(v in ONE_SIDED)
    && SERVICES.some((s) => !byService.get(s).has(v)))
  .sort();

if (missing.length) {
  for (const v of missing) {
    const only = SERVICES.filter((s) => byService.get(s).has(v));
    if (only.length > 0) {
      console.error(`[env-passthrough] ⚠️ ${v} は ${only.join(' / ')} にしかありません`
        + `（片方だけだと、入っていないほうの環境で「入れたのに効かない」になります）`);
    }
  }
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
