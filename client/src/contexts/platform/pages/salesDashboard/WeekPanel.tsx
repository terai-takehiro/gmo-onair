/**
 * 「今週の現場」(v4 ①)
 *
 * `GET /dashboard/weekly-schedule` が返す**今日から7日ぶん**を、日ごとに縦に積みます。
 *
 * ── 7列のカレンダーにしない ────────────────────────────────
 *
 * 旧実装は PC で7列のマス目を描いていました。1マスに入る文字が
 * 「本番: GLS-2601-001」程度しかなく、**何の現場か分からない**ので、
 * ダッシュボードでは日ごとに1行にして、行き先と場所を読める形にしています
 * (マス目で見たい人はカレンダーを開きます)。
 *
 * ── 予定が無い日も行を残す ─────────────────────────────────
 *
 * 空の日を畳むと「金曜が無い＝まだ読み込み中？」と見えます。
 * **「予定なし」と書いて行を残す**のが v4 の決めごと (_rules.md「4. 空・失敗」)。
 *
 * ── 自分の期限タスクを併載する（根源整理 §3-5） ──────────────
 *
 * カレンダーと同じ `GET /dailyops/tasks/deadlines` を**この週の範囲**で読み、
 * 現場の下に小さく重ねます。鍵はカレンダーと同じ族
 * (`taskLayer.ts` の `TASK_DEADLINE_KEY`) なので、キャッシュも失効も揃います。
 * dailyops 権限が無い人にはクエリごと止め、何も出しません（403 を画面に出さない）。
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import {
  TASK_DEADLINE_KEY, TASK_DEADLINE_COLOR, type TaskDeadline,
} from '@/contexts/production/pages/calendar/taskLayer';
import { Panel } from './Panel';
import type { WeekDay } from './types';

/** 1日に出す上限。**超えた分は件数だけ**にする (縦に伸びると他の枚と高さが合わない) */
const PER_DAY = 3;
/** 期限タスクの1日の上限。現場より控えめにし、多い日は「+N」で潰れないようにする */
const DL_PER_DAY = 2;

const TYPE_LABEL: Record<string, string> = {
  event: '本番',
  recording: '収録',
  broadcast: '放送',
  booking: '予約',
};

/** 予定の色。**本番だけ濃くする** — 全部に色を付けると本番が埋もれる */
const TYPE_TONE: Record<string, string> = {
  event: 'bg-primary',
  recording: 'bg-info',
  broadcast: 'bg-info',
  booking: 'bg-muted-foreground/40',
};

function titleOf(e: WeekDay['events'][number]): string {
  return e.name || e.project_name || e.gls_number || e.episode_code || '(名前なし)';
}

/** 自分の期限タスクを日付ごとに引く。読む口も鍵もカレンダーの4層目と同じ */
function useWeekDeadlines(days: WeekDay[]) {
  const { currentUser, hasPermission } = useAuth();
  const canTasks = currentUser?.role === 'system_admin' || hasPermission('dailyops');
  const from = days[0]?.date;
  const to = days[days.length - 1]?.date;
  const q = useQuery<TaskDeadline[]>({
    queryKey: [TASK_DEADLINE_KEY, from, to],
    queryFn: async () => (await api.get('/dailyops/tasks/deadlines', {
      params: { from, to },
    })).data.data,
    enabled: canTasks && !!from && !!to,
    // 日常業務（別バンドル）での完了はキャッシュ失効が届かないので短めに持つ
    // （`useCalendarEvents.ts` と同じ判断）
    staleTime: 30_000,
  });
  const byDate = useMemo(() => {
    const m = new Map<string, TaskDeadline[]>();
    for (const t of q.data ?? []) {
      const d = t.due_at.slice(0, 10);
      (m.get(d) ?? m.set(d, []).get(d)!).push(t);
    }
    return m;
  }, [q.data]);
  return { canTasks, byDate, isError: q.isError, total: q.data?.length ?? 0 };
}

export function WeekPanel({ days }: { days: WeekDay[] }) {
  const total = days.reduce((n, d) => n + d.events.length, 0);
  const dl = useWeekDeadlines(days);

  return (
    <Panel
      title="今週の現場"
      note={dl.canTasks ? '今日から7日ぶん ・ 〆 は自分の期限タスク' : '今日から7日ぶん'}
      to="/studio/calendar"
      toLabel="カレンダー"
    >
      {days.length === 0 ? (
        <EmptyState title="予定を読み込めませんでした" description="カレンダーを開くと最新の状態が見られます。" />
      ) : total === 0 && dl.total === 0 ? (
        <EmptyState title="今週の現場はありません" description="実施日が入った案件がここに並びます。" />
      ) : (
        <div className="flex flex-col">
          {days.map((d) => {
            const dayDl = dl.byDate.get(d.date) ?? [];
            return (
              <div key={d.date} className="flex gap-3 border-t border-border-subtle py-2 first:border-t-0">
                {/* 日付は等幅。**曜日を頭に置く** — 現場は曜日で覚えている */}
                <span className="font-number text-sub w-14 shrink-0 pt-0.5 font-bold text-secondary-foreground">
                  {d.dayLabel} {d.date.slice(5).replace('-', '/')}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {d.events.length === 0 && dayDl.length === 0 ? (
                    <span className="text-sub text-muted-foreground">予定なし</span>
                  ) : (
                    <>
                      {d.events.slice(0, PER_DAY).map((e, i) => (
                        <span key={i} className="flex items-start gap-2">
                          <span className={`mt-0.5 w-[3px] shrink-0 self-stretch rounded-full ${TYPE_TONE[e.type] ?? TYPE_TONE.booking}`} />
                          <span className="min-w-0">
                            <span className="text-sub block truncate font-bold">{titleOf(e)}</span>
                            <span className="text-sub-sm block text-muted-foreground">
                              {TYPE_LABEL[e.type] ?? e.type}{e.gls_number ? ` ・ ${e.gls_number}` : ''}
                            </span>
                          </span>
                        </span>
                      ))}
                      {d.events.length > PER_DAY && (
                        <span className="text-sub-sm text-muted-foreground">ほか {d.events.length - PER_DAY}件</span>
                      )}
                      {/* 自分の期限タスク。現場の下に1行ずつ・多い日は +N で畳む */}
                      {dayDl.slice(0, DL_PER_DAY).map((t) => (
                        <span key={t.id} className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="text-badge shrink-0 font-bold"
                            style={{ color: TASK_DEADLINE_COLOR }}
                          >
                            〆 {t.due_at.slice(11, 16)}
                          </span>
                          <span className="text-sub-sm min-w-0 truncate text-secondary-foreground">{t.title}</span>
                        </span>
                      ))}
                      {dayDl.length > DL_PER_DAY && (
                        <span className="text-sub-sm" style={{ color: TASK_DEADLINE_COLOR }}>
                          〆 ほか +{dayDl.length - DL_PER_DAY}件
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {/* 読めなかったことは黙らない（0件と「読めなかった」は別のこと） */}
          {dl.isError && (
            <p className="text-sub-sm border-t border-border-subtle pt-2 text-muted-foreground">
              自分の期限タスクは、いま読めませんでした。
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
