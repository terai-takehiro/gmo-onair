/**
 * 「今日の営業」カード（docs/core-redesign-plan.md Phase 2 ①）
 *
 * ── ダッシュボードの主役。3つの節だけを並べる ────────────────
 *
 *   期限が来た次の一手   超過（赤）と今日期限。**「済んだ」をその場で押せる**
 *   今日スヌーズ明け     意図して寝かせたものが起きた。今日また向き合う日
 *   止まり始めた案件     project-health の 'stalled' に**入ったばかり**のもの。
 *                        今日気づけば1本の電話で済む（何百日も放置のものは
 *                        受信箱・自動整理が拾う側で、ここには出ない）
 *
 * 0件の節は出しません。**3つとも0なら「今日片づける営業はありません」の1行だけ** —
 * 空の枠を3つ並べると、毎朝この画面を開く理由が薄まります。
 *
 * ── 旧「期限が過ぎたやること」（`OverduePanel`）を吸収した ──────
 *
 * あちらは `GET /dashboard/overdue-actions`（超過だけ）を数えていました。
 * この節の「次の一手」は同じ条件の共通核（サーバーの `NEXT_MOVES_CORE`）に
 * **今日期限を足した集合**です。2枚並べると同じ行が両方に出て二重に数える
 * ことになるため、カードごと置き換えました（client/CLAUDE.md
 * 「同じ数字を2か所で数えない」）。行の見た目（日数を頭に置く・行クリックで
 * やり取りタブへ）と下端のリンクはあちらから引き継いでいます。
 *
 * ── 「済んだ」は既存の口を使う ──────────────────────────────
 *
 * `useNextActionActions`（`POST /activity-logs/:id/complete-next-action`）を
 * そのまま呼びます。落とす鍵は自分（today-sales）に加えて**受信箱と
 * ダッシュボードの対（sales-overview は PC とスマホが同じ鍵）** —
 * 同じ次の一手が受信箱にも並ぶので、片方だけだと「済んだのに残っている」に
 * 見えます（`home/InboxTab.tsx` と同じ形）。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlarmClock, Sunrise } from 'lucide-react';
import api from '@/lib/api';
import { localDateStr } from '@/lib/format';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { useAuth } from '@/contexts/platform/AuthContext';
import { useNextActionActions } from '@/contexts/sales/pages/activityLog/useNextActionActions';
import { STAGE_BADGE_LABEL } from '@/contexts/sales/pages/projectList/stages';
import { Panel } from './Panel';
import type { TodaySales } from './types';

/**
 * このカードの鍵。**スマホの pull-to-refresh（`MobileSalesDashboard`）も
 * この定数で落とす**ので、文字を書き写さずここから import すること。
 */
export const TODAY_SALES_KEY = ['dashboard', 'today-sales'] as const;

/** 1つの節に出す行数。3節全部が埋まっても1枚のカードとして読める量 */
const PER_SECTION = 5;

/**
 * 超過日数。`YYYY-MM-DD` 同士を UTC の日として引く —
 * `new Date('YYYY-MM-DD')` と端末ローカルの now を混ぜると時間帯で1日ずれる。
 */
function daysLate(due: string, today: string): number {
  const utc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(today) - utc(due)) / 86_400_000);
}

/** 「9/10」の形（年は出さない — 直近1週間の日付しか入らない） */
function shortDate(ymd: string): string {
  return ymd.slice(5).replace(/^0/, '').replace('-', '/').replace('/0', '/');
}

/** 節の見出し。件数は**節の全件**（下に出すのは PER_SECTION 件まで） */
function SectionHead({ label, count }: { label: string; count: number }) {
  return (
    <p className="text-sub mt-3 flex items-baseline gap-1.5 font-bold first:mt-0">
      {label}
      <span className="font-number text-muted-foreground">{count}</span>
      {count > PER_SECTION && (
        <span className="text-note font-normal text-muted-foreground">うち{PER_SECTION}件</span>
      )}
    </p>
  );
}

