/**
 * 案件一覧のリスト表示 (v4)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   案件 ／ お客様   伸びる (`RowMain`)      モック flex:1
 *   ステージ         96px (`TableBadge`)     モック 98px
 *   実施日           96px (`RowSlot`)        モック 62px → 期間 (開始〜終了) を
 *                                            出すので 96px に上げた
 *   見積金額         128px (`MoneyCell`)     モック 108px
 *                                            → **段（`SlotWidth`）に無い幅は作らない。**
 *                                              9桁（¥126,400,000）を想定して 128px。
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
import { rowInProps, type RowAnim } from './rowAnim';
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
      {/* **列名は左揃え・数値は右揃え。** 名前まで右に寄せると、
          数字の右端と列名の右端が重なって桁が読みにくい */}
      <RowSlot w={128}>見積金額</RowSlot>
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

/**
 * 次のタスクの担当。**名前だけの角丸ピル**にする（指示書 4-5）。
 *
 * 「山田：見積を送る」のように文中に混ぜると、**タスク名と担当が同じ字面**になり、
 * 誰がやるのか目で拾えません。ピルにすると列の中で位置が揃うので、
 * 一覧を縦に流したときに「担当が決まっていない行」がすぐ見つかります。
 *
 * **頭文字のアバターは出しません。** 同姓の人が同じ丸になるうえ、
 * 200px の列で 20px を色の丸に使うと、タスク名が読めなくなります。
 *
 * 担当がいない行にも**同じ位置に薄いピル**を置いて列を保ちます
 * （消すと期限だけが左に寄って、担当がいる行とずれる）。
 */
function AssigneePill({ name }: { name: string | null }) {
  return (
    <span
      className={`text-badge inline-flex max-w-[96px] shrink-0 items-center truncate rounded-chip px-2 py-0.5 ${
        name ? 'bg-muted text-foreground' : 'bg-muted/60 text-fg-disabled'
      }`}
    >
      {name || '未定'}
    </span>
  );
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
  row,
  onOpen,
}: {
  p: ProjectListRow;
  today: string;
  row?: RowAnim;
  onOpen: () => void;
}) {
  /**
   * **見積金額**。出した見積があればその金額、まだ無ければ**想定金額を薄字**で出す。
   *
   * 確定売上（`total_revenue`）は出しません — 列名が「見積金額」なので、
   * 受注済の行だけ中身が売上に変わると**同じ列で意味が2つ**になります。
   * 実績は案件詳細の見積・請求タブと財務の台帳で見ます。
   */
  const estimate = Number(p.estimate_amount) || 0;
  const expected = Number(p.expected_amount) || 0;
  const amount = estimate > 0 ? estimate : expected > 0 ? expected : null;
  const isExpected = estimate === 0 && expected > 0;
  const terminal = TERMINAL_STAGES.includes(p.stage);
  const stale = isStale(p.stage, p.last_activity_at);
  const due = dueLabel(p.next_task_due, today);

  return (
    <Row
      divider
      interactive
      stackOnMobile
      /* 並び替え・絞り込みで滑らせるための鍵（`client-v4/flip.ts`）。
         **位置ではなく鍵で覚える** — 行数が変わったときに別の案件どうしを結ばない。
         `data-row`（検査の印）とは別の属性にしてある */
      data-flip-key={p.id}
      {...rowInProps(row)}
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
        title={isExpected ? '想定金額 (まだ見積を出していません)' : undefined}
      />

      <RowSlot w={200} hideOnMobile className="flex-col items-start justify-center gap-0.5">
        {p.next_task_title ? (
          <>
            <span className="text-sub w-full truncate font-bold">{p.next_task_title}</span>
            <span className="flex w-full items-center gap-1.5">
              <AssigneePill name={p.next_task_assignee} />
              {due && <span className={`text-sub-sm font-number ${dueTone(p.next_task_due, today)}`}>{due}</span>}
            </span>
          </>
        ) : null}
      </RowSlot>

      <RowSlot w={72} align="right" hideOnMobile className="text-sub-sm font-number text-muted-foreground">
        {formatRelativeTime(p.last_activity_at) || null}
      </RowSlot>
    </Row>
  );
}
