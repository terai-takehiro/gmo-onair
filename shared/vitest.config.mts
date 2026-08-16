/**
 * `shared/tests/` の実行設定
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * テストは `shared/` だけでなく**各アプリのロジックも読みます**
 * （画面を見ても間違いに気づけない計算は、置き場所がどこであれ固定する）。
 * ところがアプリ側のファイルは `@/lib/constants` のように**アプリの中の
 * 別名**で import しており、その別名は各アプリの `vite.config.ts` にしか
 * 書いてありません。
 *
 * ⚠️ **今まで気づかなかったのは、たまたま型の import だけだったから**です。
 * `import type { … } from '@/types'` は変換の時点で消えるので、
 * 解決されなくても通ります。**値**を1つ import した瞬間に
 * 「Failed to load url @/lib/constants」で**そのテストファイルごと落ちます**。
 *
 * ── なぜ固定の別名表にしないか ──────────────────────────────
 *
 * `@` は**アプリごとに違う場所**を指します（`client/src` ／
 * `client-equipment/src` ／ …）。1つに決め打つと、別のアプリのファイルを
 * 読んだ日に**黙って隣のアプリの同名ファイル**を読みます。
 * だから**読んでいる側（importer）から探します** — `@/` を書いた
 * ファイルが属するワークスペース（`package.json` を持つ最も近い親）の
 * `src/` に読み替える。
 */
// **`.mts` にしてあるのは Vite の CJS 版 Node API を踏まないため**
// （`.ts` のままだと "The CJS build of Vite's Node API is deprecated" が毎回出る）。
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** `file` から上へ辿って、最初に見つかった `package.json` のあるディレクトリ */
function workspaceOf(file: string): string | null {
  let dir = dirname(file);
  while (dir.startsWith(REPO_ROOT) && dir !== REPO_ROOT) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

export default defineConfig({
  plugins: [
    {
      name: 'onair-app-at-alias',
      enforce: 'pre',
      resolveId(source, importer) {
        if (!source.startsWith('@/') || !importer) return null;
        const ws = workspaceOf(importer);
        if (!ws) return null;
        const base = join(ws, 'src', source.slice(2));
        for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
          if (existsSync(base + ext)) return base + ext;
        }
        return null;
      },
    },
  ],
});
