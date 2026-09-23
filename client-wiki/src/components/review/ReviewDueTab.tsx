/**
 * ⑦-① 見直し予定（`docs/design/v4/wiki.md` §6-⑦・モック `Review.dc.html`）
 *
 * 1行＝ページ。**予定日を過ぎた・14日以内・担当が空**の3種類が並びます。
 *
 * ⚠️ **「期限切れ」とは書きません**（2026-09-22 のご指摘）。印は「要見直し」、
 * 列の名前は「見直し予定」です（`reviewLabels.ts` の冒頭）。
 *
 * ⚠️ **スマホでは表を横に流しません。** 1024px 未満では列をやめて
 * 「題 ＋ 場所 ＋ 担当・予定日・最終更新の1行」に畳み、操作は下に回します
 * （横スクロールする表は、指で押す前に列が隠れて何の行か分からなくなる）。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, Check, Pencil } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import { Delayed, EmptyState, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import type { WikiReviewRow } from '@gmo-onair/shared/src/wiki/types';
import { wikiKeys } from '@/lib/wikiApi';
import { reviewByLabel, reviewRemainLabel, updatedLabel } from '@/lib/wikiFormat';
import { cn } from '@/lib/utils';
import { BUCKET_TONE, type ReviewBucket } from './reviewLabels';
import { postPageReviewed, reviewKeys } from './reviewApi';

/** 区分の印。淡い面＋濃い文字（モック `Review.dc.html` の実測・高さ 22px） */
function BucketChip({ bucket, className }: { bucket: ReviewBucket; className?: string }) {
  const tone = BUCKET_TONE[bucket];
  return (
    <span
      className={cn(
        'inline-flex h-[22px] min-w-[72px] shrink-0 items-center justify-center',
        'whitespace-nowrap rounded-badge border px-2 text-badge',
        tone.cls,
        className,
      )}
      title={tone.note}
    >
      {tone.label}
    </span>
  );
}

export interface ReviewDueTabProps {
  rows: WikiReviewRow[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** 「見直した」は editor（§8）。無い人には出さず、読むことはできる */
  canEdit: boolean;
  /** スペースで絞っているか（0件のときの案内を変える） */
  filtered: boolean;
}

export default function ReviewDueTab({ rows, loading, error, onRetry, canEdit, filtered }: ReviewDueTabProps) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const reviewed = useMutation({
    meta: { action: '「見直した」を記録' },
    mutationFn: (page: WikiReviewRow) => postPageReviewed(page.id),
    onSuccess: (_data, page) => {
      void qc.invalidateQueries({ queryKey: reviewKeys.due() });
      // ホームの案内（自分が担当で予定日を過ぎたページ）も同じ値を見ている
      void qc.invalidateQueries({ queryKey: wikiKeys.home() });
      void qc.invalidateQueries({ queryKey: wikiKeys.page(page.id) });
      notifySuccess('見直しを記録しました', {
        description: `「${page.title}」の次の見直し予定日を入れ直しました。本文は変えていません。`,
      });
    },
    onSettled: () => setBusyId(null),
  });

  const askAndMark = async (page: WikiReviewRow) => {
    const ok = await confirmAction({
      title: `「${page.title}」は見直し済みにしますか？`,
      description: '本文はそのままで、次の見直し予定日だけを入れ直します。直すところがあるときは「編集」から本文を直してください。',
      confirmLabel: '見直した',
    });
    if (!ok) return;
    setBusyId(page.id);
    reviewed.mutate(page);
  };

