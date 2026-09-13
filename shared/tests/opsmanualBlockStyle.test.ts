// 運営マニュアル — `manualBlockCssStyle`（`client-techops/src/pages/opsmanual/manualBlockStyle.ts`）
// を固定する。`block.style` はケバブケースの CSS プロパティ名（BlockInspector.tsx の
// `patchStyle`）で保存されており、React の style prop はキャメルケースしか認識しない
// ——素通しすると見た目に一切反映されないまま気づけない（レビュー指摘・blocking）ため、
// この変換だけを狙って固定する。本体は client-techops 側にあるため、
// `opsmanualPreExportChecks.test.ts` と同じ考え方でここに置く。
import { describe, it, expect } from 'vitest';
import { manualBlockCssStyle } from '../../client-techops/src/pages/opsmanual/manualBlockStyle';

describe('manualBlockCssStyle', () => {
  it('style が無ければ空オブジェクト', () => {
    expect(manualBlockCssStyle(undefined)).toEqual({});
  });

  it('font-size（pt数値）を fontSize（pt付き文字列）へ変換する', () => {
    expect(manualBlockCssStyle({ 'font-size': 24 })).toEqual({ fontSize: '24pt' });
  });

  it('font-weight を fontWeight（数値のまま）へ変換する', () => {
    expect(manualBlockCssStyle({ 'font-weight': 700 })).toEqual({ fontWeight: 700 });
  });

  it('color はキー名がすでにキャメルケースなのでそのまま通す', () => {
    expect(manualBlockCssStyle({ color: '#ff0000' })).toEqual({ color: '#ff0000' });
  });

  it('background-color を backgroundColor へ変換する', () => {
    expect(manualBlockCssStyle({ 'background-color': '#fff3cd' })).toEqual({ backgroundColor: '#fff3cd' });
  });

  it('opacity をそのまま数値で通す', () => {
    expect(manualBlockCssStyle({ opacity: 0.5 })).toEqual({ opacity: 0.5 });
  });

  it('border-color / border-width は変換しない（ShapeBlockContent が生の style を直接読むため。' +
    'ここで CSS の border に変換すると、図形の SVG の輪郭と二重になる）', () => {
    expect(manualBlockCssStyle({ 'border-color': '#000000', 'border-width': 2 })).toEqual({});
  });

  it('複数のキーを一度に変換する（BlockInspector が実際に書く形）', () => {
    const style = { 'font-size': 12, 'font-weight': 400, color: '#0f172a' };
    expect(manualBlockCssStyle(style)).toEqual({ fontSize: '12pt', fontWeight: 400, color: '#0f172a' });
  });
});
