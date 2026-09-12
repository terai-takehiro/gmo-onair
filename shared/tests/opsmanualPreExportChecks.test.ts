// 運営マニュアル — 出す前の検査（runManualPreExportChecks）を固定する。
//
// 本体は client-techops 側（`client-techops/src/pages/opsmanual/manualPreExportChecks.ts`）
// にある。shared/CLAUDE.md「テスト」の「server の純粋関数も直接 import してよい」と同じ
// 考え方で、client-techops 向けのテストの置き場所が無いためここに置く
// （client-techops には .test.ts が1件も無い）。
import { describe, it, expect } from 'vitest';
import { runManualPreExportChecks } from '../../client-techops/src/pages/opsmanual/manualPreExportChecks';
import type { ManualResolveEntry } from '../../client-techops/src/lib/manualResolveApi';
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from '../src/opsmanual/types';
import type { ManualBlock, ManualPage } from '../src/opsmanual/types';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

function page(blocks: ManualBlock[], overrides: Partial<ManualPage> = {}): ManualPage {
  return {
    id: nextId('page'),
    manual_id: 'manual-1',
    sort_order: 0,
    chapter: null,
    title: 'ページ',
    blocks,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function textBlock(overrides: { x?: number; y?: number; w?: number; h?: number; text?: string } = {}): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'free',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    w: overrides.w ?? 50,
    h: overrides.h ?? 20,
    z: 0,
    style: {},
    free: { type: 'text', content: { text: overrides.text ?? 'hello' } },
  };
}

function imageBlock(url: string): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'free',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    free: { type: 'image', content: { url } },
  };
}

function tableBlock(rows: string[][]): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'free',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    free: { type: 'table', content: { rows } },
  };
}

function qrBlock(value: string): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'free',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    free: { type: 'qr', content: { value } },
  };
}

function shapeBlock(): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'free',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    free: { type: 'shape', content: { shape: 'rect' } },
  };
}

function linkedBlock(overrides: { frozen?: { at: string; data: unknown } | null } = {}): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'linked',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    link: { block: 'project.heading', sourceId: null, options: {}, frozen: overrides.frozen ?? null },
  };
}

