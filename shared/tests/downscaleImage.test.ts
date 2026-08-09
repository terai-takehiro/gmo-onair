/**
 * 送る前に画像を縮める判定（AI の費用を下げる）
 *
 * **画面を見ても間違いに気づけません** — 縮めすぎても添付は付いたままで、
 * 「文字が読めなくて AI が読み落とした」という形でしか表に出ないためです。
 * 判定の条件だけをここで固定します（実際の縮小は canvas なのでブラウザで確かめる）。
 */
import { describe, it, expect } from 'vitest';
import { shouldDownscale, downscaleImage, MAX_EDGE } from '../src/client-v4/downscaleImage';

/** File を作る（中身は問わない。判定は type と size しか見ない） */
function file(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('shouldDownscale — 縮める価値があるか', () => {
  it('大きい写真は縮める', () => {
    expect(shouldDownscale(file('IMG_0001.jpg', 'image/jpeg', 3_500_000))).toBe(true);
  });

  it('PNG のスクリーンショットも対象（重くなったら元を使うのは downscaleImage の仕事）', () => {
    expect(shouldDownscale(file('shot.png', 'image/png', 1_200_000))).toBe(true);
  });

  it('画像でないものは触らない（PDF は AI がそのまま読む）', () => {
    expect(shouldDownscale(file('見積.pdf', 'application/pdf', 5_000_000))).toBe(false);
  });

  it('GIF は触らない（動くものを1コマにすると別物になる）', () => {
    expect(shouldDownscale(file('anim.gif', 'image/gif', 4_000_000))).toBe(false);
  });

  it('もともと小さい画像は触らない（再エンコードで汚すだけ）', () => {
    expect(shouldDownscale(file('small.jpg', 'image/jpeg', 200 * 1024))).toBe(false);
  });

  it('境界（300KB ちょうど）は触らない', () => {
    expect(shouldDownscale(file('edge.jpg', 'image/jpeg', 300 * 1024))).toBe(false);
    expect(shouldDownscale(file('edge.jpg', 'image/jpeg', 300 * 1024 + 1))).toBe(true);
  });

  it('長辺の上限は 1600px（名刺・ホワイトボードが読める大きさ）', () => {
    expect(MAX_EDGE).toBe(1600);
  });
});

describe('downscaleImage — 縮められないときは元を返す', () => {
  it('対象外のファイルは同じものをそのまま返す（添付を落とさない）', async () => {
    const f = file('見積.pdf', 'application/pdf', 5_000_000);
    expect(await downscaleImage(f)).toBe(f);
  });

  it('canvas が無い環境（この試験の環境）でも元を返す — 例外にしない', async () => {
    const f = file('IMG_0001.jpg', 'image/jpeg', 3_500_000);
    expect(await downscaleImage(f)).toBe(f);
  });
});
