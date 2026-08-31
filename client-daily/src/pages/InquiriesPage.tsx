/**
 * ⑤ 入ってきた情報（日常業務） (v4)
 *
 * **未仕分けを空にするための机です。**
 * 案件・営業・見積請求・内覧会のどれにも属さない有益な情報を AI が取り込み、
 * 人が「やること（チケット）／案件／あとで効く話（ストック）／見送り」に仕分けます。
 *
 * ── 247 で直したこと（ユーザー報告「結局何をしたいのかわからない」）──
 *
 * ① **ストックに出口を作った。** 「あとで効く話ならストックして」と謳いながら、
 *    ストックしたものを戻す仕掛けが**1つもありません**でした（見直す日も通知も無し）。
 *    実質「見送り」と同じで、行き先が2つあるように見えて違うのは名前だけ。
 *    ストックするときに**見直す日**を訊き（migration 247）、その日が来たものを
 *    未仕分けと同じ扱いで「今日さばくもの」に含めます
 * ② **タブを5つから3つに畳んだ。** 5つのうち4つが「受領証」で、
 *    そこでできることは「未仕分けに戻す」だけでした。片づいたものは
 *    1つのタブにまとめ、その中で行き先を絞れるようにしています
 * ③ **空の枠を描くのをやめた**（`SidePanels.tsx`）
 * ④ **PC 専用をやめた。** 現場で開くアプリなのに、仕分けの机だけ
 *    スマホから開けませんでした（スマホは `inquiries/InquiryCards.tsx` の2行カード）
 * ⑤ **一覧に上限を付けた。** 全 state・全件・ページングなしで引いてから
 *    画面側で絞っていたので、溜まるほど遅くなっていました。
 *    **件数はサーバーが COUNT で数えます**（運んだ行を数えると上限で切れた分だけ嘘になる）
 *
 * ── AI の印は `source` では判定しない ──────────────────────
 *
 * `source` は出どころであって「誰が入れたか」ではありません。
 * サーバーが `ai_outputs` に記録があるかを見て `is_ai` で返します。
 */
import { useMemo, useState } from 'react';
import { Sparkles, Tag } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { deskSummary, jaMd } from '@gmo-onair/shared/src/utils/inboxDesk';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { INQUIRY_STATE_LABELS, type MiscInquiry } from '@/lib/types';
import {
  useInquiries, useInquiryCounts, useInquiryTags, useMoveInquiry, useDeleteInquiry,
  type InquiryListParams,
} from '@/lib/inboxApi';
import { InquiryDialog } from './inquiries/InquiryDialog';
import { TicketDialog } from './inquiries/TicketDialog';
import { StockDialog } from './inquiries/StockDialog';
import { SidePanels } from './inquiries/SidePanels';
import { InquiryCards } from './inquiries/InquiryCards';
import { InquiryRows } from './inquiries/InquiryRows';
import {
  TAB_LABEL, SORTED_STATES,
  type InquiryAction, type InquiryTab, type SortedFilter,
} from './inquiries/state';
import { todayKey } from './inview/logic';

const TABS: InquiryTab[] = ['desk', 'stock', 'sorted'];
/** 1ページの件数。**サーバーの既定と同じ値**（別々に持つと「次へ」が空振りする） */
const PAGE_SIZE = 50;

