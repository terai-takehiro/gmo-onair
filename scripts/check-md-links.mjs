#!/usr/bin/env node
/**
 * `docs/` の Markdown の**相対リンクが実在するか**を見る（`npm run lint` の1つ）。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 文書のリンク切れは**押した人しか気づけません**。ファイルの改名・移動
 * （直近では `client-qsheet/` → `client-techops/`）のたびに、そこを指していた
 * 文書は黙って切れます。実測でこの検査を書いた時点で **7 件**切れていました
 * （qsheet 改名の取り残し4件・階層の数え間違い2件・自分の場所からの重ね書き1件）。
 *
 * ── 何を見るか / 見ないか ──────────────────────────────────
 *
 *  見る: `docs/` 下の .md の ①インラインリンク `[文](先)`（画像 `![]()` 含む）
 *        ② 参照定義 `[名]: 先`。相対パスをその文書の場所から解決し、
 *        ファイルかディレクトリが**実在する**こと（`#断片` は落としてから見る）
 *  見ない:
 *   ・`http(s)://`・`mailto:`（外部）・`#…`（同じ文書の中）
 *   ・`/` 始まり（アプリのルート。ファイルではない — 画面側は check-links.mjs が見る）
 *   ・``` のコード柵の中・`…` のコード区間（例として書いた偽リンクを拾わないため)
 *   ・docs/version-history.md と docs/changelog.d/**（追記専用の過去ログ。
 *     当時のまま残す決めごとなので、リンクの手入れはしない）
 *
 * ルートの README.md / CLAUDE.md / CONTRIBUTING.md も対象（R3-c で README を
 * 減量したときに足した。ここに入っていないと入口のリンク切れに誰も気づけない）。
 *
 * 使い方: node scripts/check-md-links.mjs   （`npm run lint` から呼ばれる）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** わざと切れたまま置くもの: 「docs からの相対パス:リンク先」→ 理由（必ず書く） */
const ALLOW = new Map([
  // 例: ['docs/foo.md:../bar.md', 'bar.md は次の PR で足す'],
]);

/* ── 対象の .md を集める ─────────────────────────────────── */
const SKIP = (rel) =>
  rel === 'docs/version-history.md' || rel.startsWith('docs/changelog.d/');

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith('.md')) files.push(f);
  }
})(path.join(ROOT, 'docs'));
// ルートの入口3枚も見る（README は R3-c で減量済み・リンクはここが守る）
for (const name of ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
  const f = path.join(ROOT, name);
  if (fs.existsSync(f)) files.push(f);
}

/* ── リンクを拾って解決する ──────────────────────────────── */
const bad = [];
let seen = 0;
for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  if (SKIP(rel)) continue;
  let inFence = false;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    // コード区間 `…` は説明用の書き方見本なので落とす。[`名`](先) の「先」は残る
    const text = line.replace(/`[^`]*`/g, '``');
    const targets = [];
    for (const m of text.matchAll(/!?\[[^\]]*\]\(\s*<?([^)<>\s]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      targets.push(m[1]);
    }
    const ref = text.match(/^\s*\[[^\]]+\]:\s+(\S+)/); // 参照定義
    if (ref) targets.push(ref[1]);
    for (const t of targets) {
      if (/^(https?:|mailto:|#|\/)/.test(t)) continue;
      const noFrag = t.split('#')[0];
      if (!noFrag) continue;
      seen += 1;
      if (ALLOW.has(`${rel}:${t}`)) continue;
      // 生の % を含むリンク先 (例: 50%off.md) で decodeURIComponent が
      // URIError を投げ、検査ごと落ちる — そのまま (エンコードなし) で解決する
      let decoded = noFrag;
      try { decoded = decodeURIComponent(noFrag); } catch { /* 生のまま使う */ }
      const abs = path.resolve(path.dirname(f), decoded);
      if (!fs.existsSync(abs)) bad.push(`${rel}:${i + 1}  →  ${t}`);
    }
  });
}

if (bad.length) {
  console.error(`[md-links] リンク切れが ${bad.length} 件あります（押しても何も出ません）`);
  for (const b of bad) console.error(`    ${b}`);
  console.error('\n  直し方: リンク先の今の場所を確かめて書き直す（改名・移動の取り残しが典型）。');
  console.error('          わざと切れたまま置くなら scripts/check-md-links.mjs の ALLOW に理由付きで足す');
  process.exit(1);
}
console.log(`[md-links] OK (${files.filter((f) => !SKIP(path.relative(ROOT, f).replace(/\\/g, '/'))).length} 文書 / 相対リンク ${seen} 本を確認)`);
