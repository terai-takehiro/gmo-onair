/**
 * ② プロジェクト一覧の行 (v4 GPM)
 *
 * 列はモックの並びそのまま、幅だけ7段（`SlotWidth`）に寄せています:
 *
 *   プロジェクト ／ 依頼元・PM   伸びる (`RowMain`)
 *   状態                          96px (`TableBadge`)
 *   いまの工程                    128px
 *   進み具合                      96px   … 工程の完了数から出す（列には無い）
 *   次にやること                  200px
 *   未確認                        56px   … 0 件は薄く出す（「無い」も情報）
 *
 * ── 進み具合を「%だけ」にしない ──────────────────────────────
 *
 * 42% とだけ出ても、10 工程の 4 つ目なのか 100 タスクの 42 なのか分かりません。
 * 帯の下に **`4 / 10 工程`** を添えます（サーバーが数えた `phase_done` /
 * `phase_count` をそのまま使う — 画面で数え直さない）。
 */
import { AlertCircle } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  KIND_LABEL, STATUS_LABEL, STATUS_TONE, dueLabel, dueTone, progressPct, ymd,
  type GpmProjectRow,
} from '../../types';

export function ProjectRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain>プロジェクト ／ 依頼元・担当</RowMain>
      <RowSlot w={96}>状態</RowSlot>
      <RowSlot w={128}>いまの工程</RowSlot>
      <RowSlot w={96}>進み具合</RowSlot>
      <RowSlot w={200}>次にやること</RowSlot>
      <RowSlot w={56} align="right">未確認</RowSlot>
    </RowHeader>
  );
}

/** 進み具合の帯。**工程が1つも無いときは帯を出さない**（0% と「まだ無い」は別） */
export function ProgressBar({ done, count }: { done: number; count: number }) {
  const pct = progressPct(done, count);
  if (pct === null) {
    return <span className="text-sub-sm text-muted-foreground">工程なし</span>;
  }
  return (
    <span className="block w-full">
      <span className="block h-1.5 overflow-hidden rounded-chip bg-muted">
        <span className="v4-bar block h-1.5 rounded-chip bg-primary" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-sub-sm font-number mt-1 block text-muted-foreground">
        {done} / {count} 工程
      </span>
    </span>
  );
}

export function ProjectRow({
  p, today, onOpen,
}: {
  p: GpmProjectRow;
  today: string;
  onOpen: () => void;
}) {
  const due = ymd(p.next_due);
  const dueText = dueLabel(due, today);
  const pmLine = [
    p.client_name,
    p.pm_company ? `PM会社 ${p.pm_company}` : '自社PM',
    p.pm_name ? `担当 ${p.pm_name}` : null,
  ].filter(Boolean).join(' ・ ');

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
      className={cn(
        'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        p.status === 'done' && 'opacity-70 hover:opacity-100',
      )}
    >
      <RowMain>
        <div className="flex items-center gap-2">
          <RowTitle>{p.name}</RowTitle>
          <span className="text-badge shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
            {KIND_LABEL[p.kind]}
          </span>
        </div>
        <RowSub>{pmLine || '依頼元 未設定'}</RowSub>
      </RowMain>

      <TableBadge w={96} label={STATUS_LABEL[p.status]} className={STATUS_TONE[p.status]} />

      <RowSlot w={128} className="text-sub min-w-0" hideOnMobile>
        {p.current_phase ? <span className="truncate">{p.current_phase}</span> : null}
      </RowSlot>

      <RowSlot w={96} hideOnMobile className="flex-col items-start justify-center">
        <ProgressBar done={p.phase_done} count={p.phase_count} />
      </RowSlot>

      <RowSlot w={200} hideOnMobile className="flex-col items-start justify-center gap-0.5">
        {p.next_task ? (
          <>
            <span className="text-sub w-full truncate font-bold">{p.next_task}</span>
            {dueText && <span className={cn('text-sub-sm font-number', dueTone(due, today))}>{dueText}</span>}
          </>
        ) : null}
      </RowSlot>

      <RowSlot w={56} align="right" placeholder="">
        {p.open_items > 0 ? (
          <span className="text-sub font-number inline-flex items-center gap-1 text-destructive">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {p.open_items}
          </span>
        ) : (
          <span className="text-sub font-number text-muted-foreground">0</span>
        )}
      </RowSlot>
    </Row>
  );
}