export default function InquiriesPage() {
  const { canEdit } = usePermissions();
  const isMobile = useIsMobile();
  const today = todayKey();

  const [tab, setTab] = useState<InquiryTab>('desk');
  /** 「仕分け済み」タブの中の行き先。受領証のタブを並べない代わり */
  const [dest, setDest] = useState<SortedFilter>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<MiscInquiry | null>(null);
  const [ticketing, setTicketing] = useState<MiscInquiry | null>(null);
  const [stocking, setStocking] = useState<MiscInquiry | null>(null);
  const [adding, setAdding] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const countsQuery = useInquiryCounts();
  const counts = countsQuery.data?.states;
  const tagQuery = useInquiryTags();

  /*
    **引くのは今のタブのぶんだけ・上限つき。**
    以前はタブの件数を出すために全件を引いていたが、件数は
    `GET /dailyops/inquiries/counts` が COUNT で数える。
  */
  const listParams = useMemo<InquiryListParams>(() => {
    if (tab === 'desk') return { desk: true };
    if (tab === 'stock') return { state: 'stock' };
    if (dest === 'all') return { states: [...SORTED_STATES] };
    return { state: dest };
  }, [tab, dest]);

  const query = useInquiries({ ...listParams, tag, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
  const rows = useMemo(() => query.data ?? [], [query.data]);

  /** いま開いているタブの全件数。**タグで絞っているときは名乗らない**（数え直さない） */
  const tabTotal = !counts || tag ? null
    : tab === 'desk' ? counts.desk
      : tab === 'stock' ? counts.stock
        : dest === 'all' ? counts.sorted : (counts[dest] ?? 0);

  const move = useMoveInquiry();
  const del = useDeleteInquiry();

  const switchTab = (t: InquiryTab) => { setTab(t); setPage(0); setOpened(null); };

  const onMove = (q: MiscInquiry, state: 'unsorted' | 'stock' | 'dropped', msg: string, reviewOn?: string | null) =>
    move.mutate({ id: q.id, state, stock_review_on: reviewOn ?? null }, {
      onSuccess: () => notifySuccess(msg),
      onError: (e) => notifyApiError('動かせませんでした', e),
    });

  const onAction = async (q: MiscInquiry, a: InquiryAction) => {
    if (a === 'ticket') { setTicketing(q); return; }
    if (a === 'toProject') {
      // 案件は**案件管理の登録モーダル**で作る（16項目・顧客の選択・権限を持っている）。
      // 別バンドルなので `navigate` では飛べない
      window.location.href = `/sales/projects/new?inquiry=${encodeURIComponent(q.id)}`;
      return;
    }
    // **ストックは日を訊いてから動かす**（247）。押した瞬間に消えると、
    // それは「見送り」と同じで、戻ってくる仕掛けが無い
    if (a === 'stock' || a === 'restock') { setStocking(q); return; }
    if (a === 'unsort') {
      if (q.state === 'ticket' || q.state === 'project') {
        const ok = await confirmAction({
          title: '未仕分けに戻しますか',
          description: q.state === 'ticket'
            ? '**作ったタスクは消しません。**結びつきだけ外すので、いらなければ案件管理のタスク一覧で消してください。'
            : '**作った案件は消しません。**結びつきだけ外すので、いらなければ案件一覧で消してください。',
          confirmLabel: '戻す',
        });
        if (!ok) return;
      }
      onMove(q, 'unsorted', '未仕分けに戻しました');
      return;
    }
    onMove(q, 'dropped', '見送りにしました');
  };

  const onDelete = async (q: MiscInquiry) => {
    const ok = await confirmAction({
      title: 'この情報を消しますか',
      description: `「${q.subject || q.summary}」を消します。**AI が読み取った内容とメールの原文も一緒に消えます。**`,
      confirmLabel: '消す',
      tone: 'danger',
    });
    if (!ok) return;
    del.mutate(q.id, {
      onSuccess: () => notifySuccess('消しました'),
      onError: (e) => notifyApiError('消せませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="入ってきた情報"
        // **見出しが「この画面で今日やること」を言う。**
        // 内訳を分けて書くのは、未仕分け 0・見直し 5 のときに
        // 「5件」とだけ出すと今日届いたものが5件あるように読めるため
        sub={counts ? deskSummary(counts.unsorted, counts.stock_due) : '数えています…'}
        primaryAction={canEdit ? <Button onClick={() => setAdding(true)}>手で足す</Button> : undefined}
      />

      {/*
        タブは3つ（247）。以前は5つで、**うち4つが「受領証」**だった
        （チケット / 案件にした / 見送りは「未仕分けに戻す」しかできない）。
        片づいたものは「仕分け済み」1つにまとめ、その中で行き先を絞る。
        ⚠️ **「今日さばくもの」と「ストック」は重なる**（見直しの日が来たものは両方に出る）。
        セキュリティカードの「返却遅延は貸出中の一部」と同じで、足しても全件にならない
      */}
      <FilterChips
        label="見るものを選ぶ"
        items={TABS.map((t) => ({
          key: t,
          label: TAB_LABEL[t],
          count: counts ? (t === 'desk' ? counts.desk : t === 'stock' ? counts.stock : counts.sorted) : null,
        }))}
        value={tab}
        onChange={(k) => switchTab(k as InquiryTab)}
      />

      {tab === 'sorted' && (
        <FilterChips
          label="行き先で絞り込む"
          items={[
            { key: 'all', label: 'すべて', count: counts?.sorted ?? null },
            ...SORTED_STATES.map((s) => ({
              key: s, label: INQUIRY_STATE_LABELS[s], count: counts?.[s] ?? null,
            })),
          ]}
          value={dest}
          onChange={(k) => { setDest(k as SortedFilter); setPage(0); }}
        />
      )}

      {tag && (
        <p className="text-sub flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-primary">
            <Tag className="h-3.5 w-3.5" aria-hidden="true" />「{tag}」で絞り込み中
          </span>
          <button type="button" onClick={() => { setTag(null); setPage(0); }} className="min-h-tap text-note text-muted-foreground underline lg:min-h-[32px]">
            解除する
          </button>
        </p>
      )}

      <div className="flex flex-col items-start gap-4 lg:flex-row lg:gap-5">
        <div className="min-w-0 flex-1">
          {query.isError ? (
            <ErrorPanel title="情報を読み込めませんでした" error={query.error} onRetry={() => query.refetch()} />
          ) : query.isLoading ? (
            <Delayed><SkeletonRows rows={5} /></Delayed>
          ) : rows.length === 0 ? (
            <EmptyState
              title={emptyTitle(tab, !!tag)}
              description={emptyDescription(tab, !!tag)}
            />
          ) : isMobile ? (
            <InquiryCards
              rows={rows}
              today={today}
              canEdit={canEdit}
              pending={move.isPending}
              openedId={opened}
              onToggleOpen={(id) => setOpened((c) => (c === id ? null : id))}
              onPickTag={(t) => { setTag(t); setPage(0); }}
              onAction={onAction}
              onEdit={setEditing}
              onDelete={onDelete}
            />
          ) : (
            <InquiryRows
              rows={rows}
              today={today}
              canEdit={canEdit}
              pending={move.isPending}
              openedId={opened}
              onToggleOpen={(id) => setOpened((c) => (c === id ? null : id))}
              onPickTag={(t) => { setTag(t); setPage(0); }}
              onAction={onAction}
              onEdit={setEditing}
              onDelete={onDelete}
            />
          )}

          <PageNav
            page={page}
            shown={rows.length}
            total={tabTotal}
            hasNext={rows.length === PAGE_SIZE}
            onPage={(p) => { setPage(p); setOpened(null); }}
          />

          <p className="text-note mt-3 text-muted-foreground">
            <Sparkles className="mr-1 inline h-3 w-3 text-ai" aria-hidden="true" />
            の付いた行は AI が取り込んだものです。「中身を読む」で
            <strong className="font-bold">AI が項目に分けて読み取った内容</strong>と原文を確かめられます。
            直した内容は AI の改善に戻ります（何を直したかを入力する必要はありません）。
          </p>
        </div>

        <SidePanels
          sources={countsQuery.data?.sources ?? []}
          tags={tagQuery.data ?? []}
          activeTag={tag}
          onPickTag={(t) => { setTag(t); setPage(0); }}
        />
      </div>

      {(adding || editing) && (
        <InquiryDialog initial={editing} onClose={() => { setAdding(false); setEditing(null); }} />
      )}
      {ticketing && <TicketDialog inquiry={ticketing} onClose={() => setTicketing(null)} />}
      {stocking && (
        <StockDialog
          inquiry={stocking}
          today={today}
          saving={move.isPending}
          onClose={() => setStocking(null)}
          onSubmit={(reviewOn) => {
            const q = stocking;
            setStocking(null);
            onMove(
              q, 'stock',
              reviewOn
                ? `ストックしました。${jaMd(reviewOn)} に「今日さばくもの」へ戻ってきます`
                : 'ストックしました。見直す日を決めていないので、明日また出てきます',
              reviewOn,
            );
          }}
        />
      )}
    </div>
  );
}

/**
 * 0 件のときの見出し。**タブの名前をそのまま出さない** —
 * 「今日さばくもののものはありません」では何も伝わらない
 */
function emptyTitle(tab: InquiryTab, filtered: boolean): string {
  if (filtered) return 'このタグが付いたものはありません';
  if (tab === 'desk') return '未仕分けはありません';
  if (tab === 'stock') return 'ストックはありません';
  return '仕分け済みのものはまだありません';
}

/** 0 件のときの説明。**「この画面が何をする場所か」を1文で書く** */
function emptyDescription(tab: InquiryTab, filtered: boolean): string {
  if (filtered) return 'タグの絞り込みを解除すると、ほかの情報が出ます。';
  if (tab === 'desk') {
    return 'ここは、届いた情報を「やること（チケット）」「案件」「あとで効く話（ストック）」に'
      + '仕分けて未仕分けを空にする場所です。いまは全部仕分け済みです。'
      + 'ストックしたものは、決めた見直しの日が来るとここに戻ってきます。';
  }
  if (tab === 'stock') {
    return 'あとで効く話は「ストックする」で置いておけます。見直す日を決めると、その日にここへ戻ってきます。';
  }
  return 'チケット・案件・見送りにしたものがここに残ります。間違えたときは「未仕分けに戻す」で戻せます。';
}

/**
 * ページ送り。**「全N件」は名乗ってよいときだけ名乗る**
 * （`shared/tests/countHonesty.test.ts`）。タグで絞っているときは
 * 総数を数え直さないので「絞り込み中」と書く。
 */
function PageNav({
  page, shown, total, hasNext, onPage,
}: {
  page: number; shown: number; total: number | null; hasNext: boolean; onPage: (p: number) => void;
}) {
  if (page === 0 && !hasNext && shown === 0) return null;
  const from = page * PAGE_SIZE + 1;
  const to = page * PAGE_SIZE + shown;
  const all = total === null ? '' : '全';
  const note = total === null ? '（絞り込み中）' : '';

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-sub text-muted-foreground">
        {shown === 0 ? '0件' : (
          <>
            {all}
            {total !== null && <span className="font-number">{total}</span>}
            {total !== null && '件のうち '}
            <span className="font-number">{from}</span>–<span className="font-number">{to}</span>件
            {note}
          </>
        )}
      </p>
      {/* **1ページしか無いときはボタンを出さない**（押せない枠を置かない） */}
      {(page > 0 || hasNext) && (
        <span className="flex gap-1.5">
          <Button variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>前の{PAGE_SIZE}件</Button>
          <Button variant="outline" disabled={!hasNext} onClick={() => onPage(page + 1)}>次の{PAGE_SIZE}件</Button>
        </span>
      )}
    </div>
  );
}
