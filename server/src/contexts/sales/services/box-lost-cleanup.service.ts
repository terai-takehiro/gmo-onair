/**
 * **失注・見送りになった案件の BOX フォルダを現役の場所から片づける**
 *
 * ── ユーザーからの依頼 ──────────────────────────────────────
 *
 * 「失注や見送りのなった案件について BOX に残り続けてしまうので、
 *   失注、見送りの時点で BOX フォルダを削除していただきたい」
 *
 * ── なぜ「無条件に削除」にしなかったか（調べて分かったこと）──
 *
 * ⚠️ **このフォルダには、アプリのどこにも控えの無い書類が入っています。**
 * 見積書・請求書・検収書の PDF は**発行のたびに BOX へ置くだけ**で、アプリは
 * 生成して流すだけで保存していません（`doc-box-dest.ts` の宛先表）。つまり
 * **出した原本は BOX にしかありません**。失注案件でも「何をいくらで出したか」の
 * 唯一の記録で、失注分析の根拠でもあります。請求書・検収書は電子帳簿保存法の
 * 保存対象です。手で入れた発注・契約書や原価の資料も同じです。
 *
 * ⚠️ **失注は取り消せるステージで、しかも機械が付けます。**
 * 90日放置の自動見送り（`project-health.ts`）・Excel 取込・MCP からも付きます。
 * 取り消せる状態を根拠に、取り消せない削除をしてはいけません。
 *
 * ⚠️ **`box_url_internal` / `box_url_external` は画面から書き換えられるただの文字列**
 * です（`project.service.ts` の `update()` が受け取ったものをそのまま書く）。
 * そこから取り出した ID を無検査で消すと、**別の案件や親フォルダを消せてしまいます**。
 * しかも**本番DBのバックアップ（`00_DB_Backup/`）は社内親フォルダの直下**にあります。
 *
 * ── そこでこうする（ご判断: 「空なら削除、中身があればアーカイブ」）──
 *
 *   中身が1つも無い  → **本当に消す**（見送りの大半はこれ。ご指示どおりのゴミ）
 *   中身がある        → `99_失注・見送り` へ引っ越す（現役の場所からは消える）
 *   失注から戻した    → 引っ越したものは戻し、消したもの（空だった）は作り直す
 *
 * **「空」は木全体で見ます** — 作った直後のフォルダは空のサブフォルダを数枚
 * 持っているので、直下だけ見ると「中身あり」に見えて1件も消えません。
 *
 * ⚠️ **迷ったら消さない。** 一覧が取れない・親が違う・名前が合わない・深すぎる、
 * どれも「中身あり」と同じ扱い（＝引っ越すだけ）にします。BOX が一時的に
 * 応答しないだけで書類が消えるのは、割に合いません。
 */
import { execute, queryOne } from '../../../shared/db/connection';
import {
  getBoxClient, isBoxConfigured, extractFolderId, ensureSubfolder,
} from '../../../shared/services/box';
import { createProjectFolderTree, INTERNAL_PREFIX, EXTERNAL_PREFIX } from './box-folder.service';

/** 失注・見送りの置き場。**両方の親フォルダの直下**に1つずつ作る */
export const LOST_ARCHIVE_FOLDER = '99_失注・見送り';

/** 木をたどる深さの上限。案件フォルダは「親 → サブ → その下」までしか作らない */
export const TREE_MAX_DEPTH = 3;
/** 木をたどるフォルダ数の上限（写真が数千枚あるフォルダで固まらないように） */
export const TREE_MAX_FOLDERS = 60;

export type BoxCleanupState = 'archived' | 'deleted';

/** `folders.get` / `getItems` から見るぶんだけ */
export interface FolderNode { id: string; name: string; parentId: string | null }
export interface ChildItem { id: string; type: 'folder' | 'file' | string; name: string }

// ───────────────────────────────────────────────────────────
// 安全弁（純関数・テストで固定する）
// ───────────────────────────────────────────────────────────

export interface SafetyInput {
  /** `box_url_*` から取り出した ID */
  folderId: string | null;
  /** BOX から読んだ実際のフォルダ */
  folder: FolderNode | null;
  /** そこに入っているはずの親フォルダ（社内 or 社外） */
  expectedParentId: string | null;
  /** 付いているはずの頭（【社内】/【社外】） */
  expectedPrefix: string;
  /** 絶対に触ってはいけない ID（親フォルダ・取込用フォルダなど） */
  forbiddenIds: (string | null | undefined)[];
}

