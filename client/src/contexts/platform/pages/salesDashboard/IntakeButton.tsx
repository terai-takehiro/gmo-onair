/**
 * 「自動で届いたものを確認」— ダッシュボードの見出しの右に置くボタン
 *
 * ── 大きなカードをやめてボタン1つにした ──────────────────────
 *
 * 以前はここに**「案件受付」の大きなカード**（3タイル ＋ 録音の注記）を置いて
 * いました。モックのダッシュボードには**そんな枠はありません** — 見出しの右に
 * **このボタン1つ**があるだけです。
 *
 * カードだと、毎日開く画面の**いちばん上の 1/4 を「入口の説明」が占めます**。
 * 3つのタイルの行き先は
 *
 *   ①自動で届いたものを見る → 案件作成（＝このボタン）
 *   ②電話・打合せを取り込む → 案件作成（リード経路を電話にしただけ）
 *   ③手で登録する           → 案件作成（＝隣の「案件をつくる」）
 *
 * で**3つとも同じ画面**でした。受付を案件作成に畳んだ時点で、
 * 「どの入口から入るか」を選ばせる意味が無くなっています。
 * リード経路は案件作成のフォームで選べます。
 *
 * ── 件数は 0 でも出す ───────────────────────────────────────
 *
 * **0 を隠すと「まだ読み込み中」に見えます。** 0 のときは赤ではなく灰にして、
 * 「見るものが無い」と「溜まっている」を色で分けます。
 */
import { Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import api from '@/lib/api';

interface InboxResponse { counts?: { total?: number } }

export function IntakeButton() {
  // **案件作成のレールと同じ鍵**で引く。別の鍵にすると、片づけた直後に
  // ダッシュボードへ戻ったとき数字が古いまま残る
  const { data } = useQuery<InboxResponse>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get('/dashboard/inbox')).data.data,
    staleTime: 30_000,
  });
  const waiting = data?.counts?.total ?? null;

  return (
    <Link
      to="/sales/projects/new"
      className="min-h-tap text-sub inline-flex items-center gap-2 rounded-control border border-primary-border bg-primary-surface-weak px-3.5 font-bold text-primary hover:border-primary-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[40px]"
    >
      <Inbox className="h-4 w-4 shrink-0" aria-hidden="true" />
      自動取込案件を確認
      {waiting !== null && (
        <span
          className={`font-number text-badge inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-chip px-1.5 ${
            waiting > 0 ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {waiting}
        </span>
      )}
    </Link>
  );
}
