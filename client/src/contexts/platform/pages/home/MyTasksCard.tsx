/**
 * トップページの「わたしのタスク」 (v4)
 *
 * **お待たせ中（相手を待たせているもの）と分けています。** 混ぜると、
 * 相手を待たせているものが自分の雑務に埋もれます。
 *
 * ── 数字は3つだけ ────────────────────────────────────────────
 *
 * 期限超過 / 今日まで / 返事待ちの依頼。イズム 9-5「報告は数字で行え」に沿って
 * 件数だけを出し、「順調です」のような文は出しません。
 *
 * ── その場で終わらせられる ──────────────────────────────────
 *
 * 押して別画面に飛んでから完了する形だと、朝の5分では片づきません。
 * 四角を押すとその場で完了にします（`PATCH /dailyops/tasks/:id`）。
 *
 * ── ⚠️ 押せるのに 403 にしない（レビューでの指摘）──────────────
 *
 * ①**四角は `dailyops` の editor から。** 一覧を読む口は reader で通るので、
 *   reader にもこのカードは出ます。四角まで出すと**押した先が必ず 403**でした。
 * ②**「全部ひらく」は `sales` を持つ人だけ。** 行き先の全案件タスク一覧
 *   （`/sales/tasks/list`）は `sales` を要求するので、**`dailyops` だけの人は
 *   タスクを見ているのに押すと「権限がありません」の画面**に着いていました。
 *   その人にはここの数件がタスクの全体なので、リンクごと出しません。
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCheck, ArrowRight, Check } from 'lucide-react';
import api from '@/lib/api';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/contexts/platform/AuthContext';
import type { MyTaskRow, MyTaskSummary } from './types';

/** 期限を「7/31 17:00」で。**分まで出す**（イズム: 何月何日何時何分まで） */
function fmtDue(v: string | null): string {
  if (!v) return '期限なし';
  const d = new Date(v.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return v;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const SHOWN = 4;

export function MyTasksCard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  /** 完了にできるか。`PATCH /dailyops/tasks/:id` が editor を要求する */
  const canComplete = hasPermission('dailyops', 'editor');
  /** 行き先（全案件タスク一覧）を開けるか。あちらは `sales` を要求する */
  const canOpenList = hasPermission('sales');

  const summary = useQuery<MyTaskSummary>({
    queryKey: queryKeys.dashboard.myTaskSummary(),
    queryFn: async () => (await api.get('/dailyops/tasks/summary')).data.data,
    staleTime: 60_000,
  });

  const mine = useQuery<{ data: MyTaskRow[] }>({
    queryKey: ['home', 'my-tasks'],
    queryFn: async () => (await api.get('/dailyops/tasks/mine', { params: { limit: 8 } })).data,
    staleTime: 60_000,
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.patch(`/dailyops/tasks/${id}`, { is_completed: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['home', 'my-tasks'] });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.myTaskSummary() });
      // 全案件のタスク一覧も同じタスクを別の鍵で持っている
      qc.invalidateQueries({ queryKey: ['task-dashboard'] });
    },
    onError: (e) => notifyApiError('完了にできませんでした', e),
  });

  const rows = useMemo(() => mine.data?.data ?? [], [mine.data]);
  const s = summary.data;

  const chips = [
    { label: '期限超過', n: s?.overdue ?? 0, tone: 'border-destructive-border bg-destructive-surface text-destructive' },
    { label: '今日まで', n: s?.due_today ?? 0, tone: 'border-warning-border bg-warning-surface text-warning' },
    { label: '返事待ちの依頼', n: s?.unanswered_delegations ?? 0, tone: 'border-border bg-surface-subtle text-secondary-foreground' },
  ];

  return (
    <section className="rounded-card flex h-full flex-col border border-primary-border-strong bg-card p-4 lg:px-5">
      <div className="flex items-center gap-2.5">
        <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-cardtitle text-primary">わたしのタスク</h3>
        <div className="flex-1" />
        {canOpenList && (
          <button
            type="button"
            onClick={() => navigate('/sales/tasks/list')}
            className="min-h-tap text-note flex items-center gap-0.5 font-bold text-primary hover:underline lg:min-h-0"
          >
            全部ひらく<ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mt-2.5 flex gap-2">
        {chips.map((c) => (
          <span key={c.label} className={`rounded-control-lg min-w-0 flex-1 border px-2.5 py-1.5 ${c.tone}`}>
            <span className="font-number block text-h2 leading-tight">{c.n}</span>
            <span className="text-note block truncate text-muted-foreground">{c.label}</span>
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sub mt-3 text-secondary-foreground">
          {mine.isLoading ? '' : '自分に割り当てられた未完了のタスクはありません。'}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-col">
          {rows.slice(0, SHOWN).map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 border-t border-border-subtle py-2">
              {/* ⚠️ **完了にできる人にだけ出す。** 読むだけの人に出すと押した先が 403 */}
              {canComplete && (
              <button
                type="button"
                aria-label={`「${t.title}」を完了にする`}
                disabled={complete.isPending}
                onClick={() => complete.mutate(t.id)}
                // **スマホでは 44×44。** 四角そのものは 18px のまま中に置く —
                // 「完了にする」は押し間違えると取り消しに行くことになるので、
                // 指で確実に当たる大きさが要る（PC は今までどおり 18px）
                className="group -m-3 flex h-11 w-11 shrink-0 items-center justify-center lg:m-0 lg:mt-0.5 lg:h-[18px] lg:w-[18px]"
              >
                <span className="rounded-badge-xs flex h-[18px] w-[18px] items-center justify-center border-[1.5px] border-border-disabled group-hover:border-primary group-hover:bg-primary-surface">
                  <Check className="h-3 w-3 text-transparent group-hover:text-primary" aria-hidden="true" />
                </span>
              </button>
              )}
              <span className="min-w-0 flex-1">
                <span className="text-sub block [overflow-wrap:anywhere]">{t.title}</span>
                <span className="text-note block truncate text-muted-foreground">
                  {[t.gls_number, t.project_name, fmtDue(t.due_at)].filter(Boolean).join(' ・ ')}
                </span>
              </span>
              {t.is_overdue && (
                <span className="rounded-badge-xs inline-flex h-[22px] shrink-0 items-center bg-destructive-surface px-2 text-note font-bold text-destructive">
                  超過
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