export type SafetyVerdict = { ok: true } | { ok: false; reason: string };

/**
 * **そのフォルダに触ってよいか。** ここを通らないものは1バイトも動かしません。
 *
 * 4つ全部を見ます。1つでも外れたら触りません（消さない・動かさない）:
 *   ① ID が読めること（`box_url_*` が URL でなければ何もしない）
 *   ② 触ってはいけない ID でないこと（**親フォルダを消さないための最後の砦**）
 *   ③ 実際の親が、その案件が入っているはずの親であること
 *      （手で書き換えられた URL が他所を指していたら弾く）
 *   ④ 名前が【社内】/【社外】で始まること（このアプリが作ったフォルダの形）
 */
export function checkFolderSafety(input: SafetyInput): SafetyVerdict {
  const { folderId, folder, expectedParentId, expectedPrefix, forbiddenIds } = input;
  if (!folderId) return { ok: false, reason: 'BOXフォルダのURLが読めない' };
  if (!/^\d+$/.test(folderId)) return { ok: false, reason: `フォルダIDの形が違う (${folderId})` };

  const forbidden = new Set(forbiddenIds.filter((v): v is string => !!v));
  if (forbidden.has(folderId)) {
    return { ok: false, reason: `親フォルダ・取込フォルダを指している (${folderId})` };
  }
  if (!folder) return { ok: false, reason: 'BOXからフォルダを読めなかった' };
  if (!expectedParentId) return { ok: false, reason: '親フォルダが設定されていない' };
  if (folder.parentId !== expectedParentId) {
    return { ok: false, reason: `別の場所にある (親=${folder.parentId ?? 'なし'})` };
  }
  if (!folder.name.startsWith(expectedPrefix)) {
    return { ok: false, reason: `このアプリが作った名前ではない (${folder.name})` };
  }
  return { ok: true };
}

export type EmptyVerdict =
  | { empty: true }
  | { empty: false; reason: string };

/**
 * **木の中にファイルが1つでもあるか。** 1つ見つけた時点で打ち切ります。
 *
 * ⚠️ **数え切れなかったら「空ではない」と答えます。** 一覧が取れない・深すぎる・
 * フォルダが多すぎる、はすべて「分からない」であって「無い」ではありません。
 * ここを楽観的にすると、**BOX が数秒詰まった日に書類が消えます**。
 *
 * @param listChildren 直下の中身を返す。**投げてよい**（投げたら「空ではない」に落ちる）
 */
export async function isTreeEmpty(
  rootId: string,
  listChildren: (folderId: string) => Promise<ChildItem[]>,
  maxDepth = TREE_MAX_DEPTH,
  maxFolders = TREE_MAX_FOLDERS,
): Promise<EmptyVerdict> {
  const queue: { id: string; depth: number }[] = [{ id: rootId, depth: 0 }];
  let visited = 0;

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited >= maxFolders) return { empty: false, reason: 'フォルダが多すぎて数え切れない' };
    visited += 1;

    let children: ChildItem[];
    try {
      children = await listChildren(node.id);
    } catch (e) {
      return { empty: false, reason: `中身を読めなかった (${(e as Error).message})` };
    }

    for (const c of children) {
      if (c.type !== 'folder') return { empty: false, reason: `ファイルがある (${c.name})` };
    }
    for (const c of children) {
      if (node.depth + 1 >= maxDepth) {
        // これ以上潜れない。**潜っていない先にファイルが無いとは言えない**
        if (children.length > 0) return { empty: false, reason: '深くて数え切れない' };
        continue;
      }
      queue.push({ id: c.id, depth: node.depth + 1 });
    }
  }
  return { empty: true };
}

// ───────────────────────────────────────────────────────────
// BOX を実際に触るところ
// ───────────────────────────────────────────────────────────

function internalParentId(): string | null { return process.env.BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL || null; }
function externalParentId(): string | null { return process.env.BOX_PROJECT_PARENT_FOLDER_ID || null; }

