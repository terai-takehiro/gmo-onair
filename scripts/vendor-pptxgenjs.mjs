#!/usr/bin/env node
/**
 * pptxgenjs を「image-size 抜き」で同梱し直す（隔週キープの pptx 出力・vendor/README.md）
 *
 * ── なぜこれがあるか ──────────────────────────────────────────
 * pptxgenjs は package.json で `image-size` を宣言しているが、配布物（dist/pptxgen.cjs.js /
 * dist/pptxgen.es.js）のどこからも require / import していない（使っていた getSizeFromImage は
 * コメントアウト済み・"FIXME: TODO: currently unused"）。一方 image-size は**全版**に High の
 * 勧告（GHSA-w3rx-r6r6-pgpr / GHSA-5p2g-fcmc-qvqq）があり修正版が無いので、CI の
 * `npm audit --omit=dev --audit-level=high` が落ちる。npm の overrides は file: を扱えず、
 * 名前が image-size のままでは版を変えても勧告に当たる（範囲が `*`）ため、
 * **依存の宣言そのものを外した tarball を同梱する**。中身（dist・types）は 1 バイトも触らない。
 *
 * ── 使い方 ─────────────────────────────────────────────────
 *   node scripts/vendor-pptxgenjs.mjs 4.0.1
 *   → vendor/pptxgenjs-4.0.1-no-image-size.tgz を作り直し、元の integrity と出来上がりの
 *     sha512 を出す。server/package.json の "pptxgenjs" をそのファイルに向けて `npm install`。
 *
 * ── やめるとき ───────────────────────────────────────────────
 * pptxgenjs が image-size を宣言から外すか、image-size に修正版が出たら、
 * server/package.json を registry の版（"^4.x"）に戻して vendor/ の tgz とこの script を消す。
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('使い方: node scripts/vendor-pptxgenjs.mjs <version>  例: 4.0.1');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'vendor');
const out = path.join(outDir, `pptxgenjs-${version}-no-image-size.tgz`);
const tmp = mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-vendor-'));

try {
  // 1) レジストリから取る（npm が integrity を検証する）
  execFileSync('npm', ['pack', `pptxgenjs@${version}`, '--silent', '--ignore-scripts', '--pack-destination', tmp], { stdio: ['ignore', 'ignore', 'inherit'] });
  const upstream = path.join(tmp, `pptxgenjs-${version}.tgz`);
  const upstreamIntegrity = execFileSync('npm', ['view', `pptxgenjs@${version}`, 'dist.integrity'], { encoding: 'utf8' }).trim();

  // 2) 展開して package.json の dependencies から image-size だけ外す
  execFileSync('tar', ['-xzf', upstream, '-C', tmp]);
  const pkgPath = path.join(tmp, 'package', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.dependencies || !pkg.dependencies['image-size']) {
    console.error(`pptxgenjs@${version} は image-size を宣言していません。同梱は不要です（registry の版をそのまま使ってください）`);
    process.exit(2);
  }
  delete pkg.dependencies['image-size'];
  pkg.gmoOnairVendored = {
    upstream: `pptxgenjs@${version}`,
    upstreamIntegrity,
    removedDependencies: ['image-size'],
    reason: 'dist のどこからも読まれていない宣言だけの依存。image-size の全版に High の勧告があり修正版が無いため（vendor/README.md）',
    script: 'scripts/vendor-pptxgenjs.mjs',
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // 3) 再パック（GNU tar なら並びと時刻を固定して再現可能に。bsdtar では素直に固める）
  mkdirSync(outDir, { recursive: true });
  const gnu = (() => { try { return /GNU tar/.test(execFileSync('tar', ['--version'], { encoding: 'utf8' })); } catch { return false; } })();
  const tarFlags = gnu ? '--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner' : '';
  execSync(`tar ${tarFlags} -cf - -C "${tmp}" package | gzip -n -9 > "${out}"`, { stdio: 'inherit' });

  const sha512 = createHash('sha512').update(readFileSync(out)).digest('base64');
  console.log(`書きました: ${path.relative(root, out)}`);
  console.log(`  元の integrity: ${upstreamIntegrity}`);
  console.log(`  出来上がり:     sha512-${sha512}`);
  console.log('次: server/package.json の "pptxgenjs" を "file:../vendor/' + path.basename(out) + '" にして npm install');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
