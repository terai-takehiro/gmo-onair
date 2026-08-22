// 台本 Excel（.xlsx）往復・冪等性・id 規則の固定（段6・実装設計 03-excel.md §8-5）。
//
// 固定していること:
//   ① 書き出し → Excel → 取込 で、id を保った行はデータが完全一致する（画像を除く）
//   ② 同じファイルを2回取り込んでも行数が増えない（冪等性。取込のたびに全部「更新」と
//      数えてしまうと、値は壊れなくても差分ノイズと Yjs への無駄な書き込みが積み重なる）
//   ③ ID 列を空にして取り込むと、その行だけ増える（既存行は増えない）
//   ④ 行数の暴走（3→769→100万行の再発）を検知して取込を止める
//
// server 側のロジック（plan.ts / workbook.ts）と client 側の適用（applyPlan.ts）を
// 実際に繋いで検証する（`qsheetCsvImport.test.ts` が client 側の csvImport + collab 差分器を
// 繋いでいるのと同じ考え方）。
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildQsheetWorkbook, type QsheetDocForExport } from '../../server/src/contexts/qsheet/excel/workbook';
import { buildImportPlan } from '../../server/src/contexts/qsheet/excel/plan';
import { applyOps } from '../../client-techops/src/lib/excel/applyPlan';

const BLOCKS = [
  { id: 'scenario', type: 'scenario', label: '台本' },
  { id: 'video', type: 'video', label: '映像' },
  { id: 'mic', type: 'audio_mic', label: 'マイク' },
  { id: 'led', type: 'led_xr', label: 'LED' },
  { id: 'remarks', type: 'remarks', label: '備考' },
];

function seedData() {
  return {
    meta: { title: 'テスト回', draftType: 'numbered', draftNumber: 1 },
    blocks: BLOCKS,
    masters: { persons: ['田中'], video: ['OP'], audio: [], telop: [], micTypes: ['SM58'] },
    ledScenes: [{ id: 'led_1', name: 'シーンA', wall: '白', floor: '黒' }],
    stageTemplates: [],
    sections: [
      {
        id: 'sec_1', label: 'オープニング', rows: [
          {
            id: 'row_1', duration: '0:30', label: '', cells: {
              scenario: { entries: [{ name: '田中', html: 'こんにちは', isQWord: false }] },
              video: { entries: [{ label: 'OP', memo: 'メモ1' }] },
              mic: { assignments: [{ ch: 1, state: 'on', person: '田中', micType: 'SM58' }, { ch: 2, state: 'off', person: '', micType: '' }] },
              led: { entries: [{ sceneId: 'led_1', cueType: 'V明け', transition: 'F.I.' }] },
              remarks: { value: '台本の備考' },
            },
          },
          {
            id: 'row_2', duration: '0:15', label: '', cells: {
              scenario: { entries: [{ name: '鈴木', html: 'よろしくお願いします', isQWord: true }] },
            },
          },
        ],
      },
    ],
  };
}

function seedDoc(data: ReturnType<typeof seedData>): QsheetDocForExport {
  return { id: 'doc_1', title: 'テスト回', status: 'draft', broadcast_date: '2026-01-01', data };
}

async function exportAndLoad(doc: QsheetDocForExport): Promise<ExcelJS.Workbook> {
  const wb = buildQsheetWorkbook(doc, {});
  const buf = await wb.xlsx.writeBuffer();
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as any);
  return wb2;
}

