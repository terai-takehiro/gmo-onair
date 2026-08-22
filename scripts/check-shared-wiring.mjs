#!/usr/bin/env node
//
// shared の参照が「1つの実体」を指し続けているかを検査する。
//
// なぜこれがあるか:
//   shared は各アプリから 4 つの別々の経路で参照されている。
//     ① import 文        `@gmo-onair/shared/src/...`  → Vite の resolve.alias
//     ② 型チェック        同じ import 文               → tsconfig の paths
//     ③ Tailwind の preset `@gmo-onair/shared/tailwind.preset` → Node の解決 (node_modules)
//     ④ CSS の @import    `@gmo-onair/shared/src/client/tokens.css` → Vite の resolve.alias
//   ①〜④ が別々の実体を指すと **shared が二重に読み込まれる**。
//   そうなると zustand のストアや React の context が2つできて、
//   「片方で更新したのに片方に反映されない」という**画面上は再現条件が読めない不具合**になる。
//
//   さらに悪いことに、**tsconfig の paths は指す先が存在しないと黙って node_modules に
//   フォールバックする** (実測: paths を存在しないディレクトリに向けても `tsc -b` は exit 0)。
//   つまり paths がずれても型チェックでは気づけない。Vite の alias だけは落ちる。
//   → 「2か所がずれても片方だけ黙る」ので、人のレビューでは追えない。ここで機械的に揃える。
//
// 実行:
//   node scripts/check-shared-wiring.mjs      # 検査 (npm run lint から呼ばれる)
//
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@gmo-onair/shared';
const SHARED = realpathSync(path.join(ROOT, 'shared'));

const APPS = readdirSync(ROOT)
  .filter((d) => /^client/.test(d) && existsSync(path.join(ROOT, d, 'package.json')))
  .sort();

const problems = [];
const bad = (app, what, detail) => problems.push({ app, what, detail });

