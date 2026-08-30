/**
 * 収録設定・配信設定の Excel 書き出し（`device-excel.service.ts`）の判定を固定する。
 *
 * ここで固定するのは、**画面を見ても間違いに気づけない**現地取込の決めごと:
 *   1. シートの並びは `?sheets=` の並びそのまま（Assistant は**1枚目しか読まない**。
 *      以前は常に「収録 → 配信」に固定され、配信設定の画面からの既定の書き出しが
 *      現地でそのまま取り込めなかった）
 *   2. 収録先は現地の機器が解決できる呼び名で出す（`USB-C` は空白・ハイフンを
 *      落とすと `usbc` になり、機器の `usb1` に一致せず**行ごと弾かれていた**）
 *   3. キーの見本は keyMode に従う（伏せ字 `****`。平文は絶対に出さない）
 *   4. 復号できない鍵を数えられる（`ENCRYPTION_KEY` が変わると、キー列が
 *      空欄の Excel が**警告ひとつ無く**出来上がる）
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  buildDeviceSettingsPreview,
  exportSlotValue,
  listUndecryptableKeys,
} from '../../server/src/contexts/qsheet/services/device-excel.service';
import { encrypt } from '../../server/src/shared/utils/secret-box';

const baseInput = {
  ownerLabel: 'GLS-A012',
  serviceDate: '2026-09-01',
  decks: [
    { deckId: 'REC1', videoFormat: '1920x1080p59.94', codec: 'H.264:High', audioChannels: 2, slot: 'USB-C', filePrefix: 'PGM' },
    { deckId: 'REC2', slot: 'ネットワーク' },
    { deckId: 'REC3', slot: 'ボリュームA' },
    { deckId: 'REC4', skip: true },
  ],
  destinations: [
    { destId: 'd1', encoderId: 'ENC1', name: 'YouTube Main', protocol: 'RTMP' as const, url: 'rtmp://a.rtmp.youtube.com/live2' },
  ],
  keyMode: 'blank' as const,
};

describe('シートの並び — ?sheets= の並びがそのままシートの並び（1枚目が現地で読まれる）', () => {
  it('配信 → 収録 の順で頼むと、配信設定が1枚目になる', () => {
    const preview = buildDeviceSettingsPreview({ ...baseInput, sheets: ['streaming', 'recording'] });
    expect(preview.map((s) => s.name)).toEqual(['配信設定', '収録設定', '入力ガイド']);
  });

  it('収録 → 配信 の順ならこれまでどおり収録設定が1枚目', () => {
    const preview = buildDeviceSettingsPreview({ ...baseInput, sheets: ['recording', 'streaming'] });
    expect(preview.map((s) => s.name)).toEqual(['収録設定', '配信設定', '入力ガイド']);
  });

  it('1枚だけ選んでも入力ガイドは必ず最後に付く（#279 §4-4）', () => {
    const preview = buildDeviceSettingsPreview({ ...baseInput, sheets: ['streaming'] });
    expect(preview.map((s) => s.name)).toEqual(['配信設定', '入力ガイド']);
  });

  it('同じシートを二重に頼まれても1枚しか出さない', () => {
    const preview = buildDeviceSettingsPreview({ ...baseInput, sheets: ['recording', 'recording'] });
    expect(preview.map((s) => s.name)).toEqual(['収録設定', '入力ガイド']);
  });
});

describe('収録先の呼び名 — 現地の機器（Assistant の取込）が解決できる形で出す', () => {
  it('画面の呼び名を device 名に写す（USB-C が現地で解決されなかった実害の修正）', () => {
    expect(exportSlotValue('USB-C')).toBe('usb1');
    expect(exportSlotValue('SSD 1')).toBe('ssd1');
    expect(exportSlotValue('SSD 2')).toBe('ssd2');
    expect(exportSlotValue('SD 1')).toBe('sd1');
    expect(exportSlotValue('SD 2')).toBe('sd2');
  });

  it('日本語で安全なのは「ネットワーク」だけ — そのまま通す（#279 §4-1）', () => {
    expect(exportSlotValue('ネットワーク')).toBe('ネットワーク');
  });

  it('知らない値（自由入力・ボリューム名）は変えずに通す（弾くのは現地の仕事）', () => {
    expect(exportSlotValue('ボリュームA')).toBe('ボリュームA');
    expect(exportSlotValue(undefined)).toBe('');
  });

  it('見本（= 実物と同じ整形）にも写した値が出る', () => {
    const preview = buildDeviceSettingsPreview({ ...baseInput, sheets: ['recording'] });
    const rec = preview[0];
    const slotCol = rec.headers.indexOf('収録先');
    expect(rec.rows[0][slotCol]).toBe('usb1');
    expect(rec.rows[1][slotCol]).toBe('ネットワーク');
    expect(rec.rows[2][slotCol]).toBe('ボリュームA');
    // skip の台は行ごと出ない（空行禁止）
    expect(rec.totalRows).toBe(3);
  });
});

describe('キーの見本と復号チェック', () => {
  const origKey = process.env.ENCRYPTION_KEY;
  afterEach(() => {
    if (origKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = origKey;
  });

  it('keyMode=blank ならキー列は空欄（見本も実物と同じ）', () => {
    const preview = buildDeviceSettingsPreview({ ...baseInput, sheets: ['streaming'] });
    const st = preview[0];
    const keyCol = st.headers.indexOf('ストリームキー');
    expect(st.rows[0][keyCol]).toBe('');
  });

  it('keyMode=plain で鍵があれば、見本は伏せ字 ****（平文は出さない）', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const enc = encrypt('secret-stream-key');
    const preview = buildDeviceSettingsPreview({
      ...baseInput,
      sheets: ['streaming'],
      destinations: [{ ...baseInput.destinations[0], streamKeyEnc: enc }],
      keyMode: 'plain',
    });
    const st = preview[0];
    const keyCol = st.headers.indexOf('ストリームキー');
    expect(st.rows[0][keyCol]).toBe('****');
  });

  it('復号できない鍵は数えられる（保存時と ENCRYPTION_KEY が違う事故）', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const enc = encrypt('secret-stream-key');
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    const bad = listUndecryptableKeys([{ ...baseInput.destinations[0], streamKeyEnc: enc }]);
    expect(bad).toEqual(['ENC1 / YouTube Main']);
    // 鍵が合っていれば 0 件
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    expect(listUndecryptableKeys([{ ...baseInput.destinations[0], streamKeyEnc: enc }])).toEqual([]);
  });

  it('復号できない鍵は keyMode=plain の実物でも空欄になる（この形を見本でも隠さない）', () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    const enc = encrypt('secret-stream-key');
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);
    const preview = buildDeviceSettingsPreview({
      ...baseInput,
      sheets: ['streaming'],
      destinations: [{ ...baseInput.destinations[0], streamKeyEnc: enc }],
      keyMode: 'plain',
    });
    const st = preview[0];
    const keyCol = st.headers.indexOf('ストリームキー');
    expect(st.rows[0][keyCol]).toBe('');
  });
});