/** 触ってはいけない ID の一覧（親フォルダと、別用途の取込フォルダ） */
function forbiddenFolderIds(): (string | null | undefined)[] {
  return [
    internalParentId(),
    externalParentId(),
    process.env.XPOINT_BOX_FOLDER_ID,
    process.env.KESSAN_BOX_FOLDER_ID,
  ];
}

type Client = NonNullable<ReturnType<typeof getBoxClient>>;

async function readFolder(client: Client, id: string): Promise<FolderNode | null> {
  try {
    const f = await client.folders.get(id, { fields: 'id,name,parent' });
    return { id: String(f.id), name: String(f.name ?? ''), parentId: f.parent?.id ? String(f.parent.id) : null };
  } catch (e) {
    console.warn('[box-lost] フォルダを読めませんでした:', id, (e as Error).message);
    return null;
  }
}

const listChildrenVia = (client: Client) => async (folderId: string): Promise<ChildItem[]> => {
  const res = await client.folders.getItems(folderId, { fields: 'id,type,name', limit: 200 });
  return (res.entries ?? []).map((e) => ({ id: String(e.id), type: String(e.type), name: String(e.name ?? '') }));
};

interface Side { key: 'internal' | 'external'; url: string | null; parentId: string | null; prefix: string }

function sidesOf(row: { box_url_internal?: unknown; box_url_external?: unknown }): Side[] {
  return [
    { key: 'internal', url: (row.box_url_internal as string) ?? null, parentId: internalParentId(), prefix: INTERNAL_PREFIX },
    { key: 'external', url: (row.box_url_external as string) ?? null, parentId: externalParentId(), prefix: EXTERNAL_PREFIX },
  ];
}

interface ProjectRow {
  id: string; code?: string | null; name?: string | null; gls_number?: string | null;
  box_url_internal?: string | null; box_url_external?: string | null;
  box_cleanup_state?: string | null;
}

async function loadProject(projectId: string): Promise<ProjectRow | null> {
  return (await queryOne(
    `SELECT id, code, name, gls_number, box_url_internal, box_url_external, box_cleanup_state
       FROM projects WHERE id = ? AND deleted_at IS NULL`,
    [projectId],
  )) as unknown as ProjectRow | null;
}

/**
 * 失注・見送りになった案件のフォルダを片づける。
 *
 * 片側ずつ独立に判断します（社内は空で消せたが社外には見積書がある、が普通に起きる）。
 * **片方でも「引っ越した」なら、その案件は `archived`** として記録します
 * （戻すときに引っ越しを戻す必要があるため）。
 */
export async function cleanupLostProjectFolders(projectId: string): Promise<void> {
  if (!isBoxConfigured()) return;
  const client = getBoxClient();
  if (!client) return;

  const row = await loadProject(projectId);
  if (!row) return;
  if (row.box_cleanup_state) return;      // すでに片づけてある（同じステージへの押し直し）

  const listChildren = listChildrenVia(client);
  const forbidden = forbiddenFolderIds();
  const notes: string[] = [];
  let archived = 0;
  let deleted = 0;
  const clearedUrls: Partial<Record<'internal' | 'external', boolean>> = {};

  for (const side of sidesOf(row)) {
    if (!side.url) continue;
    const folderId = extractFolderId(side.url);
    const folder = folderId ? await readFolder(client, folderId) : null;
    const safe = checkFolderSafety({
      folderId, folder, expectedParentId: side.parentId, expectedPrefix: side.prefix, forbiddenIds: forbidden,
    });
    if (!safe.ok) {
      notes.push(`${side.key}: 触らず (${safe.reason})`);
      continue;
    }

    const verdict = await isTreeEmpty(folderId!, listChildren);
    if (verdict.empty) {
      try {
        // **`recursive` は付けない。** 中身があれば BOX 側が 400 で断る＝
        // 数え間違いがあっても書類は消えない、という二重の守り
        await client.folders.delete(folderId!);
        notes.push(`${side.key}: 空だったので削除 (${folder!.name})`);
        clearedUrls[side.key] = true;
        deleted += 1;
      } catch (e) {
        notes.push(`${side.key}: 削除できず (${(e as Error).message})`);
      }
      continue;
    }

    const archive = side.parentId ? await ensureSubfolder(side.parentId, LOST_ARCHIVE_FOLDER) : null;
    if (!archive) {
      notes.push(`${side.key}: 置き場を作れず そのまま (${verdict.reason})`);
      continue;
    }
    try {
      await client.folders.update(folderId!, { parent: { id: archive.id } });
      notes.push(`${side.key}: ${LOST_ARCHIVE_FOLDER} へ移動 (${verdict.reason})`);
      archived += 1;
    } catch (e) {
      notes.push(`${side.key}: 移動できず (${(e as Error).message})`);
    }
  }

  if (archived === 0 && deleted === 0) {
    if (notes.length) console.warn('[box-lost] 何もしませんでした:', projectId, notes.join(' / '));
    return;
  }

  // 消した側は URL を落とす（開くと 404 になるリンクを残さない）。
  // 引っ越した側は **ID が変わらないので URL はそのまま使える**
  const sets: string[] = ['box_cleanup_state = ?', 'box_cleanup_at = NOW()', 'box_cleanup_note = ?'];
  const params: unknown[] = [archived > 0 ? 'archived' : 'deleted', notes.join(' / ')];
  if (clearedUrls.internal) sets.push('box_url_internal = NULL');
  if (clearedUrls.external) sets.push('box_url_external = NULL');
  await execute(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, [...params, projectId]);
  console.log('[box-lost] 片づけました:', projectId, notes.join(' / '));
}

