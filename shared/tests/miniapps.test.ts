// 制作資料ミニアプリ・レジストリの整合を固定する（01-app-structure.md §3-2 の検査項目）。
//
// いまはこの段（08・収録設定/配信設定）が足した `panel` の2件だけを検査する。
// 01（進行台本・スケジュール表 = `document`）が着手されたら、
// docPrefix / docNoSeq / listPath / docPath の重複禁止もここに足すこと。
import { describe, it, expect } from 'vitest';
import { MINI_APPS, MINI_APP_BY_KEY, panelPathOf, enabledMiniApps } from '../src/production/miniapps';

describe('production/miniapps', () => {
  it('key が重複しない', () => {
    const keys = MINI_APPS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('panel の path は :ownerKey を含む', () => {
    for (const app of MINI_APPS) {
      if (app.kind === 'panel') {
        expect(app.path).toContain(':ownerKey');
      }
    }
  });

  it('document の docPath は :id を含む（現時点では登録0件のため空でも通る）', () => {
    for (const app of MINI_APPS) {
      if (app.kind === 'document') {
        expect(app.docPath).toContain(':id');
      }
    }
  });

  it('MINI_APP_BY_KEY が MINI_APPS と一致する', () => {
    for (const app of MINI_APPS) {
      expect(MINI_APP_BY_KEY[app.key]).toBe(app);
    }
  });

  it('enabledMiniApps は enabled:false を含まない', () => {
    expect(enabledMiniApps().every((a) => a.enabled)).toBe(true);
  });

  it('panelPathOf が :ownerKey を実値に置き換える', () => {
    expect(panelPathOf('recording', 'GLS-A012')).toBe('/qsheet/recording/GLS-A012');
    expect(panelPathOf('streaming', 'GLS-A012')).toBe('/qsheet/streaming/GLS-A012');
  });

});
