/**
 * 案件の BOX フォルダ名 — `{実施日}_{番号}_{案件名}`（ご依頼 2026-09-24）
 *
 * 日付を頭に置くのは「BOX の名前順＝実施日順」にするため。並び順が崩れても
 * BOX の画面では誰も気づけない（何となく並びがおかしい、で終わる）ので、形をここで固定する。
 * 既存フォルダの付け直しは `box_url_*`（画面から書き換えられる文字列）の先を改名するので、
 * 「触ってよいか」の安全弁もここで固定する。
 */
import { describe, it, expect } from 'vitest';
import {
  buildProjectFolderName, formatFolderDate, sanitizeFolderName, UNDATED_FOLDER_LABEL,
} from '../../server/src/contexts/sales/services/box-folder.service';
import { renameBlockReason } from '../../server/src/contexts/sales/services/box-folder-name.service';
import { checkFolderSafety, expectedFolderNames } from '../../server/src/contexts/sales/services/box-lost-cleanup.service';

describe('頭の実施日', () => {
  it('1日開催は YYYY.MM.DD（`/` は BOX で使えないので点）', () => {
    expect(formatFolderDate('2026-12-03', null)).toBe('2026.12.03');
    expect(formatFolderDate('2026-12-03', '2026-12-03')).toBe('2026.12.03');
  });

  it('複数日は範囲。年をまたぐときだけ終わりにも年を書く', () => {
    expect(formatFolderDate('2026-12-03', '2026-12-05')).toBe('2026.12.03-12.05');
    expect(formatFolderDate('2026-12-31', '2027-01-02')).toBe('2026.12.31-2027.01.02');
  });

  it('時刻付き・終わりが開始より前の古い行も読める', () => {
    expect(formatFolderDate('2026-08-20T10:00', '2026-08-22T18:00')).toBe('2026.08.20-08.22');
    expect(formatFolderDate('2026-08-20', '2026-08-01')).toBe('2026.08.20');
  });

  it('日付が無ければ「未定」', () => {
    expect(formatFolderDate(null, null)).toBe(UNDATED_FOLDER_LABEL);
    expect(formatFolderDate('', '2026-12-05')).toBe(UNDATED_FOLDER_LABEL);
  });

  it('⚠️ 名前順が実施日順になる（年明けの案件が前の年の12月より上に来ない・未定は最後）', () => {
    const names = [
      buildProjectFolderName({ gls_number: 'GLS-A010', code: 'OPP-1', name: '新年特番', event_start: '2027-01-10' }),
      buildProjectFolderName({ gls_number: 'GLS-A020', code: 'OPP-2', name: '未定の案件' }),
      buildProjectFolderName({ gls_number: 'GLS-A030', code: 'OPP-3', name: '年末特番', event_start: '2026-12-03' }),
    ];
    expect([...names].sort()).toEqual([names[2], names[0], names[1]]);
  });
});

describe('フォルダ名', () => {
  it('日付_番号_案件名。発番済みなら管理番号、未発番なら案件コード', () => {
    expect(buildProjectFolderName({
      gls_number: 'GMO-001', code: 'OPP-2026-0007', name: 'テレビ朝日 特番収録', event_start: '2026-12-03',
    })).toBe('2026.12.03_GMO-001_テレビ朝日 特番収録');
    expect(buildProjectFolderName({
      gls_number: null, code: 'OPP-2026-0007', name: '特番', event_start: '2026-12-03', event_end: '2026-12-05',
    })).toBe('2026.12.03-12.05_OPP-2026-0007_特番');
  });

  it('BOX で使えない文字は落とす（作るときと付け直すときで同じ名前になる）', () => {
    const n = buildProjectFolderName({ gls_number: 'GLS-A001', name: 'A/B: 特番?', event_start: '2026-12-03' });
    expect(n).toBe('2026.12.03_GLS-A001_AB 特番');
    expect(sanitizeFolderName(n)).toBe(n);
  });
});

describe('付け直してよいフォルダか', () => {
  const nums = ['GLS-A001', 'OPP-2026-0007'];
  it('このアプリが作った形（番号入り）は、頭の有無・日付の有無を問わず付け直す', () => {
    expect(renameBlockReason('999', '【社内】GLS-A001_特番', nums, ['111'])).toBeNull();
    expect(renameBlockReason('999', 'OPP-2026-0007_特番', nums, ['111'])).toBeNull();
    expect(renameBlockReason('999', '【社外】2026.12.01_GLS-A001_特番', nums, ['111'])).toBeNull();
  });

  it('⚠️ 親フォルダ・取込フォルダを指していたら触らない', () => {
    expect(renameBlockReason('111', '【社内】GLS-A001_特番', nums, ['111'])).not.toBeNull();
  });

  it('⚠️ 番号が入っていない名前（人やプロジェクト管理が付けた名前・別の案件）は触らない', () => {
    expect(renameBlockReason('999', '【社内】スタジオ増設', nums, ['111'])).not.toBeNull();
    expect(renameBlockReason('999', '【社内】GLS-A002_別の特番', nums, ['111'])).not.toBeNull();
    expect(renameBlockReason('999', '【社内】特番', [null, ''], ['111'])).not.toBeNull();
  });
});

describe('失注・終了の片づけが日付入りの名前を見分けられる', () => {
  const p = { gls_number: 'GLS-A001', code: 'OPP-2026-0007', name: '特番', event_start: '2026-12-03' };
  it('候補にいまの形と前の形の両方が入る', () => {
    const names = expectedFolderNames(p);
    expect(names).toContain('2026.12.03_GLS-A001_特番');
    expect(names).toContain('GLS-A001_特番');
  });

  it('日付入りの名前でも安全弁を通る', () => {
    expect(checkFolderSafety({
      folderId: '999',
      folder: { id: '999', name: '【社内】2026.12.03_GLS-A001_特番', parentId: '111' },
      expectedParentId: '111',
      expectedNames: expectedFolderNames(p),
      numbers: ['GLS-A001', 'OPP-2026-0007'],
      forbiddenIds: ['111'],
    })).toEqual({ ok: true });
  });
});
