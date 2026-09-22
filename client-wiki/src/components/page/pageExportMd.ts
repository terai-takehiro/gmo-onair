/**
 * ページを `.md` で保存する（§5-2 の約束3）
 *
 * ⚠️ **いまはクライアントで組み立てています。** 本来の口は
 * `GET /api/v1/wiki/pages/:id.md`（設計 §5-2 の1）ですが、これは段D の担当です。
 * 段D でその口ができたら、ここは**その URL を開くだけ**に置き換えてください
 * （そうすればサーバーと書式が二度と食い違いません）。
 *
 * YAML の見出しの組み立ては `shared/src/wiki/frontMatter.ts` の
 * `serializeFrontMatter` を使います — サーバーと同じ関数なので、
 * 置き換えたときに中身が変わりません。
 */
import { serializeFrontMatter } from '@gmo-onair/shared/src/wiki/frontMatter';
import type { WikiFrontMatter, WikiPage } from '@gmo-onair/shared/src/wiki/types';

/** ファイル名に使えない文字を落とす（Windows・macOS の両方で開けるように） */
export function safeFileName(title: string, fallback: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${cleaned || fallback}.md`;
}

/** ページを `.md` の中身（YAML の見出し ＋ 本文）にする */
export function pageToMarkdown(page: WikiPage): string {
  const fm: WikiFrontMatter = {
    id: page.id,
    title: page.title,
    space: page.space_key ?? page.space_name ?? undefined,
    parent: page.parent_id ?? undefined,
    tags: page.tags,
    // **人が読める名前を入れます**（id を入れても、開いた人には誰か分かりません）。
    // 取り込み直すときは名前から引き当てます（段D）
    owner: page.owner_name ?? undefined,
    review_by: page.review_by ?? undefined,
    status: page.status,
    updated: page.updated_at,
  };
  return serializeFrontMatter(fm, page.body_md ?? '');
}

/**
 * `.md` を端末に保存する。
 *
 * ⚠️ `URL.createObjectURL` で作った URL は**必ず捨てる**。捨てないと、
 * 書き出すたびに本文1本分がタブの寿命だけ残ります。
 */
export function downloadPageAsMarkdown(page: WikiPage): void {
  const blob = new Blob([pageToMarkdown(page)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFileName(page.title, page.id);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