  if (error) {
    return (
      <ErrorPanel
        title="見直し予定のページを読み込めませんでした"
        error={error}
        onRetry={onRetry}
      />
    );
  }
  if (loading) {
    return <Delayed><SkeletonRows rows={5} /></Delayed>;
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="h-6 w-6" aria-hidden />}
        title={filtered ? 'このスペースに見直すページはありません' : 'いま見直すページはありません'}
        description={
          filtered
            ? 'ほかのスペースを選ぶか、「すべてのスペース」に戻すと全部が出ます。'
            : '見直し予定日を入れたページだけがここに出ます。予定日はページの「情報」で決められます。'
        }
      />
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
      {/* 表頭は列を出す幅（1024px 以上）でだけ。狭い幅では行が畳まれるので意味が無い */}
      <div className="text-th hidden items-center gap-3 border-b border-border-subtle bg-surface-subtle px-4 py-2 text-muted-foreground lg:flex">
        <span className="w-[76px] shrink-0">状態</span>
        <span className="min-w-0 flex-1">ページ</span>
        <span className="w-[96px] shrink-0">担当</span>
        <span className="w-[132px] shrink-0">見直し予定</span>
        <span className="w-[96px] shrink-0">最終更新</span>
        <span className="w-[176px] shrink-0" />
      </div>

      <ul className="flex flex-col">
        {rows.map((row) => {
          const due = reviewByLabel(row.review_by);
          const remain = reviewRemainLabel(row.review_by);
          const busy = busyId === row.id;
          return (
            <li key={row.id} className="border-b border-border-faint last:border-b-0">
              {/* 畳んだ幅では印を題の1行目に合わせる（真ん中に置くと何の印か読み取りにくい） */}
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4 lg:flex-nowrap lg:items-center lg:py-2">
                <BucketChip bucket={row.bucket} className="mt-1.5 lg:mt-0" />

                {/*
                  **押せる場所はこのかたまり全体**。題だけをリンクにすると、
                  スマホでは高さ 20px の帯を狙うことになります（タップ領域は最低 44px）。
                */}
                <Link
                  to={`/p/${row.id}`}
                  className="group block min-h-tap min-w-0 flex-1 basis-[55%] py-1 no-underline lg:min-h-0 lg:py-0"
                >
                  <span className="block truncate text-list text-foreground group-hover:underline">
                    {row.title}
                  </span>
                  <span className="block truncate text-sub-sm text-muted-foreground">{row.path}</span>
                  {/* 列を出せない幅では、担当・予定日・最終更新をこの1行にまとめる */}
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sub-sm text-muted-foreground lg:hidden">
                    <span>担当 {row.owner_name ?? '未定'}</span>
                    <span>見直し予定 {due || '—'}{remain ? `（${remain}）` : ''}</span>
                    <span>更新 {updatedLabel(row.updated_at)}</span>
                  </span>
                </Link>

                <span className={cn(
                  'hidden w-[96px] shrink-0 truncate text-sub lg:block',
                  row.owner_name ? 'text-foreground' : 'text-muted-foreground',
                )}
                >
                  {row.owner_name ?? '未定'}
                </span>
                <span className="hidden w-[132px] shrink-0 text-sub tabular-nums text-foreground lg:block">
                  {due || '—'}
                  {remain && <span className="ml-1 text-sub-sm text-muted-foreground">{remain}</span>}
                </span>
                <span className="hidden w-[96px] shrink-0 truncate text-sub tabular-nums text-muted-foreground lg:block">
                  {updatedLabel(row.updated_at)}
                </span>

                <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto lg:w-[176px] lg:justify-end">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="min-h-tap flex-1 sm:flex-none lg:min-h-0"
                  >
                    <Link to={`/p/${row.id}/edit`}>
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden />
                      編集
                    </Link>
                  </Button>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void askAndMark(row)}
                      className="min-h-tap flex-1 border-success-border bg-success-surface text-success sm:flex-none lg:min-h-0"
                    >
                      <Check className="mr-1.5 h-4 w-4" aria-hidden />
                      見直した
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-border-faint px-4 py-3 text-sub-sm text-muted-foreground">
        「見直した」は本文を変えずに次の見直し予定日を入れ直します（履歴に「見直し」として残ります）。
        見直し予定日は任意で、入れたページだけここに出ます。
        担当が決まっていないページは、スペースの担当が引き受けるか、ページの「情報」で誰かに割り当ててください。
      </p>
    </div>
  );
}
