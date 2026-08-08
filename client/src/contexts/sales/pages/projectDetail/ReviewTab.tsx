/**
 * 案件詳細 / ふりかえりタブ (v4 ⑥)
 *
 * ── モックに絵が無い ────────────────────────────────────────
 *
 * このタブはモック自身が「これから作ります」と書いている分です。
 * **絵が無いので、いま持っている数字だけで組みました** — 新しい欄を作って
 * 「入力してください」と言うと、入れない欄が増えるだけになります。
 *
 * ── 出しているもの ──────────────────────────────────────────
 *
 *   ① お金       想定 → 見積 → 確定売上 → 仕入 → 粗利（引き算の順に並べる）
 *   ② 進み方     タスクの終わり具合・期限を過ぎたまま終わったもの・かかった日数
 *   ③ 実施の記録 `event_reports`（見出し・topics・来場者数）
 *
 * ── ③ は隔週キープと**同じ表・同じ口** ──────────────────────
 *
 * `GET/PUT /keep/event-reports/:projectId`。写しを作ると、案件から書いた内容が
 * 隔週キープの資料に出てこない（またはその逆）が起きます。
 *
 * ── 作り話をしない ──────────────────────────────────────────
 *
 * 「見積より N% 高く売れた」のような気の利いた文は出しません。
 * **数字を並べて、差だけ出します。** どう読むかは人が決めることです。
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, Wallet, ListChecks, NotebookPen, Plus, Trash2, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useProjectTasks } from '@/contexts/tasks/hooks/useProjectTasks';
import { useAuth } from '@/contexts/platform/AuthContext';
import { localDateStr } from '@/lib/format';
import type { ProjectDetail } from './types';

interface Summary {
  total_revenue: number; total_purchase: number; gross_profit: number; gross_margin: number;
}
interface Report {
  headline: string | null;
  highlights: string[] | null;
  attendees_onsite: number | null;
  attendees_online: number | null;
  attendees_note: string | null;
  report_status: 'draft' | 'confirmed';
  reported_at: string | null;
}
interface ReportPayload {
  found: boolean;
  report?: Report;
  summary?: Summary;
}
interface EstimateRow { status: string; version: number; subtotal: number; discount: number }

const num = (v: unknown): number => Number(v) || 0;

/** 引き算の1段。**利益だけ枠と色を変える**（財務ダッシュボードと同じ考え方） */
function Line({
  label, value, note, result, bad,
}: { label: string; value: number | null; note?: string; result?: boolean; bad?: boolean }) {
  return (
    <div className={cn(
      'flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5',
      result ? 'rounded-note border border-border bg-surface-subtle' : 'border-b border-border-faint',
    )}>
      <span className={cn('min-w-0 flex-1', result ? 'text-list' : 'text-sub text-muted-foreground')}>
        {label}
        {note && <span className="text-note ml-2 text-muted-foreground">{note}</span>}
      </span>
      {value === null
        ? <span className="text-sub text-muted-foreground">—</span>
        : <Money value={value} className={cn('w-40 justify-end', result && 'text-list', bad && 'text-destructive')} />}
    </div>
  );
}

