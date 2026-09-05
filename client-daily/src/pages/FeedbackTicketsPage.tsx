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
 *
 * ── 絞り込みはサーバーに投げる。件数は `/counts` から読む（レビュー #561 で直した） ──
 *
 * 以前は「全件取ってから画面で filter」していたため、一覧に上限を付けると
 * 絞り込みチップの件数まで一緒に切れてしまう（「入ってきた情報」で踏んだのと同じ形）。
 * いまは状態・対象アプリ・検索を `useFeedbackTickets` の引数として渡し、サーバー側で
 * 絞り込んだ（かつ上限つきの）結果だけを受け取る。チップの件数は絞り込みの影響を受けない
 * `useFeedbackTicketCounts`（COUNT）から読むので、一覧が上限で切れても数字は嘘にならない。
 * ⚠️ **チップの件数はどの軸も「その軸だけの総数」**（対象アプリの件数は状態を無視した総数）。
 * `SecurityCardsPage` の状態チップ・分類チップも同じ考え方（互いにクロス集計しない）で、
 * それに揃えてある——揃えないと「状態チップは状態だけの数・アプリチップは掛け合わせた数」の
 * ように**チップごとに意味が変わり**、そちらのほうが読み間違えやすい。
 *
 * ── 上限を超える分は「さらに読み込む」で追う（レビュー #562 で追加） ──
 *
 * 一覧は上限つき（既定50件）なので、それを超える一致があるときは末尾に
 * 「さらに読み込む」を出す（`financeDashboard/Breakdown.tsx` と同じ考え方）。
 * ⚠️ **絞り込みを変えたときの上限のリセットは `useEffect` ではなく描画中に行う**
 * （レビュー #562 で追加の指摘）。`useEffect` だと「新しい絞り込み ＋ 古い（伸ばした）上限」
 * の組み合わせで1回だけ問い合わせが飛んでから直後にもう1回飛び直す — React 公式の
 * 「Adjusting state when a prop changes」の形（前回の鍵を state に持ち、変わっていたら
 * 描画の途中で `setLimit` を呼ぶ）に倣うと、コミットされない描画のうちに直るので
 * 無駄な問い合わせが立たない。
 *
 * ── 0件の判定は「実際に返ってきた行」を優先する（レビュー #562 で直した） ──
 *
 * `tickets`（一覧）と `counts`（総数）は別々の問い合わせなので、更新のタイミングが
 * ずれる。**`visible.length > 0` を最優先で見る**——これを怠ると、`counts` がまだ
 * 古いキャッシュ（0件）を持っている間に一覧だけ更新された瞬間、**行があるのに
 * 「まだありません」と出る**。`counts` が失敗したときも同じ理由で「0件」とは断定せず
 * （`Breakdown.tsx` の「数えられなかったときは0と言わない」と同じ考え方）、
 * 絞り込みが効いているだけと見なして `NoSearchResults` 側に倒す。
 */
import { useMemo, useState } from 'react';
import { Loader2, MessageSquareWarning, Plus, Search, X } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, ErrorPanel, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { useDebounced } from '@gmo-onair/shared/src/client/hooks/useDebounced';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/usePermissions';
import {
  STATUS_LABELS, TARGET_APPS, TARGET_APP_LABEL, useCreateFeedbackTicket, useFeedbackTicketCounts,
  useFeedbackTickets, type CreateTicketInput, type FeedbackTicket, type TicketStatus,
} from '@/lib/feedbackTicketsApi';
import { TicketForm } from './feedbackTickets/TicketForm';
import { TicketDetailDialog } from './feedbackTickets/TicketDetailDialog';
import { TicketRow, TicketRowsHeader } from './feedbackTickets/TicketRows';
import { TicketCards } from './feedbackTickets/TicketCards';

type StatusFilter = 'all' | TicketStatus;