/** 相対パス文字列を絶対パスにして実体を返す (存在しなければ null) */
function realOf(appDir, rel) {
  const p = path.resolve(path.join(ROOT, appDir), rel);
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

for (const app of APPS) {
  const dir = path.join(ROOT, app);

  // ── ① package.json に依存として書いてあるか ──────────────────
  // npm workspaces は「宣言されていなくても」全ワークスペースを node_modules に
  // リンクするので、書かなくても動いてしまう。書いていないと依存関係が読めない。
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const dep = pkg.dependencies?.[PKG];
  if (!dep) {
    bad(app, 'package.json', `dependencies に "${PKG}" が無い`);
  } else if (dep !== '*') {
    // 必ず "*" にする。範囲 ("^2.9.237" 等) を書くと **本番のビルドが落ちる**。
    // Dockerfile の manifests ステージが全ワークスペースの version を
    // `0.0.0-build` に書き換える (ビルドキャッシュを効かせるため) ので、範囲が
    // 一致しなくなり npm ci が公開レジストリを見に行く。実測:
    //   npm error 404 '@gmo-onair/shared@^2.9.237' is not in this registry.
    bad(app, 'package.json', `"${PKG}": "${dep}" — ワークスペース参照なので "*" にすること`);
  }

  // ── ② Vite の resolve.alias ────────────────────────────────
  const viteFile = path.join(dir, 'vite.config.ts');
  if (!existsSync(viteFile)) {
    bad(app, 'vite.config.ts', 'ファイルが無い');
  } else {
    const vite = readFileSync(viteFile, 'utf8');
    /*
     * ⚠️ **引用符はどちらでも受ける**（レビューでの指摘 #39）。
     * 前の版は `'` で書いたときしか当たらず、`"` で書いた設定では
     * **「resolve.alias が無い」と出て**いました（実際にはあるのに）。
     * 落ちること自体は正しいのですが、**理由が嘘**なので直す場所を探しに行けません
     * （しかも「shared 以外を指している」の判定にも一生たどり着きません）。
     */
    const m = vite.match(new RegExp(`['"]${PKG}['"]:\\s*path\\.resolve\\(__dirname,\\s*['"]([^'"]+)['"]\\)`));
    if (!m) {
      bad(app, 'vite.config.ts', `resolve.alias に '${PKG}' が無い`);
    } else if (realOf(app, m[1]) !== SHARED) {
      bad(app, 'vite.config.ts', `alias が shared 以外を指している: '${m[1]}'`);
    }
  }

  // ── ③ tsconfig の paths ────────────────────────────────────
  const tsFile = path.join(dir, 'tsconfig.json');
  const ts = readFileSync(tsFile, 'utf8');
  const tm = ts.match(new RegExp(`"${PKG}/\\*":\\s*\\[\\s*"([^"]+)"`));
  if (!tm) {
    bad(app, 'tsconfig.json', `paths に "${PKG}/*" が無い`);
  } else {
    const target = tm[1].replace(/\/\*$/, '');
    if (realOf(app, target) !== SHARED) {
      // ここが本題。型チェックは黙って通るので、この検査が唯一の歯止め。
      bad(app, 'tsconfig.json', `paths が shared 以外を指している: "${tm[1]}"`);
    }
  }

  // ── ④ Tailwind の preset は パッケージ名で参照する ──────────
  // 相対パス (`../shared/tailwind.preset`) だと参照経路が2種類になり、
  // shared を移動したとき片方だけ直して気づかない。
  const twFile = path.join(dir, 'tailwind.config.ts');
  if (existsSync(twFile)) {
    const tw = readFileSync(twFile, 'utf8');
    if (/from\s+'(\.\.\/)+shared\/tailwind\.preset'/.test(tw)) {
      bad(app, 'tailwind.config.ts', `preset を相対パスで読んでいる → '${PKG}/tailwind.preset' にすること`);
    }
    // v4 だけの上乗せ preset は **v4 対象3アプリ ＋ 制作資料 (Qシート)** が継承していること。
    // 抜けたアプリだけ `font-medium` が 500 (存在しない太さ) のままになり、
    // **画面を見ても分からない差**ができる (ブラウザが近い太さで代用するため)。
    // 逆に凍結アプリが継承すると、あちらの見た目が動く。
    // ⚠️ 制作資料は v4.1 で凍結を解いたので v4Preset を継承する
    // (`client-qsheet/CLAUDE.md`・`docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md` §10-1)。
    // 共通シェルへの載せ替え (下の V4_APPS) とは別の話 — こちらは Tailwind の preset だけ
    // **`presets:` の中身を見る。** ファイル全体を検索すると import 文だけで
    // 通ってしまい、配列から外しても気づけない (実際に反証して踏んだ)
    const presetsArr = tw.match(/presets:\s*\[([^\]]*)\]/)?.[1] ?? '';
    const hasV4Preset = /v4Preset/.test(presetsArr);
    const wantV4Preset = ['client', 'client-daily', 'client-equipment', 'client-qsheet', 'client-live'].includes(app);
    if (hasV4Preset !== wantV4Preset) {
      bad(app, 'tailwind.config.ts', wantV4Preset
        ? `v4 の preset を継承していない → presets: [preset, v4Preset] にすること`
        : `凍結アプリが v4 の preset を継承している (見た目が変わります)`);
    }
  }

  // ── ⑤ ソースから shared を相対パスで import していないか ─────
  for (const file of walk(path.join(dir, 'src'))) {
    const text = readFileSync(file, 'utf8');
    // import 文と CSS の @import の両方を見る
    const hit = text.match(/['"](\.\.\/)+shared\/[^'"]*['"]/);
    if (hit) {
      bad(app, path.relative(ROOT, file), `shared を相対パスで参照している: ${hit[0]} → '${PKG}/...' にすること`);
    }
  }
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(tsx?|css)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

// ── shared 自身が import するパッケージがすべて申告されているか ──────
//
// shared は「ビルドせず TypeScript のまま配る」形なので、shared が import した
// パッケージは **それを使うアプリ側で解決される**。申告が無くても npm workspaces の
// ホイスティングでたまたま解決できてしまうため、気づかないまま増えていく
// (F3 の着手時点で lucide-react / class-variance-authority / Radix 9個が未申告だった)。
//
// 何が起きるか: あるアプリが `shared/ui/scroll-area` を import したとき、そのアプリに
// @radix-ui/react-scroll-area が無いと **「Failed to resolve import」としか出ない**。
// shared 側の申告漏れが原因だと分かるまで時間を取られる。ここで先に止める。
//
// dependencies ではなく peerDependencies に置くこと: Radix も React も**実体が2つ
// あると壊れる** (context が別インスタンスになりダイアログが開かない等)。
{
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'shared/package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);

  const used = new Map(); // パッケージ名 → 最初に見つけたファイル
  for (const file of walk(path.join(ROOT, 'shared/src'))) {
    // テストは**アプリから読み込まれない**ので対象外。この検査が見ているのは
    // 「アプリ側で解決できないと画面が壊れるもの」で、vitest はそれに当たらない。
    if (/\.(test|spec)\.tsx?$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from|@import)\s+['"]([^'"]+)['"]/g)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('/')) continue;   // 相対パス
      if (spec.startsWith(PKG)) continue;                            // 自分自身
      // "@scope/name/deep/path" → "@scope/name" / "name/deep" → "name"
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!used.has(name)) used.set(name, path.relative(ROOT, file));
    }
  }

  for (const [name, file] of [...used].sort()) {
    if (!declared.has(name)) {
      bad('shared', 'package.json', `"${name}" を import しているのに申告が無い (${file})`);
    }
  }
}

