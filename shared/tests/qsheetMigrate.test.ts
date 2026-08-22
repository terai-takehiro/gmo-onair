// 制作資料 (Qシート) — 読み込み時マイグレーション (migrateEntries.ts) の固定。
//
// ── なぜここをテストするか ──────────────────────────────────
//
// ① stage_diagram の templateIndex → templateId
//    ひな形を1つ消すと、それより後ろの index を指していた全行が別の図に
//    ずれる不具合の直し方そのもの。移行後は「ずれない」ことが本題。
// ② モバイル編集が書いた旧形セル (常に {entries:[...]} で丸ごと上書き) の正規化。
//    remarks/item/lighting は {value} に寄せ、stage_diagram/slide は
//    (元データは既に失われているため) 無意味な entries キーだけを取り除く。
// ③ 冪等性 — 移行済みのデータをもう一度通しても `changed` が立たないこと
//    (立つと保存が走り続け、同時編集で無駄な差分を作る)。
import { describe, it, expect } from 'vitest';
import {
  migrateStageTemplateRefs,
  migrateMobileCellShapes,
  normalizeQsheetData,
} from '../../client-techops/src/lib/migrateEntries';

const STAGE_BLOCK = { id: 'stg', type: 'stage_diagram', label: '立ち位置図' };

function docWithStageCell(templateIndex: number, templates = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]) {
  return {
    blocks: [STAGE_BLOCK],
    stageTemplates: templates,
    sections: [
      { id: 'sec1', rows: [{ id: 'row1', cells: { stg: { templateIndex, note: 'メモ' } } }] },
    ],
  };
}

describe('migrateStageTemplateRefs', () => {
  it('templateIndex:1 は 2番目のひな形の id に移る', () => {
    const result = migrateStageTemplateRefs(docWithStageCell(1) as any);
    expect(result.changed).toBe(true);
    const templates = (result.data as any).stageTemplates;
    const cell = (result.data as any).sections[0].rows[0].cells.stg;
    expect(cell.templateId).toBe(templates[1].id);
    expect(typeof templates[1].id).toBe('string');
    // note は保たれる
    expect(cell.note).toBe('メモ');
    // 旧キーは残さない
    expect('templateIndex' in cell).toBe(false);
  });

  it('範囲外の index は templateId: null になる', () => {
    const result = migrateStageTemplateRefs(docWithStageCell(99) as any);
    const cell = (result.data as any).sections[0].rows[0].cells.stg;
    expect(cell.templateId).toBeNull();
  });

  it('-1 (未選択) も templateId: null になる', () => {
    const result = migrateStageTemplateRefs(docWithStageCell(-1) as any);
    const cell = (result.data as any).sections[0].rows[0].cells.stg;
    expect(cell.templateId).toBeNull();
  });

  it('ひな形の並びは変えず、既存 id は保つ', () => {
    const templates = [{ id: 'stg_fixed', name: 'A' }, { name: 'B' }];
    const result = migrateStageTemplateRefs(docWithStageCell(0, templates) as any);
    const outTemplates = (result.data as any).stageTemplates;
    expect(outTemplates[0].id).toBe('stg_fixed');
    expect(outTemplates[1].id).toBeTruthy();
  });

  it('2回通しても変わらない (冪等)', () => {
    const once = migrateStageTemplateRefs(docWithStageCell(1) as any);
    const twice = migrateStageTemplateRefs(once.data as any);
    expect(twice.changed).toBe(false);
  });

  it('stageTemplates が無いドキュメントには触らない', () => {
    const data = { sections: [{ rows: [{ cells: {} }] }] };
    const result = migrateStageTemplateRefs(data as any);
    expect(result.changed).toBe(false);
    expect(result.data).toBe(data);
  });
});