// サーバー側の既定・上限と揃える（`feedback-ticket.service.ts` の DEFAULT_LIST_LIMIT/MAX_LIST_LIMIT）
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export default function FeedbackTicketsPage() {
  const isMobile = useIsMobile();
  const { canEdit } = usePermissions();
  const counts = useFeedbackTicketCounts();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [targetApp, setTargetApp] = useState('');
  const [search, setSearch] = useState('');
  // **問い合わせの鍵だけ遅らせる**（入力欄自体は遅らせない・`useDebounced` の決めごと）
  const debouncedSearch = useDebounced(search);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<FeedbackTicket | null>(null);

  // 絞り込みを変えたら「さらに読み込む」で伸ばした分は最初からやり直す。
  // **描画の途中でリセットする**（前回の鍵を覚えておき、変わっていたらこの描画中に
  // `setLimit` を呼ぶ）— `useEffect` だと反映が1テンポ遅れ、「新しい絞り込み ＋
  // 古い上限」のままの問い合わせが一度飛んでしまう（冒頭のコメント参照）
  const filterKey = `${status}|${targetApp}|${debouncedSearch}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setLimit(PAGE_SIZE);
  }

  const tickets = useFeedbackTickets({
    status: status === 'all' ? undefined : status,
    target_app: targetApp || undefined,
    search: debouncedSearch.trim() || undefined,
    limit,
  });
  const createTicket = useCreateFeedbackTicket();

  const visible = useMemo(() => tickets.data ?? [], [tickets.data]);

  // チップの件数はどれも `/counts`（COUNT）から読む。**軸ごとの総数**であって、
  // 他の軸の絞り込みとは掛け合わせない（冒頭のコメント参照）
  const statusCounts = useMemo(() => ({
    all: counts.data?.all ?? null,
    open: counts.data?.open ?? null,
    in_progress: counts.data?.in_progress ?? null,
    resolved: counts.data?.resolved ?? null,
    rejected: counts.data?.rejected ?? null,
  } as Record<StatusFilter, number | null>), [counts.data]);

  const appCounts = useMemo(() => ({
    '': counts.data?.all ?? null,
    ...Object.fromEntries(TARGET_APPS.map((a) => [a.key, counts.data?.byTargetApp[a.key] ?? (counts.data ? 0 : null)])),
  } as Record<string, number | null>), [counts.data]);

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
      ) : visible.length > 0 ? (
        <>
          {isMobile ? (
            <TicketCards tickets={visible} onSelect={setSelected} />
          ) : (
            <div className="rounded-card border border-border bg-card">
              <TicketRowsHeader />
              <div className="flex flex-col">
                {visible.map((t) => <TicketRow key={t.id} ticket={t} onSelect={() => setSelected(t)} />)}
              </div>
            </div>
          )}
          {/* **上限で切れているかもしれない目安**は「ちょうど上限件返ってきたか」で判定する
              （厳密な残り件数は絞り込みを跨いだ COUNT が無いと出せない）。押すと伸ばす */}
          {visible.length === limit && (
            limit < MAX_PAGE_SIZE ? (
              <Button
                variant="outline"
                className="self-center"
                onClick={() => setLimit((l) => Math.min(l + PAGE_SIZE, MAX_PAGE_SIZE))}
                disabled={tickets.isFetching}
              >
                {tickets.isFetching && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                さらに読み込む
              </Button>
            ) : (
              <p className="text-note text-center text-muted-foreground">
                {MAX_PAGE_SIZE}件まで表示しています。絞り込みを使うとほかの一致も見つけやすくなります。
              </p>
            )
          )}
        </>
      ) : counts.isLoading ? (
        <Delayed><SkeletonRows rows={6} /></Delayed>
      ) : !counts.isError && counts.data?.all === 0 ? (
        <EmptyState
          icon={<MessageSquareWarning />}
          title="フィードバックチケットはまだありません"
          description="GMO ONAiR への要望・不具合報告に気づいたら、右上の「チケットを起票する」から起こしてください。"
        />
      ) : (
        // **問い合わせに使った語（`debouncedSearch`）を出す。** 入力欄の `search` を
        // そのまま出すと、打っている途中の300msの間だけ「まだ問い合わせていない語」
        // に一致が無いと言い切ってしまう（レビュー #562 で指摘）
        <NoSearchResults
          keyword={debouncedSearch.trim() || undefined}
          activeFilters={[
            status === 'all' ? '' : `状態: ${STATUS_LABELS[status]}`,
            targetApp ? `アプリ: ${TARGET_APP_LABEL[targetApp]}` : '',
          ].filter(Boolean)}
          onClearFilters={clearFilters}
        />
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
