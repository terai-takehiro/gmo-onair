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
import type { ManualBlock, ManualOrgChartContent, ManualPage } from '../src/opsmanual/types';

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

function orgChartBlock(content: ManualOrgChartContent): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'free',
    x: 0,
    y: 0,
    w: 180,
    h: 90,
    z: 0,
    style: {},
    free: { type: 'orgchart', content },
  };
}

function linkedBlock(overrides: { frozen?: { at: string; data: unknown } | null; block?: string } = {}): ManualBlock {
  return {
    id: nextId('blk'),
    kind: 'linked',
    x: 0,
    y: 0,
    w: 50,
    h: 20,
    z: 0,
    style: {},
    link: { block: overrides.block ?? 'project.heading', sourceId: null, options: {}, frozen: overrides.frozen ?? null },
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

  it('キャンバスぴったりに収まる（境界そのもの）は検出しない', () => {
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

  it('体制図: 置いた直後（名前の無い階層が1つ・チーム0）は空', () => {
    const b = orgChartBlock({ tiers: [{ id: 'tier-1', label: '', boxes: [] }] });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('体制図: 階層の名前だけでも打ってあれば空でない', () => {
    const b = orgChartBlock({ tiers: [{ id: 'tier-1', label: '統括', boxes: [] }] });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks).toEqual([]);
  });

  it('体制図: チーム名・所属・人のどれか1つでも文字があれば空でない', () => {
    const box = orgChartBlock({ tiers: [{ id: 't1', label: '', boxes: [{ id: 'b1', label: '技術', people: [] }] }] });
    const org = orgChartBlock({
      tiers: [{ id: 't2', label: '', boxes: [{ id: 'b2', label: '', org: '東都TV', people: [] }] }],
    });
    const person = orgChartBlock({
      tiers: [{ id: 't3', label: '', boxes: [{ id: 'b3', label: '', people: [{ id: 'p1', name: '山田' }] }] }],
    });
    const role = orgChartBlock({
      tiers: [{ id: 't4', label: '', boxes: [{ id: 'b4', label: '', people: [{ id: 'p2', name: '', role: '音声' }] }] }],
    });
    const result = runManualPreExportChecks([page([box, org, person, role])], {});
    expect(result.emptyBlocks).toEqual([]);
  });

  it('体制図: 空白だけの階層・チーム・人は空扱い', () => {
    const b = orgChartBlock({
      tiers: [{ id: 't1', label: '  ', boxes: [{ id: 'b1', label: ' ', org: ' ', people: [{ id: 'p1', name: '  ' }] }] }],
    });
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

describe('runManualPreExportChecks — 差し込みブロックの種類ごとの「空」判定（外部レビュー再指摘・P1）', () => {
  // 以前は resolved.data が持つキーの**個数**だけを見ていた。ほとんどの resolver は
  // 行の配列を1個のキーに包んで返す（`{ destinations: [] }` 等）ため、中身（配列）が
  // 空でも外側のオブジェクトは1キー持っており「空でない」と誤判定していた。
  // ブロック種別ごとに resolver の戻り値の形を理解し、包んだ配列そのものの長さを見る。
  it('streaming.list: destinations が空配列なら空、中身があれば空でない', () => {
    const empty = linkedBlock({ block: 'streaming.list' });
    const filled = linkedBlock({ block: 'streaming.list' });
    const resolved: Record<string, ManualResolveEntry> = {
      [empty.id]: { data: { destinations: [] }, updatedAt: null },
      [filled.id]: { data: { destinations: [{ id: 'd1' }] }, updatedAt: null },
    };
    const result = runManualPreExportChecks([page([empty, filled])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([empty.id]);
  });

  it('schedule.day / schedule.loadInOut: items が空配列なら空', () => {
    const day = linkedBlock({ block: 'schedule.day' });
    const loadInOut = linkedBlock({ block: 'schedule.loadInOut' });
    const resolved: Record<string, ManualResolveEntry> = {
      [day.id]: { data: { items: [] }, updatedAt: null },
      [loadInOut.id]: { data: { items: [] }, updatedAt: null },
    };
    const result = runManualPreExportChecks([page([day, loadInOut])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId).sort()).toEqual([day.id, loadInOut.id].sort());
  });

  it('sheet.excerpt: sections[].rows が全部空なら空、1件でも行があれば空でない', () => {
    const empty = linkedBlock({ block: 'sheet.excerpt' });
    const filled = linkedBlock({ block: 'sheet.excerpt' });
    const resolved: Record<string, ManualResolveEntry> = {
      [empty.id]: { data: { sections: [{ rows: [] }, { rows: [] }] }, updatedAt: null },
      [filled.id]: { data: { sections: [{ rows: [] }, { rows: [{ id: 'r1' }] }] }, updatedAt: null },
    };
    const result = runManualPreExportChecks([page([empty, filled])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([empty.id]);
  });

  it('sheet.rundown: 素の配列（rows/sections を持たない旧形）でも行数で判定する', () => {
    const empty = linkedBlock({ block: 'sheet.rundown' });
    const filled = linkedBlock({ block: 'sheet.rundown' });
    const resolved: Record<string, ManualResolveEntry> = {
      [empty.id]: { data: [], updatedAt: null },
      [filled.id]: { data: [{ id: 'r1' }], updatedAt: null },
    };
    const result = runManualPreExportChecks([page([empty, filled])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([empty.id]);
  });

  it('sheet.micAssignment: assignments が空配列なら空', () => {
    const b = linkedBlock({ block: 'sheet.micAssignment' });
    const resolved: Record<string, ManualResolveEntry> = { [b.id]: { data: { assignments: [] }, updatedAt: null } };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('recording.list: decks が空配列なら空', () => {
    const b = linkedBlock({ block: 'recording.list' });
    const resolved: Record<string, ManualResolveEntry> = { [b.id]: { data: { decks: [] }, updatedAt: null } };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('streaming.webMeeting: meetings が空配列なら空', () => {
    const b = linkedBlock({ block: 'streaming.webMeeting' });
    const resolved: Record<string, ManualResolveEntry> = { [b.id]: { data: { meetings: [] }, updatedAt: null } };
    const result = runManualPreExportChecks([page([b])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('rental.list: groups があっても全グループの lines が空なら空、1本でも行があれば空でない', () => {
    const empty = linkedBlock({ block: 'rental.list' });
    const filled = linkedBlock({ block: 'rental.list' });
    const resolved: Record<string, ManualResolveEntry> = {
      [empty.id]: { data: { groups: [{ lines: [] }, { lines: [] }] }, updatedAt: null },
      [filled.id]: { data: { groups: [{ lines: [] }, { lines: [{ id: 'l1' }] }] }, updatedAt: null },
    };
    const result = runManualPreExportChecks([page([empty, filled])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([empty.id]);
  });

  it('equipment.lending: rows または lendings のどちらでも読む（resolver の版差）', () => {
    const viaRows = linkedBlock({ block: 'equipment.lending' });
    const viaLendings = linkedBlock({ block: 'equipment.lending' });
    const resolved: Record<string, ManualResolveEntry> = {
      [viaRows.id]: { data: { rows: [] }, updatedAt: null },
      [viaLendings.id]: { data: { lendings: [{ id: 'e1' }] }, updatedAt: null },
    };
    const result = runManualPreExportChecks([page([viaRows, viaLendings])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([viaRows.id]);
  });

  it('project.heading・未知の種別は従来どおりフィールド0個で判定する', () => {
    const empty = linkedBlock({ block: 'project.heading' });
    const filled = linkedBlock({ block: 'project.heading' });
    const resolved: Record<string, ManualResolveEntry> = {
      [empty.id]: { data: {}, updatedAt: null },
      [filled.id]: { data: { title: '本番案件' }, updatedAt: null },
    };
    const result = runManualPreExportChecks([page([empty, filled])], resolved);
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([empty.id]);
  });
});

describe('runManualPreExportChecks — 名前の無い階層・名前の無い人（体制図）', () => {
  it('階層の名前が空なら検出する', () => {
    const b = orgChartBlock({
      tiers: [{ id: 't1', label: '', boxes: [{ id: 'b1', label: '技術', people: [{ id: 'p1', name: '山田' }] }] }],
    });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.unnamedOrgEntries.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('人の名前が空なら検出する（役割だけ打って氏名が空のまま、など）', () => {
    const b = orgChartBlock({
      tiers: [
        {
          id: 't1',
          label: '統括',
          boxes: [{ id: 'b1', label: '技術', people: [{ id: 'p1', name: '', role: '音声' }] }],
        },
      ],
    });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.unnamedOrgEntries.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('空白だけの名前も「名前の無い」として検出する', () => {
    const b = orgChartBlock({
      tiers: [{ id: 't1', label: ' ', boxes: [{ id: 'b1', label: '技術', people: [{ id: 'p1', name: '山田' }] }] }],
    });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.unnamedOrgEntries.map((i) => i.blockId)).toEqual([b.id]);
  });

  it('⚠️ 人が0人のチームは検出しない（人が決まっていないチームを意図して紙に出せる）', () => {
    const b = orgChartBlock({ tiers: [{ id: 't1', label: '統括', boxes: [{ id: 'b1', label: '音声', people: [] }] }] });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.unnamedOrgEntries).toEqual([]);
  });

  it('チーム名が空なだけでは検出しない（検査の対象は階層と人の2つ）', () => {
    const b = orgChartBlock({
      tiers: [{ id: 't1', label: '統括', boxes: [{ id: 'b1', label: '', people: [{ id: 'p1', name: '山田' }] }] }],
    });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.unnamedOrgEntries).toEqual([]);
  });

  it('階層も人も名前が埋まっていれば0件', () => {
    const b = orgChartBlock({
      tiers: [
        { id: 't1', label: '統括', boxes: [{ id: 'b1', label: '進行', people: [{ id: 'p1', name: '寺井' }] }] },
        { id: 't2', label: '各パート', boxes: [{ id: 'b2', label: '技術', org: '東都TV', people: [] }] },
      ],
    });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.unnamedOrgEntries).toEqual([]);
  });

  it('1ブロックに不備がいくつあっても1件だけ数える（ブロック単位）', () => {
    const b = orgChartBlock({
      tiers: [
        { id: 't1', label: '', boxes: [{ id: 'b1', label: '技術', people: [{ id: 'p1', name: '' }] }] },
        { id: 't2', label: '', boxes: [] },
      ],
    });
    const p = page([b], { title: '体制' });
    const result = runManualPreExportChecks([p], {});
    expect(result.unnamedOrgEntries).toEqual([{ pageId: p.id, pageTitle: '体制', blockId: b.id }]);
  });

  it('体制図以外のブロックは対象外', () => {
    const result = runManualPreExportChecks([page([textBlock({ text: '' }), tableBlock([['']]), linkedBlock()])], {});
    expect(result.unnamedOrgEntries).toEqual([]);
  });

  it('置いた直後の体制図は「空」と「名前の無い階層」の両方に独立して入る', () => {
    const b = orgChartBlock({ tiers: [{ id: 't1', label: '', boxes: [] }] });
    const result = runManualPreExportChecks([page([b])], {});
    expect(result.emptyBlocks.map((i) => i.blockId)).toEqual([b.id]);
    expect(result.unnamedOrgEntries.map((i) => i.blockId)).toEqual([b.id]);
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
    expect(result).toEqual({
      overflowing: [],
      emptyBlocks: [],
      missingSource: [],
      staleSource: [],
      unnamedOrgEntries: [],
    });
  });
});
