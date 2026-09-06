/**
 * ④ 新規作成 ステップ3 — 着手日と工程の確認
 *
 * 着手日を入れると、**前の工程が終わったら次が始まる**前提で日程が並びます
 * （数え方の根拠は `schedule.ts`。正はサーバーの `expandTemplate()`）。
 *
 * ── 着手日を入れなくても作れる ──────────────────────────────
 *
 * 発注は決まったが着手日が決まっていない、は普通に起きます。
 * 入れないときは**工程の並びだけ**入り、日付は空のままです（**推測しない**）。
 * そのことを画面に書きます — 書かないと「日付が消えた」と読まれます。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Row, RowHeader, RowMain, RowTitle, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { previewSchedule, previewEnd, totalDays, type PreviewSource } from './schedule';

export interface PreviewStepProps {
  startedOn: string;
  onStartedOn: (v: string) => void;
  template: PreviewSource | undefined;
  templateName: string | null;
}

export function PreviewStep({ startedOn, onStartedOn, template, templateName }: PreviewStepProps) {
  const rows = previewSchedule(template, startedOn);
  const end = previewEnd(rows);
  const days = totalDays(rows);

  return (
    <div className="rounded-card overflow-hidden border border-border bg-card">
      <div className="flex flex-wrap items-end gap-4 border-b border-border-subtle p-4 lg:px-5">
        {/* **1段目（基本情報）と同じ値**。ここは工程の並びを見ながら直す場所として残す
            （`GpmProjectFormPage` の `startedOn` を両方が触る） */}
        <div>
          <Label htmlFor="gpm-start">着手日</Label>
          <Input
            id="gpm-start"
            type="date"
            className="w-full sm:w-52"
            value={startedOn}
            onChange={(e) => onStartedOn(e.target.value)}
          />
        </div>
        <p className="text-note min-w-0 flex-1 text-muted-foreground">
          {rows.length === 0 ? (
            'ひな形を選んでいないので工程はまだありません。作ったあとに足せます。'
          ) : startedOn ? (
            <>
              前の工程が終わったら次が始まる前提で日付を入れます。
              <strong>土日祝も1日として数えます</strong>（営業日で数えるかは決まっていません）。
              <br />
              工程 <span className="font-number">{rows.length}</span> ・ 目安{' '}
              <span className="font-number">{days}</span>日 ・ 完了見込み{' '}
              <span className="font-number">{end?.replace(/-/g, '/')}</span>
            </>
          ) : (
            <>
              着手日を入れると日付が入ります。
              <strong>入れなくても作れます</strong>（工程の並びだけ入り、日付は空のままです）。
            </>
          )}
        </p>
      </div>

      {rows.length > 0 && (
        <>
          <RowHeader className="hidden sm:flex">
            <RowSlot w={56} align="right">#</RowSlot>
            <RowMain>工程{templateName ? `（${templateName}）` : ''}</RowMain>
            <RowSlot w={96}>担当ロール</RowSlot>
            <RowSlot w={56} align="right">タスク</RowSlot>
            <RowSlot w={56} align="right">所要</RowSlot>
            <RowSlot w={128}>期間</RowSlot>
          </RowHeader>
          {rows.map((p, i) => (
            <Row key={`${p.label}-${i}`} divider stackOnMobile>
              <RowSlot w={56} align="right" className="text-sub-sm font-number text-muted-foreground">
                {i + 1}
              </RowSlot>
              <RowMain><RowTitle>{p.label}</RowTitle></RowMain>
              <RowSlot w={96} className="text-sub" hideOnMobile>{p.role}</RowSlot>
              <RowSlot w={56} align="right" className="text-sub font-number" hideOnMobile>
                {p.taskCount}
              </RowSlot>
              <RowSlot w={56} align="right" className="text-sub font-number">
                {p.days}日
              </RowSlot>
              <RowSlot w={128}>
                <DateRange short start={p.start} end={p.end} className="text-sub" />
              </RowSlot>
            </Row>
          ))}
        </>
      )}
    </div>
  );
}
