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
import { jstDate } from '../../../shared/utils/jst';

/** 失注・見送りの置き場。**両方の親フォルダの直下**に1つずつ作る */
export const LOST_ARCHIVE_FOLDER = '99_失注・見送り';

/**
 * **終了した案件の置き場**（migration 249・ユーザー依頼 2026-08-31）。
 *
 * 「案件が完了した(日付をベースに案件日の翌日)ものについては
 *   98_終了案件 というフォルダを BOX に新たに作成した上でそこに移動するようにしたい」
 *
 * ⚠️ **こちらは絶対に削除しません。** 終了した案件のフォルダには納品物・請求書・
 * 検収書が入っており、法定保存の対象でもあります。**移すだけ**です。
 */
export const DONE_ARCHIVE_FOLDER = '98_終了案件';

/** 木をたどる深さの上限。案件フォルダは「親 → サブ → その下」までしか作らない */
export const TREE_MAX_DEPTH = 3;
/** 木をたどるフォルダ数の上限（写真が数千枚あるフォルダで固まらないように） */
export const TREE_MAX_FOLDERS = 60;

export type BoxCleanupState = 'archived' | 'deleted';

/** `folders.get` / `getItems` から見るぶんだけ */
export interface FolderNode {
  id: string; name: string; parentId: string | null;
  /** 作った人。**結び付かないフォルダを消してよいか**の判断に使う（人が作ったものは触らない） */
  createdById?: string | null;
}
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
  /**
   * `folders` は**たどったフォルダの ID を上から順に**並べたもの（根を含む）。
   * ⚠️ **消すときはこれを逆順に使います** — 幅優先でたどるので、
   * 親は必ず子より前にいます。逆順にすれば**子から先に**消せます。
   */
  | { empty: true; folders: string[] }
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
  /** たどったフォルダを上から順に覚えておく（消すときに逆順で使う） */
  const folders: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (folders.length >= maxFolders) return { empty: false, reason: 'フォルダが多すぎて数え切れない' };
    folders.push(node.id);

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
  return { empty: true, folders };
}

/**
 * **ファイルが1つも無いと確かめた木を、下から順に消す。**
 *
 * ── ⚠️ なぜ `recursive` を使わないのか（本番で分かったこと・2026-08-31）──
 *
 * 本番で「まとめて片づける」を押すと、**15 件すべてが「BOX が削除を断った」**で
 * 止まりました（#495 の理由表示で見えるようになった）。原因はこちらの実装です:
 *
 *   BOX の `DELETE /folders/:id` は、`recursive` を付けないと
 *   **中身が1つでもあれば断ります。ファイルだけでなくサブフォルダも「中身」です。**
 *
 * 案件フォルダは作った直後から**空のサブフォルダを数枚持っています**
 * （`box-folder.service.ts` が `01_見積` などを作る）。`isTreeEmpty` は
 * 「**ファイル**が1つも無いか」を見るので `empty: true` になりますが、
 * そこへ `recursive` 無しの削除を投げると BOX は必ず断ります。
 * つまり**空フォルダは1件も消せない実装でした。**
 *
 * ⚠️ **`recursive` を真にして直すのは採りません。** 付けると
 * 「数え間違いがあっても、中身があれば BOX 側が断ってくれる」という**二重の守りを
 * 手放す**ことになります（見積書・請求書の原本は BOX にしかありません）。
 *
 * 代わりに**下から順に1つずつ消します**。各段で `recursive` を付けないので、
 * **どの階層であってもファイルが1つでもあれば BOX が断ります** — 守りはそのままで、
 * 空のサブフォルダだけが消えます。
 *
 * @param folders `isTreeEmpty` が返した順（上から）。**この関数が逆順にします**
 * @param deleteFolder 1つ消す。**投げてよい**（投げたら失敗として返す）
 */
