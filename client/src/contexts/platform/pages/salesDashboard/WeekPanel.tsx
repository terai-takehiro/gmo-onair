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
 */
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Panel } from './Panel';
import type { WeekDay } from './types';

/** 1日に出す上限。**超えた分は件数だけ**にする (縦に伸びると他の枚と高さが合わない) */
const PER_DAY = 3;

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

export function WeekPanel({ days }: { days: WeekDay[] }) {
  const total = days.reduce((n, d) => n + d.events.length, 0);

  return (
    <Panel title="今週の現場" note="今日から7日ぶん" to="/studio/calendar" toLabel="カレンダー">
      {days.length === 0 ? (
        <EmptyState title="予定を読み込めませんでした" description="カレンダーを開くと最新の状態が見られます。" />
      ) : total === 0 ? (
        <EmptyState title="今週の現場はありません" description="実施日が入った案件がここに並びます。" />
      ) : (
        <div className="flex flex-col">
          {days.map((d) => (
            <div key={d.date} className="flex gap-3 border-t border-border-subtle py-2 first:border-t-0">
              {/* 日付は等幅。**曜日を頭に置く** — 現場は曜日で覚えている */}
              <span className="font-number text-sub w-14 shrink-0 pt-0.5 font-bold text-secondary-foreground">
                {d.dayLabel} {d.date.slice(5).replace('-', '/')}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {d.events.length === 0 ? (
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
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
