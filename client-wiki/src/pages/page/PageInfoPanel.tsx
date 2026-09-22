/**
 * 右パネルの「情報」（§6-②）
 *
 * 段A は**読むだけ**。担当・見直し期限・タグをその場で編集できるようにするのは
 * 段B（本文の編集ロックとは別の口として作る）。
 */
import { Link } from 'react-router-dom';
import type { WikiPage } from '@gmo-onair/shared/src/wiki/types';
import { reviewByLabel, reviewRemainLabel, stampLabel, revLabel } from '@/lib/wikiFormat';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <span className="w-[84px] shrink-0 pt-1 text-th text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-sub text-foreground">{children}</span>
    </div>
  );
}

export default function PageInfoPanel({ page }: { page: WikiPage }) {
  const trail = [page.space_name, ...(page.breadcrumb ?? []).map((b) => b.title)].filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      <Field label="担当">{page.owner_name ?? '—'}</Field>

      <Field label="見直し期限">
        {page.review_by ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-control border border-border px-2 text-sub text-foreground">
              {reviewByLabel(page.review_by)}
            </span>
            <span className="text-sub-sm text-muted-foreground">{reviewRemainLabel(page.review_by)}</span>
          </span>
        ) : (
          '—'
        )}
      </Field>

      <Field label="タグ">
        {page.tags.length === 0 ? (
          '—'
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {page.tags.map((t) => (
              <span key={t} className="inline-flex h-6 items-center rounded-control bg-muted px-2 text-sub-sm text-foreground">
                {t}
              </span>
            ))}
          </span>
        )}
      </Field>

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
