/**
 * 隔週キープの数字 — ①ヨミ表（提案進行 案件）
 *
 * 9/4 の資料は ONAiR の案件一覧のスクリーンショットだった。ここは案件一覧と同じ並び
 * （確度 → 実施日）で、**外部案件のあとにサムライ関連**（相手がサムライパートナーズ／
 * GMOサムライコンテンツスタジオ）を続けて出す。資料では別表になる。
 *
 * 「資料」の印（`keep_pick`）は**案件の持ち物**なので案件管理の API に書く
 * （`lib/keepApi.ts` の `useSetKeepPick`）。印を付けた案件だけが案件ページになる。
 * PC 専用の行（スマホは `mobile/KeepMobile.tsx` のカード）。
 */
import { Check, ListOrdered } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money, MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { notifyApiError } from '@gmo-onair/shared/src/client/notify';
import type { KeepReportPack, PipelineRow } from '@gmo-onair/shared/src/keepReport/types';
import { useSetKeepPick } from '@/lib/keepApi';
import { SectionHead } from './SectionHead';
import { CONFIDENCE_TONE, STAGE_WORDS, circled, mdLabel, pickOf } from './format';

const SAMURAI_BADGE = 'border-warning-border bg-warning-surface text-warning';

/** 印のチェック。44px の当たり判定の中に 20px の箱（見た目はモックの箱のまま） */
function PickBox({ picked, disabled, pending, onToggle }: {
  picked: boolean; disabled: boolean; pending: boolean; onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={picked}
      aria-label={picked ? '資料に載せる（外す）' : '資料に載せる'}
      disabled={disabled || pending}
      onClick={onToggle}
      className="flex h-11 w-11 items-center justify-center rounded-control disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span
        className={`inline-flex h-5 w-5 items-center justify-center rounded-badge-xs border ${
          picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card'
        }`}
      >
        {picked && <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} />}
      </span>
    </button>
  );
}

function PipelineRowView({ row, ordinal, picked, canPick }: {
  row: PipelineRow; ordinal: number | null; picked: boolean; canPick: boolean;
}) {
  const setPick = useSetKeepPick();
  const tone = CONFIDENCE_TONE[row.confidence] ?? CONFIDENCE_TONE.E;
  const onToggle = () => {
    setPick.mutate({ projectId: row.project_id, keep_pick: !picked }, {
      onError: (e) => notifyApiError('「資料」の印を保存できませんでした', e),
    });
  };
  return (
    <Row divider>
      <RowSlot w={56} placeholder="">
        <span className={`font-number text-list ${ordinal ? '' : 'text-muted-foreground'}`}>{circled(ordinal)}</span>
      </RowSlot>
      <RowMain>
        <RowTitle>
          <a href={`/sales/projects/${row.project_id}`} className="hover:underline">{row.name}</a>
          {row.samurai_related && (
            <TableBadge label="サムライ関連" w={null} className={`ml-1.5 align-middle ${SAMURAI_BADGE}`} />
          )}
        </RowTitle>
        <RowSub>
          {row.customer_name} ・ <span className="font-number">{row.code}</span>
          {row.since_last === 'new' && <span className="ml-1.5 font-bold text-primary">新規</span>}
          {row.since_last === 'updated' && <span className="ml-1.5 font-bold text-muted-foreground">更新</span>}
        </RowSub>
      </RowMain>
      <RowSlot w={96}>
        <span className={`font-number w-4 shrink-0 text-list ${tone.letter}`}>{row.confidence}</span>
        <TableBadge label={STAGE_WORDS[row.confidence] ?? row.stage} w={null} className={tone.badge} />
      </RowSlot>
      <RowSlot w={96}>
        <DateRange start={row.event_start} end={row.event_end} short className="text-sub" />
      </RowSlot>
      {row.estimate_amount === null
        ? <RowSlot w={128} align="right"><span className="text-sub text-muted-foreground">提案前</span></RowSlot>
        : <MoneyCell value={row.estimate_amount} width={128} className="text-sub" />}
      <RowSlot w={200}>
        <span className="flex min-w-0 flex-col">
          <span className={`text-sub truncate ${row.next_action ? '' : 'text-muted-foreground'}`}>{row.next_action ?? '—'}</span>
          {(row.next_action_owner || row.next_action_date) && (
            <span className="text-sub-sm truncate text-muted-foreground">
              {row.next_action_owner && <span className="font-bold">{row.next_action_owner}</span>}
              {row.next_action_date && <span className="font-number ml-1">{mdLabel(row.next_action_date)}</span>}
            </span>
          )}
        </span>
      </RowSlot>
      <RowSlot w={72} align="right">
        <span className="font-number text-sub-sm text-muted-foreground">{formatRelativeTime(row.last_activity_at) || '—'}</span>
      </RowSlot>
      <RowSlot w={56} align="center" placeholder="">
        <PickBox picked={picked} disabled={!canPick} pending={setPick.isPending} onToggle={onToggle} />
      </RowSlot>
    </Row>
  );
}