export function TodaySalesCard() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  // 「済んだ」の口（complete-next-action）はサーバーが sales の editor を要求する。
  // 押せない人にボタンを出さない（押して 403 は API の失敗を画面に移し替えただけ）
  const canEdit = hasPermission('sales', 'editor');
  const today = useMemo(() => localDateStr(new Date()), []);

  const { data, isLoading, isError, error, refetch } = useQuery<TodaySales>({
    queryKey: TODAY_SALES_KEY,
    queryFn: async () => (await api.get('/dashboard/today-sales')).data.data,
    staleTime: 30_000,
  });

  const nextAction = useNextActionActions([
    [...TODAY_SALES_KEY],
    [...queryKeys.dashboard.inbox()],
    // PC とスマホが同じ鍵で持つダッシュボードの対（`DashboardPage.tsx` の overview）
    ['dashboard', 'sales-overview'],
  ]);

  if (isError) {
    return (
      <ErrorPanel
        title="今日の営業を読み込めませんでした"
        error={error}
        onRetry={() => refetch()}
      />
    );
  }

  const moves = data?.next_moves ?? [];
  const awake = data?.snooze_awake ?? [];
  const stalled = data?.newly_stalled ?? [];
  const empty = moves.length === 0 && awake.length === 0 && stalled.length === 0;

  return (
    <Panel
      title="今日の営業"
      icon={<Sunrise className="h-4 w-4" aria-hidden="true" />}
      note="朝ここを片づければ、今日待たせる相手はいません"
      /* 次の一手の全件は営業活動記録（sort=next_action で期限が近い順＝超過が先頭）。
         旧 `OverduePanel` と同じ行き先 — 次回アクションを一覧できるのはあちらだけ */
      to="/sales/activity-logs?sort=next_action"
      toLabel="営業活動記録で見る"
      linkAt="foot"
    >
      {isLoading || !data ? (
        <Delayed><SkeletonRows rows={3} /></Delayed>
      ) : empty ? (
        // **1行だけ**（決めごと）。空の節を3つ並べない
        <p className="text-list py-2 text-muted-foreground">今日片づける営業はありません。</p>
      ) : (
        <>
          {moves.length > 0 && (
            <>
              <SectionHead label="期限が来た次の一手" count={moves.length} />
              {moves.slice(0, PER_SECTION).map((m) => {
                const late = m.due_date ? daysLate(m.due_date, today) : 0;
                const overdue = late > 0;
                return (
                  <Row
                    key={m.activity_log_id}
                    divider
                    interactive
                    onClick={() => navigate(`/sales/projects/${m.project_id}/thread`)}
                  >
                    {/* 日数を行の頭に。**どれから電話するかで読む節**（旧 OverduePanel と同じ） */}
                    <RowSlot w={56} align="center">
                      {overdue ? (
                        <span className="flex flex-col items-center leading-none">
                          <span className="font-number text-lg font-bold text-destructive">{late}</span>
                          <span className="text-sub-sm text-muted-foreground">日超過</span>
                        </span>
                      ) : (
                        <span className="text-sub font-bold text-warning">今日</span>
                      )}
                    </RowSlot>
                    <RowMain>
                      <RowTitle>{m.action_short || m.action || '（やることが書かれていません）'}</RowTitle>
                      <RowSub>{[m.project_name, m.customer_name].filter(Boolean).join(' ・ ')}</RowSub>
                    </RowMain>
                    {canEdit && (
                      <RowSlot w={72} align="right">
                        {/* Row は div なのでボタンを入れ子にしても HTML は壊れない。
                            行クリック（やり取りタブへ）に流さないよう止める */}
                        <button
                          type="button"
                          disabled={nextAction.isPending}
                          onClick={(e) => { e.stopPropagation(); nextAction.complete(m.activity_log_id); }}
                          className="min-h-tap rounded-control text-sub shrink-0 border border-border px-2.5 py-1 font-bold text-success hover:bg-success-surface disabled:opacity-50 lg:min-h-0"
                        >
                          済んだ
                        </button>
                      </RowSlot>
                    )}
                  </Row>
                );
              })}
            </>
          )}

          {awake.length > 0 && (
            <>
              <SectionHead label="今日スヌーズ明け" count={awake.length} />
              {awake.slice(0, PER_SECTION).map((p) => (
                <Row
                  key={p.project_id}
                  divider
                  interactive
                  onClick={() => navigate(`/sales/projects/${p.project_id}`)}
                >
                  <RowSlot w={56} align="center">
                    <AlarmClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  </RowSlot>
                  <RowMain>
                    <RowTitle>{p.project_name || '(案件名なし)'}</RowTitle>
                    <RowSub>
                      {[p.customer_name, p.snooze_until ? `${shortDate(p.snooze_until)} に明けました` : null]
                        .filter(Boolean).join(' ・ ')}
                    </RowSub>
                  </RowMain>
                </Row>
              ))}
            </>
          )}

          {stalled.length > 0 && (
            <>
              <SectionHead label="止まり始めた案件" count={stalled.length} />
              {stalled.slice(0, PER_SECTION).map((p) => (
                <Row
                  key={p.project_id}
                  divider
                  interactive
                  onClick={() => navigate(`/sales/projects/${p.project_id}`)}
                >
                  <RowSlot w={56} align="center">
                    <span className="flex flex-col items-center leading-none">
                      <span className="font-number text-lg font-bold text-warning">{p.stalled_days}</span>
                      <span className="text-sub-sm text-muted-foreground">日放置</span>
                    </span>
                  </RowSlot>
                  <RowMain>
                    <RowTitle>{p.project_name || '(案件名なし)'}</RowTitle>
                    <RowSub>
                      {[STAGE_BADGE_LABEL[p.stage], p.customer_name].filter(Boolean).join(' ・ ')}
                    </RowSub>
                  </RowMain>
                </Row>
              ))}
            </>
          )}
        </>
      )}
    </Panel>
  );
}
