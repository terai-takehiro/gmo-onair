/**
 * Wiki — スペースまるごとの書き出し（`docs/design/v4/wiki.md` §5-2 の約束3-3・段D）。
 *
 * `GET /wiki/export?space=<key>` が zip を1本返します。中身の形は **Notion の書き出しと同じ考え方**:
 *
 * ```
 * README.md                     何が入っているか
 * 社内ルール.md                 ページ1枚 = .md 1本（先頭に YAML の見出し）
 * 社内ルール/経費の申請.md      子ページは親と同じ名前のフォルダの中
 * 貸出台帳/_database.md         データベースは フォルダ ＋ 項目とビュー
 * 貸出台帳/_index.csv           　　　　　　＋ 一覧（Notion と同じ形）
 * 貸出台帳/2026-09-22 貸出.md   　　　　　　＋ 行ごとの .md（値は YAML の見出し）
 * files/wf-xxxxxxxx.png         本文が指している画像
 * ```
 *
 * ⚠️ **本文は書き換えません。** 画像のリンクは `/api/v1/internal/wiki/files/:id` のままです
 * （本文の正は `body_md` の文字列そのもの、という約束1）。`files/` の名前をその id に揃えてあるので、
 * どの画像がどれかは名前で分かります。
 *
 * ⚠️ **下書きは書き出しません**（§7-5。他の人の書きかけを配らない）。
 * 一覧から隠した `archived` は入れます（リンクをたどれば読めるもの＝消えていない）。
 */
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { queryAll, type Row } from '../../../shared/db/connection';
import { ValidationError } from '../../qsheet/services/httpErrors';
import { getSpaceByKey } from './wiki-space.service';
import { loadDefinition } from './wiki-database.service';
import { getWikiFile } from './wiki-file.service';
import { buildRowsCsv } from './wiki-row-csv';
import { pageToMarkdown, frontMatterOf, safeSegment } from './wiki-md.service';
import { serializeFrontMatter } from '../wiki-front-matter';
import type { WikiItem, WikiPropValue } from '../wiki-props';
import { canReadPage, type WikiUser } from './wiki-access.service';

/** 1回に書き出せるページ数。超えたら**書き出さずに止めます**（足りない zip を渡さない） */
const MAX_EXPORT_PAGES = 2000;
/** 同梱する画像の合計。超えたら止めます（zip をメモリで作るため） */
const MAX_EXPORT_FILE_BYTES = 100 * 1024 * 1024;
/** 親をたどる深さの上限（`wiki-path.service.ts` と同じ）。取り違えで無限に回るのを止める */
const MAX_DEPTH = 20;

const PAGE_SELECT = `
  SELECT p.id, p.parent_id, p.sort_order, p.title, p.body_md, p.status, p.kind,
         p.props, p.tags, p.review_by::text AS review_by, p.updated_at,
         s.key AS space_key, ou.name AS owner_name
    FROM wiki_pages p
    JOIN wiki_spaces s ON s.id = p.space_id
    LEFT JOIN users ou ON ou.id = p.owner_user_id
   WHERE p.space_id = ? AND p.deleted_at IS NULL AND p.status <> 'draft'
   ORDER BY p.sort_order, p.title
`;

/** 同じフォルダの中で名前がぶつかったら id を足す（上書きで1枚消えるのを防ぐ） */
function uniqueName(used: Set<string>, base: string, id: string): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const withId = `${base} (${id})`;
  used.add(withId);
  return withId;
}

/**
 * `_database.md` の中で「ここから下は書き出しが付けた説明」を示す印。
 * **取り込み（`wiki-import.service.ts`）が同じ文字列で切ります。片方だけ直さないこと。**
 */
export const DATABASE_NOTE_MARKER = '<!-- wiki-export: ここから下は書き出しが付けた説明です -->';