export function PipelineTable({ pack, canPick }: { pack: KeepReportPack; canPick: boolean }) {
  const rows = [...pack.pipeline.external, ...pack.pipeline.samurai];
  const pages = new Map(pack.project_pages.map((p) => [p.project_id, p.ordinal]));
  const pickedIds = new Set(pages.keys());
  const added = rows.filter((r) => r.since_last === 'new').length;
  const updated = rows.filter((r) => r.since_last === 'updated').length;
  const prev = pack.previous_meeting_date ? mdLabel(pack.previous_meeting_date) : null;

  return (
    <div className="flex flex-col gap-3">
      <SectionHead
        icon={ListOrdered}
        title="提案進行 案件 ヨミ表"
        note="受注前の案件を確度順に。資料では外部案件とサムライ関連を分けて出します。「資料」に印を付けた案件だけ案件ページになります"
        right={prev ? (
          <span className="text-sub-sm whitespace-nowrap text-muted-foreground">
            前回（{prev}）から 新規 <span className="font-number">{added}</span> ・ 更新 <span className="font-number">{updated}</span>
          </span>
        ) : undefined}
      />
      <div className="overflow-hidden rounded-card border border-border bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[960px]">
            <RowHeader density="list">
              <RowSlot w={56} placeholder="" />
              <RowMain>案件 ／ お客様</RowMain>
              <RowSlot w={96}>確度</RowSlot>
              <RowSlot w={96}>実施日</RowSlot>
              <RowSlot w={128} align="right">見積金額</RowSlot>
              <RowSlot w={200}>次のタスク</RowSlot>
              <RowSlot w={72} align="right">最後の動き</RowSlot>
              <RowSlot w={56} align="center">資料</RowSlot>
            </RowHeader>
            {rows.length === 0 && (
              <p className="text-sub px-4 py-6 text-center text-muted-foreground">
                受注前の案件はいまありません。案件管理で案件を作るとここに並びます
              </p>
            )}
            {rows.map((row) => (
              <PipelineRowView
                key={row.project_id}
                row={row}
                ordinal={pages.get(row.project_id) ?? null}
                picked={pickOf(row, pickedIds)}
                canPick={canPick}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border-faint bg-surface-subtle px-4 py-2.5">
          <span className="text-sub-sm text-muted-foreground">確度加味の売上見込み</span>
          <Money value={pack.pipeline.weighted_revenue} inline className="text-cardtitle" />
          <span className="text-sub-sm inline-flex items-center gap-1 text-muted-foreground">
            （総額 <Money value={pack.pipeline.total_revenue} inline className="text-sub-sm" /> ・ 財務ダッシュボードの「営業見通し」と同じ計算）
          </span>
          <a href="/sales/projects" className="text-sub-sm ml-auto whitespace-nowrap font-bold text-primary hover:underline">
            案件一覧で開く
          </a>
        </div>
      </div>
    </div>
  );
}
