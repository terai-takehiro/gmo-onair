#!/usr/bin/env node
/**
 * 検証用ブラウザのために Google Fonts を手元へ取り置く。
 *
 *   npm run verify:font              # 取り置き (既にあるものは飛ばす)
 *   FONT_CACHE_REFRESH=1 npm run verify:font   # 一覧から取り直す (書体を差し替えたとき)
 *
 * `verify:ui` が最初に自分で呼ぶので**普段は打たなくてよい**。単体で走らせるのは
 * 「取り置きが作れているか」だけを切り分けたいときと、ネットワークの無い場所で
 * 検証する前に用意しておきたいとき。中身の理由は `scripts/lib/google-fonts-cache.mjs`。
 */
import { collectFontUrls, ensureFontCache } from './lib/google-fonts-cache.mjs';

const urls = collectFontUrls();
console.log(`読んでいる書体 ${urls.length} 件:`);
for (const u of urls) console.log(`  - ${decodeURIComponent(u.replace(/^.*css2\?/, '').replace(/&display=swap$/, ''))}`);

const cache = await ensureFontCache({ urls, log: (m) => console.log(m) });
if (cache.ready) {
  console.log(`\n取り置きできました (${cache.note}) → ${cache.dir}`);
  process.exit(0);
}
console.log(`\n取り置きできませんでした: ${cache.note}`);
console.log('検証は続けられますが、書体は代替で描かれます (字幅が本番と 2〜4% 違います)。');
process.exit(1);
