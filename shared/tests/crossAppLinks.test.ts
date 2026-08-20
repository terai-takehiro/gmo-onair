/**
 * base path をまたぐ直接リンクが、行き先を失っていないかを見る検査
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * `scripts/check-links.mjs` は **client/src の中のリンクだけ**を見ていて、
 * `client-daily` / `client-live` のような**別バンドルから client への直接リンク**
 * は最初から対象外（`SRC = client/src` しか読んでいない）。
 *
 * 実際に `client-daily` には、client の `/budget/documents` と
 * `/sales/tasks/list` へ直接 `window.location.replace` / `href` している箇所がある。
 * client 側でこのルートを削っても、`check-links.mjs` は client-daily を読まないので
 * **誰も気づけない**（押した人には「押しても遷移しない」としか見えない）。
 *
 * ── 何を見るか ──────────────────────────────────────────────
 *
 * わかっている cross-app リンクをここに固定で列挙し、
 *  ① 呼び出し側のファイルに、その文字列がいまも書かれているか
 *  ② client/src/App.tsx のルート表に、いまも着地できるか
 * の2つを確認する。増えたら `CROSS_APP_LINKS` に足すこと。
 *
 * `client-live` の `/settings` は調べ直した結果 `client-live` 自身の
 * `<BrowserRouter basename="/live">` の中のルート（＝自分の設定ページ）で、
 * cross-app リンクではなかったため、ここには含めていない。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const CLIENT_APP = join(ROOT, 'client/src/App.tsx');

/** client のルート表を check-links.mjs と同じ組み立て方で作る */
function clientRouteMatcher(): (url: string) => boolean {
  const app = readFileSync(CLIENT_APP, 'utf8');
  const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => p !== '*');
  if (routes.length < 20) {
    throw new Error('App.tsx からルートを読めませんでした（check-links.mjs と前提が変わった？）');
  }
  const table = routes.map((p) => new RegExp(
    '^' + p.replace(/\/\*$/, '(?:/.*)?').replace(/:[A-Za-z0-9_]+/g, '[^/]+') + '$',
  ));
  return (url: string) => table.some((re) => re.test(url));
}

const CROSS_APP_LINKS = [
  {
    file: 'client-daily/src/App.tsx',
    literal: "'/budget/documents'",
    target: '/budget/documents',
    note: '受け取った書類 → 財務管理（別バンドル）への転送',
  },
  {
    file: 'client-daily/src/pages/inquiries/InquiryBody.tsx',
    literal: 'href="/sales/tasks/list"',
    target: '/sales/tasks/list',
    note: '問い合わせカード → 案件管理のタスク一覧',
  },
];

describe('base path をまたぐ直接リンクの行き先', () => {
  const known = clientRouteMatcher();

  it.each(CROSS_APP_LINKS)('$note ($target) が client 側から消えていない', ({ file, literal, target }) => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    // 呼び出し側の書き方が変わっていないか（変わっていたら、この一覧の更新を忘れている）
    expect(source).toContain(literal);
    // client のルート表から本当に消えていないか
    expect(known(target)).toBe(true);
  });
});
