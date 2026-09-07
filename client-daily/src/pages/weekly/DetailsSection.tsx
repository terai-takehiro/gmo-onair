/**
 * ウィークリー活動報告 — 詳細内訳 (2026-09 の再設計)
 *
 * パイプライン・営業活動の内訳・今週のイベント・来週の予定。以前は「自動集計」の
 * 一部として**常に開いた状態で画面の上半分**を占めていたが、読む人の大半は
 * 総括と主要指標だけで足りる。**既定では畳み、下書きのときだけ開く**
 * （総括を書く人にとっては材料なので、書く場面では最初から見えているほうがよい）。
 *
 * 表と行の作りは以前の `StatsSection` から移したもの（PC は `Row`/`RowSlot` で
 * 数字を桁で比べられる列、スマホは1段のカード積み）。
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { Card, CardContent } from '@/components/ui/card';
import { ACTIVITY_TYPE_LABELS, STAGE_LABELS, formatDateJa } from '@/lib/types';
import type { StatsShape } from './StatsSection';

export function DetailsSection({ stats, isMobile, defaultOpen }: {
  stats: StatsShape;
  isMobile: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-card border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="min-h-tap flex w-full items-center gap-2.5 px-4 py-3 text-left lg:min-h-[52px]"
      >
        <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-list shrink-0">詳細内訳</span>
        <span className="text-sub hidden truncate text-muted-foreground sm:inline">
          パイプライン ・ 営業活動の内訳 ・ 今週のイベント ・ 来週の予定
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border-subtle p-3 sm:p-4">
          <AiShare stats={stats} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Panel title="パイプライン">
              {stats.pipeline?.length ? (
                isMobile ? <PipelineCards pipeline={stats.pipeline} /> : <PipelineRows pipeline={stats.pipeline} />
              ) : <Note>進行中の案件はありません</Note>}
            </Panel>

            <Panel title="営業活動の内訳">
              {stats.activities?.by_type?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {stats.activities.by_type.map((t) => (
                    <TableBadge
                      key={t.activity_type}
                      label={`${ACTIVITY_TYPE_LABELS[t.activity_type] ?? t.activity_type} ${t.count}`}
                      w={null}
                      className="bg-muted text-muted-foreground"
                    />
                  ))}
                </div>
              ) : <Note>この週の活動記録はありません</Note>}
            </Panel>

            <Panel title="今週のイベント">
              <EventList events={stats.events_this_week ?? []} empty="イベントはありません" isMobile={isMobile} />
            </Panel>

            <Panel title="来週の予定">
              <EventList events={stats.next_week?.events ?? []} empty="来週のイベントはありません" isMobile={isMobile} />
              {!!stats.next_week?.next_actions?.length && (
                <div className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-2">
                  <p className="text-th text-muted-foreground">期限が近い次のアクション</p>
                  {stats.next_week.next_actions.slice(0, 8).map((a, i) => (
                    <p key={i} className="text-sub-sm">
                      <span className="font-number text-muted-foreground">{formatDateJa(String(a.next_action_date ?? ''))}</span>{' '}
                      {String(a.next_action ?? '')}
                      {a.project_name ? <span className="text-muted-foreground"> ({String(a.project_name)})</span> : null}
                    </p>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AI がどれだけ関与したか。**主要指標のカードからはこの行を外した**（数字の隣に
 * 出すと、読む人には「AI が何件やったか」が指標そのものに見える）。数えている値は
 * 変えず、置き場所だけ内訳へ移した — 会社方針「AIを使い捨てにしない」の
 * 条件3（成果を出力に紐づける）で使う数字なので、消さずに残す。
 */
