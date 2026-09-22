/**
 * 右パネルの「情報」（§6-②）
 *
 * 担当・見直し予定・タグは**その場で直せます**（`components/page/PageInfoFields.tsx`）。
 * **本文の編集ロックとは別**なので、誰かが本文を書いている最中でも直せます。
 * 直す権限（editor）が無い人には、同じ場所に読むだけの表示が出ます。
 *
 * ⚠️ **「期限切れ」とは書きません。** 見直し予定日を過ぎても中身が無効になる
 * わけではないので、項目名は「見直し予定」、印は「要見直し」です（ご指摘）。
 */
import { Link } from 'react-router-dom';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import { usePermissions } from '@/hooks/usePermissions';
import { OwnerField, ReviewByField, TagsField } from '@/components/page/PageInfoFields';
import RowPropsFields from '@/components/items/RowPropsFields';
import { stampLabel, revLabel } from '@/lib/wikiFormat';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span className="w-[84px] shrink-0 pt-1 text-th text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sub text-foreground">{children}</span>
    </div>
  );
}

export default function PageInfoPanel({ page }: { page: WikiPage }) {
  const { canEdit } = usePermissions();
  const trail = [page.space_name, ...(page.breadcrumb ?? []).map((b) => b.title)].filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      <Field label="担当"><OwnerField page={page} canEdit={canEdit} /></Field>
      <Field label="見直し予定"><ReviewByField page={page} canEdit={canEdit} /></Field>
      <Field label="タグ"><TagsField page={page} canEdit={canEdit} /></Field>

      {/*
        データベースの行（`kind='database'` のページの子）のときだけ、親で決めた
        項目の値がここに並ぶ（§6-⑩「行を押すとその行ページ」）。
        ふつうのページでは何も出ない（通信も起きない）
      */}
      <RowPropsFields page={page} canEdit={canEdit} />

      <Field label="スペース">{trail.join(' ／ ')}</Field>
      <Field label="作成">{stampLabel(page.created_at)} ・ {page.creator_name ?? '—'}</Field>
      <Field label="更新">
        {stampLabel(page.updated_at)} ・ {page.updater_name ?? '—'} ・ {revLabel(page.rev)}
      </Field>
      {page.view_count_30d !== undefined && (
        <Field label="閲覧">
          30日で {page.view_count_30d}回
          {page.view_from_answer_30d !== undefined && `（うち AI の出典から ${page.view_from_answer_30d}回）`}
        </Field>
      )}

      <div className="mt-2 border-t border-border-faint pt-3">
        <div className="mb-2 text-th text-muted-foreground">このページへのリンク元</div>
        {!page.backlinks || page.backlinks.length === 0 ? (
          <p className="text-sub-sm text-muted-foreground">
            このページを指しているページはまだありません。
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {page.backlinks.map((b) => (
              <Link
                key={b.id}
                to={`/p/${b.id}`}
                className="flex min-h-tap items-center gap-2 rounded-control px-1 text-sub text-foreground no-underline hover:bg-muted lg:min-h-0 lg:h-8"
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-badge-xs bg-primary"
                  style={b.color ? { backgroundColor: b.color } : undefined}
                  aria-hidden
                />
                <span className="truncate">{b.title}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