export function ReviewTab({ project }: { project: ProjectDetail }) {
  const qc = useQueryClient();
  const { currentUser, permissions } = useAuth();
  const canEdit = currentUser?.role === 'system_admin'
    || ['editor', 'manager', 'owner'].includes(permissions?.sales ?? '');

  const q = useQuery<ReportPayload>({
    queryKey: ['event-report', project.id],
    queryFn: async () => (await api.get(`/keep/event-reports/${project.id}`)).data.data,
  });

  const estimates = useQuery<EstimateRow[]>({
    queryKey: ['estimates', project.id],
    queryFn: async () => (await api.get(`/projects/${project.id}/estimates`)).data.data,
  });

  const { data: tasks = [] } = useProjectTasks(project.id, null);

  const [draft, setDraft] = useState<Partial<Report> | null>(null);
  const cur = { ...(q.data?.report ?? {}), ...(draft ?? {}) } as Partial<Report>;
  const dirty = draft !== null && Object.keys(draft).length > 0;
  const set = (patch: Partial<Report>) => setDraft((d) => ({ ...(d ?? {}), ...patch }));

  const save = useMutation({
    mutationFn: () => api.put(`/keep/event-reports/${project.id}`, {
      headline: cur.headline ?? null,
      highlights: cur.highlights ?? [],
      attendees_onsite: cur.attendees_onsite ?? null,
      attendees_online: cur.attendees_online ?? null,
      attendees_note: cur.attendees_note ?? null,
      report_status: cur.report_status ?? 'draft',
    }),
    onSuccess: () => {
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['event-report', project.id] });
      // 隔週キープの一覧も読み直す（同じ表を出しているので、片方だけ古いと食い違う）
      qc.invalidateQueries({ queryKey: ['keep-event-reports'] });
      notifySuccess('ふりかえりを保存しました');
    },
    onError: (e) => notifyApiError('保存できませんでした', e),
  });

  if (q.isError) return <ErrorPanel title="ふりかえりを読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />;
  if (q.isLoading) return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;

  const s = q.data?.summary;
  // **出した見積のうち最新のもの。** 作成中の版は「出した金額」ではない
  const sent = (estimates.data ?? [])
    .filter((e) => e.status === 'accepted' || e.status === 'sent' || e.status === 'superseded')
    .sort((a, b) => b.version - a.version)[0];
  const quoted = sent ? num(sent.subtotal) - num(sent.discount) : null;

  const total = tasks.length;
  const done = tasks.filter((t) => t.is_completed).length;
  const today = localDateStr(new Date());
  const late = tasks.filter((t) => t.due_date && !t.is_completed && t.due_date < today).length;

  const highlights = cur.highlights ?? [];

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:gap-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <LineChart className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <h2 className="text-h2 min-w-0 flex-1">ふりかえり</h2>
        {cur.report_status === 'confirmed' && (
          <span className="text-note rounded-badge bg-success-surface px-2 py-1 font-bold text-success">確定</span>
        )}
      </div>

      {/* ① お金 */}
      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">お金</h3>
        </div>
        <Line label="想定していた金額" value={project.expected_amount === null ? null : num(project.expected_amount)}
          note="案件をつくったときの見込み" />
        <Line label="出した見積" value={quoted} note={sent ? `v${sent.version}（値引きのあと）` : '出した見積がありません'} />
        <Line label="確定した売上" value={s ? s.total_revenue : null} />
        <Line label="仕入（原価）" value={s ? -s.total_purchase : null} />
        <div className="p-3">
          <Line
            label="粗利"
            value={s ? s.gross_profit : null}
            note={s && s.total_revenue > 0 ? `${s.gross_margin}%` : undefined}
            result
            bad={!!s && s.gross_profit < 0}
          />
        </div>
        <p className="text-note border-t border-border-faint bg-surface-subtle px-4 py-2.5 text-muted-foreground">
          売上と仕入は<strong className="font-bold">分け合った額も足した実績</strong>です（財務管理と同じ数え方）。
          <strong className="font-bold">見積との差の読み方はここでは書きません</strong> —
          値引きなのか追加受注なのかは数字からは分からないためです。
        </p>
      </section>

      {/* ② 進み方 */}
      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">進み方</h3>
        </div>
        {total === 0 ? (
          <p className="text-sub px-4 py-3 text-muted-foreground">タスクを1つも入れていない案件です。</p>
        ) : (
          <div className="flex flex-wrap gap-x-8 gap-y-2 px-4 py-3">
            <span className="flex items-baseline gap-2">
              <span className="text-sub text-muted-foreground">終わったタスク</span>
              <span className="font-number text-list">{done} / {total}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="text-sub text-muted-foreground">期限を過ぎたまま</span>
              <span className={cn('font-number text-list', late > 0 && 'text-destructive')}>{late}</span>
            </span>
            {project.event_start && (
              <span className="flex items-baseline gap-2">
                <span className="text-sub text-muted-foreground">実施日</span>
                <span className="font-number text-list">{project.event_start}</span>
              </span>
            )}
          </div>
        )}
      </section>

      {/* ③ 実施の記録 */}
      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">実施の記録</h3>
          <span className="text-note text-muted-foreground">隔週キープの資料に出ます</span>
        </div>

        <div className="flex flex-col gap-3.5 p-4">
          <div>
            <Label htmlFor="rv-headline">ひとことで言うと</Label>
            <Input
              id="rv-headline"
              value={cur.headline ?? ''}
              disabled={!canEdit}
              maxLength={120}
              placeholder="例）ハイブリッド配信で現地 120 名・オンライン 480 名。機材トラブルなし。"
              onChange={(e) => set({ headline: e.target.value })}
            />
          </div>

          <div>
            <Label>よかったこと・次に活かすこと</Label>
            <div className="mt-1 flex flex-col gap-1.5">
              {highlights.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={h}
                    aria-label={`よかったこと・次に活かすこと ${i + 1} 行目`}
                    disabled={!canEdit}
                    onChange={(e) => set({ highlights: highlights.map((x, n) => (n === i ? e.target.value : x)) })}
                  />
                  {canEdit && (
                    <Button variant="ghost" size="icon" aria-label={`${i + 1} 行目を消す`}
                      onClick={() => set({ highlights: highlights.filter((_, n) => n !== i) })}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
              {canEdit && (
                <Button variant="outline" size="sm" className="self-start"
                  onClick={() => set({ highlights: [...highlights, ''] })}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />行を足す
                </Button>
              )}
              {highlights.length === 0 && !canEdit && (
                <p className="text-sub text-muted-foreground">まだ書かれていません。</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="rv-onsite">来場（現地）</Label>
              <Input id="rv-onsite" type="number" className="font-number" disabled={!canEdit}
                value={cur.attendees_onsite ?? ''}
                onChange={(e) => set({ attendees_onsite: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="rv-online">視聴（オンライン）</Label>
              <Input id="rv-online" type="number" className="font-number" disabled={!canEdit}
                value={cur.attendees_online ?? ''}
                onChange={(e) => set({ attendees_online: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <div>
              <Label htmlFor="rv-note">数え方のメモ</Label>
              <Input id="rv-note" disabled={!canEdit} value={cur.attendees_note ?? ''}
                placeholder="例）同時接続の最大値"
                onChange={(e) => set({ attendees_note: e.target.value })} />
            </div>
          </div>
          <p className="text-note text-muted-foreground">
            <strong className="font-bold">空欄は「数えていない」</strong>として扱います（0 と区別します）。
          </p>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
              <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                保存する
              </Button>
              {cur.report_status !== 'confirmed' ? (
                <Button
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() => { set({ report_status: 'confirmed' }); }}
                >
                  確定にする
                </Button>
              ) : (
                <Button variant="outline" disabled={save.isPending}
                  onClick={() => set({ report_status: 'draft' })}>
                  下書きに戻す
                </Button>
              )}
              {dirty && <span className="text-note text-muted-foreground">保存していない直しがあります</span>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
