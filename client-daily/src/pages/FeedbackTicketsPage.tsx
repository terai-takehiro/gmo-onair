/**
 * フィードバックチケット (`/feedback-tickets`) (v4・新規ミニアプリ・2026-09)
 *
 * GMO ONAiR 自体（このプラットフォームのどれかのブロックアプリ）への要望・不具合報告を
 * **起票**し、**対応状況**（未対応/対応中/対応済み/却下）を一覧で追いかける画面。
 *
 * ── 権限の切り分け ──────────────────────────────────────────
 *
 * **起票は全ユーザー**（`dailyops:reader` = このアプリを開ける人なら誰でも）。
 * **対応状況の更新（対応中にする/対応済みにする/却下する）は `dailyops:editor`**
 * — 「入ってきた情報」の状態遷移などと同じ切り分け。editor でない人が行を押しても
 * 中身は読める（`TicketDetailDialog` が読み取り専用で対応状況・対応コメントを見せる）。
 *
 * ── PC は表・スマホはカード ───────────────────────────────────
 *
 * 他の一覧画面（デイリーニュース報告など）と同じ形。列の詳細は `TicketRows.tsx`。
 */
import { useMemo, useState } from 'react';
import { MessageSquareWarning, Plus, Search, X } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import {
  STATUS_LABELS, TARGET_APPS, TARGET_APP_LABEL, useCreateFeedbackTicket, useFeedbackTickets,
  type CreateTicketInput, type FeedbackTicket, type TicketStatus,
} from '@/lib/feedbackTicketsApi';
import { TicketForm } from './feedbackTickets/TicketForm';
import { TicketDetailDialog } from './feedbackTickets/TicketDetailDialog';
import { TicketRow, TicketRowsHeader } from './feedbackTickets/TicketRows';
import { TicketCards } from './feedbackTickets/TicketCards';

type StatusFilter = 'all' | TicketStatus;

export default function FeedbackTicketsPage() {
  const isMobile = useIsMobile();
  const { canEdit } = usePermissions();
  const tickets = useFeedbackTickets();
  const createTicket = useCreateFeedbackTicket();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [targetApp, setTargetApp] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<FeedbackTicket | null>(null);

  const all = useMemo(() => tickets.data ?? [], [tickets.data]);

  // **件数はこの一覧から数える。** サーバーに `/counts` はあるが、
  // 絞り込み(対象アプリ・検索)まで反映した数はここでしか出せない
  const statusCounts = useMemo(() => ({
    all: all.length,
    open: all.filter((t) => t.status === 'open').length,
    in_progress: all.filter((t) => t.status === 'in_progress').length,
    resolved: all.filter((t) => t.status === 'resolved').length,
    rejected: all.filter((t) => t.status === 'rejected').length,
  } as Record<StatusFilter, number>), [all]);

  const appCounts = useMemo(() => ({
    '': all.length,
    ...Object.fromEntries(TARGET_APPS.map((a) => [a.key, all.filter((t) => t.target_app === a.key).length])),
  } as Record<string, number>), [all]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) =>
      (status === 'all' || t.status === status)
      && (!targetApp || t.target_app === targetApp)
      && (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
  }, [all, status, targetApp, search]);

  const submitNew = (fields: CreateTicketInput) => {
    createTicket.mutate(fields, {
      onSuccess: () => { setAdding(false); notifySuccess('チケットを起票しました'); },
      onError: (e) => notifyApiError('起票できませんでした', e),
    });
  };

  const clearFilters = () => { setStatus('all'); setTargetApp(''); setSearch(''); };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="フィードバックチケット"
        sub="GMO ONAiR への要望・不具合報告を起票し、対応状況を追いかけます"
        primaryAction={
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />チケットを起票する
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          label="対応状況で絞り込む"
          items={(['all', 'open', 'in_progress', 'resolved', 'rejected'] as StatusFilter[]).map((k) => ({
            key: k, label: k === 'all' ? 'すべて' : STATUS_LABELS[k], count: statusCounts[k],
          }))}
          value={status}
          onChange={(k) => setStatus(k as StatusFilter)}
        />
        <FilterChips
          label="対象アプリで絞り込む"
          items={[
            { key: '', label: 'すべてのアプリ', count: appCounts[''] },
            ...TARGET_APPS.map((a) => ({ key: a.key, label: TARGET_APP_LABEL[a.key], count: appCounts[a.key] ?? 0 })),
          ]}
          value={targetApp}
          onChange={setTargetApp}
        />
        <div className="relative min-w-0 flex-1 sm:max-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="題名・内容で探す"
            aria-label="チケットを探す"
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="検索を消す"
              data-ui="button"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-badge text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <p className="text-note text-muted-foreground">
          起票は誰でもできます。対応状況を変える（対応中にする・対応済みにする・却下する）には編集権限が要ります。
        </p>
      )}

      {tickets.isError ? (
        <ErrorPanel title="チケットを読み込めませんでした" error={tickets.error} onRetry={() => tickets.refetch()} />
      ) : tickets.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : all.length === 0 ? (
        <EmptyState
          icon={<MessageSquareWarning />}
          title="フィードバックチケットはまだありません"
          description="GMO ONAiR への要望・不具合報告に気づいたら、右上の「チケットを起票する」から起こしてください。"
        />
      ) : visible.length === 0 ? (
        <NoSearchResults
          keyword={search || undefined}
          activeFilters={[
            status === 'all' ? '' : `状態: ${STATUS_LABELS[status]}`,
            targetApp ? `アプリ: ${TARGET_APP_LABEL[targetApp]}` : '',
          ].filter(Boolean)}
          onClearFilters={clearFilters}
        />
      ) : isMobile ? (
        <TicketCards tickets={visible} onSelect={setSelected} />
      ) : (
        <div className="rounded-card border border-border bg-card">
          <TicketRowsHeader />
          <div className="flex flex-col">
            {visible.map((t) => <TicketRow key={t.id} ticket={t} onSelect={() => setSelected(t)} />)}
          </div>
        </div>
      )}

      {adding && (
        <TicketForm
          onCancel={() => setAdding(false)}
          onSubmit={submitNew}
          submitting={createTicket.isPending}
        />
      )}

      {selected && (
        <TicketDetailDialog ticket={selected} canEdit={canEdit} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
