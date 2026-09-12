// 運営マニュアル — 印刷ドキュメント本体（`client-techops/src/pages/opsmanual/ManualPrintDocument.tsx`）
// が export する純粋関数を固定する。本体は client-techops 側にあり、client-techops には
// .test.ts の置き場所が無いため、`opsmanualPreExportChecks.test.ts` と同じ考え方でここに置く。
//
// 画面を見ても間違いに気づけない計算（範囲の絞り込み・取扱注意の判定・柱の文言）だけを
// 固定する（shared/CLAUDE.md「テスト」の方針）。
import { describe, it, expect } from 'vitest';
import {
  manualHasRevealedSecret,
  manualPrintAsOfLabel,
  manualPrintStatusLabel,
  selectPagesInRange,
} from '../../client-techops/src/pages/opsmanual/ManualPrintDocument';
import type { ManualBlock, ManualPage } from '../src/opsmanual/types';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function page(blocks: ManualBlock[] = []): ManualPage {
  return {
    id: nextId('page'),
    manual_id: 'manual-1',
    sort_order: 0,
    chapter: null,
    title: 'ページ',
    blocks,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  };
}

function linkedBlock(reveal?: { by: string; at: string; fields: string[] }): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'linked',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    link: { block: 'project.heading', sourceId: null, options: {}, frozen: null, reveal },
  };
}

describe('selectPagesInRange', () => {
  it('mode: all はそのまま全部返す', () => {
    const pages = [page(), page(), page()];
    expect(selectPagesInRange(pages, { mode: 'all', from: 1, to: 1 })).toEqual(pages);
  });

  it('mode: range は from〜to（1始まり・両端含む）を返す', () => {
    const pages = [page(), page(), page()];
    const result = selectPagesInRange(pages, { mode: 'range', from: 2, to: 3 });
    expect(result).toEqual([pages[1], pages[2]]);
  });

  it('範囲が逆転していれば空配列（「書き出すページがありません」の分岐へ）', () => {
    const pages = [page(), page(), page()];
    expect(selectPagesInRange(pages, { mode: 'range', from: 3, to: 1 })).toEqual([]);
  });

  it('範囲がページ数を超えていれば末尾でクランプする', () => {
    const pages = [page(), page()];
    const result = selectPagesInRange(pages, { mode: 'range', from: 1, to: 99 });
    expect(result).toEqual(pages);
  });

  it('from が0以下・NaNのようなおかしい値は1側にクランプする', () => {
    const pages = [page(), page()];
    const result = selectPagesInRange(pages, { mode: 'range', from: -5, to: 1 });
    expect(result).toEqual([pages[0]]);
  });

  it('ページが無ければ何を指定しても空配列', () => {
    expect(selectPagesInRange([], { mode: 'range', from: 1, to: 1 })).toEqual([]);
    expect(selectPagesInRange([], { mode: 'all', from: 1, to: 1 })).toEqual([]);
  });
});

describe('manualHasRevealedSecret', () => {
  it('伏せ字を解除した差し込みブロックが1つも無ければ false', () => {
    const pages = [page([linkedBlock(undefined)])];
    expect(manualHasRevealedSecret(pages)).toBe(false);
  });

  it('どこか1ページの1ブロックでも reveal があれば true（§7-2）', () => {
    const pages = [page([linkedBlock(undefined)]), page([linkedBlock({ by: 'u1', at: '2026-09-01T00:00:00.000Z', fields: ['passcode'] })])];
    expect(manualHasRevealedSecret(pages)).toBe(true);
  });

  it('ページが無ければ false', () => {
    expect(manualHasRevealedSecret([])).toBe(false);
  });
});

describe('manualPrintStatusLabel', () => {
  it('draft は「下書き」', () => {
    expect(manualPrintStatusLabel({ status: 'draft', rev: 0 })).toBe('下書き');
  });

  it('draft 以外（段E以降にしか到達しない）は rev.N', () => {
    expect(manualPrintStatusLabel({ status: 'fixed', rev: 2 })).toBe('rev.2');
  });
});

describe('manualPrintAsOfLabel', () => {
  it('§6⑤の例「2026/08/22 14:00 時点」と同じ桁の並び（年を含む）で出す', () => {
    const date = new Date(2026, 7, 22, 14, 0); // 月は0始まり = 8月
    expect(manualPrintAsOfLabel(date)).toBe('2026/08/22 14:00 時点');
  });

  it('月日・時刻の1桁はゼロ埋めする', () => {
    const date = new Date(2027, 0, 5, 9, 5);
    expect(manualPrintAsOfLabel(date)).toBe('2027/01/05 09:05 時点');
  });
});
