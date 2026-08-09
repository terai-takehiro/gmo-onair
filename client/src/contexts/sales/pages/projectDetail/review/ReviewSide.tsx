/**
 * ふりかえりの右側 — お金と進み方 (v4 ⑥ 案件記録)
 *
 * ── サブ列に入ることが前提 ──────────────────────────────────
 *
 * 指示書 2-1 で**実施記録がメイン**になったので、この2枚は 340px の列に入ります。
 * そのぶん詰め方が本文側と違います:
 *
 *   ・注記は**ラベルの下段**（横に並べると金額スロットが押されて桁がそろわない）
 *   ・金額スロットは **124px**（一覧の 7 段だとラベルが折り返す）
 *   ・進み方は**縦積み**（ラベル左・数値右）
 *
 * ── 作り話をしない ──────────────────────────────────────────
 *
 * 「見積より N% 高く売れた」は書きません。値引きなのか追加受注なのかは
 * 数字からは分からないので、**並べるだけ**にします。
 */
import { Wallet, ListChecks } from 'lucide-react';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';

export interface ReviewSummary {
  total_revenue: number;
  total_purchase: number;
  gross_profit: number;
  gross_margin: number;
}

/**
 * お金の金額スロット（指示書 2-5 の指定）。**サブ列（340px）に入るので詰めます** —
 * 一覧の 7 段（…160 / 200 / 240）だと、ラベルが 2 行に折り返します。
 */
const MONEY_W = 'w-[124px]';  // ui-tokens-ok: ふりかえりのサブ列に入る金額スロット

const num = (v: unknown): number => Number(v) || 0;

export function ReviewSide({
  expectedAmount, quoted, sentVersion, summary, taskTotal, taskDone, taskLate, eventStart,
}: {
  expectedAmount: number | string | null;
  quoted: number | null;
  sentVersion: number | null;
  summary?: ReviewSummary;
  taskTotal: number;
  taskDone: number;
  taskLate: number;
  eventStart: string | null;
}) {
  const s = summary;
  return (
    <div className="flex min-w-0 flex-col gap-3.5">
      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">お金</h3>
        </div>
        {/* **引き算の順に並べる**（想定 → 見積 → 売上 → 仕入 → 粗利） */}
        <Line label="想定していた金額" value={expectedAmount === null ? null : num(expectedAmount)}
          note="案件をつくったときの見込み" />
        <Line label="出した見積" value={quoted}
          note={sentVersion ? `v${sentVersion}（値引きのあと）` : '出した見積がありません'} />
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

      <section className="rounded-card overflow-hidden border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border-faint px-4 py-2.5">
          <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-cardtitle min-w-0 flex-1">進み方</h3>
        </div>
        {taskTotal === 0 ? (
          <p className="text-sub px-4 py-3 text-muted-foreground">タスクを1つも入れていない案件です。</p>
        ) : (
          <div className="flex flex-col">
            <Stat label="終わったタスク" value={`${taskDone} / ${taskTotal}`} />
            <Stat label="期限を過ぎたまま" value={String(taskLate)} bad={taskLate > 0} />
            {eventStart && <Stat label="実施日" value={eventStart} />}
          </div>
        )}
      </section>
    </div>
  );
}

/** 引き算の1段。**利益だけ枠と色を変える**（財務ダッシュボードと同じ考え方） */
function Line({
  label, value, note, result, bad,
}: { label: string; value: number | null; note?: string; result?: boolean; bad?: boolean }) {
  return (
    <div className={cn(
      'flex items-start gap-3 px-4 py-2.5',
      result ? 'rounded-note border border-border bg-surface-subtle' : 'border-b border-border-faint',
    )}>
      <span className="min-w-0 flex-1">
        <span className={cn('block', result ? 'text-list' : 'text-sub text-muted-foreground')}>{label}</span>
        {note && <span className="text-note block text-muted-foreground">{note}</span>}
      </span>
      {value === null
        ? <span className="text-sub text-muted-foreground">—</span>
        : <Money value={value} className={cn(MONEY_W, 'shrink-0 justify-end', result && 'text-list', bad && 'text-destructive')} />}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-border-faint px-4 py-2.5 last:border-b-0">
      <span className="text-sub min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className={cn('font-number text-list', bad && 'text-destructive')}>{value}</span>
    </div>
  );
}
