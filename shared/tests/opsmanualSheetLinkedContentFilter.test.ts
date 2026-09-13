// 運営マニュアル — `filterSectionsByTitle`（`client-techops/src/pages/opsmanual/linked/
// SheetLinkedContent.tsx`）を固定する。外部レビュー再指摘（P1）: `sheet.excerpt` の
// 「セクション」欄（`options.sectionTitle`）が実際には一切効いておらず、著者が絞り込んだ
// つもりでも常に全セクションがそのままキャンバス・PDFへ出ていた（`options` を分割代入すら
// していなかった）——気づきにくい欠陥（画面を見ても差分が分からない）なので固定する。
// 本体は client-techops 側にあるため、`opsmanualBlockStyle.test.ts` と同じ考え方でここに置く。
import { describe, it, expect } from 'vitest';
import { filterSectionsByTitle } from '../../client-techops/src/pages/opsmanual/linked/SheetLinkedContent';

function sections(labels: string[]) {
  return { sections: labels.map((label, i) => ({ sectionId: `s${i}`, label, rows: [{ id: `r${i}`, label, duration: null, cells: {} }] })) };
}

describe('filterSectionsByTitle', () => {
  it('sectionTitle が空文字/空白なら絞り込まない（そのまま返す）', () => {
    const data = sections(['オープニング', '本編', 'エンディング']);
    expect(filterSectionsByTitle(data, '')).toBe(data);
    expect(filterSectionsByTitle(data, '   ')).toBe(data);
  });

  it('sectionTitle を含むセクションだけに絞る', () => {
    const data = sections(['オープニング', '本編A', '本編B', 'エンディング']);
    const result = filterSectionsByTitle(data, '本編') as { sections: { label: string }[] };
    expect(result.sections.map((s) => s.label)).toEqual(['本編A', '本編B']);
  });

  it('前後の空白は無視して比較する', () => {
    const data = sections(['オープニング', '本編']);
    const result = filterSectionsByTitle(data, '  本編  ') as { sections: { label: string }[] };
    expect(result.sections.map((s) => s.label)).toEqual(['本編']);
  });

  it('一致するセクションが無ければ空配列になる（「選んだセクションの内容がありません」につながる）', () => {
    const data = sections(['オープニング', '本編']);
    const result = filterSectionsByTitle(data, '存在しない見出し') as { sections: unknown[] };
    expect(result.sections).toEqual([]);
  });

  it('sections を持たないデータ（sheet.micAssignment 等）はそのまま返す', () => {
    const data = { assignments: [{ ch: 1, person: 'A' }] };
    expect(filterSectionsByTitle(data, 'なにか')).toBe(data);
  });
});