// ── お知らせ帯と確認ダイアログの器が「ちょうど1つ」あるか (P3 / S2) ──────
//
// `confirmAction()` は `<ConfirmHost />` が画面に無いと **false を返して実行しません**
// (置き忘れたときに黙って実行するほうが危ないので、そう倒してある)。
// つまり置き忘れると「削除ボタンを押しても何も起きない」になり、
// **その画面を実際に触るまで誰も気づけません**。
// `<NoticeBar />` も同じで、無いと `notifyApiError` が呼ばれても何も出ません。
//
// 数え方: **共通シェル (`shared/src/client/shell`) を使っていれば、シェルが持っている**。
// 使っていないアプリは自分で1つずつ置く。合わせて 1 になっていればよい。
// 凍結アプリ (client-awards) は 0 (帯が出ると見た目が変わる)。client-qsheet/client-live は
// 凍結を解いて共通シェルに載せ替え済みなので V4_APPS に入っている。
{
  const V4_APPS = ['client', 'client-daily', 'client-equipment', 'client-qsheet', 'client-live'];
  const SHELL = `${PKG}/src/client/shell`;

  // 共通シェル自身が本当に置いているか。ここが抜けると
  // 「シェルを使っているアプリ = 置いてある」という数え方が丸ごと嘘になる
  // コメントを落としてから探す。**説明文の中の `<NoticeBar />` に引っかかると、
  // 実際に消しても検査が通ってしまう** (最初に書いたとき実際に素通りした)
  const shellSrc = readFileSync(path.join(ROOT, 'shared/src/client/shell/AppShell.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  for (const name of ['NoticeBar', 'ConfirmHost']) {
    if (!new RegExp(`<${name}\\s*/>`).test(shellSrc)) {
      bad('shared', 'shell/AppShell.tsx', `<${name} /> を描いていない — シェルを使うアプリ全部で効かなくなります`);
    }
  }
  for (const app of APPS) {
    const src = path.join(ROOT, app, 'src');
    if (!existsSync(src)) continue;
    const counts = { NoticeBar: 0, ConfirmHost: 0, Toaster: 0 };
    let usesShell = false;
    for (const file of walk(src)) {
      if (!/\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      if (text.includes(SHELL)) usesShell = true;
      if (!/\.tsx$/.test(file)) continue;
      for (const name of Object.keys(counts)) {
        counts[name] += (text.match(new RegExp(`<${name}\\s*/>`, 'g')) ?? []).length;
      }
    }
    const v4 = V4_APPS.includes(app);
    if (!v4 && usesShell) {
      bad(app, 'シェル', '凍結アプリを共通シェルに載せ替えないこと (見た目が変わります)');
    }
    // 共通シェルが持っている分を 1 と数える
    const owned = v4 && usesShell ? 1 : 0;
    const want = v4 ? 1 : 0;
    for (const name of ['NoticeBar', 'ConfirmHost']) {
      const total = counts[name] + owned;
      if (total === want) continue;
      const why =
        want === 1
          ? name === 'ConfirmHost'
            ? '無いと confirmAction が false を返し、削除ボタンが黙って何もしません'
            : '無いと notifyApiError が呼ばれても画面に何も出ません'
          : '凍結アプリには置かないこと (帯が出ると見た目が変わります)';
      bad(app, 'シェル', `<${name} /> が実質 ${total} 個 (期待 ${want} 個 / 共通シェル ${owned} + 直置き ${counts[name]}) — ${why}`);
    }
    const wantToaster = app === 'client-qsheet' ? 1 : 0;
    if (counts.Toaster !== wantToaster) {
      bad(app, 'シェル', `<Toaster /> が ${counts.Toaster} 個 (期待 ${wantToaster} 個) — ` +
        (wantToaster ? 'Qシートは 13 か所でトーストを使っています (放送中の切断通知を含む)'
                     : 'v4 は帯で知らせる決まりです。トーストを足すと出方が2通りになります'));
    }
  }
}

if (problems.length) {
  console.error(`\n✗ shared の参照がずれています (${problems.length} 件)\n`);
  for (const { app, what, detail } of problems) {
    console.error(`    ${app} / ${what}`);
    console.error(`      ${detail}`);
  }
  console.error(
    '\n  shared が二重に読み込まれると、zustand のストアや React の context が2つでき、\n' +
      '  「片方で更新したのに反映されない」という再現条件の読めない不具合になります。\n' +
      '  参照経路は Vite の alias / tsconfig の paths / Tailwind の preset / import 文 の4つで、\n' +
      '  **すべて同じ実体を指している必要があります**。\n'
  );
  process.exit(1);
}

console.log(`[shared-wiring] OK (${APPS.length} アプリすべてが shared の同じ実体を指している)`);
