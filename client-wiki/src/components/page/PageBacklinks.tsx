/**
 * 「このページへのリンク元」（設計 §6-② 最後の行・段D）
 *
 * サーバーが `GET /wiki/pages/:id` に添えて返します（`wiki_links` を逆に引いたもの・
 * 新しい順に 50 件まで）。本文の中の `/wiki/p/:id` を保存のたびに拾い直しているので、
 * **書いた人が何もしなくても溜まります**（§5-3 の2）。
 *
 * ⚠️ **読めないスペースのページは入っていません。** サーバー側で閲覧範囲に絞って
 *    あります（§8「読めない人には存在ごと見えない」）。ここで足し直さないこと。
 *
 * ⚠️ **スペース名はいつも出しません。** 同じスペースの中のリンクが大半なので、
 *    全部に付けると同じ文字が縦に並ぶだけになります。**別のスペースから
 *    指されているときだけ**右に小さく出します（どこから来ているかが要る場面）。
 */
import { Link } from 'react-router-dom';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';

export type WikiBacklink = NonNullable<WikiPage['backlinks']>[number];

export default function PageBacklinks({
  backlinks,
  spaceName,
}: {
  backlinks: WikiBacklink[] | undefined;
  /** いま開いているページのスペース名（同じなら行に出さない） */
  spaceName?: string | null;
}) {
  const rows = backlinks ?? [];

  return (
    <div className="mt-2 border-t border-border-faint pt-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-th text-muted-foreground">このページへのリンク元</span>
        {rows.length > 0 && <span className="text-sub-sm text-muted-foreground">{rows.length}</span>}
      </div>

      {rows.length === 0 ? (
        <p className="text-sub-sm text-muted-foreground">
          このページを指しているページはまだありません。
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {rows.map((b) => (
            <Link
              key={b.id}
              to={`/p/${b.id}`}
              title={b.space_name ? `${b.space_name} ／ ${b.title}` : b.title}
              className="flex min-h-tap items-center gap-2 rounded-control px-1 text-sub text-foreground no-underline hover:bg-muted lg:h-8 lg:min-h-0"
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-badge-xs bg-primary"
                style={b.color ? { backgroundColor: b.color } : undefined}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate">{b.title}</span>
              {b.space_name && b.space_name !== spaceName && (
                <span className="shrink-0 text-sub-sm text-muted-foreground">{b.space_name}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
