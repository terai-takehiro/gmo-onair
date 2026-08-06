/**
 * 案件一覧のリスト表示 (v4)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   案件 ／ お客様   伸びる (`RowMain`)      モック flex:1
 *   ステージ         96px (`TableBadge`)     モック 98px
 *   実施日           96px (`RowSlot`)        モック 62px → 期間 (開始〜終了) を
 *                                            出すので 96px に上げた
 *   金額             128px (`MoneyCell`)     モック 108px
 *   次のタスク       200px (`RowSlot`)       モック 210px
 *   最後の動き       72px (`RowSlot`)        モック 74px
 *
 * **7段から外れた幅を作らないこと** — 同じ意味の列がページごとに違う幅になり、
 * 目が横に流れなくなります (docs/design/v4/_rules.md「1. 縦の整列」)。
 *
 * スマホでは `stackOnMobile` で案件名が1行を独占し、実施日・次のタスク・
 * 最後の動きは**消えます** (`hideOnMobile`)。狭めるのではなく消すのが方針です。
 */
import { Sparkles } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { STAGE_BADGE_LABEL, STAGE_BADGE_TONE, TERMINAL_STAGES, isStale } from './stages';
import type { ProjectListRow } from './types';

/**
 * 表頭。**スマホでは出しません** — 行が縦積みになるので、
 * 列の名前が並んでいても指す先がありません。
 */
export function ProjectRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain>案件 ／ お客様</RowMain>
      <RowSlot w={96}>ステージ</RowSlot>
      <RowSlot w={96}>実施日</RowSlot>
      <RowSlot w={128} align="right">金額</RowSlot>
      <RowSlot w={200}>次のタスク</RowSlot>
      <RowSlot w={72} align="right">最後の動き</RowSlot>
    </RowHeader>
  );
}

/** 期限の色。**超過だけを赤にする** — 全部に色を付けると超過が埋もれる */
function dueTone(due: string | null, today: string): string {
  if (!due) return 'text-muted-foreground';
  if (due < today) return 'text-destructive';
  if (due === today) return 'text-warning';
  return 'text-muted-foreground';
}

function dueLabel(due: string | null, today: string): string | null {
  if (!due) return null;
  const short = due.slice(5).replace('-', '/');
  if (due < today) return `${short} 超過`;
  if (due === today) return `${short} 今日`;
  return short;
}

export function ProjectRow({
  p,
  today,
  onOpen,
}: {
  p: ProjectListRow;
  today: string;
  onOpen: () => void;
}) {
  const revenue = Number(p.total_revenue) || 0;
  const expected = Number(p.expected_amount) || 0;
  // 確定売上があればそれ。無ければ想定金額を**薄く**出す
  // (同じ列に確定と想定が混ざるので、色で区別できないと足し算してしまう)
  const amount = revenue > 0 ? revenue : expected > 0 ? expected : null;
  const isExpected = revenue === 0 && expected > 0;
  const terminal = TERMINAL_STAGES.includes(p.stage);
  const stale = isStale(p.stage, p.last_activity_at);
  const due = dueLabel(p.next_task_due, today);

  return (
    <Row
      divider
      interactive
      stackOnMobile
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${terminal ? 'opacity-70 hover:opacity-100' : ''}`}
    >
      <RowMain>
        <div className="flex items-center gap-2">
          <RowTitle>{p.name}</RowTitle>
          {stale && (
            <span className="text-badge shrink-0 rounded-badge-xs bg-destructive-surface px-1.5 py-0.5 text-destructive">
              止まっている
            </span>
          )}
          {p.is_ai_created && (
            <span
              className="text-badge inline-flex shrink-0 items-center gap-0.5 rounded-badge-xs bg-ai-surface px-1.5 py-0.5 text-ai"
              title={p.ai_reviewed_at ? 'AI が作りました (確認済み)' : 'AI が作りました (未確認)'}
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              AI
              {!p.ai_reviewed_at && '・未確認'}
            </span>
          )}
        </div>
        <RowSub>
          {p.customer_name || 'お客様 未設定'}
          {(p.gls_number || p.code) && ` ・ ${p.gls_number || p.code}`}
        </RowSub>
      </RowMain>

      <TableBadge
        w={96}
        label={STAGE_BADGE_LABEL[p.stage] ?? p.stage}
        className={STAGE_BADGE_TONE[p.stage]}
      />

      <RowSlot w={96} hideOnMobile>
        {p.event_start || p.event_end
          ? <DateRange short start={p.event_start} end={p.event_end} className="text-sub" />
          : null}
      </RowSlot>

      <MoneyCell
        width={128}
        value={amount}
        className={`text-sub ${isExpected ? 'text-muted-foreground' : ''}`}
        title={isExpected ? '想定金額 (確定した売上はまだありません)' : undefined}
      />

      <RowSlot w={200} hideOnMobile className="flex-col items-start justify-center gap-0.5">
        {p.next_task_title ? (
          <>
            <span className="text-sub w-full truncate font-bold">
              {p.next_task_assignee ? `${p.next_task_assignee}：` : ''}{p.next_task_title}
            </span>
            {due && <span className={`text-sub-sm font-number ${dueTone(p.next_task_due, today)}`}>{due}</span>}
          </>
        ) : null}
      </RowSlot>

      <RowSlot w={72} align="right" hideOnMobile className="text-sub-sm font-number text-muted-foreground">
        {formatRelativeTime(p.last_activity_at) || null}
      </RowSlot>
    </Row>
  );
}
