/**
 * 技術資料 — パッチ番号の組み立て・分解と矢印表記（docs/design/v4/tech-docs.md §4-2・§8-1）。
 * 番号は列に持たず毎回組み立てるので、ここが崩れると画面と紙の全部の番号が崩れる。
 */
import { describe, it, expect } from 'vitest';
import { patchNo, parsePatchNo, panelHundreds, panelNameOf } from '../src/tech/patchNo';
import { patchRowLine, groupPatchRows, patchExportText } from '../src/tech/patchExport';
import { TECH_ROLES, roleOrder } from '../src/tech/roles';
import type { TechPatchRow } from '../src/tech/types';

describe('patchNo', () => {
  it('VJP200 の 16 番 B段 は 216B', () => {
    expect(patchNo('VJP200', 16, 'B')).toBe('216B');
    expect(patchNo('VJP100', 1, 'A')).toBe('101A');
    expect(patchNo('VJP1800', 32, 'A')).toBe('1832A');
  });
  it('TRK 盤は段を持たない', () => {
    expect(patchNo('VJP1700', 12, 'B', 'trunk')).toBe('TRK12');
  });
  it('分解して盤の名前に戻せる', () => {
    const p = parsePatchNo('216b');
    expect(p).toEqual({ hundreds: 2, jackNo: 16, jackRow: 'B' });
    expect(panelNameOf(p!)).toBe('VJP200');
    expect(parsePatchNo('TRK12')).toBeNull();
    expect(parsePatchNo('16B')).toBeNull();
  });
  it('盤の名前が壊れていたら百の位は取れない', () => {
    expect(panelHundreds('VJP150')).toBeNull();
    expect(panelHundreds('盤1')).toBeNull();
    expect(panelHundreds('VJP1300')).toBe(13);
  });
});

function row(p: Partial<TechPatchRow>): TechPatchRow {
  return {
    id: 'r', tech_doc_id: 'd', group_label: '', sort_order: 0,
    from_device_text: '', from_jack_id: null, from_jack_text: '', from_is_extra: false,
    to_device_text: '', to_jack_id: null, to_jack_text: '', to_is_extra: false,
    label: '', signal: '', note: '', created_at: '', updated_at: '', ...p,
  };
}

describe('patchExport', () => {
  it('現場の矢印表記になる', () => {
    expect(patchRowLine(row({ from_device_text: 'CCU1', from_jack_text: '101A', to_device_text: 'ATEM 2 M/E', to_jack_text: 'in1', to_is_extra: true })))
      .toBe('CCU1 out [101A] → ATEM 2 M/E in1（増設）');
    expect(patchRowLine(row({ from_device_text: 'ATEM 2 M/E', from_jack_text: 'PGM out', from_is_extra: true, to_device_text: '入力ルーター', to_jack_text: '136B' })))
      .toBe('ATEM 2 M/E PGM out（増設） → 入力ルーター in [136B]');
  });
  it('系統ごとに sort_order 順でまとめる', () => {
    const rows = [
      row({ id: '2', group_label: '配信', sort_order: 3, from_device_text: 'vMix 3', from_jack_text: '113A', to_device_text: 'サブ配信PC', to_is_extra: true }),
      row({ id: '1', group_label: '増設スイッチャー', sort_order: 1, from_device_text: 'CCU1', from_jack_text: '101A', to_device_text: 'ATEM', to_jack_text: 'in1', to_is_extra: true }),
    ];
    const g = groupPatchRows(rows);
    expect(g.map((x) => x.label)).toEqual(['増設スイッチャー', '配信']);
    expect(patchExportText(rows)).toBe('〈増設スイッチャー〉\nCCU1 out [101A] → ATEM in1（増設）\n\n〈配信〉\nvMix 3 out [113A] → サブ配信PC in（増設）');
  });
});

describe('roles', () => {
  it('SW が先頭・知らない役職は末尾', () => {
    expect(TECH_ROLES[0]).toBe('SW');
    expect(roleOrder('SW')).toBe(0);
    expect(roleOrder('社内業務')).toBe(TECH_ROLES.length);
  });
});
