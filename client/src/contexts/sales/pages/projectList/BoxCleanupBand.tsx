/**
 * **溜まっている失注・見送り案件の BOX フォルダを片づける帯**（migration 248）
 *
 * ユーザー報告「失注や見送りのなった案件について BOX に残り続けてしまう」。
 * これから失注にするものは自動で片づきますが、**すでに溜まっているぶんは
 * 誰かが一度動かさないと残ります**。migration は遡って片づけません
 * （本番の BOX で数百フォルダが人の知らないうちに一斉に動くため）。
 *
 * ── 出し方の決めごと ────────────────────────────────────────
 *
 * **0件なら何も出しません。** 出しっぱなしにすると「押しても減らない帯」になり、
 * そのうち誰も読まなくなります（この製品が通知で通った道と同じ）。
 * **1回に触る件数を切って、残りを出します** — 押すたびに減るのが見えないと、
 * 終わったのかどうかが分かりません。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderArchive, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/contexts/platform/AuthContext';

const KEY = ['projects', 'box-cleanup', 'lost'];
/** 1回に触る件数。BOX は1フォルダにつき数回叩くので、多くすると詰まる */
const BATCH = 20;

export function BoxCleanupBand() {
  const { hasPermission } = useAuth();
  const qc = useQueryClient();
  const [done, setDone] = useState(0);
  // ⚠️ **API と同じ権限で出す**（manager 以外に出すと「押せるのに 403」になる）
  const canRun = hasPermission('sales', 'manager');

  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get('/projects/box-cleanup/lost')).data.data as { remaining: number },
    enabled: canRun,
  });

  const run = useMutation({
    mutationFn: async () =>
      (await api.post('/projects/box-cleanup/lost', { limit: BATCH })).data.data as
        { processed: number; remaining: number },
    onSuccess: (r) => {
      setDone((n) => n + r.processed);
      qc.setQueryData(KEY, { remaining: r.remaining });
      notifySuccess(
        r.remaining > 0
          ? `${r.processed} 件を片づけました（残り ${r.remaining} 件・もう一度押すと続きから進みます）`
          : `${r.processed} 件を片づけました。片づけ待ちはもうありません`,
      );
    },
    onError: (err) => notifyApiError('BOXフォルダを片づけられませんでした', err),
  });

  const remaining = q.data?.remaining ?? 0;
  if (!canRun || remaining === 0) return null;

  return (
    <div className="rounded-card border border-border bg-surface-subtle px-3.5 py-3">
      <p className="text-sub flex flex-wrap items-center gap-2 font-bold">
        <FolderArchive className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        失注・見送りの BOX フォルダが {remaining} 件、現役の場所に残っています
      </p>
      <p className="text-note mt-1 text-muted-foreground">
        中身が1つも無いものは削除し、見積書などが入っているものは「99_失注・見送り」へ移します。
        案件を失注から戻すと元に戻ります。1回に {BATCH} 件までです。
      </p>
      <button
        type="button"
        onClick={() => run.mutate()}
        disabled={run.isPending}
        className="text-sub mt-2 inline-flex min-h-tap items-center gap-1.5 rounded-control border border-border bg-card px-3 font-bold hover:bg-muted disabled:opacity-60 lg:min-h-[36px]"
      >
        {run.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {run.isPending ? '片づけています…' : `${Math.min(BATCH, remaining)} 件を片づける`}
      </button>
      {done > 0 && <span className="text-note ml-2 text-muted-foreground">この画面で {done} 件片づけました</span>}
    </div>
  );
}
