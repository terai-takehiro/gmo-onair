/**
 * Wiki — ページを `.md` にする（`docs/design/v4/wiki.md` §5-2 の約束3-1・段D）。
 *
 * `.md` の口は3つあり（REST・MCP・スペースまるごとの zip）、**3つとも同じ形**を出します。
 * 組み立てをここ1か所に置いているのはそのためです（段E の MCP もここを呼びます）。
 *
 * ⚠️ **本文はそのまま出します。** 画像のリンク（`/api/v1/internal/wiki/files/:id`）も
 * 書き換えません——本文の正は `body_md` の文字列そのもの、という約束1 を、
 * 書き出した `.md` でも崩さないためです。zip の `files/` は同じ id の名前で同梱します。
 */
import type { Row } from '../../../shared/db/connection';
import { serializeFrontMatter, type WikiFrontMatter } from '../wiki-front-matter';
import type { WikiPropValue } from '../wiki-props';
import { assertReadablePage, type WikiUser } from './wiki-access.service';
import { selectPageRow } from './wiki-page.service';

/** ISO の文字列にする（`updated` の見出し。`Date` でも文字列でも同じ形にする） */
function isoOf(v: unknown): string {
  if (!v) return '';
  const d = new Date(v as string);
  return Number.isFinite(d.getTime()) ? d.toISOString() : String(v);
}

/**
 * ページ1行から YAML の見出しを組み立てる。
 *
 * - `space` は URL に出る短い英数字（`key`）。id ではない（人が読んで分かる側）
 * - `owner` は**担当の氏名**。id を書いても人にも AI にも意味が無い。
 *   ⚠️ そのぶん**取り込みでは担当を戻しません**（同姓同名がありうるので id を当てられない）
 * - `props` は値が1つでもあるときだけ（データベースの行）
 */
export function frontMatterOf(page: Row): WikiFrontMatter {
  const props = (page.props as Record<string, WikiPropValue> | null) ?? {};
  return {
    id: String(page.id),
    title: String(page.title ?? ''),
    space: page.space_key ? String(page.space_key) : undefined,
    parent: page.parent_id ? String(page.parent_id) : undefined,
    tags: Array.isArray(page.tags) ? (page.tags as string[]) : [],
    owner: page.owner_name ? String(page.owner_name) : undefined,
    review_by: page.review_by ? String(page.review_by) : undefined,
    status: (page.status as WikiFrontMatter['status']) ?? undefined,
    updated: isoOf(page.updated_at),
    props: Object.keys(props).length > 0 ? props : undefined,
  };
}

/** ページ1行を `.md`（YAML の見出し ＋ 本文）にする */
export function pageToMarkdown(page: Row): string {
  return serializeFrontMatter(frontMatterOf(page), String(page.body_md ?? ''));
}

/**
 * ファイル名に使える形にする。
 *
 * ⚠️ **記号は落とします** — `/` `\` `:` `*` `?` `"` `<` `>` `|` が入ると、
 * zip を展開できない OS があります。空になったら呼ぶ側が id を使います。
 */
export function safeSegment(title: string): string {
  return String(title)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // 末尾の `.` はWindows が消すので落とす
    .replace(/\.+$/, '')
    .slice(0, 60);
}

/** `.md` の名前（題が空なら id）。`GET /wiki/pages/:id.md` の保存名にも使う */
export function mdFileName(title: string, pageId: string): string {
  return `${safeSegment(title) || pageId}.md`;
}

export interface WikiPageMarkdown {
  markdown: string;
  fileName: string;
  updated_at: string;
}

/**
 * `GET /wiki/pages/:id.md` の中身。
 * **読めないページは 404**（`assertReadablePage`。存在ごと隠す・§8）。
 */
export async function getPageMarkdown(user: WikiUser, pageId: string): Promise<WikiPageMarkdown> {
  await assertReadablePage(user, pageId);
  const page = await selectPageRow(pageId);
  return {
    markdown: pageToMarkdown(page),
    fileName: mdFileName(String(page.title ?? ''), String(page.id)),
    updated_at: isoOf(page.updated_at),
  };
}
