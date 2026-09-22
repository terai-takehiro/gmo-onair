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
import { saveWikiFile } from './wiki-file.service';
import { DATABASE_NOTE_MARKER } from './wiki-export.service';
import {
  buildImportPlan,
  csvToDatabase,
  isImagePath,
  parseCsv,
  baseName,
  type ImportNode,
} from './wiki-import-parse';
import { collectAssetRefs, rewriteAssetLinks } from './wiki-import-assets';

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
  const planned = countNodes(plan);
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
    const text = await zip.file(p)!.async('string');
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
  const urlByPath = new Map<string, string>();
  for (const p of wanted) {
    try {
      const buf = await zip.file(p)!.async('nodebuffer');
      const saved = await saveWikiFile(user.id, { originalname: baseName(p), buffer: buf }, null);
      urlByPath.set(p, String(saved.url));
    } catch {
      // 形式が違う・壊れている画像で取り込みごと止めない（本文のリンクはそのまま残る）
    }
  }
  const urlOf = (p: string) => urlByPath.get(p) ?? null;

  const result: WikiImportResult = {
    space_key: String(space.key),
    pages: 0,
    databases: 0,
    rows: 0,
    files: urlByPath.size,
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

    if (!isDatabase) {
      for (const child of node.children) await create(child, pageId);
      return;
    }

    // データベース: 項目とビューを入れてから行（子ページ）を作る
    const fromJson = dbMd ? readDatabaseJson(dbMd.body) : null;
    const fromCsv = node.csvPath
      ? csvToDatabase(parseCsv(await zip.file(node.csvPath)!.async('string')))
      : null;
    const items = fromJson?.items ?? fromCsv?.items ?? [];
    const views = fromJson?.views ?? [];
    await setPageKind(user, pageId, 'database');
    await putDatabase(user, pageId, {
      items,
      views: Array.isArray(views) && views.length > 0 ? views : [defaultTableView()],
    });
    result.databases += 1;

    // 行の本文は同じ題の `.md` から採る（Notion は CSV と行の .md の両方を出す）
    const mdByName = new Map<string, ImportNode>();
    for (const child of node.children) {
      if (child.mdPath) mdByName.set(child.name, child);
    }

    if (fromCsv) {
      for (const row of fromCsv.rows) {
        const child = mdByName.get(row.title);
        mdByName.delete(row.title);
        await createPage(user, {
          space_id: String(space.id),
          parent_id: pageId,
          title: row.title || '無題の行',
          body_md: bodyFor(child?.mdPath ? mdByPath.get(child.mdPath) : undefined),
          status,
          props: row.props,
          note: '取り込みで追加',
        });
        result.rows += 1;
        result.pages += 1;
      }
    }

    for (const child of node.children) {
      if (!mdByName.has(child.name)) continue;
      const childMd = child.mdPath ? mdByPath.get(child.mdPath) : undefined;
      await createPage(user, {
        space_id: String(space.id),
        parent_id: pageId,
        title: childMd?.title ?? child.name,
        body_md: bodyFor(childMd),
        status,
        props: propsOf(childMd?.data ?? {}),
        tags: tagsOf(childMd?.data ?? {}),
        note: '取り込みで追加',
      });
      result.rows += 1;
      result.pages += 1;
    }
  };

  for (const node of plan) await create(node, parentId);
  return result;
}

/** 作る枚数を数える（上限の判定に使う。行は数えきれないので目安） */
function countNodes(nodes: ImportNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countNodes(node.children);
  return n;
}
