/**
 * ウィークリー活動報告 ▸ 「隔週キープの数字」タブ（`/weekly/:id/keep`）
 *
 * 会議1回ぶんの数字（定例報告パック）を、資料と同じ切り口で見せる:
 *   数値報告（着地・見込・計上会社別）→ 進捗のグラフ → ヨミ表 → 稼働カレンダー →
 *   実施報告 → 定期内覧会。設計の正は `docs/design/v4/keep-report.md` §3・§5。
 *
 * ── 数字は「いまの数字」。確定で凍る ────────────────────────
 * `frozen_at: null` のパックはサーバーが毎回計算する。この週の報告を確定すると
 * パックが凍結され、以後はその版を読む（資料・Slack・AI につなぐ口も同じ版）。
 * 帯で「いまの数字か・凍った数字か」を必ず言う。
 *
 * ── 絞り込みは URL に持つ ───────────────────────────────────
 * `?meeting=&entity_code=&segment=&live=1`（`entity_code` は main の帳簿の列と同じ名前・値は SCS / GSS / GMO）。
 * 共有した URL で同じ数字が開くようにする。
 * 計上会社・お客様のチップの件数は**絞り込まない全体のパック**から数える
 * （絞ったパックから数えると、押していないチップが 0 件に見える）。
 *
 * スマホは要約だけ（`mobile/KeepMobile.tsx`）。出し分けは親から渡る `isMobile` 1本。
 */
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, FileOutput, Info, Snowflake } from 'lucide-react';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { Delayed, ErrorPanel, SkeletonKpi, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { localDateStr } from '@gmo-onair/shared/src/client/format';
import type { KeepReportPack } from '@gmo-onair/shared/src/keepReport/types';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { useKeepMeetings, useKeepPack, useKeepPacks } from '@/lib/keepApi';
import type { OpsReport } from '@/lib/types';
import { EventReportCards } from './EventReportCards';
import { InviewCard } from './InviewCard';
import { JsonDialog } from './JsonDialog';
import { PipelineTable } from './PipelineTable';
import { PlTables } from './PlTables';
import { SlackDraftButton } from './SlackDraftButton';
import { TrendCharts } from './TrendCharts';
import { UtilizationCalendars } from './UtilizationCalendars';
import { KeepMobile } from './mobile/KeepMobile';
import {
  ENTITY_CHIPS, SEGMENT_CHIPS, mdLabel, parseEntity, parseSegment, timeLabel, ymLabel,
} from './format';

interface KeepPayload { keep?: { pack_id?: string; meeting_date?: string } }

export function KeepSection({ report, isMobile }: { report: OpsReport; isMobile: boolean }) {
  const [params, setParams] = useSearchParams();
  const { canEdit, hasPermission } = usePermissions();
  const meetings = useKeepMeetings();
  const packs = useKeepPacks();

  // 会議日: URL → 確定した週報が結んだ版 → 次回の開催日 → 今日（開催日が未登録でも数字は出す）
  const fromReport = (report.payload as KeepPayload | null)?.keep?.meeting_date ?? null;
  const settled = meetings.isFetched || meetings.isError;
  const meeting = params.get('meeting') ?? fromReport ?? meetings.data?.next_meeting_date
    ?? (settled ? localDateStr(new Date()) : null);
  const entity = parseEntity(params.get('entity_code'));
  const segment = parseSegment(params.get('segment'));
  const live = params.get('live') === '1';
  // 「資料をつくる」へは見ている会議日を持って渡る（`WeeklyTabs` と同じ）。落とすと行き先が週から会議日を
  // 導き直し、凍結した過去の数字を見ていたのに別の会議日の構成を開く／作る（レビュー 5 回目 P2）
  const meetingQuery = meeting && /^\d{4}-\d{2}-\d{2}$/.test(meeting) ? `?meeting=${meeting}` : '';

  const q = useKeepPack(meeting, entity, segment, live);
  const base = useKeepPack(meeting, 'all', 'all', live);   // チップの件数用（絞る前）

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all' || v === '0') next.delete(k); else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const counts = countsOf(base.data?.pack ?? q.data?.pack ?? null);
  const options = meetingOptions(meeting, meetings.data, packs.data);
  // 「凍結版がある」は**いま選んでいる絞り込み**で見る（会議日だけで見ると、全体は凍っていても
  // この絞り込みは「いまの数字」なのに「凍結した数字に戻す」が出る）
  const frozenExists = !!packs.data?.some((p) => p.meeting_date === meeting && p.scope_entity === entity && p.scope_segment === segment);

  return (
    <div className="flex flex-col gap-4">
      {!isMobile && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex items-center gap-2">
          <span className="text-sub-sm font-bold text-muted-foreground">対象月</span>
          <label className="inline-flex h-9 items-center gap-2 rounded-control-lg border border-border bg-card px-3 text-sub font-bold">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {q.data && (
              <span className="font-number whitespace-nowrap">
                {ymLabel(q.data.pack.landing.all.year_month, true)} 着地 ・ {ymLabel(q.data.pack.forecast.all.year_month)} 見込
              </span>
            )}
            <select
              aria-label="会議日"
              value={meeting ?? ''}
              onChange={(e) => set({ meeting: e.target.value, live: null })}
              className="max-w-[240px] bg-transparent text-sub font-bold text-foreground focus:outline-none"
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          </span>
          {/* 見出しとチップは**組で折り返す**（別々に折り返すと見出しだけが行末に残る） */}
          <span className="inline-flex max-w-full items-center gap-2">
            <span className="text-sub-sm shrink-0 font-bold text-muted-foreground">計上会社</span>
            <FilterChips
              label="計上会社で絞り込む"
              items={ENTITY_CHIPS.map((c) => ({ key: c.key, label: c.label, count: counts.entity[c.key] ?? null }))}
              value={entity}
              onChange={(k) => set({ entity_code: k })}
            />
          </span>
          <span className="inline-flex max-w-full items-center gap-2">
            <span className="text-sub-sm shrink-0 font-bold text-muted-foreground">お客様</span>
            <FilterChips
              label="お客様の区分で絞り込む"
              items={SEGMENT_CHIPS.map((c) => ({ key: c.key, label: c.label, count: counts.segment[c.key] ?? null }))}
              value={segment}
              onChange={(k) => set({ segment: k })}
            />
          </span>
          <span className="ml-auto flex items-center gap-2">
            <SlackDraftButton meeting={meeting} entity={entity} segment={segment} live={live} />
            {q.data && <JsonDialog pack={q.data.pack} packId={q.data.pack_id} />}
            <Button type="button" size="sm" asChild>
              <Link to={`/weekly/${report.id}/deck${meetingQuery}`}>
                <FileOutput className="mr-1.5 h-4 w-4" aria-hidden="true" />資料をつくる
              </Link>
            </Button>
          </span>
          <p className="text-sub-sm flex basis-full items-center gap-1.5 text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            計上会社は案件の計上会社（グループ内のお客様 → GMOサムライスタジオ／外部のお客様 → GMOサムライコンテンツスタジオ／プロジェクトはグループ本体）。切替前はすべて GMOサムライスタジオです
          </p>
        </div>
      )}

      {q.data && (
        <InfoBar
          pack={q.data.pack}
          frozen={q.data.frozen}
          live={live}
          frozenExists={frozenExists}
          meetingFrozen={q.data.meeting_frozen}
          previous={meetings.data?.previous_meeting_date ?? null}
          next={meetings.data?.next_meeting_date ?? null}
          meeting={meeting}
          onSet={set}
        />
      )}

      {q.isError ? (
        <ErrorPanel title="隔週キープの数字を読み込めませんでした" error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Delayed><SkeletonKpi count={4} /><SkeletonRows rows={6} /></Delayed>
      ) : isMobile ? (
        <KeepMobile pack={q.data.pack} />
      ) : (
        <div className={`flex flex-col gap-5 ${q.isPlaceholderData ? 'opacity-60' : ''}`}>
          <PlTables pack={q.data.pack} entity={entity} />
          <TrendCharts trend={q.data.pack.trend} />
          <PipelineTable pack={q.data.pack} canPick={hasPermission('sales', 'editor')} />
          <UtilizationCalendars calendars={q.data.pack.calendars} />
          <EventReportCards reports={q.data.pack.event_reports} previousMeeting={q.data.pack.previous_meeting_date} />
          <InviewCard inview={q.data.pack.inview} meeting={meeting} canEdit={canEdit} />
        </div>
      )}
    </div>
  );
}

