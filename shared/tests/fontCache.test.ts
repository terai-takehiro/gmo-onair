/**
 * **検査が代替書体で測っていないか**（`verify:ui` の書体の取り置き）
 *
 * ── 何を確かめたか ──────────────────────────────────────────
 *
 * 指摘は「取り置きの書体に CORS が無いので、検査が代替書体で測る」でした。
 * **実測すると、いまの版でも本物の書体が届いています。**
 * Playwright が `route.fulfill()` で返した応答を Chromium が受け入れるためです。
 *
 * | | Bebas Neue | Roboto Condensed |
 * | --- | --- | --- |
 * | 取り置きあり（いまの検査） | **157.36px** | **208.11px** |
 * | 取り置きなし（代替書体） | 246.97px | 246.97px |
 *
 * **書体ごとに違う幅が出ていれば本物**です（無いと2つが同じ幅＝代替書体に落ちる）。
 *
 * ⚠️ **測り方を1度間違えました。** はじめ `<p>` の幅を測っており、
 * ブロック要素なので**どの書体でも 1264px（画面の幅）**になっていました。
 * 「差が無い＝直っている」と読みかけたので、**中身を測れているかを先に確かめること**。
 *
 * ── それでも CORS を付けた理由 ──────────────────────────────
 *
 * `@font-face` の取得は**本来 CORS を要求する経路**です。Playwright の版が変わって
 * 素直に検査するようになった日に、**何も言わずに代替書体で測り始めます** —
 * この検査は**書体の幅**を見るものなので、**数字だけが出て中身が変わります**。
 * 1行で防げるので付けてあります（いまの版では無くても動きます）。
 *
 * v4 の PR で指摘された形です（#71）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const CACHE = readFileSync(join(ROOT, 'scripts', 'lib', 'google-fonts-cache.mjs'), 'utf8');

describe('取り置きの書体は CORS を付けて返す', () => {
  it('CSS と woff2 の両方に付ける', () => {
    expect(CACHE).toMatch(/const CORS = \{ 'access-control-allow-origin': '\*' \};/);
    expect(CACHE).toMatch(/contentType: 'text\/css; charset=utf-8', headers: CORS, body,/);
    expect(CACHE).toMatch(/contentType: 'font\/woff2', headers: CORS, body: fs\.readFileSync\(file\),/);
  });

  it('取り置きが無い URL は素通しさせる（勝手に 404 にしない）', () => {
    // 取り置きに無いものを止めると、**読めない書体があること自体**が見えなくなる
    expect(CACHE).toMatch(/if \(!body\) return pass\(route\);/);
    expect(CACHE).toMatch(/if \(!fs\.existsSync\(file\)\) return pass\(route\);/);
  });

  it('当てるのは正規表現（glob だと版によって静かに外れる）', () => {
    expect(CACHE).toMatch(/ctx\.route\(\/\^https:\\\/\\\/fonts\\\.googleapis\\\.com\\\/\//);
    expect(CACHE).toMatch(/ctx\.route\(\/\^https:\\\/\\\/fonts\\\.gstatic\\\.com\\\/\//);
  });
});