/** 項目とビューの定義を `_database.md` にする。読める表 ＋ 取り込み用の JSON */
export function databaseToMarkdown(page: Row, items: WikiItem[], views: unknown[]): string {
  const lines: string[] = [];
  const body = String(page.body_md ?? '').trim();
  if (body) lines.push(body, '');
  // ⚠️ この印から下は**書き出しが付けた説明**。取り込み（`wiki-import.service.ts`）は
  //    ここで切って、上だけを本文として戻す（項目の表が本文に二重に残らないように）
  lines.push(DATABASE_NOTE_MARKER, '');
  lines.push('## 項目', '');
  lines.push('| 項目 | 種類 | 必須 | 選択肢 |', '| --- | --- | --- | --- |');
  for (const item of items) {
    const options = (item.options ?? []).map((o) => o.value).join(' / ');
    lines.push(`| ${item.name} | ${item.type} | ${item.required ? '必須' : ''} | ${options} |`);
  }
  if (items.length === 0) lines.push('| （項目なし） | | | |');
  lines.push('', '## ビュー', '');
  for (const view of views as Array<{ name?: string; type?: string }>) {
    lines.push(`- ${view.name ?? ''}（${view.type ?? ''}）`);
  }
  if (views.length === 0) lines.push('- （ビューなし）');
  lines.push(
    '',
    '<!-- 取り込み（POST /wiki/import）はこの JSON から項目とビューを戻します。消さないでください -->',
    '',
    '```json wiki-database',
    JSON.stringify({ items, views }, null, 2),
    '```',
    '',
  );
  return serializeFrontMatter(frontMatterOf(page), lines.join('\n'));
}

/**
 * 書き出しが置く README だと分かる印。
 *
 * ⚠️ **取り込みは「名前が README」ではなく、この印で飛ばします。**
 * Obsidian も Notion も `README.md` を**ふつうのページ**として書き出します。
 * 名前だけで捨てていたころは、そういう zip を取り込むと**そのページが黙って消え**、
 * README しか無い zip は「取り込めるページがありません」になりました
 *（Codex の指摘・P1）。印は HTML のコメントなので画面には出ません。
 */
export const EXPORT_README_MARKER = '<!-- gmo-onair-wiki-export -->';

/** README（何が入っているか）。展開した人が最初に開く */
function readmeOf(space: Row, pageCount: number, fileCount: number): string {
  return [
    EXPORT_README_MARKER,
    `# ${String(space.name)} の書き出し`,
    '',
    `- スペース: ${String(space.name)}（\`${String(space.key)}\`）`,
    `- 書き出した日時: ${new Date().toISOString()}`,
    `- ページ: ${pageCount} 件 ／ 画像: ${fileCount} 件`,
    '',
    '## 中身',
    '',
    '- ページ1枚が `.md` 1本です。先頭の `---` で挟んだ部分が題・タグ・担当・見直し予定です',
    '- 子ページは、親と同じ名前のフォルダの中にあります',
    '- データベースはフォルダで、`_database.md`（項目とビュー）・`_index.csv`（一覧）・行ごとの `.md` が入っています',
    '- 本文が指している画像は `files/` にあります。ファイル名は本文のリンクの末尾（`wf-…`）と同じです',
    '',
    '## 戻すとき',
    '',
    'この zip はそのまま `POST /api/v1/internal/wiki/import` に渡せます（取り込み先のスペースは指定します）。',
    'Obsidian で開くこともできます（`.md` のフォルダ構成のままです）。',
    '',
  ].join('\n');
}

export interface WikiExportResult {
  fileName: string;
  buffer: Buffer;
  pageCount: number;
  fileCount: number;
}

