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
  checkFolderSafety, isTreeEmpty, deleteEmptyTree, expectedFolderNames, stripFolderPrefix,
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

  it('何も無ければ空（消す相手として根そのものを返す）', async () => {
    expect(await isTreeEmpty('a', tree({ a: [] }))).toEqual({ empty: true, folders: ['a'] });
  });

  it('作った直後の「空のサブフォルダだけ」も空（直下しか見ないと1件も消えない）', async () => {
    const m = { a: [f('b', '02_発注・契約'), f('c', '03_請求')], b: [], c: [] };
    /*
     * ⚠️ **サブフォルダも消す相手として返すこと。** BOX の削除は `recursive` を
     * 付けないと**サブフォルダ1枚でも断ります**。根だけ返していたため、
     * 本番で「BOX が削除を断った」15件が1件も消えませんでした。
     */
    expect(await isTreeEmpty('a', tree(m))).toEqual({ empty: true, folders: ['a', 'b', 'c'] });
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

  it('削除は必ず「空だと確かめた木を下から消す」形でしか呼ばれない', () => {
    /*
     * ⚠️ **数ではなく形で縛る。** 呼ぶ場所は2つある（案件をたどる経路と、
     * どの案件にも結び付かないフォルダの経路）が、**どちらも
     * `deleteEmptyTree(<空と確かめた木>, ...)` の引数の中でしか呼べない**。
     * 素の `folders.delete(...)` が1つでも増えたらここで落ちる。
     */
    const calls = code.match(/folders\.delete\([^)]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const at = code.indexOf(call);
      const line = code.slice(code.lastIndexOf('\n', at) + 1, code.indexOf('\n', at));
      expect(line).toContain('deleteEmptyTree(');
      expect(line).toContain('.folders, (id) =>');
    }
    // どちらの経路も「空」を確かめてから通る
    expect(code).toContain('const verdict = await isTreeEmpty(');
    // 案件をたどる経路は安全弁も通る
    expect(code.indexOf('checkFolderSafety')).toBeLessThan(code.indexOf('deleteEmptyTree('));
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

  it('⚠️ 1リクエストは「件数」ではなく「時間」で区切る（本番で 504 になった）', () => {
    // フォルダ1件につき BOX を十数回叩くので、件数で切ると BOX が遅い日に
    // Nginx の 60 秒へ当たる。実際に 20 件で 504 になり 0 件のまま失敗した
    expect(svc).toContain('BOX_CLEANUP_BUDGET_MS');
    const budget = Number(svc.match(/BOX_CLEANUP_BUDGET_MS = ([\d_]+)/)![1].replace(/_/g, ''));
    expect(budget).toBeGreaterThan(0);
    expect(budget).toBeLessThanOrEqual(30_000);   // 60秒の proxy に対して十分な余裕
    expect(svc).toContain('timedOut');
  });

  it('1往復の件数の上限も小さくしてある（保険）', () => {
    expect(band).toMatch(/const BATCH = \d+/);
    expect(Number(band.match(/const BATCH = (\d+)/)![1])).toBeLessThanOrEqual(10);
  });

  it('⚠️ 名寄せは片づけと別の往復にする（同じ往復にして 504 になった）', () => {
    expect(band).toContain("{ relink: true }");
    expect(svc).toMatch(/if \(relink\) \{/);
  });

  it('⚠️ 時間切れで切り上げたときはループを続ける（諦めると BOX が遅い日に1件も片づかない）', () => {
    expect(band).toContain('r.processed === 0 && !r.timedOut');
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

  it('名寄せは「まとめて処分」の先頭で1回だけ（毎回やると親フォルダを丸ごと引き直す）', () => {
    const band = read('client', 'src', 'contexts', 'sales', 'pages', 'projectList', 'BoxCleanupBand.tsx');
    // 片づけのループの外で、独立した1往復として呼ぶ（504 の反省で分けた）
    expect((band.match(/relink: true/g) ?? []).length).toBe(1);
    expect(band.indexOf('relink: true')).toBeLessThan(band.indexOf('while (!stopRef.current'));
  });
});

describe('空の木を消す（本番で「BOX が削除を断った」15件の直し）', () => {
  /*
   * ⚠️ **本番で分かったこと（2026-08-31）。**
   * BOX の `DELETE /folders/:id` は、再帰を指定しないと**中身が1つでもあれば断る**。
   * **ファイルだけでなくサブフォルダも「中身」**。案件フォルダは作った直後から
   * `01_見積` などの空のサブフォルダを持つので、根に1回投げるだけの実装では
   * **空フォルダを1件も消せなかった**（#495 の理由表示で見えた「BOX が削除を断った」）。
   */
  it('子から先に消す（親を先に投げると BOX が断る）', async () => {
    const order: string[] = [];
    const r = await deleteEmptyTree(['a', 'b', 'c'], async (id) => { order.push(id); });
    expect(r).toEqual({ ok: true, deleted: 3 });
    // `isTreeEmpty` は幅優先なので親が必ず先。**逆順にすれば子から消える**
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('1つでも断られたら止めて、どこまで消せたかを返す', async () => {
    const r = await deleteEmptyTree(['a', 'b', 'c'], async (id) => {
      if (id === 'b') throw new Error('folder_not_empty');
    });
    expect(r).toEqual({ ok: false, reason: 'folder_not_empty', deleted: 1 });
  });

  it('⚠️ 再帰削除は使わない — 呼び出し側が段ごとに BOX の判断を受ける', () => {
    // 各段で再帰を指定しないので、ファイルが1枚でもあればその段で BOX が断る。
    // 「数え間違いがあっても書類は消えない」という二重の守りはそのまま。
    const src = read('server/src/contexts/sales/services/box-lost-cleanup.service.ts');
    expect(src).toContain('deleteEmptyTree(verdict.folders, (id) => client.folders.delete(id))');
  });

  it('消せなかったら現役の場所に残さず「99_失注・見送り」へ移す', () => {
    /*
     * 断られた＝数え終わったあとに誰かが置いたか権限が足りないか。どちらも
     * 「現役の場所から外す」ほうが正しい。**以前はここで諦めて残していた**。
     */
    const src = read('server/src/contexts/sales/services/box-lost-cleanup.service.ts');
    expect(src).toContain('moveReason = `削除を断られた');
    const move = src.indexOf('client.folders.update(folderId!, { parent: { id: archive.id } })');
    expect(src.indexOf('moveReason = `削除を断られた')).toBeLessThan(move);
  });
});

describe('引き合いのまま止まっている案件（ご判断「ネタの空フォルダも消す」）', () => {
  const SVC = read('server/src/contexts/sales/services/box-lost-cleanup.service.ts');
  const PSVC = read('server/src/contexts/sales/services/project.service.ts');

  it('ネタも片づけの対象に入れる', () => {
    // 実物の BOX で、引き合いのまま止まった案件のフォルダが中身ゼロで並んでいた
    expect(PSVC).toContain("const LOST_BOX_JUNK_SQL = `stage IN ('e_lost', 'neta')`");
  });

  it('⚠️ 生きているネタは「空なら消す」だけ — 失注の置き場へは入れない', () => {
    /*
     * まだ失注ではない案件のフォルダを `99_失注・見送り` へ引っ越すのは間違い
     * （これから使うかもしれないものを、失注の置き場に入れてしまう）。
     */
    expect(SVC).toContain("const emptyOnly = row.stage === 'neta' && !row.deleted_at");
    const guard = SVC.indexOf('if (emptyOnly) {');
    const move = SVC.indexOf('client.folders.update(folderId!, { parent: { id: archive.id } })');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(move);
  });
});

describe('どの案件にも結び付かないフォルダ（実測 77 件中 13 件）', () => {
  const SVC = read('server/src/contexts/sales/services/box-lost-cleanup.service.ts');

  it('⚠️ このアプリの実行ユーザーが作ったものだけ消す', () => {
    // 人が手で作ったフォルダには絶対に触らない。ここが最後の砦
    expect(SVC).toContain("client.users.get('me'");
    expect(SVC).toContain('folder.createdById !== meId');
    expect(SVC).toContain("notes.push('orphan: 触らず (人が作ったフォルダ)')");
  });

  it('実行ユーザーが取れなければ1件も触らない', () => {
    // 分からないものは消さない
    const fail = SVC.indexOf("console.warn('[box-orphan] 実行ユーザーを取れませんでした:'");
    expect(fail).toBeGreaterThan(0);
    expect(SVC.slice(fail, fail + 200)).toContain('return { ...empty, complete: false }');
  });

  it('どれかの案件から指されているフォルダは触らない', () => {
    // 指されていれば、それは生きている案件のフォルダ
    expect(SVC).toContain('if (linked.has(String(item.id))) continue;');
    // 消えた案件のぶんも索引に入れる（外した案件のフォルダを orphan と誤認しない）
    expect(SVC).toContain("'SELECT box_url_internal, box_url_external FROM projects'");
  });

  it('案件フォルダでないと分かっている名前は触らない', () => {
    expect(SVC).toContain('(NON_PROJECT_FOLDERS as readonly string[]).includes(bare)');
  });

  it('空のときだけ消し、再帰は使わない', () => {
    const fn = SVC.slice(SVC.indexOf('export async function cleanupOrphanFolders'));
    expect(fn).toContain('const verdict = await isTreeEmpty(');
    expect(fn).toContain('if (!verdict.empty)');
    expect(fn).toContain('deleteEmptyTree(verdict.folders, (id) => client.folders.delete(id))');
    expect(fn).not.toMatch(/recursive:\s*true/);
  });

  it('件数ではなく時間で区切る（504 の再発を止める）', () => {
    expect(SVC).toContain('export const ORPHAN_BUDGET_MS = 20_000;');
    expect(SVC).toContain('timedOut = true; break;');
  });

  it('画面は別の往復で呼び、時間切れのときだけ続ける', () => {
    const band = read('client/src/contexts/sales/pages/projectList/BoxCleanupBand.tsx');
    expect(band).toContain("api.post('/projects/box-cleanup/lost', { orphans: true })");
    expect(band).toContain('if (!o.orphaned?.timedOut) break;');
  });
});
