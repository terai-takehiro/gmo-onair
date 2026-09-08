/**
 * 依頼 — 人に頼んだ仕事と、人から頼まれた仕事
 *
 * 設計の正は [docs/design/v4/mockups/tasks-redesign/](../../../../docs/design/v4/mockups/tasks-redesign/)。
 * 要件は D3（依頼）／ D8（画面）。
 *
 * ── 作り直しで変えたこと ────────────────────────────────────
 *
 * ① **「あなたの番」を先頭に出す。** 受けたのに返していない依頼と、
 *    出したが差し戻されて決めていない依頼の合計。ここが 0 なら止まっている
 *    ものは無い。0 件のときは帯そのものを出さない。
 * ② **受けた／出したを段で切り替える。** 以前は2つの節を縦に積んでいたので、
 *    出した依頼を見るのに受けた依頼を全部スクロールして越える必要があった。
 * ③ **状態で絞り込めるようにした**（すべて／未返答／承諾／差し戻し／完了）。
 *    以前は「対応済の依頼も表示」のトグル1つだけで、未返答だけを見られなかった。
 * ④ **一覧と詳細を分けた。** 本文・やり取り・操作は選んだ1件のパネルにだけ出す
 *    （`DelegationList` の冒頭に理由）。
 *
 * ⚠️ **一覧は常に完了ぶんまで取る**（`useMyDelegations(dir, true)`）。
 * チップの件数は「押す前に 0 件だと分かる」ためのものなので、
 * 取っていないものを数えるとその段だけ嘘になる。
 */
import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, EmptyState, NoSearchResults, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import {
  BUCKET_LABELS, DELEGATION_FILTERS, delegationBucket, isMyTurn, useMyDelegations,
  type DelegationFilter, type MyTask,
} from '@/lib/tasksApi';
import { DelegationCards, DelegationRows } from './DelegationList';
import { DelegationDetail } from './DelegationDetail';

type Direction = 'received' | 'sent';

const DIRECTIONS: { key: Direction; label: string }[] = [
  { key: 'received', label: '受けた依頼' },
  { key: 'sent', label: '出した依頼' },
];

/** 未完了だけを数える（完了は「完了」チップの件数として別に出す） */
function openOf(rows: MyTask[]): MyTask[] {
  return rows.filter((t) => delegationBucket(t) !== 'done');
}

