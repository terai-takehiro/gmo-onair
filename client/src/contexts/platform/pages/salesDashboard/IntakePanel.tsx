/**
 * 「案件受付」(v4 ① の上辺)
 *
 * ── モックとの違い。**動く入口だけを出します** ──────────────
 *
 * モックはここに3つのタイルを置きます:
 *   ① メールから取り込む（MCP が自動で取り込み済み）
 *   ② 電話・打合せを取り込む（貼るか、その場で録音する）
 *   ③ 手で登録する
 *
 * ①③ は**今日から動きます** — ① は受付 (`/sales/inbox`) に届いている
 * 未処理の数をそのまま出し、③ は案件の新規作成に行きます。
 * ② の**録音は入っていません** (v4.0 で入れると決まっていますが、
 * 会社方針「AI を使い捨てにしない」の充足表を先に通す必要があるため別立て)。
 *
 * **押せないタイルを並べません。** 押しても何も起きないボタンは、
 * 「壊れている」と受け取られて以後ここ全体が信用されなくなります。
 * 入っていないものは、そう書いて出します。
 */
import { Inbox, FolderPlus, Mic, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import api from '@/lib/api';

interface InboxResponse { counts?: { total?: number } }

export function IntakePanel() {
  // **受付ページと同じ鍵**で引く。別の鍵にすると、受付で片づけた直後に
  // ダッシュボードへ戻ったとき数字が古いまま残る
  const { data } = useQuery<InboxResponse>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get('/dashboard/inbox')).data.data,
    staleTime: 30_000,
  });
  const waiting = data?.counts?.total ?? null;

  return (
    <section className="rounded-card border border-primary-border bg-card p-4 lg:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-cardtitle flex items-center gap-2">
          <span className="rounded-control flex h-7 w-7 items-center justify-center bg-primary-surface">
            <Inbox className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          案件受付
        </h2>
        <p className="text-note text-muted-foreground">
          まずネタとして入れます。案件にするのは、日程か見積が動いてからです
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <Link
          to="/sales/inbox"
          className="rounded-control min-h-tap flex items-center gap-3 border border-primary-border bg-primary-surface-weak px-3.5 py-3 hover:border-primary-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-primary-surface">
            <Inbox className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-list block truncate">受付をひらく</span>
            <span className="text-sub-sm block text-muted-foreground">メール・問い合わせ・AI が起こした案件</span>
          </span>
          {/* 数字は 0 のときも出す。**0 を隠すと「まだ読み込み中」に見える** */}
          {waiting !== null && (
            <span
              className={`font-number rounded-chip inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center px-2 text-sub-sm font-bold ${
                waiting > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              {waiting}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
        </Link>

        <Link
          to="/sales/projects/new"
          className="rounded-control min-h-tap flex items-center gap-3 border border-border bg-card px-3.5 py-3 hover:border-primary-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
            <FolderPlus className="h-[18px] w-[18px] text-secondary-foreground" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-list block truncate">手で登録する</span>
            <span className="text-sub-sm block text-muted-foreground">内容が分かっているとき</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-fg-disabled" aria-hidden="true" />
        </Link>
      </div>

      <p className="text-note mt-2.5 flex items-start gap-1.5 text-muted-foreground">
        <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-bold">電話・打合せをその場で録音して取り込む</strong>のは、まだ入っていません
          （v4.0 で入れる予定です）。いまは受付から手で登録してください。
        </span>
      </p>
    </section>
  );
}
