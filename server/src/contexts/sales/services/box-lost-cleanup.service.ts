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
import { execute, queryOne, queryAll } from '../../../shared/db/connection';
import {
  getBoxClient, isBoxConfigured, extractFolderId, ensureSubfolder, getBoxFolderUrl, listFolderItems,
} from '../../../shared/services/box';
import { createProjectFolderTree, sanitizeFolderName, INTERNAL_PREFIX, EXTERNAL_PREFIX } from './box-folder.service';

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
  /**
   * **このアプリならこう名付けたはず**の候補（`expectedFolderNames`）。
   * 番号の形は当てにしない（`GLS001` も `PRJ-2026-001` も番号なしの
   * プロジェクト管理もあるため）。
   *
   * ⚠️ **以前は「頭が `【社内】`/`【社外】` で始まること」を見ていた。2つ問題があった:**
   *  ① **頭が付いたのは 2026-08-25 の版**（`box-folder.service.ts` の `INTERNAL_PREFIX`）。
   *     それ以前に作られたフォルダは頭を持たないので、**古い案件が全部弾かれていた**
   *     （まさに「ほとんどのゴミ案件が処理できていない」の正体）。
   *  ② 頭は**どの案件のフォルダにも付く**ので、`box_url_*` を手で書き換えて
   *     **同じ親の下にある別の案件のフォルダ**を指させると、素通りしていた。
   * 名前そのもので見ると、古い名前にも効き、「その案件のフォルダである」ことまで確かめられる。
   */
  expectedNames: string[];
  /**
   * その案件だけを指す番号（GLS 番号・コード）。案件名を変えたあと BOX 側の
   * リネームに失敗していると名前が一致しないので、**番号が入っていれば通す**。
   */
  numbers: string[];
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
 *   ④ **名前にその案件の番号（GLS / OPP）が入っていること**
 *      — このアプリが作った形であり、かつ**その案件のフォルダ**であることまで見る
 */