export function DelegationsTab() {
  const { canEdit } = usePermissions();
  const isMobile = useIsMobile();
  const received = useMyDelegations('received', true);
  const sent = useMyDelegations('sent', true);

  const [direction, setDirection] = useState<Direction>('received');
  const [filter, setFilter] = useState<DelegationFilter>('all');
  /** 「あなたの番」だけに絞る。状態の絞り込みとは別軸（両方掛かる） */
  const [turnOnly, setTurnOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const all = useMemo(
    () => (direction === 'received' ? received.data : sent.data) ?? [],
    [direction, received.data, sent.data],
  );

  const myTurnCount = (received.data ?? []).filter((t) => isMyTurn(t, 'received')).length
    + (sent.data ?? []).filter((t) => isMyTurn(t, 'sent')).length;
  const receivedTurn = (received.data ?? []).filter((t) => isMyTurn(t, 'received')).length;
  const sentTurn = (sent.data ?? []).filter((t) => isMyTurn(t, 'sent')).length;

  const scoped = useMemo(
    () => (turnOnly ? all.filter((t) => isMyTurn(t, direction)) : all),
    [all, turnOnly, direction],
  );

  /**
   * 出す行。**完了は最後に沈める。**
   * サーバーの並びは「未返答が先 → 優先度 → 期限」で、完了かどうかを見ていないので、
   * 「すべて」で見ると片づいた依頼が優先度の高さだけで上に居座る。
   * （`Array.prototype.sort` は安定なので、同じ段の中の並びはサーバーのままになる）
   */
  const rows = useMemo(() => {
    const list = filter === 'all' ? scoped : scoped.filter((t) => delegationBucket(t) === filter);
    return [...list].sort((a, b) => Number(delegationBucket(a) === 'done') - Number(delegationBucket(b) === 'done'));
  }, [scoped, filter]);

  // 絞り込みで消えた行を右に出したままにしない（左に無いものを操作させない）
  const selected = rows.find((t) => t.id === selectedId) ?? null;

  const chips = DELEGATION_FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: received.isLoading || sent.isLoading
      ? null
      : f.key === 'all' ? scoped.length : scoped.filter((t) => delegationBucket(t) === f.key).length,
  }));

  const activeFilters = [
    turnOnly ? 'あなたの番だけ' : null,
    filter === 'all' ? null : `状態: ${BUCKET_LABELS[filter]}`,
  ].filter((f): f is string => f !== null);

  const switchDirection = (d: Direction) => {
    setDirection(d);
    // 別の向きの行を右に残さない（id は向きをまたいで一致しない）
    setSelectedId(null);
  };

  if (received.isLoading || sent.isLoading) {
    return <Delayed><SkeletonRows rows={5} /></Delayed>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ① あなたの番。**0 件のときは帯ごと出さない**（空の帯は場所だけ取る） */}
      {myTurnCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-destructive-border bg-destructive-surface px-3.5 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <span className="text-sub font-bold text-destructive">
            あなたの番が <span className="font-number">{myTurnCount}</span> 件あります
          </span>
          <span className="text-sub text-muted-foreground">
            返事をしていない依頼 <span className="font-number">{receivedTurn}</span> 件 ／
            差し戻されて決めていない依頼 <span className="font-number">{sentTurn}</span> 件
          </span>
          <button
            type="button"
            onClick={() => { setTurnOnly((v) => !v); setFilter('all'); }}
            aria-pressed={turnOnly}
            className={cn(
              'min-h-tap text-sub ml-auto shrink-0 rounded-control border border-destructive-border px-3 font-bold lg:min-h-[32px]',
              turnOnly ? 'bg-destructive text-destructive-foreground' : 'bg-card text-destructive',
            )}
          >
            {turnOnly ? 'すべて表示' : 'この分だけ表示'}
          </button>
        </div>
      )}

      {/* ② 受けた／出した ＋ ③ 状態 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex shrink-0 overflow-hidden rounded-control border border-border" role="group" aria-label="依頼の向きを切り替える">
          {DIRECTIONS.map((d, i) => {
            const list = (d.key === 'received' ? received.data : sent.data) ?? [];
            const active = direction === d.key;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => switchDirection(d.key)}
                aria-pressed={active}
                className={cn(
                  'min-h-tap text-sub inline-flex min-w-[128px] items-center justify-center gap-1.5 px-3.5 lg:min-h-[36px]',
                  i > 0 && 'border-l border-border',
                  active ? 'bg-primary font-bold text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {d.label}
                <span className="font-number text-sub-sm">{openOf(list).length}</span>
              </button>
            );
          })}
        </div>

        <FilterChips label="依頼の状態で絞り込む" items={chips} value={filter} onChange={setFilter} />
      </div>

      {/* **数字の意味が2つあるので書く。** 段の名前（受けた依頼／出した依頼）に
          添えた数は未完了だけ、チップの「すべて」は完了も含む。
          セキュリティカードの「返却遅延は貸出中の一部」と同じ断り書き */}
      <p className="text-note text-muted-foreground">
        「受けた依頼」「出した依頼」に添えた数は<strong className="font-bold">未完了だけ</strong>です
        （チップの「すべて」には完了した依頼も入ります）。
      </p>

      {rows.length === 0 ? (
        all.length === 0 ? (
          <EmptyState
            title={direction === 'received' ? 'まだ受けた依頼がありません' : 'まだ出した依頼がありません'}
            description={
              direction === 'received'
                ? '誰かがあなたに依頼すると、ここに出ます。'
                : '右上の「依頼する」から、相手・内容・期限を決めて送れます。'
            }
          />
        ) : (
          <NoSearchResults
            activeFilters={activeFilters}
            onClearFilters={() => { setFilter('all'); setTurnOnly(false); }}
          />
        )
      ) : isMobile ? (
        <DelegationCards rows={rows} direction={direction} onSelect={setSelectedId} />
      ) : (
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <DelegationRows rows={rows} direction={direction} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          </div>
          <div className="w-[400px] shrink-0">
            <DelegationDetail key={selected?.id ?? 'none'} task={selected} direction={direction} canEdit={canEdit} />
          </div>
        </div>
      )}

      {/* スマホは選んだ1件をシートで開く（一覧を隠さないと本文とやり取りが読めない） */}
      {isMobile && selected && (
        <Sheet
          open
          onOpenChange={(v) => { if (!v) setSelectedId(null); }}
          title={selected.title}
          sub={direction === 'received'
            ? `${selected.requester_name ?? '依頼者不明'} さんから`
            : `${selected.assigned_to_name ?? '担当者不明'} さんへ`}
        >
          <div className="flex flex-col gap-3">
            <span className="flex flex-wrap items-center gap-2">
              <TableBadge label={BUCKET_LABELS[delegationBucket(selected)]} w={null} />
              {selected.is_overdue && (
                <TableBadge label="期限超過" w={null} className="bg-destructive-surface text-destructive" />
              )}
            </span>
            <DelegationDetail task={selected} direction={direction} canEdit={canEdit} embedded />
          </div>
        </Sheet>
      )}
    </div>
  );
}
