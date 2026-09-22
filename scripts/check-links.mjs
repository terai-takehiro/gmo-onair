#!/usr/bin/env node
/**
 * 画面の中のリンクが、ちゃんとどこかに着くかを機械で確かめる。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * `App.tsx` の最後に `<Route path="*" element={<Navigate to="/" replace />} />`
 * があるので、**行き先の無いリンクは 404 になりません。黙ってホームに戻ります。**
 * 押した人からは「押しても遷移しない」ようにしか見えず、型検査にも lint にも
 * 出ないので、**画面を開いた人が報告してくれるまで誰も気づけません**。
 * 実際に `/project-groups`（正しくは `/sales/project-groups`）が
 * この形で残っていました。
 *
 * ── 何を見るか ──────────────────────────────────────────────
 *
 *  ① `to=` / `href=` / `navigate(...)` / `window.location.href =` の**文字列**
 *  ② 左メニュー・設定トップ・⌘K の一覧が持つ `to: '/…'` の**オブジェクトの値**
 *
 * テンプレート（`${...}`）は「何か1区間」に均してから当てます。
 *
 * ── 見ないもの ──────────────────────────────────────────────
 *
 *  ・別バンドル（`/qsheet` `/equipment` `/daily` …）… Nginx が配信する。
 *    このアプリのルート表に無くて当然（素の遷移で開く）
 *  ・`/api/...`（API の口）・`http(s)://`（外部）
 *  ・`ALLOW` に理由付きで挙げたもの
 *
 * 使い方: node scripts/check-links.mjs   （`npm run lint` から呼ばれる）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'client/src/App.tsx');
const SRC = path.join(ROOT, 'client/src');

/**
 * 別バンドル・API・外部。ここは案件管理アプリのルート表が持たない。
 * ⚠️ awards は廃止（配信停止・404）なので外した — /awards へのリンクは
 * 「黙ってホームに戻る壊れリンク」であり、この検査が見つけるべきもの。
 * signage は別バンドルではなく client 自身のルート (/signage/:roomId) なので
 * 素通しせずルート表と突き合わせる。
 */
const OTHER_BUNDLE = /^\/(qsheet|techops|live|equipment|daily|wiki|api)(\/|$)/;

/** 行き先がまだ無いと**分かったうえで**置いてあるもの（理由を必ず書く） */
const ALLOW = new Map([
  ['/prodsheet', 'アプリ一覧の「制作支援」。comingSoon: true で押せない札として出している'],
  ['/delivery', 'アプリ一覧の「素材納品」。comingSoon: true で押せない札として出している'],
  ['/awards', '廃止済みリアルタイムCGの登録行（apps.ts・frozen: true で一覧に出ず押せる場所は無い）。コード保存ポリシーのため登録だけ残っている — ここ以外に /awards へのリンクを書くと検出される'],
]);

/* ── ルート表 ────────────────────────────────────────────── */
const app = fs.readFileSync(APP, 'utf8');
const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*');
if (routes.length < 20) {
  console.error('[links] App.tsx からルートを読めませんでした（書き方が変わった？）');
  process.exit(1);
}
const table = routes.map((p) => new RegExp(
  '^' + p.replace(/\/\*$/, '(?:/.*)?').replace(/:[A-Za-z0-9_]+/g, '[^/]+') + '$',
));
const known = (u) => table.some((re) => re.test(u));

/* ── 画面が持っている行き先 ───────────────────────────────── */
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.tsx?$/.test(e.name)) files.push(f);
  }
})(SRC);
files.push(path.join(ROOT, 'shared/src/client/apps.ts'));

const PATTERNS = [
  /(?:navigate\(|to=\{?|href=\{?|window\.location\.href\s*=\s*|window\.location\.replace\()\s*(['"`])(\/[^'"`${]*)\1/g,
  /\b(?:to|path|href)\s*:\s*(['"`])(\/[^'"`${]*)\1/g,
  /(?:navigate\(|to=\{|href=\{|to:\s*|href:\s*)`(\/[^`]*)`/g,
];

const hits = new Map(); // url -> ["file:line", ...]
for (const f of files) {
  if (f === APP) continue;
  const rel = path.relative(ROOT, f);
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    // 行頭が `*` や `//` のコメント行は見ない（説明文に旧 URL が出てくる）
    const t = line.trim();
    if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const raw = m[2] ?? m[1];
        const u = raw.replace(/\$\{[^}]*\}/g, 'x').split('?')[0].split('#')[0].replace(/(.)\/$/, '$1');
        if (!u.startsWith('/')) continue;
        (hits.get(u) ?? hits.set(u, []).get(u)).push(`${rel}:${i + 1}`);
      }
    }
  });
}

const bad = [];
for (const [u, where] of [...hits].sort()) {
  if (OTHER_BUNDLE.test(u) || ALLOW.has(u)) continue;
  if (!known(u)) bad.push([u, [...new Set(where)]]);
}

if (bad.length) {
  console.error(`[links] 行き先の無いリンクが ${bad.length} 件あります`);
  console.error('        ※ 404 にはなりません。<Route path="*"> が拾って**黙ってホームに戻ります**');
  for (const [u, where] of bad) {
    console.error(`\n  ${u}`);
    for (const w of where) console.error(`      ${w}`);
  }
  console.error('\n  直し方: 接頭辞（/sales /budget /studio /settings /gpm）を確かめるか、');
  console.error('          わざと置いているなら scripts/check-links.mjs の ALLOW に理由付きで足す');
  process.exit(1);
}
console.log(`[links] OK (ルート ${routes.length} 本 / 行き先 ${hits.size} 種を確認)`);