/**
 * 失注から戻したときに元へ返す。
 *
 * 引っ越したもの（`archived`）は置き場から親フォルダへ戻し、
 * 消したもの（`deleted`＝空だった）は**同じ形の空フォルダを作り直します**。
 */
export async function restoreLostProjectFolders(projectId: string): Promise<void> {
  if (!isBoxConfigured()) return;
  const client = getBoxClient();
  if (!client) return;

  const row = await loadProject(projectId);
  if (!row?.box_cleanup_state) return;

  if (row.box_cleanup_state === 'deleted') {
    const idCode = row.gls_number || row.code || row.id;
    const pair = await createProjectFolderTree(String(idCode), String(row.name ?? ''));
    const sets = ['box_cleanup_state = NULL', 'box_cleanup_at = NULL', 'box_cleanup_note = NULL'];
    const params: unknown[] = [];
    if (pair.internal) { sets.push('box_url_internal = ?'); params.push(pair.internal.folderUrl); }
    if (pair.external) { sets.push('box_url_external = ?'); params.push(pair.external.folderUrl); }
    await execute(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, [...params, projectId]);
    console.log('[box-lost] 空フォルダを作り直しました:', projectId);
    return;
  }

  // archived — 置き場から親へ戻す
  const notes: string[] = [];
  for (const side of sidesOf(row)) {
    if (!side.url || !side.parentId) continue;
    const folderId = extractFolderId(side.url);
    if (!folderId) continue;
    const folder = await readFolder(client, folderId);
    // 置き場の中に居るものだけ戻す（人が手で動かしていたら触らない）
    if (!folder || !folder.name.startsWith(side.prefix)) { notes.push(`${side.key}: 触らず`); continue; }
    try {
      await client.folders.update(folderId, { parent: { id: side.parentId } });
      notes.push(`${side.key}: 戻した`);
    } catch (e) {
      notes.push(`${side.key}: 戻せず (${(e as Error).message})`);
    }
  }
  await execute(
    `UPDATE projects SET box_cleanup_state = NULL, box_cleanup_at = NULL, box_cleanup_note = ? WHERE id = ?`,
    [notes.join(' / ') || null, projectId],
  );
  console.log('[box-lost] 置き場から戻しました:', projectId, notes.join(' / '));
}

/**
 * ステージが動いたら呼ぶ入口。**失敗しても呼び出し元は止めない。**
 *
 * BOX の不調で失注にできないほうが業務は確実に止まります
 * （`box.ts` 冒頭の「BOX 障害が業務をブロックしない」と同じ判断）。
 *
 * **完了（`s_completed`）は対象外**です — 納品物が入っており、現役で参照します。
 */
export async function syncBoxFoldersForStageSafe(projectId: string, toStage: string): Promise<void> {
  try {
    if (toStage === 'e_lost') await cleanupLostProjectFolders(projectId);
    else await restoreLostProjectFolders(projectId);
  } catch (e) {
    console.warn('[box-lost] 片づけ/戻しに失敗:', projectId, toStage, (e as Error).message);
  }
}