describe('Excel 往復（書き出し → 取込）', () => {
  it('① id を保った往復で値が完全一致する（画像を除く）', async () => {
    const data = seedData();
    const doc = seedDoc(data);
    const wb2 = await exportAndLoad(doc);

    const plan = buildImportPlan(wb2, data, 'merge');
    expect(plan.ok).toBe(true);
    expect(plan.errors).toEqual([]);
    expect(plan.summary.sections.add).toBe(0);
    expect(plan.summary.rows.add).toBe(0);
    expect(plan.summary.rows.update).toBe(0); // 何も変えていないファイルの取込はノイズを出さない

    const next = applyOps(data as any, plan.ops);
    const row1 = next.sections![0].rows![0];
    expect(row1.cells.scenario.entries[0].name).toBe('田中');
    expect(row1.cells.scenario.entries[0].html).toBe('こんにちは');
    expect(row1.cells.video.entries[0].label).toBe('OP');
    expect(row1.cells.video.entries[0].memo).toBe('メモ1');
    expect(row1.cells.remarks.value).toBe('台本の備考');
    // LED: 名前で書き出し → 名前で引き当てて元の sceneId に戻る
    expect(row1.cells.led.entries[0].sceneId).toBe('led_1');
    expect(row1.cells.led.entries[0].cueType).toBe('V明け');
    // マイク香盤: OFF も含めて往復する（CSV では表現できなかった項目）
    const assignments = row1.cells.mic.assignments.slice().sort((a: any, b: any) => a.ch - b.ch);
    expect(assignments).toEqual([
      { ch: 1, state: 'on', person: '田中', micType: 'SM58' },
      { ch: 2, state: 'off', person: '', micType: '' },
    ]);

    const row2 = next.sections![0].rows![1];
    expect(row2.cells.scenario.entries[0].isQWord).toBe(true);
  });

  it('② 同じファイルを2回取り込んでも行数もセクション数も増えない（冪等性）', async () => {
    const data = seedData();
    const doc = seedDoc(data);
    const wb2 = await exportAndLoad(doc);

    const plan1 = buildImportPlan(wb2, data, 'merge');
    const afterFirst = applyOps(data as any, plan1.ops);
    expect(afterFirst.sections![0].rows!.length).toBe(2);

    const wb3 = await exportAndLoad(doc); // 同じ内容をもう一度読み直す (Workbook は使い捨てなので再ロード)
    const plan2 = buildImportPlan(wb3, afterFirst, 'merge');
    expect(plan2.summary.rows.add).toBe(0);
    expect(plan2.summary.sections.add).toBe(0);
    const afterSecond = applyOps(afterFirst as any, plan2.ops);
    expect(afterSecond.sections![0].rows!.length).toBe(2);
  });

  it('③ ID 列を空にして取り込むと、その行だけ増える（既存行は残る）', async () => {
    const data = seedData();
    const doc = seedDoc(data);
    const wb2 = await exportAndLoad(doc);

    // 進行台本シートの末尾に ID 無しの新しい行を1行追加する
    const ws = wb2.worksheets.find((w) => w.name === '進行台本')!;
    const newRow = ws.getRow(ws.rowCount + 1);
    newRow.getCell(1).value = '行'; // 種別
    newRow.getCell(2).value = '';   // ID (空 = 新規)
    newRow.getCell(6).value = '0:20'; // 尺

    const plan = buildImportPlan(wb2, data, 'merge');
    expect(plan.ok).toBe(true);
    expect(plan.summary.rows.add).toBe(1);
    expect(plan.summary.rows.update).toBe(0); // 既存2行は変更なし

    const next = applyOps(data as any, plan.ops);
    expect(next.sections![0].rows!.length).toBe(3);
    // 既存の id は保たれている
    expect(next.sections![0].rows![0].id).toBe('row_1');
    expect(next.sections![0].rows![1].id).toBe('row_2');
    expect(next.sections![0].rows![2].id).not.toBe('');
  });

  it('④ ファイル内で ID が重複していたら取込を中止する', async () => {
    const data = seedData();
    const doc = seedDoc(data);
    const wb2 = await exportAndLoad(doc);
    const ws = wb2.worksheets.find((w) => w.name === '進行台本')!;
    // row_2 の ID を row_1 と重複させる
    for (let r = 3; r <= ws.rowCount; r++) {
      if (ws.getCell(r, 2).value === 'row_2') ws.getCell(r, 2).value = 'row_1';
    }
    const plan = buildImportPlan(wb2, data, 'merge');
    expect(plan.ok).toBe(false);
    expect(plan.errors.length).toBeGreaterThan(0);
    expect(plan.ops).toEqual([]);
  });

  it('applyOps は prev に無い id への update/trash を黙って無視する（地雷#1 P0 対策）', () => {
    const data = seedData();
    const ops = [
      { op: 'update_row' as const, sectionId: 'sec_1', rowId: 'row_does_not_exist', set: { duration: '9:99' } },
      { op: 'trash_section' as const, sectionId: 'sec_does_not_exist' },
    ];
    const next = applyOps(data as any, ops);
    expect(next.sections![0].rows!.length).toBe(2);
    expect(next.sections!.length).toBe(1);
  });
});
