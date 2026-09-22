#!/usr/bin/env node
/**
 * **Claude が作るモックの画面文字に、開発文書の比喩語と禁止語が出ていないか**を見る（`npm run lint` の1つ）。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 設計書は「道具・決めごと・棚・札・帯・木・種・口・手つき・作法」のような比喩で書いてあり、
 * モックを作るときにその語がそのまま画面の文言に漏れていた（「この道具の決めごと」など）。
 * 利用者からのご指摘（2026-09-22）: 「謎表現が相も変わらず続いています。こういった表現は抹殺を。
 * ちゃんとルール化してください」。ルールは `docs/wording.md` ルール11。
 *
 * 画面の実装は `scripts/check-ui-tokens.mjs`（`forbidden-wording` / `metaphor-wording`）が見るが、
 * **モックは実装の前に作るもの**なので、ここで止めないと実装に写る。
 *
 * ── 何を見るか ──────────────────────────────────────────────
 *
 *  対象: Claude が作るモックのフォルダ（`native/`・`keep-report/`・`regular/`・`tasks-redesign/`・`weekly-redesign/`）
 *        の `.dc.html`。デザイナーのハンドオフ原文（`mockups/` 直下）は見ない（原文は直さない決めごと）。
 *  見る: HTML コメント・JS コメント・タグを落とした**画面に出る文字**（ラベルは JS の配列にもあるので script の中も見る。
 *        タグの属性は落とすが、利用者に見える placeholder・title・aria-label・alt の値は残す）。
 *  止める: `forbidden-wording`（画面に出さないと決めた言葉。check-ui-tokens.mjs と同じ）と
 *          `metaphor-wording`（開発文書の比喩語）。
 *
 * ── 記録（BASELINE）────────────────────────────────────────
 *
 * 2026-09-22 時点でモックに残っていた分はファイル別に件数を記録し、**増えたときだけ止める**
 * （旧モックの直しは別の作業。減らしたら `--update` で記録も下げること）。
 * ここに無いファイルは 0 件が正で、**1件でも出たら止まる**。
 *
 * 使い方: node scripts/check-mock-wording.mjs            （`npm run lint` から呼ばれる）
 *         node scripts/check-mock-wording.mjs --update   （記録を実測値に書き直す）
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MOCK_ROOT = 'docs/design/v4/mockups';
const DIRS = ['native', 'keep-report', 'regular', 'tasks-redesign', 'weekly-redesign'];

const RULES = [
  {
    id: 'forbidden-wording',
    // check-ui-tokens.mjs の `forbidden-wording` と同じ語（片方だけ直すとまた食い違うので、足すときは両方）
    re: /データがありません|共用キー|タイムアウト|トースト|ビジネス案件|MCP|論理削除|ぜんぶ|さばく|見るだけ|書ける|動いているもの|止まっているもの|今日さばくもの|書き留めたもの|やり切れ|壁打ち|ひと押し/g,
    why: '画面に出さないと決めた言葉です（`docs/wording.md` ルール5・9）',
  },
  {
    id: 'metaphor-wording',
    // 開発文書の比喩語（`docs/wording.md` ルール11）。1文字の語は普通の語と衝突するので比喩の形だけを見る。
    // 「小道具」「大道具」「棚卸」「凍結」は業務語なので除く。「生きている」「凍る」「古びる」と、
    // 入口・出口の比喩の形（「〜の入口」「入口は」「出口を」）も見る（Codex レビュー #720）。
    re: /決めごと|きめごと|(?<![小大])道具|手つき|作法|手入れ|棚(?!卸)|札(?=[がをに]付)|(?<=の)帯(?=[をがに]|$)|(?<=の)木(?![曜材])|(?<=の)種(?![類別])|(?<=の)器(?=[にをが]|$)|生きて|凍(?!結)|古び|(?<=の)(?:入口|出口)|(?:入口|出口)(?=[はを])/g,
    why: '開発文書の比喩語は画面に出しません（`docs/wording.md` ルール11: 道具→アプリ／機能・決めごと→ルール・棚→区分・札→表示・帯→バナー／ツールバー・木→ツリー・種→候補・手つき／作法→操作・生きている／凍る／古びる→有効／固定／期限切れ・入口／出口→メニュー／リンク）',
  },
];

/** 画面に出る文字だけを残す（HTML コメント・JS コメント・タグを落とす） */
function visibleText(html) {
  let t = html.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, js) => ' ' + js.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1') + ' ');
  t = t.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  // タグは落とすが、利用者に見える属性（placeholder・title・aria-label・alt）の値は残す
  t = t.replace(/<[^>]+>/g, (tag) => ' ' + [...tag.matchAll(/\s(?:placeholder|title|aria-label|alt)=(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]).join(' ') + ' ');
  return t;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.dc.html')) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(join(ROOT, MOCK_ROOT, d)));
const findings = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  const text = visibleText(readFileSync(file, 'utf8'));
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      const at = m.index;
      const ctx = text.slice(Math.max(0, at - 14), at + m[0].length + 14).replace(/\s+/g, ' ').trim();
      findings.push({ rel, id: rule.id, word: m[0], ctx, why: rule.why });
    }
  }
}

/** ファイル別の記録（2026-09-22 の実測。減らしたら --update で下げる） */
const BASELINE = {};

const counts = {};
for (const f of findings) {
  counts[f.rel] ??= {};
  counts[f.rel][f.id] = (counts[f.rel][f.id] ?? 0) + 1;
}

if (process.argv.includes('--update')) {
  const sorted = Object.fromEntries(Object.entries(counts).sort().map(([k, v]) => [k, Object.fromEntries(Object.entries(v).sort())]));
  const json = JSON.stringify(sorted, null, 2).replace(/\n {2}"([^"]+)": \{\n {4}/g, '\n  "$1": { ').replace(/\n {4}"/g, ' "').replace(/\n {2}\}/g, ' }');
  const self = fileURLToPath(import.meta.url);
  const src = readFileSync(self, 'utf8');
  writeFileSync(self, src.replace(/const BASELINE = \{[\s\S]*?\n\};/, `const BASELINE = ${json};`));
  console.log('[mock-wording] 記録を書き直しました:\n' + json);
  process.exit(0);
}

const blocking = [];
for (const [rel, byRule] of Object.entries(counts)) {
  for (const [id, n] of Object.entries(byRule)) {
    const allowed = BASELINE[rel]?.[id] ?? 0;
    if (n > allowed) blocking.push({ rel, id, n, allowed });
  }
}

if (blocking.length === 0) {
  const total = findings.length;
  console.log(`[mock-wording] OK（${files.length} ファイル。記録の範囲内 ${total} 件）`);
  process.exit(0);
}

console.error('[mock-wording] モックの画面文字に、画面に出さないと決めた言葉があります:');
for (const b of blocking) {
  const rule = RULES.find((r) => r.id === b.id);
  console.error(`\n  ${b.rel}  [${b.id}] 記録 ${b.allowed} → ${b.n}`);
  for (const f of findings.filter((f) => f.rel === b.rel && f.id === b.id)) console.error(`    「${f.word}」 …${f.ctx}…`);
  console.error(`    → ${rule.why}`);
}
console.error('\n  直し方: 画面の語に置き換える（docs/wording.md ルール9・11）。旧モックを直して減ったら --update で記録を下げる。');
process.exit(1);
