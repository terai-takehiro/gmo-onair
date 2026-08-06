/**
 * ウィークリー活動報告 — 自動集計のところ (v4)
 *
 * AI が投稿した時点の ONAiR のデータを写したもの。**ここは読むだけ**で、
 * 画面から直すことはできない (直すなら元のデータを直す)。
 *
 * ── v4 で変えたところ ────────────────────────────────────────
 *
 * ・金額を `formatYen()` の文字列から **`<Money>`** にした。
 *   「¥1,234,000」を1つの文字列で置くと、桁数の違う金額が縦に並んだとき
 *   円記号の位置がばらついて比べられない
 * ・パイプライン・活動の内訳・イベントを **`Row` + `RowSlot`** に載せた。
 *   `justify-between` で突き放していたので、名前の長さで数字の位置が動いていた
 */
import { Row, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { Card, CardContent } from '@/components/ui/card';
import { ACTIVITY_TYPE_LABELS, STAGE_LABELS, formatDateJa } from '@/lib/types';

export interface StatsShape {
  period?: { week_start: string; week_end: string };
  new_projects?: { count: number; ai_count: number; items: Array<Record<string, unknown>> };
  activities?: { count: number; ai_count: number; by_type: Array<{ activity_type: string; count: number }> };
  pipeline?: Array<{ stage: string; count: number; expected_amount: number }>;
  revenue?: { week_total: number; month_total: number; month: string };
  events_this_week?: Array<Record<string, unknown>>;
  next_week?: {
    events: Array<Record<string, unknown>>;
    next_actions: Array<Record<string, unknown>>;
  };
}

export function StatsSection({ stats }: { stats: StatsShape }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiTile label="新しい案件" value={`${stats.new_projects?.count ?? 0} 件`} sub={aiSub(stats.new_projects?.ai_count)} />
        <KpiTile label="営業の動き" value={`${stats.activities?.count ?? 0} 件`} sub={aiSub(stats.activities?.ai_count)} />
        <KpiTile label="売上（この週）" money={stats.revenue?.week_total ?? 0} />
        <KpiTile label={`売上（${stats.revenue?.month?.slice(5) ?? ''}月の累計）`} money={stats.revenue?.month_total ?? 0} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="いま進んでいる案件">
          {stats.pipeline?.length ? (
            <div className="flex flex-col">
              {stats.pipeline.map((p) => (
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
          ) : <Note>進んでいる案件はありません</Note>}
        </Panel>

        <Panel title="営業の動きの内訳">
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
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="この週のイベント">
          <EventList events={stats.events_this_week ?? []} empty="イベントはありません" />
        </Panel>
        <Panel title="来週の予定">
          <EventList events={stats.next_week?.events ?? []} empty="来週のイベントはありません" />
          {!!stats.next_week?.next_actions?.length && (
            <div className="mt-3 flex flex-col gap-1 border-t border-border-subtle pt-2">
              <p className="text-th text-muted-foreground">期限が来る次のひと押し</p>
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
  );
}

function aiSub(aiCount?: number): string | undefined {
  return aiCount ? `うち AI ${aiCount} 件` : undefined;
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

function KpiTile({ label, value, money, sub }: { label: string; value?: string; money?: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-th text-muted-foreground">{label}</p>
        {money !== undefined
          ? <Money value={money} className="text-h2 mt-0.5" />
          : <p className="text-h2 mt-0.5">{value}</p>}
        {sub && <p className="text-note mt-0.5 text-ai">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function EventList({ events, empty }: { events: Array<Record<string, unknown>>; empty: string }) {
  if (!events.length) return <Note>{empty}</Note>;
  return (
    <div className="flex flex-col">
      {events.slice(0, 8).map((e, i) => (
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
