// Qシート CSV 取込 — **取り込んだロール/行が編集のたびに倍々に増える**不具合の固定。
//
// 何が起きていたか:
//   CSV 取込は `sections[]` を作るが **`id` を付けていなかった**。
//   同時共同編集 (collab) の差分器 (`ydocDiff`) は **`id` を鍵に prev/next を突き合わせる**ため、
//   id の無いロール/行は「Y.Doc にまだ無いもの」と毎回判定され、
//   **編集するたびに全部がもう一度追加される** (2 → 4 → 8 → …)。
//   打鍵の commit ごとに倍になるので、20 回ほどでロールが百万件に達しブラウザとサーバーが落ちる。
//
// ここで固定するのは「画面を見ても気づけない」部分:
//   ① CSV 取込の結果は必ず一意な id を持つ
//   ② id 無しが紛れ込んでも差分器が増殖させない (壊れた既存文書の回復を含む)
//   ③ 通常の編集は今までどおり id で突き合わさる (作り直しではなくマージ)

import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { applyDataToYDoc, yDocToData } from '../src/collab/yjsDoc';
import { parseCsv, mapCsvColumns, buildSectionsFromCsv } from '../../client-techops/src/lib/csvImport';
import { applyDataUpdate } from '../../client-techops/src/lib/collab/ydocDiff';
import * as ops from '../../client-techops/src/lib/collab/ydocOps';

const BLOCKS = [
  { id: 'scenario', type: 'scenario', label: '台本' },
  { id: 'video', type: 'video', label: '映像' },
];

const CSV = [
  '#,セクション,尺,台本,映像',
  '1,オープニング,0:30,【田中】本日はお集まりいただき,VTR OP映像',
  '2,オープニング,1:00,【鈴木】よろしくお願いします,',
  '3,CM,1:00,,',
  '4,本編,2:00,【田中】さて本題です,',
].join('\n');

function importCsv(csv = CSV) {
  const rows = parseCsv(csv);
  const map = mapCsvColumns(rows[0], BLOCKS);
  if ('error' in map) throw new Error(map.error);
  return buildSectionsFromCsv(rows, map);
}

/** 既存文書 (id つき) を種にした Y.Doc。EditorPage が collab で開いた直後の状態。 */
function seedYDoc(sections: any[] = [{ id: 'sec_a', label: '既存ロール', rows: [{ id: 'row_a', duration: '0:10', cells: {} }] }]) {
  const ydoc = new Y.Doc();
  applyDataToYDoc(ydoc, { meta: { title: 'テスト' }, blocks: BLOCKS, masters: { persons: [] }, sections });
  return ydoc;
}

/** EditorPage の updateData (collab 経路) と同じ呼び方。 */
function edit(ydoc: Y.Doc, updater: (d: any) => any) {
  ydoc.transact(() => applyDataUpdate(ydoc, updater), 'local');
}

const sectionsOf = (ydoc: Y.Doc) => yDocToData(ydoc).sections as any[];

describe('CSV 取込の結果', () => {
  it('全ロール・全行に一意な id が付く', () => {
    const { sections } = importCsv();
    const ids = sections.map((s) => s.id);
    expect(ids.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);

    const rowIds = sections.flatMap((s) => (s.rows || []).map((r: any) => r.id));
    expect(rowIds.length).toBeGreaterThan(0);
    expect(rowIds.every((v: any) => typeof v === 'string' && v.length > 0)).toBe(true);
    expect(new Set(rowIds).size).toBe(rowIds.length);
  });

  it('id を付けても中身は変わらない (ロールの区切り・CM 行・尺・セル)', () => {
    const { sections } = importCsv();
    expect(sections.map((s) => s.label)).toEqual(['オープニング', 'CM', '本編']);
    expect(sections[1]._break).toBe(true);
    expect(sections[0].rows).toHaveLength(2);
    expect(sections[0].rows[0].duration).toBe('0:30');
    expect(sections[0].rows[0].cells.scenario.entries[0].name).toBe('田中');
  });
});

describe('取り込んだあとの編集 (collab)', () => {
  it('編集を繰り返してもロールが増殖しない', () => {
    const ydoc = seedYDoc();
    const imported = importCsv().sections;

    edit(ydoc, (d) => ({ ...d, sections: [...d.sections, ...imported] }));
    const afterImport = sectionsOf(ydoc).length;
    expect(afterImport).toBe(1 + imported.length);

    // 打鍵のたびに走る更新を 5 回。増殖していれば 2^5 倍になる。
    for (let i = 0; i < 5; i++) {
      edit(ydoc, (d) => ({ ...d, meta: { ...d.meta, title: `テスト${i}` } }));
      expect(sectionsOf(ydoc)).toHaveLength(afterImport);
    }
    expect(sectionsOf(ydoc).map((s) => s.label)).toEqual([
      '既存ロール', 'オープニング', 'CM', '本編',
    ]);
  });

  it('取り込んだ行も増殖しない', () => {
    const ydoc = seedYDoc();
    const imported = importCsv().sections;
    edit(ydoc, (d) => ({ ...d, sections: [...d.sections, ...imported] }));

    const rowCount = () => sectionsOf(ydoc).reduce((n, s) => n + (s.rows?.length || 0), 0);
    const before = rowCount();
    expect(before).toBe(1 + 3); // 既存 1 行 + CSV の 3 行

    for (let i = 0; i < 5; i++) {
      edit(ydoc, (d) => ({ ...d, meta: { ...d.meta, location: `スタジオ${i}` } }));
      expect(rowCount()).toBe(before);
    }
  });

  it('置き換え取込でも増殖しない', () => {
    const ydoc = seedYDoc();
    const imported = importCsv().sections;
    edit(ydoc, (d) => ({ ...d, sections: imported }));
    expect(sectionsOf(ydoc)).toHaveLength(imported.length);

    for (let i = 0; i < 5; i++) {
      edit(ydoc, (d) => ({ ...d, meta: { ...d.meta, title: `t${i}` } }));
      expect(sectionsOf(ydoc)).toHaveLength(imported.length);
    }
  });
});

