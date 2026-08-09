/**
 * 「案件受付」(v4 ① の上辺)
 *
 * ── モックどおり3つのタイル ──────────────────────────────────
 *
 *   ① 自動で届いたものを見る   → 案件作成 (`/sales/projects/new`)。未処理の数を出す
 *   ② 電話・打合せを取り込む   → 入口を「電話」にして案件登録へ
 *   ③ 手で登録する             → 案件登録へ
 *
 * ② は `?intake=phone` を付けて登録画面に行きます。保存すると
 * `projects.intake_channel = 'phone'` が入り、案件一覧の「ネタ」の見え方で
 * **どこから来た引き合いか**が読めます (migration 165)。
 *
 * ── 「その場で録音する」はまだ案件を作ってから ──────────────
 *
 * 録音 → 文字起こし → 議事録は**案件詳細のやり取りタブ**にあります
 * (`project_minutes`)。**案件が無いと録音を置く先がありません** — 議事録は
 * `project_id` にぶら下がるためです。②のタイルにその旨を書いてあります。
 * 「録音してから案件を作る」は、録音の置き場を先に決める別の作業です。
 *
 * **押せないタイルを並べません。** 押しても何も起きないボタンは、
 * 「壊れている」と受け取られて以後ここ全体が信用されなくなります。
 */
import { Inbox, FolderPlus, Mic, Phone, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import api from '@/lib/api';

interface InboxResponse { counts?: { total?: number } }

export function IntakePanel() {
  // **案件作成のレールと同じ鍵**で引く。別の鍵にすると、片づけた直後に
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

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/sales/projects/new"
          className="rounded-control min-h-tap flex items-center gap-3 border border-primary-border bg-primary-surface-weak px-3.5 py-3 hover:border-primary-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-primary-surface">
            <Inbox className="h-[18px] w-[18px] text-primary" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-list block truncate">自動で届いたものを見る</span>
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
          to="/sales/projects/new?intake=phone"
          className="rounded-control min-h-tap flex items-center gap-3 border border-border bg-card px-3.5 py-3 hover:border-primary-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="rounded-control flex h-9 w-9 shrink-0 items-center justify-center bg-muted">
            <Phone className="h-[18px] w-[18px] text-secondary-foreground" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-list block truncate">電話・打合せを取り込む</span>
            <span className="text-sub-sm block text-muted-foreground">聞いたことをメモから起こす</span>
          </span>
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
          <strong className="font-bold">打合せの録音と文字起こし</strong>は、案件をつくったあとに
          <strong className="font-bold">案件詳細の「やり取り」タブ</strong>から使えます
          （議事録は案件にぶら下がるので、置き先の案件が要ります）。
        </span>
      </p>
    </section>
  );
}
