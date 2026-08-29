/**
 * 「データのある最新の月へ移動」導線（① ダッシュボード ／ ③④⑤ の台帳）
 *
 * 財務の画面は既定の計上月が**今月**ですが、月次の入力は締めのあとに入るので、
 * 今月を開いた時点では**まだ1件も無いのが普通**です。以前はそこで
 * 「◯月の売上はありません」と ¥0 の画面が出るだけで、**どの月に行けば
 * データがあるのか手掛かりがゼロ**でした（月を1つずつ戻して探すことになる）。
 *
 * ── サーバーは足していません ────────────────────────────────
 *
 * 「最終データ月」を返す口は作らず、**既にある一覧の口を
 * `sort=recognition_desc&limit=1` で1件だけ引いて**その計上日から月を取ります
 * （`recognition_desc` は `NULLS LAST` なので、先頭行が最新の計上日）。
 * **いま効いている絞り込みをそのまま渡す**のが要点で、渡さないと
 * 「移動したのにやっぱり0件」が起きます（例: 見込みだけを見ているのに
 * 確定売上しか無い月へ送る）。
 *
 * ── 「直近」と書かないこと ──────────────────────────────────
 *
 * 先の月に入力済みの行があれば、行き先は**未来の月**になります。
 * 「直近」だと過去に戻ると読まれるので、文言は「最新の月」にしています。
 */
import { useQuery } from '@tanstack/react-query';
import { CalendarSearch } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';

/** 一覧の口が返す行のうち、ここで使うのは計上日だけ */
interface DatedRow {
  recognition_date?: string | null;
}

/** `2026-03` → `2026年3月` */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

/**
 * その絞り込みで**いちばん新しい計上月**（`YYYY-MM`）。見つからなければ `null`。
 *
 * `enabled` は**0件のときだけ true にすること** — 行が並んでいる画面で
 * 余分な1件を毎回引く必要はありません。
 */
export function useLatestDataMonth(
  endpoint: '/revenues' | '/purchases' | '/sga',
  { enabled, params }: { enabled: boolean; params?: Record<string, string | undefined> },
): string | null {
  const query = useQuery({
    queryKey: ['finance-latest-month', endpoint, params],
    queryFn: async () => {
      const res = await api.get(endpoint, {
        params: { ...params, page: 1, limit: 1, sort: 'recognition_desc' },
      });
      const rows = (res.data?.data ?? []) as DatedRow[];
      const date = rows[0]?.recognition_date;
      return date && date.length >= 7 ? date.slice(0, 7) : null;
    },
    enabled,
    staleTime: 60_000,
  });
  return query.data ?? null;
}

/**
 * 空の画面に置くボタン。**行き先が今と同じ月なら何も出しません**
 * （押しても何も変わらないボタンは「壊れている」と読まれる）。
 */
export function LatestMonthAction({
  month, current, what, onJump,
}: {
  month: string | null;
  /** いま見ている月（`YYYY-MM`）。空 = 全月 */
  current: string;
  /** 何のデータか。「売上」「仕入」「販管費」 */
  what: string;
  onJump: (month: string) => void;
}) {
  if (!month || month === current) return null;
  return (
    <Button variant="outline" onClick={() => onJump(month)}>
      <CalendarSearch className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {what}のある最新の月（{monthLabel(month)}）を見る
    </Button>
  );
}