describe('migrateMobileCellShapes', () => {
  const blocks = [
    { id: 'remarks1', type: 'remarks', label: '備考' },
    { id: 'stg', type: 'stage_diagram', label: '立ち位置図' },
    { id: 'slide1', type: 'slide', label: 'スライド' },
    { id: 'led1', type: 'led_xr', label: 'LED/XR' },
  ];

  it('モバイルの remarks が {entries} から {value} になる', () => {
    const data = {
      blocks,
      sections: [
        { rows: [{ cells: { remarks1: { entries: [{ label: '確認済み' }] } } }] },
      ],
    };
    const result = migrateMobileCellShapes(data as any);
    expect(result.changed).toBe(true);
    const cell = (result.data as any).sections[0].rows[0].cells.remarks1;
    expect(cell.value).toBe('確認済み');
    expect('entries' in cell).toBe(false);
  });

  it('PC が既に書いた {value} には触らない', () => {
    const data = {
      blocks,
      sections: [{ rows: [{ cells: { remarks1: { value: '既存' } } }] }],
    };
    const result = migrateMobileCellShapes(data as any);
    expect(result.changed).toBe(false);
  });

  it('stage_diagram/slide の残骸 entries キーだけを取り除く (元データは戻せない)', () => {
    const data = {
      blocks,
      sections: [
        {
          rows: [
            { cells: { stg: { entries: [{ label: '' }] }, slide1: { entries: [{ label: '' }] } } },
          ],
        },
      ],
    };
    const result = migrateMobileCellShapes(data as any);
    expect(result.changed).toBe(true);
    const row = (result.data as any).sections[0].rows[0];
    expect('entries' in row.cells.stg).toBe(false);
    expect('entries' in row.cells.slide1).toBe(false);
  });

  it('led_xr の既知の Cue 自由文はそのまま cueType に載る', () => {
    const data = {
      blocks,
      sections: [{ rows: [{ cells: { led1: { entries: [{ sceneId: 's1', cue: 'V明け' }] } } }] }],
    };
    const result = migrateMobileCellShapes(data as any);
    const entry = (result.data as any).sections[0].rows[0].cells.led1.entries[0];
    expect(entry.cueType).toBe('V明け');
    expect('cue' in entry).toBe(false);
  });

  it('led_xr の未知の Cue 自由文は custom + cueCustom に寄せる (捨てない)', () => {
    const data = {
      blocks,
      sections: [{ rows: [{ cells: { led1: { entries: [{ sceneId: 's1', cue: '本番きっかけ' }] } } }] }],
    };
    const result = migrateMobileCellShapes(data as any);
    const entry = (result.data as any).sections[0].rows[0].cells.led1.entries[0];
    expect(entry.cueType).toBe('custom');
    expect(entry.cueCustom).toBe('本番きっかけ');
  });

  it('led_xr の未知のトランジション自由文も custom + transitionCustom に寄せる', () => {
    const data = {
      blocks,
      sections: [{ rows: [{ cells: { led1: { entries: [{ transition: 'ワイプ' }] } } }] }],
    };
    const result = migrateMobileCellShapes(data as any);
    const entry = (result.data as any).sections[0].rows[0].cells.led1.entries[0];
    expect(entry.transition).toBe('custom');
    expect(entry.transitionCustom).toBe('ワイプ');
  });

  it('2回通しても変わらない (冪等)', () => {
    const data = {
      blocks,
      sections: [{ rows: [{ cells: { remarks1: { entries: [{ label: 'x' }] } } }] }],
    };
    const once = migrateMobileCellShapes(data as any);
    const twice = migrateMobileCellShapes(once.data as any);
    expect(twice.changed).toBe(false);
  });
});

describe('normalizeQsheetData — 3つのマイグレーションをまとめて1回で適用する', () => {
  it('splitMultiEntryRows / migrateStageTemplateRefs / migrateMobileCellShapes を合成する', () => {
    const data = {
      blocks: [
        { id: 'scenario', type: 'scenario' },
        { id: 'stg', type: 'stage_diagram' },
      ],
      stageTemplates: [{ name: 'A' }, { name: 'B' }],
      sections: [
        {
          rows: [
            {
              cells: {
                scenario: { entries: [{ name: '田中', html: '1つ目' }, { name: '鈴木', html: '2つ目' }] },
                stg: { templateIndex: 1 },
              },
            },
          ],
        },
      ],
    };
    const result = normalizeQsheetData(data as any);
    expect(result.changed).toBe(true);
    expect(result.splitRows).toBe(1);
    // 複数エントリ行が分割されている
    expect(result.data.sections![0].rows!.length).toBe(2);
    // stage_diagram は 1 行目 (row-level データ) にだけ残り、id 参照に移っている
    const firstRowStg = (result.data.sections![0].rows![0] as any).cells.stg;
    expect(firstRowStg.templateId).toBe((result.data as any).stageTemplates[1].id);
  });

  it('冪等 — 2回目は changed が false', () => {
    const data = {
      blocks: [{ id: 'stg', type: 'stage_diagram' }],
      stageTemplates: [{ name: 'A' }],
      sections: [{ rows: [{ cells: { stg: { templateIndex: 0 } } }] }],
    };
    const once = normalizeQsheetData(data as any);
    const twice = normalizeQsheetData(once.data as any);
    expect(twice.changed).toBe(false);
  });
});
