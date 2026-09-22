/**
 * Wiki — 取り込み（`docs/design/v4/wiki.md` §5-2 の約束3・段D）。
 *
 * `POST /wiki/import` が Obsidian・Notion・ONAiR の書き出し（zip）を受けます。
 * **取り込み先のスペースは呼ぶ側が指定します**（どこに入るか分からない取り込みを作らない）。
 *
 * | 元 | 何が戻るか |
 * | --- | --- |
 * | ONAiR の書き出し | 題・タグ・見直し予定・本文・子ページ・データベース（項目とビューと値） |
 * | Obsidian | フォルダの形・本文・YAML の見出し・画像 |
 * | Notion | 32桁の id を落とした題・本文・CSV をデータベースとして |
 *
 * ⚠️ **担当（owner）は戻しません。** `.md` に書いてあるのは氏名で、同姓同名があると
 * 別人に担当が付きます。取り込んだあとに画面で選び直してください。
 *
 * ⚠️ **1回の取り込みは1つのトランザクションにしていません。** 何百ページの作成を
 * 1本の錠で囲むと、その間ほかの人の保存が全部待たされます。途中で失敗したら
 * **そこまでが入った状態**で止まり、作れたページ数を返します。
 */
import JSZip from 'jszip';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { parseFrontMatter } from '../wiki-front-matter';
import type { WikiPropValue } from '../wiki-props';
import { assertReadablePage, isWikiEditor, type WikiUser } from './wiki-access.service';
import { getSpaceByKey } from './wiki-space.service';
import { createPage } from './wiki-write.service';
import { setPageKind, putDatabase } from './wiki-database.service';
import { defaultTableView } from './wiki-database-schema';
import { saveWikiFile, attachWikiFileToPage } from './wiki-file.service';
import { DATABASE_NOTE_MARKER } from './wiki-export.service';
import {
  buildImportPlan,
  csvToDatabase,
  isImagePath,
  parseCsv,
  baseName,
  type ImportNode,
  type CsvDatabase,
} from './wiki-import-parse';
import { collectAssetRefs, rewriteAssetLinks } from './wiki-import-assets';
import { ZipReader } from './wiki-import-read';

/** 1回に取り込めるページ数。超えたら**1枚も作らずに**止めます */
const MAX_IMPORT_PAGES = 1000;

export interface WikiImportInput {
  /** 取り込み先のスペース（URL に出る短い英数字） */
  space: string;
  /** 取り込み先の親ページ（省略＝スペース直下） */
  parent_id?: string | null;
  /** 作るページの状態。既定は公開（下書きにすると取り込んだ本人にしか見えない） */
  status?: 'draft' | 'published';
}

export interface WikiImportResult {
  space_key: string;
  /** 作ったページ（データベースと行を含む） */
  pages: number;
  databases: number;
  rows: number;
  files: number;
}