describe('runManualPreExportChecks — 紙からはみ出すブロック', () => {
  it('全部が版面の中に収まっていれば0件', () => {
    const p = page([textBlock({ x: 10, y: 10, w: 50, h: 20 })]);
    const result = runManualPreExportChecks([p], {});
    expect(result.overflowing).toEqual([]);
  });

  it('右端・下端が紙の外に出ていれば検出する', () => {
    const b = textBlock({ x: PAGE_WIDTH_MM - 10, y: 0, w: 50, h: 20 });
    const p = page([b]);
    const result = runManualPreExportChecks([p], {});
    expect(result.overflowing).toEqual([{ pageId: p.id, pageTitle: p.title, blockId: b.id }]);
  });

  it('左端・上端がマイナス座標に出ていれば検出する', () => {
    const b = textBlock({ x: -5, y: -1, w: 10, h: 10 });
    const p = page([b]);
    const result = runManualPreExportChecks([p], {});
    expect(result.overflowing.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('紙面ぴったりに収まる（境界そのもの）は検出しない', () => {
    const b = textBlock({ x: 0, y: 0, w: PAGE_WIDTH_MM, h: PAGE_HEIGHT_MM });
    const p = page([b]);
    const result = runManualPreExportChecks([p], {});
    expect(result.overflowing).toEqual([]);
  });
});

describe('runManualPreExportChecks — 中身が空のブロック（自由ブロック）', () => {
  it('文字: text が空文字なら空', () => {
    const b = textBlock({ text: '' });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('文字: 空白だけでも空扱い', () => {
    const b = textBlock({ text: '   ' });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('文字: 中身があれば空でない', () => {
    const b = textBlock({ text: 'こんにちは' });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks).toEqual([]);
  });

  it('画像: url が空なら空', () => {
    const b = imageBlock('');
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('画像: url があれば空でない', () => {
    const b = imageBlock('https://example.com/a.png');
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks).toEqual([]);
  });

  it('表: 全セルが空文字なら空', () => {
    const b = tableBlock([
      ['', ''],
      ['', ''],
    ]);
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('表: 1セルでも中身があれば空でない', () => {
    const b = tableBlock([
      ['', 'x'],
      ['', ''],
    ]);
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks).toEqual([]);
  });

  it('QR: value が空なら空', () => {
    const b = qrBlock('');
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('図形: 空の概念が無いので対象外（常に検出しない）', () => {
    const b = shapeBlock();
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks).toEqual([]);
  });
});

describe('runManualPreExportChecks — 差し込みブロック（空・消えた・変わったまま）', () => {
  it('resolved.data が null なら空', () => {
    const b = linkedBlock();
    const resolved: Record<string, ManualResolveEntry> = { [b.id]: { data: null, updatedAt: '2026-09-01T00:00:00.000Z' } };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
    expect(result.missingSource).toEqual([]);
  });

  it('resolved.data が空配列なら空', () => {
    const b = linkedBlock();
    const resolved: Record<string, ManualResolveEntry> = { [b.id]: { data: [], updatedAt: '2026-09-01T00:00:00.000Z' } };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('resolved.data が中身の無いオブジェクトなら空', () => {
    const b = linkedBlock();
    const resolved: Record<string, ManualResolveEntry> = { [b.id]: { data: {}, updatedAt: '2026-09-01T00:00:00.000Z' } };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('resolved.data に中身があれば空でない', () => {
    const b = linkedBlock();
    const resolved: Record<string, ManualResolveEntry> = {
      [b.id]: { data: { title: '本番案件' }, updatedAt: '2026-09-01T00:00:00.000Z' },
    };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks).toEqual([]);
  });

  it('resolved.error があれば「元の資料が消えた」に入れ、空ブロックには重複して入れない', () => {
    const b = linkedBlock();
    const resolved: Record<string, ManualResolveEntry> = {
      [b.id]: { data: null, updatedAt: null, error: 'source_missing' },
    };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.missingSource.map((i) => i.blockId)).toEqual([b.id]);
    expect(result.emptyBlocks).toEqual([]);
  });

  it('resolve の結果に該当ブロックが無い（未解決）ときも空ブロックとして扱う', () => {
    const b = linkedBlock();
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
    expect(result.missingSource).toEqual([]);
  });

  it('frozen が無い（段Dは常にこう）なら、更新日時が新しくても差し込み元が変わったままにはならない', () => {
    const b = linkedBlock({ frozen: null });
    const resolved: Record<string, ManualResolveEntry> = {
      [b.id]: { data: { x: 1 }, updatedAt: '2099-01-01T00:00:00.000Z' },
    };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.staleSource).toEqual([]);
  });

  it('frozen があり、resolved.updatedAt がそれより新しければ「変わったまま」に入る（段Eを見越した分岐。今は到達しない）', () => {
    const b = linkedBlock({ frozen: { at: '2026-01-01T00:00:00.000Z', data: { x: 0 } } });
    const resolved: Record<string, ManualResolveEntry> = {
      [b.id]: { data: { x: 1 }, updatedAt: '2026-02-01T00:00:00.000Z' },
    };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.staleSource.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('frozen があっても、resolved.updatedAt がそれ以前なら「変わったまま」にはならない', () => {
    const b = linkedBlock({ frozen: { at: '2026-02-01T00:00:00.000Z', data: { x: 0 } } });
    const resolved: Record<string, ManualResolveEntry> = {
      [b.id]: { data: { x: 1 }, updatedAt: '2026-01-01T00:00:00.000Z' },
    };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.staleSource).toEqual([]);
  });
});

describe('runManualPreExportChecks — 複数ページ・複合', () => {
  it('複数ページのブロックをまとめて数え、pageId/pageTitle/blockId を正しく持つ', () => {
    const b1 = textBlock({ text: '' });
    const b2 = qrBlock('');
    const p1 = page([b1], { title: '表紙' });
    const p2 = page([b2], { title: '当日の流れ' });
    const result = runManualPreExportChecks([p1, p2], {});
    expect(result.emptyBlocks).toEqual([
      { pageId: p1.id, pageTitle: '表紙', blockId: b1.id },
      { pageId: p2.id, pageTitle: '当日の流れ', blockId: b2.id },
    ]);
  });

  it('1つのブロックがはみ出しかつ空でも、両方の検査に独立して入る', () => {
    const b = textBlock({ x: -10, y: 0, w: 10, h: 10, text: '' });
    const p = page([b]);
    const result = runManualPreExportChecks([p], {});
    expect(result.overflowing.map((i) => i.blockId)).toEqual([b.id]);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('ページが無ければ全部0件', () => {
    const result = runManualPreExportChecks([], {});
    expect(result).toEqual({ overflowing: [], emptyBlocks: [], missingSource: [], staleSource: [] });
  });
});
