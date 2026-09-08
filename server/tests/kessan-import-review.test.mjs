import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.mjs';

// normalizeForMatch は取引先・顧客の名寄せ／販管費の重複検出で使う突き合わせキー。
// 完全一致だと、元帳側の表記が登録済みマスタと1文字でも違うだけで「別会社」を
// 新規作成する・二重計上を見逃す、という不具合になる（terai-takehiro/gmo-onair#663
// のレビュー指摘）。ここでは表記ゆれの吸収そのものを固定する。
test('normalizeForMatch absorbs zenkaku/hankaku and compatibility-character notation differences', async () => {
  const { normalizeForMatch } = await loadTs('server/src/contexts/platform/services/kessan-import.service.ts', {
    '../../../shared/utils/excel': { loadExcelWorkbook: {}, sheetToAoa: {} },
    '../../../shared/db/connection': { getDb: {} },
    '../../../shared/services/tax-category.service': { normalizeTaxCategory: {} },
    '../../../shared/services/gmo-group': { looksLikeGmoGroup: {} },
    '../../../shared/services/company-directory.service': {
      createCustomerRecord: {}, createVendorRecord: {}, execFromPgClient: {},
    },
    '../../../shared/constants/entity-default': { CURRENT_ENTITY_CODE: {} },
  });

  // 全角英数字・全角スペースは半角に統一される（NFKC）。
  assert.equal(normalizeForMatch('ＡＢＣ商事　株式会社'), 'ABC商事 株式会社');
  // 互換文字 ㈱ は (株) に分解される（NFKC の標準的な振る舞い）。
  assert.equal(normalizeForMatch('㈱ABC商事'), '(株)ABC商事');
  // 連続する空白（半角・タブ混在）は1つに圧縮し、前後は trim する。
  assert.equal(normalizeForMatch('  ABC  商事 \t 東京支店  '), 'ABC 商事 東京支店');
  // 表記が完全に同じなら当然一致する。
  assert.equal(normalizeForMatch('ABC商事'), normalizeForMatch('ABC商事'));
  // 全角スペース入りと半角スペース入りが同一キーになる（元の不具合の再現ケース）。
  assert.equal(normalizeForMatch('ABC　商事'), normalizeForMatch('ABC 商事'));
  // null/undefined は空文字として扱う。
  assert.equal(normalizeForMatch(null), '');
  assert.equal(normalizeForMatch(undefined), '');
});
