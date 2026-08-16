#!/usr/bin/env node
/**
 * **マージ済みの PR に、返していないレビュー指摘が残っていないか**を出す
 *
 * ── なぜ要るか（実測）────────────────────────────────────────
 *
 * **マージすると、レビューの指摘は GitHub の画面から消えます。** 直っていなくても
 * 消えるので、**誰も見なくなります**。実際にこうなっていました:
 *
 *  ・v4 の PR 68 本に **143 件**の指摘が付いたまま埋もれていた
 *  ・その 143 件を**潰す作業そのもの**にも **26 件**付き、**24 件は記録されていなかった**
 *  ・そのうち1件は **P1**（リリースが出せなくなる回帰）で、
 *    **潰す PR がリリースを塞いだ**ことに誰も気づいていなかった
 *
 * つまり**「レビューを見る」を人の記憶に任せると、必ず抜けます**。
 * ここが数えられる形にしておくための道具です。
 *
 * ── 使い方 ──────────────────────────────────────────────────
 *
 *   GITHUB_TOKEN=… npm run reviews:debt          # 直近 20 本のマージ済み PR
 *   GITHUB_TOKEN=… npm run reviews:debt -- 50    # 直近 50 本
 *
 * ⚠️ **止める門にはしていません**（`npm run lint` に入れていない）。
 * 外の API に依存するものを門にすると、**GitHub が重い日にビルドが止まります**。
 * これは**マージのあとに人が見る**ためのものです。
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**未解決（`isResolved: false`）だけ**を出す。返信して解決したものは出さない
 *  ・**棚卸し（`docs/reviews/codex-findings-v4.md`）に PR 番号が載っていれば
 *    「記録済み」**として印を分ける。⚠️ **「直した」ではなく「書いた」**の意味です
 *  ・**0 件でも「0 件でした」と出す。** 黙って終わると、動いたのか動いていないのか
 *    分かりません（この製品が何度も踏んでいる形）
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INVENTORY = 'docs/reviews/codex-findings-v4.md';

/** レビューを書く相手。**人の返信と区別する**ため */
export const REVIEWERS = ['chatgpt-codex-connector', 'copilot', 'coderabbitai'];

export function isReviewerLogin(login) {
  const l = String(login ?? '').toLowerCase();
  return REVIEWERS.some((r) => l.includes(r.replace(/-connector$/, '')));
}

/**
 * 返していない指摘だけ拾う。
 *
 * **スレッドの1つ目の書き込み**で判断します（2つ目以降は人の返信）。
 * ⚠️ **`isResolved` を見るだけでは足りません** — この製品は解決印を押す運用を
 * していないので、**返信があるかどうか**も添えて出します（人が読んで決める）。
 */
export function openThreadsOf(pr) {
  const out = [];
  for (const t of pr.reviewThreads?.nodes ?? []) {
    if (t.isResolved) continue;
    const first = t.comments?.nodes?.[0];
    if (!first || !isReviewerLogin(first.author?.login)) continue;
    out.push({
      pr: pr.number,
      title: pr.title,
      mergedAt: pr.mergedAt,
      path: first.path ?? '(ファイル不明)',
      weight: /P1 Badge/.test(first.body ?? '') ? 'P1' : 'P2',
      summary: firstLineOf(first.body ?? ''),
      replied: (t.comments?.totalCount ?? 1) > 1,
    });
  }
  return out;
}

/**
 * 指摘の見出し（Codex は太字1行目に要点を書く）。
 *
 * ⚠️ **札を「1つだけ」と決めて書かないこと。** 実物は
 * `**<sub><sub>![P1 Badge](…)</sub></sub>  要点**` と**入れ子**になっており、
 * `<sub>…</sub>` を1組だけ飛ばす書き方だと**閉じ札が要点に混ざります**
 * （実際に混ざったので直した）。**太字の中身を取ってから、札と画像を落とす**。
 */
export function firstLineOf(body) {
  const m = /\*\*([\s\S]*?)\*\*/.exec(body);
  const raw = m ? m[1] : (body.split('\n').find(Boolean) ?? '');
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')   // バッジの画像
    .replace(/<[^>]+>/g, '')                 // <sub> などの札（入れ子でも落ちる）
    .trim()
    .slice(0, 90);
}

/**
 * 棚卸しに**その PR 番号が書かれているか**。
 * ⚠️ **「直した」ではなく「書いた」**を見ています（直したかは表の状態欄が持つ）。
 */
export function isRecorded(prNumber, doc) {
  return new RegExp(`#${prNumber}\\b`).test(doc);
}

export function formatReport(threads, doc) {
  if (threads.length === 0) {
    return '[reviews] 返していない指摘はありません（0 件）';
  }
  const lines = [`[reviews] 返していない指摘が ${threads.length} 件あります:\n`];
  const byPr = new Map();
  for (const t of threads) {
    if (!byPr.has(t.pr)) byPr.set(t.pr, []);
    byPr.get(t.pr).push(t);
  }
  for (const [pr, list] of [...byPr].sort((a, b) => b[0] - a[0])) {
    const recorded = isRecorded(pr, doc) ? '記録あり' : '⚠️ 棚卸しに未記載';
    lines.push(`  #${pr} ${list[0].title}  — ${recorded}`);
    for (const t of list) {
      lines.push(`    [${t.weight}] ${t.path}${t.replied ? '（返信あり）' : ''}`);
      lines.push(`          ${t.summary}`);
    }
  }
  lines.push(`
  **マージしても指摘は消えません（画面から見えなくなるだけ）。**
  直すか、直さないと決めた理由を ${INVENTORY} の表に足してください。
  ⚠️ **決めたものも表から消さないこと** — 消すと次に読んだ人には無かったことになります。`);
  return lines.join('\n');
}

const QUERY = `query($owner:String!,$repo:String!,$n:Int!){
  repository(owner:$owner,name:$repo){
    pullRequests(states:MERGED, first:$n, orderBy:{field:UPDATED_AT,direction:DESC}){
      nodes{
        number title mergedAt
        reviewThreads(first:50){
          nodes{ isResolved comments(first:1){ totalCount nodes{ body path author{login} } } }
        }
      }
    }
  }
}`;

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error(`[reviews] GITHUB_TOKEN が要ります。

  GITHUB_TOKEN=<token> npm run reviews:debt

  （読み取りだけです。GitHub の Settings → Developer settings →
   Personal access tokens で repo の read 権限を付けてください）`);
    process.exit(2);
  }
  const n = Number(process.argv[2]) || 20;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { owner: 'terai-takehiro', repo: 'gmo-onair', n } }),
  });
  if (!res.ok) {
    console.error(`[reviews] GitHub が ${res.status} を返しました`);
    process.exit(2);
  }
  const body = await res.json();
  if (body.errors) {
    console.error(`[reviews] GitHub のエラー: ${body.errors.map((e) => e.message).join(' / ')}`);
    process.exit(2);
  }
  const prs = body.data?.repository?.pullRequests?.nodes ?? [];
  const threads = prs.flatMap(openThreadsOf);
  const doc = readFileSync(join(ROOT, INVENTORY), 'utf8');
  console.log(formatReport(threads, doc));
  console.log(`\n  （マージ済み ${prs.length} 本を見ました）`);
}

// **CLI として起動されたときだけ走らせる**（試験から純粋な関数を読めるように）
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