/** 「いまの数字か、凍った数字か」を言う帯。右端に前回／今回の切り替え */
function InfoBar({ pack, frozen, live, frozenExists, meetingFrozen, previous, next, meeting, onSet }: {
  pack: KeepReportPack; frozen: boolean; live: boolean; frozenExists: boolean;
  /** この会議日に全体／全区分の凍結版があるか（`frozen` が false でこれが true なら、この絞り込みの版だけが無い） */
  meetingFrozen: boolean;
  previous: string | null; next: string | null; meeting: string | null;
  onSet: (patch: Record<string, string | null>) => void;
}) {
  const isPrevious = !!previous && meeting === previous && next !== previous;
  const linkCls = 'text-sub-sm inline-flex min-h-tap items-center gap-1 whitespace-nowrap font-bold text-primary hover:underline lg:min-h-0';
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-note border px-3.5 py-2.5 ${
      frozen ? 'border-info-border bg-info-surface' : 'border-primary-border bg-primary-surface-weak'
    }`}>
      {frozen
        ? <Snowflake className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        : <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
      {/* スマホは1行目を文だけにして、切り替えの文言は次の行へ（同じ行に置くと文が細い柱になる） */}
      <span className="text-sub min-w-0 grow basis-full text-foreground lg:basis-0">
        {frozen ? (
          <>
            <span className="font-number">{timeLabel(pack.frozen_at)}</span> に凍結した数字です。
            <span className="hidden lg:inline">資料と Slack の投稿はこの版を読みます。数字を直したいときは元のデータを直してから、もう一度確定してください</span>
          </>
        ) : !live && meetingFrozen ? (
          <>
            この会議日は凍結済みですが、いま選んでいる絞り込みの凍結版が無いので、
            いま ONAiR にある数字（<span className="font-number">{timeLabel(pack.generated_at)}</span> 時点）を出しています。
            <span className="hidden lg:inline">確定した週報の数字とは限りません。この週の報告をもう一度<strong className="font-bold">確定</strong>すると、絞り込みも一緒に凍ります</span>
          </>
        ) : (
          <>
            いま ONAiR にある数字です（<span className="font-number">{timeLabel(pack.generated_at)}</span> 時点）。
            <span className="hidden lg:inline">この週の報告を<strong className="font-bold">確定</strong>すると、この画面の数字も一緒に凍り、資料と Slack の元データになります</span>
          </>
        )}
      </span>
      {frozen && (
        <button type="button" onClick={() => onSet({ live: '1' })} className={linkCls}>いまの数字を見る</button>
      )}
      {!frozen && live && frozenExists && (
        <button type="button" onClick={() => onSet({ live: null })} className={linkCls}>凍結した数字に戻す</button>
      )}
      {previous && !isPrevious && (
        <button type="button" onClick={() => onSet({ meeting: previous, live: null })} className={linkCls}>
          前回 {mdLabel(previous)} の資料に載せた数字と比べる
        </button>
      )}
      {isPrevious && next && (
        <button type="button" onClick={() => onSet({ meeting: null, live: null })} className={linkCls}>
          今回 {mdLabel(next)} の数字に戻る
        </button>
      )}
    </div>
  );
}

/** チップの件数（ヨミ表の案件数を計上会社・区分で数える）。パックが無ければ null＝出さない */
function countsOf(pack: KeepReportPack | null) {
  const entity: Record<string, number | null> = {};
  const segment: Record<string, number | null> = {};
  if (!pack) return { entity, segment };
  const rows = [...pack.pipeline.external, ...pack.pipeline.samurai];
  entity.all = rows.length; segment.all = rows.length;
  for (const k of ['SCS', 'GSS', 'GMO']) entity[k] = rows.filter((r) => r.entity_code === k).length;
  for (const k of ['internal', 'external']) segment[k] = rows.filter((r) => r.customer_segment === k).length;
  return { entity, segment };
}

/** 会議日の選択肢: 次回（いまの数字）・凍結した版・前回。いま選んでいる日は必ず入れる */
function meetingOptions(
  meeting: string | null,
  m: { next_meeting_date: string | null; previous_meeting_date: string | null } | undefined,
  packs: Array<{ meeting_date: string; frozen_at: string | null }> | undefined,
) {
  const out = new Map<string, string>();
  if (m?.next_meeting_date) out.set(m.next_meeting_date, `${mdLabel(m.next_meeting_date)} の会議（次回）`);
  for (const p of packs ?? []) {
    if (!out.has(p.meeting_date)) out.set(p.meeting_date, `${mdLabel(p.meeting_date)} の会議（凍結済み）`);
  }
  if (m?.previous_meeting_date && !out.has(m.previous_meeting_date)) {
    out.set(m.previous_meeting_date, `${mdLabel(m.previous_meeting_date)} の会議（前回）`);
  }
  if (meeting && !out.has(meeting)) out.set(meeting, `${mdLabel(meeting)} の会議`);
  return [...out.entries()].map(([value, label]) => ({ value, label }));
}