export async function deleteEmptyTree(
  folders: string[],
  deleteFolder: (folderId: string) => Promise<void>,
): Promise<{ ok: true; deleted: number } | { ok: false; reason: string; deleted: number }> {
  let deleted = 0;
  // **逆順＝深いほうから。** 幅優先の順に積んであるので、親は必ず子より前にいる
  for (const id of [...folders].reverse()) {
    try {
      await deleteFolder(id);
      deleted += 1;
    } catch (e) {
      return { ok: false, reason: (e as Error).message, deleted };
    }
  }
  return { ok: true, deleted };
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
    const f = await client.folders.get(id, { fields: 'id,name,parent,created_by' });
    return {
      id: String(f.id), name: String(f.name ?? ''),
      parentId: f.parent?.id ? String(f.parent.id) : null,
      createdById: f.created_by?.id ? String(f.created_by.id) : null,
    };
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
  /** **生きている引き合いかどうか**の判断に使う（下の `emptyOnly`） */
  stage?: string | null; deleted_at?: string | null;
  /** 「98_終了案件」へ移した日時（migration 249）。NULL = まだ移していない */
  box_done_at?: string | null;
}

/**
 * ⚠️ **`deleted_at IS NULL` で絞らないこと。**
 * 台帳から外した案件（ゴミの一括処分）の BOX フォルダも片づけるためです。
 * ここで絞ると、**外した瞬間にその案件のフォルダは二度と片づけられません**
 * （ユーザー報告「BOX の削除コマンドが表示されなくなりました」の一因）。
 * どれを対象に選ぶかは `project.service.ts` の `LOST_BOX_JUNK_SQL` が決めます。
 */