/** zip の中の `.md` 1本ぶん（読み込み済み） */
interface LoadedMd {
  dir: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

function dirOf(p: string): string {
  const at = p.lastIndexOf('/');
  return at === -1 ? '' : p.slice(0, at + 1);
}

/** 題は ①YAML の見出し ②本文の最初の `# ` ③ファイル名 の順に採る */
function titleOf(data: Record<string, unknown>, body: string, fallback: string): string {
  const fromYaml = typeof data.title === 'string' ? data.title.trim() : '';
  if (fromYaml) return fromYaml;
  const m = body.match(/^#\s+(.+?)\s*$/m);
  if (m) return m[1].trim();
  return fallback;
}

function tagsOf(data: Record<string, unknown>): string[] {
  const raw = data.tags;
  if (Array.isArray(raw)) return raw.map((t) => String(t)).filter(Boolean).slice(0, 30);
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

function reviewByOf(data: Record<string, unknown>): string | null {
  const raw = typeof data.review_by === 'string' ? data.review_by.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function propsOf(data: Record<string, unknown>): Record<string, WikiPropValue> {
  const raw = data.props;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, WikiPropValue>;
}

/** `_database.md` の中の JSON（項目とビュー）。無ければ null */
function readDatabaseJson(md: string): { items: unknown; views: unknown } | null {
  const m = md.match(/```json wiki-database\s*\n([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1]) as { items?: unknown; views?: unknown };
    return { items: parsed.items ?? [], views: parsed.views ?? [] };
  } catch {
    return null; // 人が手で直して壊れていても、取り込みごと落とさない
  }
}

/** `_database.md` の本文（書き出しが付けた説明より前だけ） */
function databaseBodyOf(body: string): string {
  const at = body.indexOf(DATABASE_NOTE_MARKER);
  return (at === -1 ? body : body.slice(0, at)).trim();
}

/**
 * zip を取り込む。**editor 以上**（route が確かめますが、MCP から呼ばれても効くようここでも見ます）。
 */
export async function importZip(
  user: WikiUser,
  buffer: Buffer,
  input: WikiImportInput,
): Promise<WikiImportResult> {
  if (!isWikiEditor(user)) throw new ValidationError('ページを追加できる権限がありません。');
  const space = await getSpaceByKey(user, String(input.space ?? ''));
  const parentId = input.parent_id ? String(input.parent_id) : null;
  if (parentId) await assertReadablePage(user, parentId);
  const status = input.status === 'draft' ? 'draft' : 'published';

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ValidationError('zip を読み込めませんでした。書き出したファイルをそのまま選んでください。');
  }

  const paths: string[] = [];
  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith('__MACOSX/') || baseName(relativePath) === '.DS_Store') return;
    paths.push(relativePath);
  });
  if (paths.length === 0) throw new ValidationError('zip の中にファイルがありません。');

  const plan = buildImportPlan(paths);

  /*
   * ⚠️ **CSV の行も上限に数えます。**
   * `countNodes` は zip の中のフォルダとファイルを数えるだけなので、
   * CSV は「1件」にしかなりません。ところが**行はあとで1行＝1ページ**になるため、
   * 10万行の CSV を1枚入れた小さな zip が上限（${MAX_IMPORT_PAGES}）をすり抜け、
   * **取り込みは途中で止められない**まま DB に大量の書き込みを流していました
   * （Codex の指摘・P1）。数えるために CSV を先に読み、その結果は使い回します
   * （同じ zip を2度読まない）。
   *
   * ⚠️ **行の `.md` を二重に数えないこと。** Notion は CSV と行の `.md` の
   * **両方**を書き出すので、`countNodes` の数に CSV の行数をそのまま足すと
   * 600行の台帳が 1,201件 と数えられ、実際に作るのは 601件 なのに止まります
   * （Codex の指摘・P2）。`countPlanned` は `create` と同じ手順で数えます。
   */
  /*
   * ⚠️ **zip の中身は `ZipReader` を通して読みます。** multer の 50MB は
   * 圧縮したあとの大きさにしか効かないので、解いた大きさを数えながら読みます
   * （数十 MB の zip が解くと数 GB になる zip 爆弾を、上限を見る前に止める。
   * Codex の指摘・P1）。**1回の取り込みで1つ**作って使い回します。
   */
  const reader = new ZipReader(zip);

  const csvByPath = new Map<string, CsvDatabase>();
  for (const csvPath of collectCsvPaths(plan)) {
    const text = await reader.text(csvPath);
    if (text === null) continue;
    csvByPath.set(csvPath, csvToDatabase(parseCsv(text)));
  }
  const planned = countPlanned(plan, csvByPath);
  if (planned > MAX_IMPORT_PAGES) {
    throw new ValidationError(
      `ページが ${MAX_IMPORT_PAGES} 件を超えています。フォルダを分けてからお試しください。`,
    );
  }
  if (planned === 0) {
    throw new ValidationError('取り込めるページ（.md）が zip の中にありません。');
  }

  // ① `.md` を先に全部読む（画像は「本文が指しているもの」だけ取り込むため）
  const mdByPath = new Map<string, LoadedMd>();
  for (const p of paths) {
    if (!p.endsWith('.md')) continue;
    const text = (await reader.text(p)) ?? '';
    const { data, body } = parseFrontMatter(text);
    mdByPath.set(p, {
      dir: dirOf(p),
      title: titleOf(data, body, baseName(p).replace(/\.md$/i, '')),
      body,
      data,
    });
  }

  // ② 画像を取り込む（指されているものだけ・page_id は作ったページに後で付ける）
  const imagePaths = new Set(paths.filter(isImagePath));
  const byBase = new Map<string, string>();
  for (const p of imagePaths) byBase.set(baseName(p), p);
  const has = (p: string) => imagePaths.has(p);

  const wanted = new Set<string>();
  for (const md of mdByPath.values()) {
    for (const ref of collectAssetRefs(md.body, md.dir, has, byBase)) wanted.add(ref);
  }
  const savedByPath = new Map<string, { id: string; url: string }>();
  for (const p of wanted) {
    try {
      const buf = await reader.buffer(p);
      if (!buf) continue;
      const saved = await saveWikiFile(user.id, { originalname: baseName(p), buffer: buf }, null);
      savedByPath.set(p, { id: String(saved.id), url: String(saved.url) });
    } catch (e) {
      /*
       * ⚠️ **大きすぎて止めた（`ValidationError`）ときは、握りつぶさず投げ直します。**
       * ここで飲み込んでいたころは、申告を偽った画像を何枚も並べるだけで
       * **1枚あたり上限いっぱいまで解かせ続けられ**、zip 全体の budget を
       * すり抜けられました（Codex の指摘・P1）。
       * 形式が違う・壊れている画像だけは今までどおり飛ばします
       *（本文のリンクはそのまま残り、開けば 404 になります）。
       */
      if (e instanceof ValidationError) throw e;
    }
  }
  const urlOf = (p: string) => savedByPath.get(p)?.url ?? null;

  /*
   * ⚠️ **上げた画像は、その本文のページに必ず付け直します。**
   * `page_id` が空のままだと `GET /wiki/files/:id` の読む権限の判定が効かず、
   * 限定のスペースへ取り込んだ画像を**誰でも取れて**しまいます（Codex の指摘・P1）。
   * 1枚の画像を複数のページが指しているときは**最初に作ったページ**の持ち物にします
   * （読めるかどうかは同じスペースなので、どちらに付けても判定は変わりません）。
   */
  const attachedPaths = new Set<string>();
  const attachAssets = async (md: LoadedMd | undefined, pageId: string): Promise<void> => {
    if (!md) return;
    for (const ref of collectAssetRefs(md.body, md.dir, has, byBase)) {
      const saved = savedByPath.get(ref);
      if (!saved || attachedPaths.has(ref)) continue;
      attachedPaths.add(ref);
      await attachWikiFileToPage(saved.id, pageId);
    }
  };

  const result: WikiImportResult = {
    space_key: String(space.key),
    pages: 0,
    databases: 0,
    rows: 0,
    files: savedByPath.size,
  };

  const bodyFor = (md: LoadedMd | undefined): string => (
    md ? rewriteAssetLinks(md.body, md.dir, has, byBase, urlOf).trim() : ''
  );

  /** 1枚作って、子があれば続けて作る */
  const create = async (node: ImportNode, parent: string | null): Promise<void> => {
    const md = node.mdPath ? mdByPath.get(node.mdPath) : undefined;
    const dbMd = node.dbPath ? mdByPath.get(node.dbPath) : undefined;
    const isDatabase = !!node.csvPath || !!dbMd;

    const page = await createPage(user, {
      space_id: String(space.id),
      parent_id: parent,
      title: (md?.title ?? dbMd?.title ?? node.name) || node.name,
      body_md: isDatabase ? databaseBodyOf(bodyFor(dbMd)) : bodyFor(md),
      status,
      tags: tagsOf((md ?? dbMd)?.data ?? {}),
      review_by: reviewByOf((md ?? dbMd)?.data ?? {}),
      note: '取り込みで追加',
    });
    result.pages += 1;
    const pageId = String(page.id);
    await attachAssets(md, pageId);
    await attachAssets(dbMd, pageId);

    if (!isDatabase) {
      for (const child of node.children) await create(child, pageId);
      return;
    }

    // データベース: 項目とビューを入れてから行（子ページ）を作る
    const fromJson = dbMd ? readDatabaseJson(dbMd.body) : null;
    // 上限を数えるときに読んで持っています（同じ zip を2度読まない）
    const fromCsv = node.csvPath ? csvByPath.get(node.csvPath) ?? null : null;
    const items = fromJson?.items ?? fromCsv?.items ?? [];
    const views = fromJson?.views ?? [];
    await setPageKind(user, pageId, 'database');
    await putDatabase(user, pageId, {
      items,
      views: Array.isArray(views) && views.length > 0 ? views : [defaultTableView()],
    });
    result.databases += 1;

    /*
     * 行の本文は同じ題の `.md` から採ります（Notion は CSV と行の `.md` の両方を出す）。
     * ⚠️ **題ごとに「待ち行列」を持ち、1行につき1枚ずつ取り出します。**
     * 題を鍵に1枚だけ覚える作りだと、同じ題の行が2つあるときに
     * ①2行目が1行目の本文を**そのまま写し**、②使われなかった `.md` が下の
     * 取りこぼしの輪で**余分な3行目**になっていました（Codex の指摘・P1）。
     */
    const mdQueueByName = new Map<string, ImportNode[]>();
    for (const child of node.children) {
      if (!child.mdPath) continue;
      const queue = mdQueueByName.get(child.name);
      if (queue) queue.push(child);
      else mdQueueByName.set(child.name, [child]);
    }
    const consumed = new Set<ImportNode>();

    if (fromCsv) {
      for (const row of fromCsv.rows) {
        const child = mdQueueByName.get(row.title)?.shift();
        if (child) consumed.add(child);
        const childMd = child?.mdPath ? mdByPath.get(child.mdPath) : undefined;
        const rowPage = await createPage(user, {
          space_id: String(space.id),
          parent_id: pageId,
          title: row.title || '無題の行',
          body_md: bodyFor(childMd),
          status,
          props: row.props,
          // ⚠️ 行にも見直し予定を戻す（ふつうのページと同じ。往復で消していた）
          review_by: reviewByOf(childMd?.data ?? {}),
          tags: tagsOf(childMd?.data ?? {}),
          note: '取り込みで追加',
        });
        await attachAssets(childMd, String(rowPage.id));
        result.rows += 1;
        result.pages += 1;
        // 行の下のページも作る（書き出しは `行の名前/` の下に書いている）
        if (child) await createChildren(child, String(rowPage.id));
      }
    }

    for (const child of node.children) {
      if (consumed.has(child)) continue;
      /*
       * ⚠️ **フォルダだけの子も取りこぼさないこと。**
       * データベースの下のデータベースは `_database.md` を持つフォルダで、
       * **兄弟の `.md` はありません**。`mdPath` が無いという理由で飛ばしていたころは、
       * 入れ子のデータベースとその下が丸ごと消えていました（Codex の指摘・P1）。
       * データベースの子は `create` に渡せば、定義も行もそのまま作れます。
       */
      if (child.csvPath || child.dbPath) {
        await create(child, pageId);
        continue;
      }
      if (!child.mdPath) continue;
      const childMd = mdByPath.get(child.mdPath);
      const leftover = await createPage(user, {
        space_id: String(space.id),
        parent_id: pageId,
        title: childMd?.title ?? child.name,
        body_md: bodyFor(childMd),
        status,
        props: propsOf(childMd?.data ?? {}),
        tags: tagsOf(childMd?.data ?? {}),
        /*
         * ⚠️ **行にも見直し予定を戻します。** `.md` の見出しには `review_by` が
         * 書いてあるのに、ここで渡していなかったため、**書き出して取り込み直すと
         * データベースの行の見直し予定だけが消えて**いました（Codex の指摘・P1）。
         */
        review_by: reviewByOf(childMd?.data ?? {}),
        note: '取り込みで追加',
      });
      await attachAssets(childMd, String(leftover.id));
      result.rows += 1;
      result.pages += 1;
      await createChildren(child, String(leftover.id));
    }
  };

  /*
   * ⚠️ **行の下のページも作ります。**
   * 行はページなので子を持てます。書き出しは `行の名前/` の下に書くのに、
   * 取り込みが行を1枚作って終わりにしていたため、**書き出して取り込み直すと
   * 行の下が丸ごと消えて**いました（Codex の指摘・P1。書き出し側を直した
   * ことで表に出た穴です）。数え方（`countPlanned`）も合わせてあります。
   */
  const createChildren = async (row: ImportNode, rowPageId: string): Promise<void> => {
    for (const grandChild of row.children) await create(grandChild, rowPageId);
  };

  for (const node of plan) await create(node, parentId);
  return result;
}

/**
 * 作る枚数を数える（上限の判定に使う）。
 *
 * ⚠️ **`create` と同じ手順で数えること。** ずれると、作れるはずの zip を止めるか、
 * 止めるはずの zip を通します。データベースの節は
 * 「①データベース1枚 ②CSV の行の数 ③どの行にも使われなかった `.md` の数」で、
 * ③は題ごとの待ち行列で1行に1枚ずつ取り出したあとの残りです（`create` と同じ）。
 */
function countPlanned(nodes: ImportNode[], csvByPath: Map<string, CsvDatabase>): number {
  let n = 0;
  for (const node of nodes) {
    n += 1;
    const isDatabase = !!node.csvPath || !!node.dbPath;
    if (!isDatabase) {
      n += countPlanned(node.children, csvByPath);
      continue;
    }
    const rows = (node.csvPath ? csvByPath.get(node.csvPath)?.rows : undefined) ?? [];
    const queue = new Map<string, number>();
    let mdChildren = 0;
    for (const child of node.children) {
      // 入れ子のデータベースは `create` に渡すので、まるごと同じ手順で数える
      if (child.csvPath || child.dbPath) {
        n += countPlanned([child], csvByPath);
        continue;
      }
      if (!child.mdPath) continue;
      mdChildren += 1;
      queue.set(child.name, (queue.get(child.name) ?? 0) + 1);
      // 行の下のページも作るので数に入れる（`createChildren`）
      n += countPlanned(child.children, csvByPath);
    }
    let consumed = 0;
    for (const row of rows) {
      const left = queue.get(row.title) ?? 0;
      if (left <= 0) continue;
      queue.set(row.title, left - 1);
      consumed += 1;
    }
    n += rows.length + (mdChildren - consumed);
  }
  return n;
}

/** 計画の中の CSV の道（上限を数えるために先に読む） */
function collectCsvPaths(nodes: ImportNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.csvPath) out.push(node.csvPath);
    out.push(...collectCsvPaths(node.children));
  }
  return out;
}