/** 本文が指している画像の id（`/wiki/files/:id`。API の前置きは変わりうるので末尾で拾う） */
export function referencedFileIds(body: string): string[] {
  const out = new Set<string>();
  const re = /\/wiki\/files\/([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.add(m[1]);
  return [...out];
}

/**
 * スペース1つを zip にする。
 * **読めないスペースは 404**（`getSpaceByKey` が投げる・存在ごと隠す）。
 */
export async function exportSpaceZip(user: WikiUser, spaceKey: string): Promise<WikiExportResult> {
  const space = await getSpaceByKey(user, spaceKey);
  const pages = await queryAll(PAGE_SELECT, [String(space.id)]);
  if (pages.length > MAX_EXPORT_PAGES) {
    throw new ValidationError(
      `ページが ${MAX_EXPORT_PAGES} 件を超えているため書き出せません。スペースを分けてからお試しください。`,
    );
  }

  /*
   * ⚠️ **親が書き出しに入っていないページは、根に置きます。**
   *
   * 下書きの親の下に公開のページがあると（親を下書きのまま作って、子だけ公開した形）、
   * 親は `status <> 'draft'` で落ちるので、子の `parent_id` はどこにも無い id になります。
   * 「親と同じ名前のフォルダ」を作る相手が居ないため、**そのページは zip に1本も
   * 書かれないのに README の件数には入っている**（＝黙って消える）状態でした。
   * 根に上げれば中身は落ちません（親子の形は戻せませんが、親そのものを
   * 書き出さない以上ほかに置き場がありません）。検証用 Postgres で実測して見つけました。
   */
  const exported = new Set(pages.map((p) => String(p.id)));
  const byParent = new Map<string, Row[]>();
  for (const page of pages) {
    const parent = page.parent_id ? String(page.parent_id) : '';
    const key = parent && exported.has(parent) ? parent : '';
    const list = byParent.get(key) ?? [];
    list.push(page);
    byParent.set(key, list);
  }

  const zip = new JSZip();
  const fileIds = new Set<string>();

  /** データベースは項目とビューを別の表から引くので、いったん覚えて後でまとめて書く */
  const databaseJobs: Array<{ page: Row; dir: string; rows: Row[] }> = [];

  const collectFiles = (page: Row) => {
    for (const id of referencedFileIds(String(page.body_md ?? ''))) fileIds.add(id);
  };

  /** ページ1枚を書く。データベースならフォルダに `_database.md` と一覧も置く */
  const writePage = (page: Row, dir: string, used: Set<string>, depth: number): void => {
    collectFiles(page);
    const id = String(page.id);
    const children = byParent.get(id) ?? [];
    const base = safeSegment(String(page.title ?? '')) || id;

    if (page.kind === 'database') {
      const folder = uniqueName(used, base, id);
      databaseJobs.push({ page, dir: `${dir}${folder}/`, rows: children });
      return;
    }

    const name = uniqueName(used, base, id);
    zip.file(`${dir}${name}.md`, pageToMarkdown(page));
    if (children.length === 0 || depth >= MAX_DEPTH) return;
    const childUsed = new Set<string>();
    for (const child of children) writePage(child, `${dir}${name}/`, childUsed, depth + 1);
  };

  /*
   * ⚠️ **`README` は先に押さえておきます。** 根に「README」という題のページが
   * あると `README.md` に書かれ、そのあと下で書く**案内の README が同じ名前で
   * 上書き**します（JSZip は後勝ち）。件数には入っているのに中身が消えるので、
   * 取り込み直すとそのページの本文が（子が無ければページごと）失われていました
   * （Codex の指摘・P1）。押さえておけば `README (wp-xxxx)` になって逃げます。
   */
  const rootUsed = new Set<string>(['README']);
  for (const page of byParent.get('') ?? []) writePage(page, '', rootUsed, 0);

  // データベース（項目とビューは別の表にあるので、ここで1件ずつ引く）
  for (const job of databaseJobs) {
    const { items, views } = await loadDefinition(String(job.page.id));
    zip.file(`${job.dir}_database.md`, databaseToMarkdown(job.page, items, views));
    /*
     * ⚠️ **データベースの下のデータベースは「行」ではありません。**
     * ツリーの `+` からデータベースの下にデータベースを足せます。全部を行として
     * 1枚の `.md` に書いていたころは、**項目とビューの定義（`wiki_databases`）が
     * 1行も書かれず**、取り込み直すとただのページに化けていました
     *（Codex の指摘・P1）。フォルダとして書き直します。
     */
    const nestedDatabases = job.rows.filter((r) => r.kind === 'database');
    const plainRows = job.rows.filter((r) => r.kind !== 'database');

    const rows = plainRows.map((r) => ({
      title: String(r.title ?? ''),
      props: ((r.props as Record<string, WikiPropValue> | null) ?? {}),
    }));
    zip.file(`${job.dir}_index.csv`, buildRowsCsv(items, rows));
    const used = new Set<string>(['_database', '_index']);

    // 入れ子のデータベースは `writePage` に任せる（新しい仕事が下の輪に積まれる）
    for (const nested of nestedDatabases) writePage(nested, job.dir, used, 1);

    for (const row of plainRows) {
      collectFiles(row);
      const name = uniqueName(used, safeSegment(String(row.title ?? '')) || String(row.id), String(row.id));
      zip.file(`${job.dir}${name}.md`, pageToMarkdown(row));
      /*
       * ⚠️ **行の下のページも書きます。** 行はページなので子を持てます
       *（ツリーの `+` から足せます）。ここで止めていたころは、孫から下が
       * **zip に1本も書かれないのに README の件数には入って**いました
       *（＝足りないことに気づけない。Codex の指摘・P1）。
       */
      const grandChildren = byParent.get(String(row.id)) ?? [];
      if (grandChildren.length === 0) continue;
      const rowUsed = new Set<string>();
      for (const child of grandChildren) {
        writePage(child, `${job.dir}${name}/`, rowUsed, 1);
      }
    }
  }

  // 画像（本文が指しているものだけ。上げたまま使っていないものは入れない）
  let fileBytes = 0;
  let fileCount = 0;
  for (const id of fileIds) {
    try {
      const { row, absolutePath } = await getWikiFile(id);
      /*
       * ⚠️ **口（`GET /wiki/files/:id`）と同じ権限をここでも通します。**
       * 本文のリンクは誰でも書けるので、**読めるスペースの本文に、読めない
       * スペースの画像の URL を貼れば**、書き出しでその中身を取り出せて
       * いました（Codex の指摘・P1）。判定は口と同じ:
       * ページに付いていれば `canReadPage`、付いていなければ上げた本人だけ。
       * 通らない画像は**黙って飛ばします**（本文のリンクはそのまま残るので、
       * 開けば 404 になります。書き出しごと失敗させる理由はありません）。
       */
      const filePageId = row.page_id ? String(row.page_id) : null;
      const allowed = filePageId
        ? await canReadPage(user, filePageId)
        : String(row.created_by ?? '') === user.id;
      if (!allowed) continue;
      const stat = fs.statSync(absolutePath);
      fileBytes += stat.size;
      if (fileBytes > MAX_EXPORT_FILE_BYTES) {
        throw new ValidationError(
          '画像の合計が大きすぎるため書き出せません。大きなものは BOX のリンクに置き換えてからお試しください。',
        );
      }
      const ext = path.extname(String(row.storage_path)) || '.bin';
      zip.file(`files/${id}${ext}`, fs.readFileSync(absolutePath));
      fileCount += 1;
    } catch (e) {
      if (e instanceof ValidationError) throw e;
      // 消えた画像で書き出しごと失敗させない（本文のリンクはそのまま残る）
    }
  }

  zip.file('README.md', readmeOf(space, pages.length, fileCount));
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return {
    fileName: `${safeSegment(String(space.name)) || String(space.key)}.zip`,
    buffer,
    pageCount: pages.length,
    fileCount,
  };
}
