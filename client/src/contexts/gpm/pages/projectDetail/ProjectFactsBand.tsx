/**
 * ③ プロジェクト詳細「事実の帯」— 期間・進み具合（PR③・項目10）
 *
 * 以前はヘッダー右上に数値で出していた「期間」「進み具合」を、
 * 案件詳細⑥の「本文先頭の事実の帯」と同じ考え方で本文側へ移した。
 * ヘッダー右上は**その画面でいちばんやること**（＋タスクを追加）に譲る。
 *
 * どのタブでも同じ位置（本文のいちばん上）に出す — タブごとに出したり
 * 消したりすると、見たい数字がタブによってあったり無かったりする。
 */
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { StatValue } from '@gmo-onair/shared/src/client/ui/numbers';
import { phaseProgress, ymd, type GpmProjectDetail } from '../../types';

export function ProjectFactsBand({ project }: { project: GpmProjectDetail }) {
  const progress = phaseProgress(project.phases);
  return (
    <div className="rounded-card grid grid-cols-2 gap-y-3 border border-border bg-card px-1 py-3">
      <div className="min-w-0 px-3.5 lg:px-5">
        <p className="text-note text-muted-foreground">期間</p>
        <DateRange
          start={ymd(project.started_on)}
          end={ymd(project.ends_on)}
          className="text-sub mt-0.5 font-bold"
        />
      </div>
      <div className="min-w-0 border-l border-border px-3.5 lg:px-5">
        <p className="text-note text-muted-foreground">進み具合</p>
        {progress.pct === null ? (
          <p className="text-sub mt-0.5 font-bold">工程なし</p>
        ) : (
          <>
            <p className="mt-0.5 flex items-baseline gap-1">
              <StatValue size="sm">{progress.pct}</StatValue>
              <span className="text-note text-muted-foreground">%</span>
            </p>
            <p className="text-note text-muted-foreground">{progress.done} / {progress.count} 工程</p>
          </>
        )}
      </div>
    </div>
  );
}