function AiShare({ stats }: { stats: StatsShape }) {
  const p = stats.new_projects;
  const a = stats.activities;
  if (!p?.ai_count && !a?.ai_count) return null;
  return (
    <p className="text-sub text-muted-foreground">
      AI の関与：新規案件 {p?.count ?? 0}件のうち起票 <span className="font-number">{p?.ai_count ?? 0}</span>件、
      営業活動 {a?.count ?? 0}件のうち取込 <span className="font-number">{a?.ai_count ?? 0}</span>件
    </p>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-th mb-2 text-muted-foreground">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-sub text-muted-foreground">{children}</p>;
}

/** PC専用。列を縦に比べられる `Row`/`RowSlot`（数字を桁で並べたいのでこちら） */
function PipelineRows({ pipeline }: { pipeline: NonNullable<StatsShape['pipeline']> }) {
  return (
    <div className="flex flex-col">
      {pipeline.map((p) => (
        <Row key={p.stage} density="table" divider className="px-0">
          <RowMain><RowTitle>{STAGE_LABELS[p.stage] ?? p.stage}</RowTitle></RowMain>
          <RowSlot w={56} align="right">
            <span className="font-number text-sub">{p.count}件</span>
          </RowSlot>
          <RowSlot w={128} align="right">
            {Number(p.expected_amount) > 0 ? <Money value={Number(p.expected_amount)} className="text-sub" /> : null}
          </RowSlot>
        </Row>
      ))}
    </div>
  );
}

/**
 * スマホ専用。固定幅の列に押し込めるのをやめ、1段ぶんのカードを積む
 * （`DayCards.tsx` と同じ考え方 — 列を消すのではなくカードとして組み直す）。
 */
function PipelineCards({ pipeline }: { pipeline: NonNullable<StatsShape['pipeline']> }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {pipeline.map((p) => (
        <li
          key={p.stage}
          className="flex items-center justify-between gap-3 rounded-note border border-border-subtle bg-surface-subtle px-3 py-2.5"
        >
          <span className="text-list min-w-0 truncate">{STAGE_LABELS[p.stage] ?? p.stage}</span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="font-number text-sub text-muted-foreground">{p.count}件</span>
            {Number(p.expected_amount) > 0 && <Money value={Number(p.expected_amount)} className="text-list" />}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventList({ events, empty, isMobile }: { events: Array<Record<string, unknown>>; empty: string; isMobile: boolean }) {
  if (!events.length) return <Note>{empty}</Note>;
  const shown = events.slice(0, 8);
  return isMobile ? <EventCards events={shown} /> : <EventRows events={shown} />;
}

/** PC専用。GLS番号・実施日を列として比べられる `Row`/`RowSlot` */
function EventRows({ events }: { events: Array<Record<string, unknown>> }) {
  return (
    <div className="flex flex-col">
      {events.map((e, i) => (
        <Row key={i} density="table" divider className="px-0">
          <RowSlot w={72} placeholder="">
            {e.gls_number ? <span className="font-number text-sub-sm text-primary">{String(e.gls_number)}</span> : null}
          </RowSlot>
          <RowMain><RowTitle>{String(e.name ?? '')}</RowTitle></RowMain>
          <RowSlot w={128} align="right" placeholder="">
            {e.event_start ? (
              <DateRange
                start={String(e.event_start)}
                end={e.event_end ? String(e.event_end) : null}
                short
                className="text-sub-sm text-muted-foreground"
              />
            ) : null}
          </RowSlot>
        </Row>
      ))}
    </div>
  );
}

/** スマホ専用。GLS番号 → 件名 → 実施日 の3段に積む（`DayCards.tsx` と同じ考え方） */
function EventCards({ events }: { events: Array<Record<string, unknown>> }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {events.map((e, i) => (
        <li key={i} className="rounded-note border border-border-subtle bg-surface-subtle px-3 py-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {e.gls_number ? <span className="font-number text-sub-sm text-primary">{String(e.gls_number)}</span> : null}
            <span className="text-list min-w-0 truncate">{String(e.name ?? '')}</span>
          </div>
          {e.event_start ? (
            <DateRange
              start={String(e.event_start)}
              end={e.event_end ? String(e.event_end) : null}
              short
              className="text-sub-sm mt-0.5 block text-muted-foreground"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
