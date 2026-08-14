/**
 * 見積の明細の分類を、画面と紙で同じにする。
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * `estimate_items.category` に入るのは**画面が持つ鍵**（`studio` / `tech` / `other`）で、
 * 日本語の札は画面の側にしかありません。サーバー（`estimate-pdf.service.ts`）は
 * PDF を描くときに同じ札を要るので**写しを持っています**。
 *
 * 写しが食い違うと:
 * - 鍵が増えたのにサーバーが知らない → **帯に「studio」と英語が出る**（実際にそう出ていた）
 * - 札を変えたのに片方だけ直す → **同じ見積が画面と紙で違う分け方に見える**
 *
 * どちらも型検査にも lint にも出ません（ただの文字列なので）。
 * 画面のファイルは React を import しているので**実行はせず、文字として読みます**。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESTIMATE_CATEGORY_LABEL } from '../../server/src/contexts/sales/services/estimate-pdf.service';

/** 画面の `CATEGORIES` を文字として読む（`{ key: 'studio', label: 'スタジオ' }` の並び） */
function screenCategories(): Record<string, string> {
  const src = readFileSync(
    resolve(__dirname, '../../client/src/contexts/sales/pages/projectDetail/EstimateItems.tsx'),
    'utf-8',
  );
  const block = src.match(/const CATEGORIES[\s\S]*?\n\];/);
  expect(block, '画面の CATEGORIES が見つからない（名前を変えたらこの試験も直すこと）').toBeTruthy();
  const out: Record<string, string> = {};
  for (const m of block![0].matchAll(/key:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

describe('見積の明細の分類', () => {
  it('画面の3つの鍵をサーバーも知っている', () => {
    const screen = screenCategories();
    expect(Object.keys(screen).length).toBe(3);
    expect(Object.keys(ESTIMATE_CATEGORY_LABEL).sort()).toEqual(Object.keys(screen).sort());
  });

  it('札の文字が画面と紙で同じ', () => {
    expect(ESTIMATE_CATEGORY_LABEL).toEqual(screenCategories());
  });

  it('鍵は英字だけ（紙にそのまま出ても読めるものを鍵にしない）', () => {
    for (const key of Object.keys(ESTIMATE_CATEGORY_LABEL)) {
      expect(key, key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});
