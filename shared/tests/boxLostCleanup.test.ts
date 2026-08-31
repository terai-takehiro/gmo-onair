/**
 * 失注・見送りの BOX フォルダの片づけ（migration 248）
 *
 * ⚠️ **ここが緩むと、本番の BOX でお客様に出した見積書・請求書が消えます。**
 * 見積書・請求書・検収書の原本は BOX にしか無く（アプリは PDF をその都度作って
 * 流すだけで保存しない）、しかも `box_url_*` は画面から書き換えられるただの
 * 文字列で、本番DBのバックアップは社内親フォルダの直下にあります。
 * だから「触ってよいか」と「空か」の2つを、実装ではなくここで固定します。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkFolderSafety, isTreeEmpty, expectedFolderNames, stripFolderPrefix,
  NON_PROJECT_FOLDERS, LOST_ARCHIVE_FOLDER, TREE_MAX_DEPTH,
  type ChildItem, type FolderNode,
} from '../../server/src/contexts/sales/services/box-lost-cleanup.service';

const ROOT = path.resolve(__dirname, '../..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const PARENT = '111';
const OTHER_PARENT = '222';
const folder = (over: Partial<FolderNode> = {}): FolderNode =>
  ({ id: '999', name: '【社内】GLS-A001_テレビ朝日 特番収録', parentId: PARENT, ...over });

const base = {
  folderId: '999',
  folder: folder(),
  expectedParentId: PARENT,
  expectedNames: expectedFolderNames({ gls_number: 'GLS-A001', code: 'OPP-2026-0007', name: 'テレビ朝日 特番収録' }),
  numbers: ['GLS-A001', 'OPP-2026-0007'],
  forbiddenIds: [PARENT, OTHER_PARENT, '333'],
};

describe('触ってよいフォルダか（安全弁）', () => {
  it('このアプリが作った形で、正しい親の下にあるものだけ通す', () => {
    expect(checkFolderSafety(base)).toEqual({ ok: true });
  });

  it('⚠️ 親フォルダそのものを指していたら絶対に通さない（本番DBのバックアップが同じ親の下にある）', () => {
    const v = checkFolderSafety({ ...base, folderId: PARENT, folder: folder({ id: PARENT }) });
    expect(v.ok).toBe(false);
  });

  it('⚠️ 取込用のフォルダ（XPOINT / 決算）を指していたら通さない', () => {
    const v = checkFolderSafety({ ...base, folderId: '333', folder: folder({ id: '333' }) });
    expect(v.ok).toBe(false);
  });

  it('⚠️ 別の場所にあるフォルダは通さない（URL を手で書き換えられている）', () => {
    const v = checkFolderSafety({ ...base, folder: folder({ parentId: OTHER_PARENT }) });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/別の場所/);
  });

  it('⚠️ その案件の番号が名前に入っていなければ通さない', () => {
    const v = checkFolderSafety({ ...base, folder: folder({ name: '共有フォルダ' }) });
    expect(v.ok).toBe(false);
  });

  it('⚠️ 同じ親の下にある**別の案件**のフォルダは通さない（頭だけ見ていたときは素通りしていた）', () => {
    const v = checkFolderSafety({ ...base, folder: folder({ name: '【社内】GLS-A999_別の案件' }) });
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.reason).toMatch(/この案件のフォルダではない/);
  });

  it('⚠️ 頭（【社内】）が無い古いフォルダも通る — 頭が付いたのは 2026-08-25 の版で、それ以前の案件が全部弾かれていた', () => {
    expect(checkFolderSafety({ ...base, folder: folder({ name: 'GLS-A001_東都TV 特番収録' }) })).toEqual({ ok: true });
  });

  it('GLS 発番前の OPP コードでも通る（発番時のリネームが失敗していることがある）', () => {
    expect(checkFolderSafety({ ...base, folder: folder({ name: 'OPP-2026-0007_下見' }) })).toEqual({ ok: true });
  });

  it('この案件の名前が分からなければ通さない', () => {
    expect(checkFolderSafety({ ...base, expectedNames: [], numbers: [] }).ok).toBe(false);
    expect(checkFolderSafety({ ...base, expectedNames: ['', '  '], numbers: [] }).ok).toBe(false);
  });

  it('⚠️ 番号を持たないプロジェクト管理のフォルダ（案件名だけ）も通る', () => {
    const gpm = {
      ...base,
      folder: folder({ name: '【社内】スタジオ増設' }),
      expectedNames: expectedFolderNames({ gls_number: null, code: null, name: 'スタジオ増設' }),
      numbers: [],
    };
    expect(checkFolderSafety(gpm)).toEqual({ ok: true });
  });

  it('URL が読めない・数字でない・BOXから読めない・親が未設定は、どれも通さない', () => {
    expect(checkFolderSafety({ ...base, folderId: null }).ok).toBe(false);
    expect(checkFolderSafety({ ...base, folderId: 'abc' }).ok).toBe(false);
    expect(checkFolderSafety({ ...base, folder: null }).ok).toBe(false);
    expect(checkFolderSafety({ ...base, expectedParentId: null }).ok).toBe(false);
  });
});

describe('空かどうか（消してよいのは空のときだけ）', () => {
  const tree = (m: Record<string, ChildItem[]>) => async (id: string) => {
    if (!(id in m)) throw new Error(`unknown ${id}`);
    return m[id];
  };
  const f = (id: string, name: string): ChildItem => ({ id, type: 'folder', name });
  const file = (id: string, name: string): ChildItem => ({ id, type: 'file', name });

  it('何も無ければ空', async () => {
    expect(await isTreeEmpty('a', tree({ a: [] }))).toEqual({ empty: true });
  });

  it('作った直後の「空のサブフォルダだけ」も空（直下しか見ないと1件も消えない）', async () => {
    const m = { a: [f('b', '02_発注・契約'), f('c', '03_請求')], b: [], c: [] };
    expect(await isTreeEmpty('a', tree(m))).toEqual({ empty: true });
  });

  it('⚠️ 奥にファイルが1つでもあれば空ではない（見積書は 01_見積・提案 の中）', async () => {
    const m = { a: [f('b', '01_見積・提案')], b: [file('x', '見積書.pdf')] };
    const v = await isTreeEmpty('a', tree(m));
    expect(v.empty).toBe(false);
  });

  it('⚠️ 一覧が取れなかったら「空ではない」（BOXが数秒詰まっただけで書類を消さない）', async () => {
    const v = await isTreeEmpty('a', async () => { throw new Error('boom'); });
    expect(v.empty).toBe(false);
    expect(v.empty === false && v.reason).toMatch(/読めなかった/);
  });

  it('⚠️ 深すぎて数え切れないときも「空ではない」', async () => {
    // 深さ上限のさらに下にフォルダが続く形を作る
    const m: Record<string, ChildItem[]> = {};
    let prev = 'a';
    for (let i = 0; i <= TREE_MAX_DEPTH + 1; i++) {
      const next = `n${i}`;
      m[prev] = [f(next, `d${i}`)];
      prev = next;
    }
    m[prev] = [];
    const v = await isTreeEmpty('a', tree(m));
    expect(v.empty).toBe(false);
  });

  it('⚠️ フォルダが多すぎるときも「空ではない」', async () => {
    const m: Record<string, ChildItem[]> = { a: [] };
    for (let i = 0; i < 80; i++) { m.a.push(f(`s${i}`, `s${i}`)); m[`s${i}`] = []; }
    const v = await isTreeEmpty('a', tree(m));
    expect(v.empty).toBe(false);
  });
});

describe('実装が安全弁を素通りしていないこと', () => {
  const code = read('server', 'src', 'contexts', 'sales', 'services', 'box-lost-cleanup.service.ts');

  it('削除は1か所だけで、必ず安全弁と「空」の判定のあとに呼ばれる', () => {
    expect((code.match(/folders\.delete\(/g) ?? []).length).toBe(1);
    const before = code.slice(0, code.indexOf('folders.delete('));
    expect(before).toContain('checkFolderSafety');
    expect(before).toContain('isTreeEmpty');
  });

  it('⚠️ 再帰削除を使わない（中身があれば BOX 側が断る、が二重の守り）', () => {
    expect(code).not.toMatch(/recursive:\s*true/);
    expect(code).not.toContain('deletePermanently');
  });

  it('触ってはいけない ID に親フォルダと取込フォルダが全部入っている', () => {
    expect(code).toContain('BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL');
    expect(code).toContain('BOX_PROJECT_PARENT_FOLDER_ID');
    expect(code).toContain('XPOINT_BOX_FOLDER_ID');
    expect(code).toContain('KESSAN_BOX_FOLDER_ID');
  });

  it('頭（【社内】/【社外】）は写さず box-folder.service から借りている', () => {
    expect(code).toContain("from './box-folder.service'");
    expect(code).toMatch(/INTERNAL_PREFIX/);
    // 文字列そのものを書き写していないこと（片方だけ言い換えた日に他人のフォルダを消せる）
    expect(code.replace(/^[\s\S]*?\*\//, '')).not.toContain("'【社内】'");
  });

  it('完了（s_completed）では片づけない（納品物が入っており現役で参照する）', () => {
    expect(code).toMatch(/toStage === 'e_lost'/);
    expect(code).not.toMatch(/toStage === 's_completed'/);
  });

  it('置き場の名前は1か所だけに書く', () => {
    expect(LOST_ARCHIVE_FOLDER).toBe('99_失注・見送り');
    expect((code.match(/'99_失注・見送り'/g) ?? []).length).toBe(1);
  });
});

describe('ステージが動く全部の道から呼ばれていること', () => {
  it('集約点・一括更新・自動見送りの3か所すべてが呼ぶ', () => {
    const svc = read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');
    const health = read('server', 'src', 'contexts', 'sales', 'services', 'project-health.ts');
    // recordStageTransition（案件詳細・GPM が通る）と updateMany（一括）
    expect((svc.match(/syncBoxFoldersForStageSafe\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // 自動見送り（recordStageTransition を通らない）
    expect(health).toContain('syncBoxFoldersForStageSafe(r.id, \'e_lost\')');
  });

  it('migration 248 は既存分を遡って片づけない（本番BOXで一斉に動かさない）', () => {
    const sql = read('server', 'src', 'shared', 'db', 'migrations', '248_box_lost_cleanup.sql');
    expect(sql).not.toMatch(/^\s*UPDATE\s+projects/mi);
    expect(sql).toContain('遡って片づけません');
  });
});

describe('まとめて片づける導線（過去の失注分）', () => {
  const band = read('client', 'src', 'contexts', 'sales', 'pages', 'projectList', 'BoxCleanupBand.tsx');
  const svc = read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');

  it('⚠️ 「残り0件」ではなく「1件も進まなかったら」で止める（安全弁で見送った行は印が付かないので、残り0件を待つと永久に回る）', () => {
    expect(band).toContain('r.processed === 0');
  });

  it('1回のリクエストで全部やらない（フォルダ1件につきBOXを数回叩くのでタイムアウトする）', () => {
    expect(band).toMatch(/const BATCH = \d+/);
    expect(Number(band.match(/const BATCH = (\d+)/)![1])).toBeLessThanOrEqual(50);
  });

  it('長い処理に逃げ道がある（止められる）', () => {
    expect(band).toContain('止める');
    expect(band).toContain('stopRef');
  });

  it('触らなかったものを黙って消さずに数えて出す', () => {
    expect(band).toMatch(/触っていません/);
  });

  it('件数は「見た件数」ではなく「本当に片づいた件数」を返す', () => {
    // 印（box_cleanup_state）が付いた行だけを数え直していること
    expect(svc).toMatch(/box_cleanup_state IS NOT NULL/);
  });

  it('⚠️ 片づかなかった行に印を付けない（付けると対象から永久に外れ、二度と片づかない）', () => {
    const code = read('server', 'src', 'contexts', 'sales', 'services', 'box-lost-cleanup.service.ts');
    // 注釈を落としてから、何もしなかったときに流す UPDATE 文だけを見る
    const bare = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const noop = bare.slice(bare.indexOf('if (archived === 0 && deleted === 0)'));
    const body = noop.slice(0, noop.indexOf('return;'));
    expect(body).toContain('box_cleanup_note = ?');
    expect(body).not.toContain('box_cleanup_state');
  });
});

describe('このアプリならこう名付けたはず（名寄せの突き合わせ）', () => {
  it('⚠️ 番号の形を当てにしない — 実際には3種類の例外がある', () => {
    // ① プロジェクト管理（GLS-B）は番号を持たない（案件名だけで作られる）
    expect(expectedFolderNames({ name: 'スタジオ増設' })).toContain('スタジオ増設');
    // ② Excel 取込の旧番号はハイフンが無い
    expect(expectedFolderNames({ gls_number: 'GLS001', name: '旧案件' })).toContain('GLS001_旧案件');
    // ③ Excel 取込のコードは OPP で始まらない
    expect(expectedFolderNames({ code: 'PRJ-2026-001', name: 'サンプル案件' }))
      .toContain('PRJ-2026-001_サンプル案件');
    // 通常（GLS 発番後・発番前）
    const both = expectedFolderNames({ gls_number: 'GLS-A001', code: 'OPP-202603-0021', name: '東都TV 特番' });
    expect(both).toContain('GLS-A001_東都TV 特番');
    expect(both).toContain('OPP-202603-0021_東都TV 特番');
  });

  it('名前が無ければ候補も無い（当てずっぽうで結び付けない）', () => {
    expect(expectedFolderNames({ gls_number: 'GLS-A001', name: '' })).toEqual([]);
    expect(expectedFolderNames({ name: null })).toEqual([]);
  });

  it('頭（【社内】/【社外】）は外して突き合わせる。無い名前もそのまま通す', () => {
    expect(stripFolderPrefix('【社内】GLS-A001_東都TV')).toBe('GLS-A001_東都TV');
    expect(stripFolderPrefix('GLS-A001_東都TV')).toBe('GLS-A001_東都TV');
    expect(stripFolderPrefix('【社外】スタジオ増設')).toBe('スタジオ増設');
  });

  it('⚠️ 案件フォルダでないと分かっている名前は、偶然一致しても触らない', () => {
    expect(NON_PROJECT_FOLDERS).toContain('00_DB_Backup');   // 本番DBのバックアップ
    expect(NON_PROJECT_FOLDERS).toContain(LOST_ARCHIVE_FOLDER);
    const code = read('server', 'src', 'contexts', 'sales', 'services', 'box-lost-cleanup.service.ts');
    expect(code).toContain('NON_PROJECT_FOLDERS as readonly string[]).includes(bare)');
  });

  it('名寄せは空の側だけ埋め、1件に決まらないものは触らない', () => {
    const code = read('server', 'src', 'contexts', 'sales', 'services', 'box-lost-cleanup.service.ts');
    const fn = code.slice(code.indexOf('export async function relinkProjectFolders'));
    expect(fn).toContain('IS NULL');         // 空の側だけ
    expect(fn).toContain('AMBIGUOUS');       // 同じ名前が2件なら捨てる
    expect(fn).toContain('truncated');       // 最後まで見られたかを返す
  });

  it('⚠️ URL が空の失注案件も候補に数える（数えないと帯が出ず、古い案件が永久に残る）', () => {
    const svc = read('server', 'src', 'contexts', 'sales', 'services', 'project.service.ts');
    expect(svc).toContain('LOST_BOX_UNLINKED_SQL');
    expect(svc).toMatch(/box_url_internal IS NULL AND box_url_external IS NULL/);
    const band = read('client', 'src', 'contexts', 'sales', 'pages', 'projectList', 'BoxCleanupBand.tsx');
    expect(band).toContain('remaining + unlinked');
  });

  it('名寄せは「まとめて処分」の1回目だけ（毎回やると親フォルダを丸ごと引き直す）', () => {
    const band = read('client', 'src', 'contexts', 'sales', 'pages', 'projectList', 'BoxCleanupBand.tsx');
    expect(band).toContain('relink: first');
  });
});