async function loadProject(projectId: string): Promise<ProjectRow | null> {
  return (await queryOne(
    `SELECT id, code, name, gls_number, box_url_internal, box_url_external, box_cleanup_state,
            stage, deleted_at, box_done_at
       FROM projects WHERE id = ?`,
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
  DONE_ARCHIVE_FOLDER, // 置き場そのもの（終了案件）
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
  /*
   * ⚠️ **台帳から外した案件も索引に入れる。** 外したぶんのフォルダは BOX に
   * 残っているので、名前で結び付け直せないと片づけの対象に選べません
   * （ユーザー報告「BOX の削除コマンドが表示されなくなりました」）。
   * 同じ名前が2件以上になれば下の `AMBIGUOUS` が拾って触らないので、
   * 「外した案件と現役の案件を取り違える」ことはありません。
   */
  const projects = await queryAll(
    'SELECT id, code, gls_number, name FROM projects',
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

  /*
   * ⚠️ **生きている引き合い（ネタ）は「空なら消す」だけ。**
   *
   * ご判断（2026-08-31）「ネタ・引き合いの空フォルダも消す」。ただし
   * **まだ失注になっていない案件のフォルダを `99_失注・見送り` へ引っ越すのは
   * 間違い**です（これから使うかもしれないものを、失注の置き場に入れてしまう）。
   * 中身があるものは**触らずにそのまま**にします。
   *
   * 空だったので消した場合、`box_cleanup_state = 'deleted'` が付くので、
   * その案件が先の段階へ動いたときに `restoreLostProjectFolders` が
   * **同じ形のフォルダを作り直します**（使い始めるときには戻っている）。
   */
  const emptyOnly = row.stage === 'neta' && !row.deleted_at;

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
    /** 引っ越す理由（空でなかった / 消せなかった）。空文字なら引っ越さない */
    let moveReason = verdict.empty ? '' : verdict.reason;

    if (verdict.empty) {
      /*
       * **下から順に1つずつ消す。** `recursive` は**どの段でも付けない**ので、
       * ファイルが1つでもあれば BOX がその段で断る（二重の守りはそのまま）。
       *
       * ⚠️ 以前は根に1回だけ `recursive` 無しの削除を投げていたため、
       * **空のサブフォルダを持つ案件フォルダは1件も消せませんでした**
       * （本番で「BOX が削除を断った」15件の正体）。
       */
      const res = await deleteEmptyTree(verdict.folders, (id) => client.folders.delete(id));
      if (res.ok) {
        notes.push(`${side.key}: 空だったので削除 (${folder!.name})`);
        clearedUrls[side.key] = true;
        deleted += 1;
        continue;
      }
      /*
       * ⚠️ **消せなかったら、そのままにせず引っ越す。**
       * 断られたということは中身がある（＝数え終わったあとに誰かが置いた）か、
       * 権限が足りないかで、どちらも「現役の場所から外す」ほうが正しい。
       * 以前はここで諦めていたので、**現役の場所に残り続けていました**。
       */
      moveReason = `削除を断られた (${res.reason}・途中まで ${res.deleted} 件)`;
    }

    if (emptyOnly) {
      // まだ失注ではないので、失注の置き場へは入れない
      notes.push(`${side.key}: 空ではないので触らず (${moveReason})`);
      continue;
    }

    const archive = side.parentId ? await ensureSubfolder(side.parentId, LOST_ARCHIVE_FOLDER) : null;
    if (!archive) {
      notes.push(`${side.key}: 置き場を作れず そのまま (${moveReason})`);
      continue;
    }
    try {
      await client.folders.update(folderId!, { parent: { id: archive.id } });
      notes.push(`${side.key}: ${LOST_ARCHIVE_FOLDER} へ移動 (${moveReason})`);
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
    /*
     * **完了から戻したら、`98_終了案件` からも返す**（migration 249）。
     * ⚠️ 失注の戻しとは別に見ること — 同じ案件が「失注 → 戻す → 終了」と
     * 両方を経験しうるので、片方の状態でもう片方を判断できない。
     */
    if (toStage !== 's_completed') await restoreDoneProjectFolders(projectId);
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
  { code: 'boxRefused', match: '削除を断られた', label: 'BOX が削除を断ったので「99_失注・見送り」へ移した' },
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

// ───────────────────────────────────────────────────────────
// どの案件にも結び付かないフォルダ（実測: 77 件中 13 件）
// ───────────────────────────────────────────────────────────

/**
 * **案件に結び付かない、空のフォルダを消す。**
 *
 * ── なぜ要るか（実物の BOX で測って分かったこと・2026-08-31）──────
 *
 * 名寄せの結果は「**BOX のフォルダ 77 件を調べて 64 件を案件に結び付けました**」。
 * つまり **13 件はどの案件にも結び付きません**。アプリはそれが何なのか知らないので、
 * 案件をたどる片づけでは**永久に触れません**。利用者から見れば
 * 「まだ大量にゴミが残っている」状態です。
 *
 * ── ⚠️ 何を根拠に消してよいと判断するか ────────────────────────
 *
 * 案件をたどる経路では「その案件のフォルダである」ことを名前で確かめていますが、
 * 結び付かないフォルダには照らす相手がいません。代わりに**4つ全部**を見ます:
 *
 *   ① **親フォルダの直下にある**（親を一覧して得たものだけを見るので当然に満たす）
 *   ② **案件フォルダではないと分かっている名前ではない**（`00_DB_Backup` など）
 *   ③ **どの案件の `box_url_*` からも指されていない**
 *      — 指されていれば、それは生きている案件のフォルダ
 *   ④ ⚠️ **このアプリの実行ユーザーが作ったものである**（`created_by`）
 *      — 人が手で作ったフォルダには絶対に触らない。ここが最後の砦です
 *
 * そのうえで**中身が空のときだけ**消します（`isTreeEmpty` → `deleteEmptyTree`）。
 * **どの段でも再帰は指定しない**ので、ファイルが1枚でもあれば BOX が断ります。
 */
export interface OrphanResult {
  /** 消したフォルダの数 */
  deleted: number;
  /** 見た（親フォルダ直下の）フォルダの数 */
  scanned: number;
  /** 触らなかった数と、その理由の内訳 */
  skipped: SkipReason[];
  /** 時間切れで切り上げたか */
  timedOut: boolean;
  /** 親フォルダを最後まで見られたか */
  complete: boolean;
}

/** 1リクエストで BOX を触ってよい時間（片づけと同じ理由で件数ではなく時間で切る） */
export const ORPHAN_BUDGET_MS = 20_000;

export async function cleanupOrphanFolders(budgetMs = ORPHAN_BUDGET_MS): Promise<OrphanResult> {
  const empty: OrphanResult = { deleted: 0, scanned: 0, skipped: [], timedOut: false, complete: true };
  if (!isBoxConfigured()) return empty;
  const client = getBoxClient();
  if (!client) return empty;

  /*
   * **アプリ自身が誰か。** これが取れないと ④ の判断ができないので、
   * **取れなければ1件も触りません**（分からないものは消さない）。
   */
  let meId: string | null = null;
  try {
    meId = String((await client.users.get('me', { fields: 'id,login' })).id);
  } catch (e) {
    console.warn('[box-orphan] 実行ユーザーを取れませんでした:', (e as Error).message);
    return { ...empty, complete: false };
  }

  /** どの案件からも指されている ID（**消えた案件のぶんも含める**） */
  const linked = new Set<string>();
  const rows = await queryAll(
    'SELECT box_url_internal, box_url_external FROM projects',
  ) as { box_url_internal: string | null; box_url_external: string | null }[];
  for (const r of rows) {
    for (const url of [r.box_url_internal, r.box_url_external]) {
      const id = url ? extractFolderId(url) : null;
      if (id) linked.add(id);
    }
  }

  const listChildren = listChildrenVia(client);
  const started = Date.now();
  const notes: string[] = [];
  let deleted = 0;
  let scanned = 0;
  let timedOut = false;
  let complete = true;

  for (const parentId of [internalParentId(), externalParentId()]) {
    if (!parentId) { complete = false; continue; }
    if (timedOut) break;
    let listing;
    try {
      listing = await listFolderItems(parentId);
    } catch (e) {
      console.warn('[box-orphan] 親フォルダを一覧できませんでした:', parentId, (e as Error).message);
      complete = false;
      continue;
    }
    if (listing.truncated) complete = false;

    for (const item of listing.items) {
      if (item.type !== 'folder') continue;
      if (Date.now() - started > budgetMs) { timedOut = true; break; }
      const bare = stripFolderPrefix(item.name);
      if ((NON_PROJECT_FOLDERS as readonly string[]).includes(bare)) continue;   // ②
      if (linked.has(String(item.id))) continue;                                  // ③
      scanned += 1;

      const folder = await readFolder(client, String(item.id));
      if (!folder) { notes.push(`orphan: 触らず (BOXからフォルダを読めなかった)`); continue; }
      if (folder.parentId !== parentId) {                                         // ①
        notes.push(`orphan: 触らず (別の場所にある (親=${folder.parentId ?? 'なし'}))`);
        continue;
      }
      if (!folder.createdById || folder.createdById !== meId) {                    // ④
        notes.push('orphan: 触らず (人が作ったフォルダ)');
        continue;
      }

      const verdict = await isTreeEmpty(String(item.id), listChildren);
      if (!verdict.empty) { notes.push(`orphan: 触らず (${verdict.reason})`); continue; }

      const res = await deleteEmptyTree(verdict.folders, (id) => client.folders.delete(id));
      if (res.ok) { deleted += 1; continue; }
      notes.push(`orphan: 削除できず (${res.reason})`);
    }
  }

  console.log('[box-orphan] 結び付かないフォルダ:', { deleted, scanned, timedOut, complete });
  return { deleted, scanned, skipped: summarizeSkipReasons(notes), timedOut, complete };
}

// ───────────────────────────────────────────────────────────
// 終了した案件を「98_終了案件」へ移す（migration 249）
// ───────────────────────────────────────────────────────────

/**
 * **終了した案件の BOX フォルダを `98_終了案件` へ移す。**
 *
 * ── いつ「終了」とみなすか ──────────────────────────────────
 *
 * ご依頼は「**日付をベースに案件日の翌日**」。アプリにはすでに同じ判定があります —
 * 日次の `completeElapsedWonProjects` が `event_end < 今日(JST)` の受注案件を
 * `s_completed` へ繰り上げています。**同じ式をもう一度書かず**、
 *
 *   ステージが `s_completed` **かつ** `event_end` が今日より前
 *
 * の両方を見ます。⚠️ **ステージだけだと、まだ本番が来ていないのに手で完了にした
 * 案件のフォルダまで片づけます**（日付を見れば起きません）。
 *
 * ── ⚠️ 削除は絶対にしない ────────────────────────────────────
 *
 * 失注の置き場（`99_失注・見送り`）は「空なら消す」ですが、**こちらは移すだけ**です。
 * 終了した案件のフォルダには納品物・請求書・検収書が入っており、法定保存の
 * 対象でもあります。**空に見えても消しません**（数え間違いの余地を作らない）。
 *
 * 安全弁（`checkFolderSafety`）は失注の片づけと**同じものを通します** —
 * 別に書くと、片方だけ緩んだ日に他人のフォルダを動かします。
 */
export interface DoneArchiveResult {
  /** 置き場へ移した案件の数 */
  moved: number;
  /** 残っている（まだ移していない）案件の数 */
  remaining: number;
  /** 触らなかった理由の内訳 */
  skipped: SkipReason[];
  /** 時間切れで切り上げたか */
  timedOut: boolean;
}

/** 1リクエストで BOX を触ってよい時間（片づけと同じ理由で件数ではなく時間で切る） */
export const DONE_BUDGET_MS = 20_000;

/**
 * **「案件が終わった日」。** ご依頼の「案件日の翌日」を決める式。
 *
 * ── ⚠️ `event_end` だけを見てはいけない（実データで確認・2026-08-31）──
 *
 * 本番の完了案件 9 件を数えたところ、**4 件が `event_end` 空**でした
 * （GLS-A002 / A003 / A009 / A010）。`event_end` しか見ない実装では、
 * **完了していても永久に `98_終了案件` へ移りません**。
 *
 * ⚠️ **プロジェクト管理（GLS-B）はもっと外れます。** GPM は自分の終了日を
 * `gpm_projects.ends_on` に持っており、`projects.event_end` はほぼ空です。
 * 実測でも完了 4 件のうち自動で移れたのは 1 件だけでした
 * （B004 / B009 / B010 が残り、B006 だけ移った）。
 *
 * そこで**3つを上から順に見ます**。どれか1つでも日付があれば判定できます:
 *   ① `projects.event_end`   … 案件（GLS-A）の終了日
 *   ② `projects.event_start` … 終了日が無ければ**開催日**（1日開催はここだけ入る）
 *   ③ `gpm_projects.ends_on` … プロジェクト管理の終了日
 *
 * ⚠️ **3つとも空なら、いまも対象外のままです。** 日付が1つも無い案件を
 * 「終わった」と決める材料がこちらには無いためです（推測で動かすと、
 * まだ動いている案件のフォルダを片づけてしまう）。
 */
export const DONE_DATE_SQL = `COALESCE(
     NULLIF(p.event_end, ''),
     NULLIF(p.event_start, ''),
     (SELECT to_char(g.ends_on, 'YYYY-MM-DD') FROM gpm_projects g
       WHERE g.project_id = p.id AND g.deleted_at IS NULL AND g.ends_on IS NOT NULL
       ORDER BY g.ends_on DESC LIMIT 1)
   )`;

/**
 * 移す対象。**数えるときと移すときで必ず同じものを使う**
 * （写すと「10件と出ているのに押すと3件しか動かない」が起きる）。
 */
export const DONE_TARGET_SQL = `FROM projects p
   WHERE p.deleted_at IS NULL AND p.stage = 's_completed' AND p.box_done_at IS NULL
     AND ${DONE_DATE_SQL} IS NOT NULL AND ${DONE_DATE_SQL} < ?
     AND (p.box_url_internal IS NOT NULL OR p.box_url_external IS NOT NULL)`;

export async function countDoneFoldersToArchive(): Promise<number> {
  const row = await queryOne(
    `SELECT COUNT(*)::int AS c ${DONE_TARGET_SQL}`, [jstDate()],
  ) as { c?: number } | null;
  return Number(row?.c ?? 0);
}

export async function archiveDoneProjectFolders(budgetMs = DONE_BUDGET_MS): Promise<DoneArchiveResult> {
  const idle: DoneArchiveResult = { moved: 0, remaining: 0, skipped: [], timedOut: false };
  const client = isBoxConfigured() ? getBoxClient() : null;
  if (!client) return { ...idle, remaining: await countDoneFoldersToArchive() };

  const rows = await queryAll(
    `SELECT p.id ${DONE_TARGET_SQL} ORDER BY ${DONE_DATE_SQL} ASC LIMIT 200`, [jstDate()],
  ) as { id: string }[];

  const forbidden = forbiddenFolderIds();
  const started = Date.now();
  const allNotes: string[] = [];
  let moved = 0;
  let timedOut = false;

  /*
   * ⚠️ **置き場は1回だけ解決する。**
   *
   * 以前は案件ごと・側ごとに `ensureSubfolder` を呼んでいました（1件あたり最大2回）。
   * 置き場は**両親に1つずつしかない**のに毎回 BOX へ問い合わせるので、
   * **1回の押下で進む件数がその分だけ減ります**。実際、本番で押したとき
   * 20 秒の予算内に 3 件しか進まず、条件を満たしていた GLS-A013 / A018 が
   * 残りました（次の往復で進むはずが、そこまで届いていない）。
   * ここで1回だけ解決して使い回します。
   */
  const archiveOf = new Map<string, string | null>();
  for (const parentId of [internalParentId(), externalParentId()]) {
    if (!parentId) continue;
    const a = await ensureSubfolder(parentId, DONE_ARCHIVE_FOLDER);
    archiveOf.set(parentId, a ? a.id : null);
  }

  for (const r of rows) {
    if (Date.now() - started > budgetMs) { timedOut = true; break; }
    const row = await loadProject(r.id);
    if (!row || row.box_done_at) continue;

    const names = expectedFolderNames(row);
    const numbers = projectNumbers(row);
    const notes: string[] = [];
    let did = 0;

    for (const side of sidesOf(row)) {
      if (!side.url) continue;
      const folderId = extractFolderId(side.url);
      const folder = folderId ? await readFolder(client, folderId) : null;
      const safe = checkFolderSafety({
        folderId, folder, expectedParentId: side.parentId, expectedNames: names, numbers, forbiddenIds: forbidden,
      });
      if (!safe.ok) { notes.push(`${side.key}: 触らず (${safe.reason})`); continue; }

      const archiveId = side.parentId ? archiveOf.get(side.parentId) ?? null : null;
      if (!archiveId) { notes.push(`${side.key}: 置き場を作れず そのまま`); continue; }
      try {
        // **移すだけ。消さない。** 引っ越しても ID は変わらないので URL はそのまま使える
        await client.folders.update(folderId!, { parent: { id: archiveId } });
        notes.push(`${side.key}: ${DONE_ARCHIVE_FOLDER} へ移動 (${folder!.name})`);
        did += 1;
      } catch (e) {
        notes.push(`${side.key}: 移動できず (${(e as Error).message})`);
      }
    }

    if (did === 0) {
      if (notes.length) allNotes.push(notes.join(' / '));
      continue;
    }
    await execute(
      'UPDATE projects SET box_done_at = NOW(), box_cleanup_note = ? WHERE id = ?',
      [notes.join(' / '), r.id],
    );
    moved += 1;
  }

  console.log('[box-done] 終了案件の引っ越し:', { moved, timedOut });
  return {
    moved, remaining: await countDoneFoldersToArchive(),
    skipped: summarizeSkipReasons(allNotes), timedOut,
  };
}

/**
 * **完了から戻したときに、置き場から親フォルダへ返す。**
 * 失注の `restoreLostProjectFolders` と同じ考え方（片づけたことを覚えているので戻せる）。
 */
export async function restoreDoneProjectFolders(projectId: string): Promise<void> {
  const client = isBoxConfigured() ? getBoxClient() : null;
  if (!client) return;

  const row = await loadProject(projectId);
  if (!row?.box_done_at) return;

  const notes: string[] = [];
  for (const side of sidesOf(row)) {
    if (!side.url || !side.parentId) continue;
    const folderId = extractFolderId(side.url);
    if (!folderId) continue;
    try {
      await client.folders.update(folderId, { parent: { id: side.parentId } });
      notes.push(`${side.key}: 戻した`);
    } catch (e) {
      notes.push(`${side.key}: 戻せず (${(e as Error).message})`);
    }
  }
  await execute(
    'UPDATE projects SET box_done_at = NULL, box_cleanup_note = ? WHERE id = ?',
    [notes.join(' / ') || null, projectId],
  );
  console.log('[box-done] 置き場から戻しました:', projectId, notes.join(' / '));
}
