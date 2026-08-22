/**
 * ミニアプリのレジストリ（`shared/src/production/miniapps.ts`）の固定テスト。
 *
 * 重複や `:id`/`:ownerKey` の付け忘れは型でも lint でも見つからず、実行時に
 * 「一覧に2件出る」「作成メニューを押しても何も起きない」という
 * 気づきにくい壊れ方をする。ここで機械的に止める。
 */
import { describe, it, expect } from 'vitest';
import {
  MINI_APPS,
  MINI_APP_BY_KEY,
  docPathOf,
  panelPathOf,
  miniAppOfPath,
  enabledMiniApps,
  type MiniAppDocumentDef,
  type MiniAppPanelDef,
} from '../src/production/miniapps';

const documents = MINI_APPS.filter((a): a is MiniAppDocumentDef => a.kind === 'document');
const panels = MINI_APPS.filter((a): a is MiniAppPanelDef => a.kind === 'panel');

describe('MINI_APPS — 登録そのもの', () => {
  it('key が重複していない', () => {
    expect(new Set(MINI_APPS.map((a) => a.key)).size).toBe(MINI_APPS.length);
  });

  it('document: docPrefix が重複していない（配った番号の接頭辞が被らない）', () => {
    expect(new Set(documents.map((a) => a.docPrefix)).size).toBe(documents.length);
  });

  it('document: docNoSeq が重複していない（連番が飛ばない）', () => {
    expect(new Set(documents.map((a) => a.docNoSeq)).size).toBe(documents.length);
  });

  it('document: listPath が重複していない', () => {
    expect(new Set(documents.map((a) => a.listPath)).size).toBe(documents.length);
  });

  it('document: docPath が重複していない、かつ必ず `:id` を含む', () => {
    expect(new Set(documents.map((a) => a.docPath)).size).toBe(documents.length);
    for (const a of documents) expect(a.docPath).toContain(':id');
  });

  it('panel: path が重複していない、かつ必ず `:ownerKey` を含む', () => {
    expect(new Set(panels.map((a) => a.path)).size).toBe(panels.length);
    for (const a of panels) expect(a.path).toContain(':ownerKey');
  });

  it('**段4以降は schedule も有効**（qsheet_schedules ができたため）', () => {
    expect(MINI_APP_BY_KEY.schedule.enabled).toBe(true);
    expect(MINI_APP_BY_KEY.sheet.enabled).toBe(true);
  });

  it('recording / streaming（panel）は有効', () => {
    expect(MINI_APP_BY_KEY.recording.enabled).toBe(true);
    expect(MINI_APP_BY_KEY.streaming.enabled).toBe(true);
  });

  it('label は画面に出す名前だけを持つ（内部識別子 qsheet を含まない）', () => {
    for (const a of MINI_APPS) {
      expect(a.label).not.toMatch(/qsheet/i);
      expect(a.label).not.toBe('Qシート');
    }
  });

  it('MINI_APP_BY_KEY が MINI_APPS と一致する', () => {
    for (const app of MINI_APPS) {
      expect(MINI_APP_BY_KEY[app.key]).toBe(app);
    }
  });
});

describe('docPathOf — document 専用', () => {
  it('`:id` を実際の id に置換する', () => {
    expect(docPathOf('sheet', 'abc123')).toBe('/qsheet/editor/abc123');
    expect(docPathOf('schedule', 'xyz')).toBe('/qsheet/schedules/xyz');
  });

  it('panel の key を渡すと例外', () => {
    expect(() => docPathOf('recording', 'x')).toThrow();
  });
});

describe('panelPathOf — panel 専用', () => {
  it('`:ownerKey` を実値に置き換える', () => {
    expect(panelPathOf('recording', 'GLS-A012')).toBe('/qsheet/recording/GLS-A012');
    expect(panelPathOf('streaming', 'GLS-A012')).toBe('/qsheet/streaming/GLS-A012');
  });

  it('document の key を渡すと例外', () => {
    expect(() => panelPathOf('sheet', 'x')).toThrow();
  });
});

describe('enabledMiniApps — 導線に出してよいものだけ', () => {
  it('段4以降は sheet / schedule の両方が出る', () => {
    const keys = enabledMiniApps().map((a) => a.key);
    expect(keys).toContain('sheet');
    expect(keys).toContain('schedule');
    expect(keys).toContain('recording');
    expect(keys).toContain('streaming');
  });
});

describe('miniAppOfPath — URL から判定', () => {
  it('一覧の URL を判定する', () => {
    expect(miniAppOfPath('/qsheet/sheets')?.key).toBe('sheet');
    expect(miniAppOfPath('/qsheet/schedules')?.key).toBe('schedule');
  });

  it('資料1件の URL（`:id` を含む形）を判定する', () => {
    expect(miniAppOfPath('/qsheet/editor/abc123')?.key).toBe('sheet');
    expect(miniAppOfPath('/qsheet/schedules/xyz')?.key).toBe('schedule');
  });

  it('panel の URL（`:ownerKey` を含む形）を判定する', () => {
    expect(miniAppOfPath('/qsheet/recording/GLS-A012')?.key).toBe('recording');
    expect(miniAppOfPath('/qsheet/streaming/GLS-A012')?.key).toBe('streaming');
  });

  it('**長い path から先に見る**（短い listPath が誤って先に一致しない）', () => {
    // schedules の一覧 (/qsheet/schedules) と資料1件 (/qsheet/schedules/:id) が
    // 前方一致で衝突しないことを確認
    const found = miniAppOfPath('/qsheet/schedules/xyz');
    expect(found?.kind).toBe('document');
    expect((found as MiniAppDocumentDef).docPath).toBe('/qsheet/schedules/:id');
  });

  it('知らない URL は undefined', () => {
    expect(miniAppOfPath('/qsheet/nope')).toBeUndefined();
  });
});