describe('id の無いロール/行が既に Y.Doc に入っている文書 (この不具合で壊れた文書)', () => {
  it('開いて編集すると id が後付けされ、そこで増殖が止まる', () => {
    const ydoc = seedYDoc([
      { id: 'sec_a', label: '既存ロール', rows: [{ id: 'row_a', duration: '0:10', cells: {} }] },
      { label: 'id 無しロール', rows: [{ duration: '0:20', cells: {} }] }, // 旧版が書き込んだ形
    ]);

    edit(ydoc, (d) => ({ ...d, meta: { ...d.meta, title: '開いた' } }));
    const secs = sectionsOf(ydoc);
    expect(secs).toHaveLength(2);
    expect(typeof secs[1].id).toBe('string');
    expect(secs[1].id).not.toBe(secs[0].id);
    expect(secs[1].rows[0].id).toBeTruthy();
    expect(secs[1].label).toBe('id 無しロール'); // 中身は失わない

    for (let i = 0; i < 5; i++) {
      edit(ydoc, (d) => ({ ...d, meta: { ...d.meta, title: `t${i}` } }));
      expect(sectionsOf(ydoc)).toHaveLength(2);
    }
  });
});

describe('id を付け忘れた更新が来ても増殖しない (最後の砦)', () => {
  it('id 無しのロール/行を足す updater でも 1 つしか増えない', () => {
    const ydoc = seedYDoc();
    edit(ydoc, (d) => ({
      ...d,
      sections: [...d.sections, { label: '付け忘れ', rows: [{ duration: '0:05', cells: {} }] }],
    }));
    expect(sectionsOf(ydoc)).toHaveLength(2);

    for (let i = 0; i < 5; i++) {
      edit(ydoc, (d) => ({ ...d, meta: { ...d.meta, title: `t${i}` } }));
      const secs = sectionsOf(ydoc);
      expect(secs).toHaveLength(2);
      expect(secs[1].rows).toHaveLength(1);
      expect(secs[1].id).toBeTruthy();
      expect(secs[1].rows[0].id).toBeTruthy();
    }
  });

  it('ydocOps に直接渡しても id 無しの Y ノードは作られない', () => {
    const ydoc = seedYDoc();
    ydoc.transact(() => {
      ops.addSection(ydoc, { label: '直接追加', rows: [{ duration: '', cells: {} }] });
      ops.insertRowAfter(ydoc, 'sec_a', null, { duration: '0:01', cells: {} });
    }, 'local');
    const secs = sectionsOf(ydoc);
    expect(secs[1].id).toBeTruthy();
    expect(secs[1].rows[0].id).toBeTruthy();
    expect(secs[0].rows[1].id).toBeTruthy();
  });
});

describe('通常の編集は今までどおり id で突き合わさる', () => {
  it('セルの編集は行を作り直さずマージされる', () => {
    const ydoc = seedYDoc();
    edit(ydoc, (d) => {
      const secs = d.sections.map((s: any) => ({
        ...s,
        rows: s.rows.map((r: any) => ({ ...r, cells: { ...r.cells, scenario: { entries: [{ name: '', html: 'あ', isQWord: false }] } } })),
      }));
      return { ...d, sections: secs };
    });
    const secs = sectionsOf(ydoc);
    expect(secs).toHaveLength(1);
    expect(secs[0].rows).toHaveLength(1);
    expect(secs[0].rows[0].id).toBe('row_a'); // id が保たれる = CRDT の identity が保たれる
    expect(secs[0].rows[0].cells.scenario.entries[0].html).toBe('あ');
  });

  it('ロールの削除・並び替えは今までどおり効く', () => {
    const ydoc = seedYDoc([
      { id: 'sec_a', label: 'A', rows: [] },
      { id: 'sec_b', label: 'B', rows: [] },
      { id: 'sec_c', label: 'C', rows: [] },
    ]);
    edit(ydoc, (d) => ({ ...d, sections: [d.sections[2], d.sections[0]] }));
    expect(sectionsOf(ydoc).map((s) => s.id)).toEqual(['sec_c', 'sec_a']);
  });
});
