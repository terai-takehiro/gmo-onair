/**
 * 収録設定・配信設定の Excel（`device-excel.service.ts`）が、台本の Excel
 * （`qsheet-excel.service.ts` — 03-excel.md で追加予定）や `exceljs`、
 * 台本側の2行ヘッダ形式（`_schema` 隠しシート）を**混入させていないか**を見張る。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * 制作資料には Excel が2本あり、前提が正反対（08 §4 / impl doc §6-1）。
 * 「似ているから」で後から共有すると、Assistant が2行目をデータ行として読み、
 * 現地で全行が弾かれる。口約束ではなく、文字列を固定して機械的に見張る
 * （`shared/tests/crossAppLinks.test.ts` と同じ形）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const TARGET = join(
  ROOT,
  'server/src/contexts/qsheet/services/device-excel.service.ts'
);

const BANNED = ['qsheet-excel', 'exceljs', '_schema'];

describe('device-excel.service.ts の分離', () => {
  it('台本の Excel モジュール・exceljs・_schema を参照していない', () => {
    const text = readFileSync(TARGET, 'utf8');
    for (const word of BANNED) {
      expect(text.includes(word)).toBe(false);
    }
  });

  it('shared/utils/excel.ts の既存 API（buildExcelWorkbook / excelResponse）だけを使っている', () => {
    const text = readFileSync(TARGET, 'utf8');
    expect(text).toContain("from '../../../shared/utils/excel'");
  });
});
