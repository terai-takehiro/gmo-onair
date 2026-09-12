// 運営マニュアル — 紙面の「インクの目安」（estimatePageInkCoverage）を固定する。
//
// production-manual.md §6-6・§8-3「6. インクの目安」の塗り係数のとおりに
// 数えること（画面を見ても間違いに気づけない計算のため、既存の
// opsmanualCanvasGeometry.test.ts と同じ書き方で固定する）。
import { describe, it, expect } from 'vitest';
import { estimatePageInkCoverage } from '../src/opsmanual/inkEstimate';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '../src/opsmanual/types';
import type { ManualBlock, ManualShapeKind } from '../src/opsmanual/types';

let seq = 0;
function nextId(): string {
  seq += 1;
  return `blk-${seq}`;
}

function textBlock(w: number, h: number, style: Record<string, string | number> = {}, text = 'x'): ManualBlock {
  return { id: nextId(), kind: 'free', x: 0, y: 0, w, h, z: 0, style, free: { type: 'text', content: { text } } };
}

function shapeBlock(w: number, h: number, shape: ManualShapeKind, style: Record<string, string | number> = {}): ManualBlock {
  return { id: nextId(), kind: 'free', x: 0, y: 0, w, h, z: 0, style, free: { type: 'shape', content: { shape } } };
}

function imageBlock(w: number, h: number): ManualBlock {
  return {
    id: nextId(),
    kind: 'free',
    x: 0,
    y: 0,
    w,
    h,
    z: 0,
    style: {},
    free: { type: 'image', content: { url: 'https://example.com/a.png' } },
  };
}

function tableBlock(w: number, h: number, style: Record<string, string | number> = {}): ManualBlock {
  return { id: nextId(), kind: 'free', x: 0, y: 0, w, h, z: 0, style, free: { type: 'table', content: { rows: [['a', 'b']] } } };
}

function qrBlock(w: number, h: number): ManualBlock {
  return { id: nextId(), kind: 'free', x: 0, y: 0, w, h, z: 0, style: {}, free: { type: 'qr', content: { value: 'https://example.com' } } };
}

function linkedBlock(w: number, h: number, style: Record<string, string | number> = {}): ManualBlock {
  return {
    id: nextId(),
    kind: 'linked',
    x: 0,
    y: 0,
    w,
    h,
    z: 0,
    style,
    link: { block: 'project.heading', sourceId: null, options: {}, frozen: null },
  };
}

describe('estimatePageInkCoverage', () => {
  it('ブロックが無ければ 0', () => {
    expect(estimatePageInkCoverage([])).toBe(0);
  });

  it('文字ブロック（背景なし）は面積として数えない（文字の色は面積扱いしない）', () => {
    const blocks = [textBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM)];
    expect(estimatePageInkCoverage(blocks)).toBe(0);
  });

  it('文字ブロックに白・透明以外の背景があれば塗り面として数える', () => {
    const blocks = [textBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, { 'background-color': '#334455' })];
    expect(estimatePageInkCoverage(blocks)).toBeCloseTo(1);
  });

  it('文字ブロックの背景が白・透明なら数えない', () => {
    expect(estimatePageInkCoverage([textBlock(100, 100, { 'background-color': '#ffffff' })])).toBe(0);
    expect(estimatePageInkCoverage([textBlock(100, 100, { 'background-color': 'transparent' })])).toBe(0);
  });

  it('文字ブロックの背景色の opacity を係数に掛ける', () => {
    const blocks = [textBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, { 'background-color': '#334455', opacity: 0.5 })];
    expect(estimatePageInkCoverage(blocks)).toBeCloseTo(0.5);
  });

  it('塗りつぶし系の図形（背景あり）は係数1', () => {
    const blocks = [shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'rect', { 'background-color': '#000000' })];
    expect(estimatePageInkCoverage(blocks)).toBeCloseTo(1);
  });

  it('塗りつぶし系の図形（背景なし＝枠線のみ）は係数0', () => {
    const blocks = [shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'rounded-rect')];
    expect(estimatePageInkCoverage(blocks)).toBe(0);
  });

  it('線・矢印は背景があっても常に0（線は面積として無視できる）', () => {
    const blocks = [shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'line', { 'background-color': '#000000' })];
    expect(estimatePageInkCoverage(blocks)).toBe(0);
    const arrow = [shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'arrow', { 'background-color': '#000000' })];
    expect(estimatePageInkCoverage(arrow)).toBe(0);
  });

  it('画像は係数0.5（厳密な画像解析はしない）', () => {
    const blocks = [imageBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM)];
    expect(estimatePageInkCoverage(blocks)).toBeCloseTo(0.5);
  });

  it('表は背景があれば係数1、なければ0（罫と文字だけの組み方ならほぼ0という前提）', () => {
    const filled = estimatePageInkCoverage([tableBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, { 'background-color': '#eeeeee' })]);
    const bare = estimatePageInkCoverage([tableBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM)]);
    expect(filled).toBeCloseTo(1);
    expect(bare).toBe(0);
  });

  it('差し込みブロックは既定で罫ベース: 背景があれば係数1、なければ0', () => {
    const filled = estimatePageInkCoverage([linkedBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, { 'background-color': '#eeeeee' })]);
    const bare = estimatePageInkCoverage([linkedBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM)]);
    expect(filled).toBeCloseTo(1);
    expect(bare).toBe(0);
  });

  it('QRは係数0.3', () => {
    const blocks = [qrBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM)];
    expect(estimatePageInkCoverage(blocks)).toBeCloseTo(0.3);
  });

  it('部分的な塗りは紙面に対する面積比どおりに出る', () => {
    const blocks = [shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM * 0.4, 'rect', { 'background-color': '#000000' })];
    expect(estimatePageInkCoverage(blocks)).toBeCloseTo(0.4);
  });

  it('複数ブロックは合算する。紙面の面積を超える塗りは1で頭打ち（返り値は常に0〜1）', () => {
    const blocks = [
      shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'rect', { 'background-color': '#000000' }),
      shapeBlock(PAGE_WIDTH_MM, PAGE_HEIGHT_MM, 'ellipse', { 'background-color': '#000000' }),
    ];
    expect(estimatePageInkCoverage(blocks)).toBe(1);
  });
});