export function checkFolderSafety(input: SafetyInput): SafetyVerdict {
  const { folderId, folder, expectedParentId, expectedNames, numbers, forbiddenIds } = input;
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
  const names = expectedNames.filter((n) => !!n && n.trim() !== '');
  if (names.length === 0) return { ok: false, reason: 'この案件の名前が分からない' };
  const bare = sanitizeFolderName(stripFolderPrefix(folder.name));
  /*
   * **名前が一致する** … このアプリが付けた名前そのもの（頭の有無は問わない）。
   * **番号を含む** … 案件名を変えたあとリネームに失敗していると一致しないので、
   *   番号が入っていれば通す（番号はその案件だけのもの）。
   */
  const exact = names.some((n) => n === bare);
  const byNumber = numbers.some((k) => !!k && k.trim() !== '' && bare.includes(k));
  if (!exact && !byNumber) {
    return { ok: false, reason: `この案件のフォルダではない (${folder.name})` };
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

/**
 * その案件を指す番号。**フォルダ名の頭に入る**（`{頭}{番号}_{案件名}`）。
 * GLS 発番の前後で名前が変わるので、**両方**を候補にする
 * （発番のときのリネームが失敗していると、古い番号のままのことがある）。
 */
function projectNumbers(row: ProjectRow): string[] {
  return [row.gls_number, row.code].filter((v): v is string => !!v && String(v).trim() !== '');
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
 * **フォルダ名の頭（`【社内】`/`【社外】`）を外す**（純関数）。
 * 頭が付いたのは 2026-08-25 の版なので、**無い名前もそのまま通す**。
 */
export function stripFolderPrefix(name: string): string {
  return String(name ?? '').replace(/^【[^】]*】/, '').trim();
}

/** 案件フォルダではないと分かっている名前。**番号でも案件名でもない** */
export const NON_PROJECT_FOLDERS = [
  '00_DB_Backup',      // 本番DBのバックアップ（3時間ごと）
  LOST_ARCHIVE_FOLDER, // 置き場そのもの
  '11_awards_photo',
] as const;

/** 名寄せ・安全弁が使う案件の最小の姿 */
export interface ProjectNaming { code?: string | null; gls_number?: string | null; name?: string | null }

/**
 * **このアプリなら、その案件のフォルダをこう名付けたはず**（純関数）。
 *
 * ⚠️ **番号の形を当てにしてはいけません。** 前の版は
 * `/^(GLS|OPP)-[A-Za-z0-9-]+_/` で名前から番号を切り出していましたが、実際には
 * これに当たらないものが3種類あります:
 *   ① **プロジェクト管理（GLS-B）のフォルダは番号を持たない** —
 *      `createGpmFolderTree(projectName)` は**案件名だけ**で作る
 *   ② **Excel 取込の旧番号**は `GLS001`（ハイフン無し）の形がある
 *   ③ **Excel 取込のコード**は `PRJ-2026-001` のように `OPP` で始まらない
 * どれも「ほとんどのゴミ案件が処理できていない」の一因になります。
 *
 * そこで**名前を読み解くのをやめ、DB の値から候補を組み立てて突き合わせます**。
 * こうすると、コードの形が何であっても（今後増えても）効きます。
 */
export function expectedFolderNames(p: ProjectNaming): string[] {
  const name = String(p.name ?? '').trim();
  if (!name) return [];
  const out: string[] = [];
  for (const key of [p.gls_number, p.code]) {
    const k = String(key ?? '').trim();
    if (k) out.push(sanitizeFolderName(`${k}_${name}`));
  }
  // 番号を持たないプロジェクト管理のフォルダ（案件名だけ）
  out.push(sanitizeFolderName(name));
  return [...new Set(out)];
}

export interface RelinkResult {
  /** BOX を見て案件に結び付け直した数 */
  linked: number;
  /** 親フォルダの中を最後まで見られたか。**false のときは画面に必ず書く** */
  complete: boolean;
  /** 見たフォルダの数（親フォルダ直下） */
  scanned: number;
}

/**
 * **BOX に残っているフォルダを、案件に結び付け直す。**
 *
 * ── なぜ要るか（ユーザー報告）────────────────────────────────
 *
 * 「ほとんどのゴミ案件が処理できていない」。調べたところ、**古い失注案件には
 * `box_url_internal` / `box_url_external` が入っていません**。フォルダは BOX に
 * あるのに、アプリ側がどれがその案件のものか知らないので、片づけの対象にすら
 * 入っていませんでした（自動作成が後から入った・書き戻しに失敗した、など）。
 *
 * 親フォルダの直下を一覧し、**フォルダ名の番号で案件を引いて**、URL が空の側だけ
 * 埋めます。これは**片づけとは別の、壊れた紐づけを直す操作**なので、
 * 失注案件に限らず全部の案件に対して行います（現役の案件の紐づけも直る）。
 *
 * ⚠️ **書くのは `box_url_*` が空のときだけ。** 入っている値は人が直したかもしれず、
 * 名前から引いたものより信用できます（上書きすると人の修正を消す）。
 * ⚠️ **番号で1件に決まらないものは触りません**（同じ番号の案件が2つある等）。
 */
export async function relinkProjectFolders(): Promise<RelinkResult> {
  if (!isBoxConfigured()) return { linked: 0, complete: true, scanned: 0 };
  const client = getBoxClient();
  if (!client) return { linked: 0, complete: true, scanned: 0 };

  /*
   * **「このアプリならこう名付けたはず」を全案件ぶん組み立てて索引にする。**
   * フォルダ名を読み解くのではなく、DB の値から候補名を作って突き合わせるので、
   * 番号の形（`GLS-A001` / `GLS001` / `PRJ-2026-001` / 番号なし）に依らず効く。
   *
   * ⚠️ **同じ名前に2件以上ぶら下がったら、その名前は捨てる**（どちらのフォルダか
   * 決められない）。決められないものを当てずっぽうで結び付けると、
   * **別の案件のフォルダを消しにいく**ことになる。
   */
  const projects = await queryAll(
    'SELECT id, code, gls_number, name FROM projects WHERE deleted_at IS NULL',
  ) as { id: string; code: string | null; gls_number: string | null; name: string | null }[];

  const AMBIGUOUS = '__ambiguous__';
  const byName = new Map<string, string>();
  for (const p of projects) {
    for (const cand of expectedFolderNames(p)) {
      byName.set(cand, byName.has(cand) && byName.get(cand) !== p.id ? AMBIGUOUS : p.id);
    }
  }

  const sides: { col: 'box_url_internal' | 'box_url_external'; parentId: string | null }[] = [
    { col: 'box_url_internal', parentId: internalParentId() },
    { col: 'box_url_external', parentId: externalParentId() },
  ];

  let linked = 0;
  let scanned = 0;
  let complete = true;

  for (const side of sides) {
    if (!side.parentId) { complete = false; continue; }
    let listing;
    try {
      listing = await listFolderItems(side.parentId);
    } catch (e) {
      console.warn('[box-lost] 親フォルダを一覧できませんでした:', side.parentId, (e as Error).message);
      complete = false;
      continue;
    }
    if (listing.truncated) complete = false;   // **黙って切らない**（`box.ts` の決めごと）

    for (const item of listing.items) {
      if (item.type !== 'folder') continue;
      scanned += 1;
      const bare = stripFolderPrefix(item.name);
      // 案件フォルダでないと分かっているものは、名前が偶然当たっても触らない
      if ((NON_PROJECT_FOLDERS as readonly string[]).includes(bare)) continue;

      const hit = byName.get(sanitizeFolderName(bare));
      if (!hit || hit === AMBIGUOUS) continue;

      // **空の側だけ埋める**（人が直した値は名前から引いたものより信用できる）
      await execute(
        `UPDATE projects SET ${side.col} = ? WHERE id = ? AND ${side.col} IS NULL`,
        [getBoxFolderUrl(item.id), hit],
      );
      linked += 1;
    }
  }
  console.log('[box-lost] 名寄せ:', { linked, scanned, complete });
  return { linked, complete, scanned };
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
  const names = expectedFolderNames(row);
  const numbers = projectNumbers(row);
  const notes: string[] = [];
  let archived = 0;
  let deleted = 0;
  const clearedUrls: Partial<Record<'internal' | 'external', boolean>> = {};

  for (const side of sidesOf(row)) {
    if (!side.url) continue;
    const folderId = extractFolderId(side.url);
    const folder = folderId ? await readFolder(client, folderId) : null;
    const safe = checkFolderSafety({
      folderId, folder, expectedParentId: side.parentId, expectedNames: names, numbers, forbiddenIds: forbidden,
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
    /*
     * ⚠️ **理由は残すが、片づけた印（`box_cleanup_state`）は付けない。**
     *
     * ここに来るのは「安全弁で見送った」「BOX が一時的に読めなかった」「BOX が
     * 断った」のどれかで、**次に試せば片づくかもしれない**ものです。印を付けると
     * 対象から永久に外れ、**放っておけば片づくはずのものが二度と片づきません**。
     *
     * 理由だけ書いておくのは、**触らなかったことに人が気づけない**ためです
     * （消えていないことは画面から読めない）。まとめて片づける導線は
     * 「1件も進まなかったら止まる」ので、これで無限に回ることもありません。
     */
    if (notes.length) {
      console.warn('[box-lost] 何もしませんでした:', projectId, notes.join(' / '));
      await execute('UPDATE projects SET box_cleanup_note = ? WHERE id = ?', [notes.join(' / '), projectId]);
    }
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

// ───────────────────────────────────────────────────────────
// **なぜ触らなかったのかを画面に出す**（純関数・テストで固定する）
// ───────────────────────────────────────────────────────────

/**
 * ── なぜ要るか（ユーザー報告 2026-08-31）──────────────────────
 *
 * 本番で「まとめて片づける」を押したところ、504 は出なくなり名寄せも動いた
 * （BOX のフォルダ 120 件を調べて 94 件を結び付けた）のに、
 * **片づけは1件も通りませんでした**。画面に出たのは
 *
 *   「片づけられるものがありませんでした（安全のため、確かめられなかった
 *     フォルダは触っていません）」
 *   「残り 15 件は、置き場所や名前が想定と違うか中身を数え切れなかったため
 *     触っていません」
 *
 * ⚠️ **これでは押した人も直す側も次の一手が決められません。**
 * 「置き場所が違う」のか「名前が違う」のかで、直し方は正反対です。
 *
 * ⚠️ **理由そのものは最初から DB にありました**（`box_cleanup_note`）。
 * 書いていたのに**画面へ出していなかっただけ**です。集めて数えて出します。
 */
export type SkipReasonCode =
  | 'url' | 'forbidden' | 'unreadable' | 'noParent' | 'elsewhere'
  | 'noName' | 'nameMismatch' | 'boxRefused' | 'other';

export interface SkipReason {
  code: SkipReasonCode;
  /** 画面にそのまま出す文。**次に何をすればよいか**まで書く */
  label: string;
  count: number;
  /** 実物の例（フォルダ名・親ID）。**1つあるだけで原因の見当がつく** */
  sample?: string;
}

/** 判定の順に見る。**先に当たったものを採る**（1つの note に複数入ることがある） */
const SKIP_RULES: { code: SkipReasonCode; match: string; label: string; sample?: RegExp }[] = [
  {
    code: 'nameMismatch', match: 'この案件のフォルダではない',
    label: 'BOX のフォルダ名が、このアプリの付け方と違う（案件名を変えたあと BOX 側の名前が古いまま、など）',
    sample: /この案件のフォルダではない \(([^)]*)\)/,
  },
  {
    code: 'elsewhere', match: '別の場所にある',
    label: 'BOX のフォルダが親フォルダの直下に無い（年度フォルダなどの下に移動している）',
    sample: /別の場所にある \(親=([^)]*)\)/,
  },
  {
    code: 'unreadable', match: 'BOXからフォルダを読めなかった',
    label: 'BOX からフォルダを読めない（すでに消えている・権限が無い）',
  },
  {
    code: 'forbidden', match: '親フォルダ・取込フォルダを指している',
    label: 'BOX の URL が親フォルダそのものを指している（案件のフォルダではない）',
  },
  {
    code: 'url', match: 'BOXフォルダのURLが読めない',
    label: 'BOX の URL が読めない形をしている',
  },
  {
    code: 'url', match: 'フォルダIDの形が違う',
    label: 'BOX の URL が読めない形をしている',
  },
  {
    code: 'noParent', match: '親フォルダが設定されていない',
    label: '親フォルダの環境変数が設定されていない（設定の「外部サービス連携」）',
  },
  {
    code: 'noName', match: 'この案件の名前が分からない',
    label: '案件名が空なので、どのフォルダか決められない',
  },
  { code: 'boxRefused', match: '削除できず', label: 'BOX が削除を断った' },
  { code: 'boxRefused', match: '移動できず', label: 'BOX が移動を断った' },
  { code: 'boxRefused', match: '置き場を作れず', label: '「99_失注・見送り」を作れなかった' },
];

/**
 * **触らなかった理由を数える。** 多い順に返す。
 *
 * ⚠️ **1件の note に社内・社外の2つが入ります。** 案件の数を数えたいので
 * **1案件につき最初に当たった理由を1つだけ**数えます（両方数えると
 * 「15件のはずが 23 件」になり、押した人が数を信じられなくなる）。
 */
export function summarizeSkipReasons(notes: (string | null | undefined)[]): SkipReason[] {
  const acc = new Map<string, SkipReason>();
  for (const raw of notes) {
    const note = String(raw ?? '');
    if (!note.trim()) continue;
    const hit = SKIP_RULES.find((r) => note.includes(r.match));
    const code: SkipReasonCode = hit?.code ?? 'other';
    const label = hit?.label ?? 'BOX を触れなかった（詳しい理由はサーバーの記録にあります）';
    const key = `${code}:${label}`;
    const cur = acc.get(key) ?? { code, label, count: 0 };
    cur.count += 1;
    if (!cur.sample && hit?.sample) {
      const m = note.match(hit.sample);
      if (m?.[1]) cur.sample = m[1];
    }
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.count - a.count);
}
