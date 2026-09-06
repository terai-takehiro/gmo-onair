/**
 * ② プロジェクト一覧の行 (v4 GPM)
 *
 * 列はモックの並びそのまま、幅だけ7段（`SlotWidth`）に寄せています:
 *
 *   プロジェクト ／ 依頼元・PM   伸びる (`RowMain`)
 *   状態                          96px (`TableBadge`)
 *   いまの工程                    128px
 *   進み具合                      96px   … 工程の完了数から出す（列には無い）
 *   見積                          128px  … 束ごとに最新版・値引きは引く・税抜
 *   次にやること                  200px
 *   未確認                        56px   … 0 件は薄く出す（「無い」も情報）
 *
 * ── 見積の列は「いま出ている金額」 ──────────────────────────
 *
 * 金額の出し方は**案件一覧とまったく同じ式**（サーバーの `ESTIMATE_AMOUNT_LATERAL`）
 * です。同じ見積が画面によって違う金額に見えるのがいちばん困るので、
 * 束ごとに最新版を採り、旧版と失注を外し、値引きを引き、**税は乗せません**。
 * 版と状態（`個別見積 v2 提出済`）はいちばん新しい1本から採ります。
 *
 * ── 進み具合を「%だけ」にしない ──────────────────────────────
 *
 * 42% とだけ出ても、10 工程の 4 つ目なのか 100 タスクの 42 なのか分かりません。
 * 帯の下に **`4 / 10 工程`** を添えます（サーバーが数えた `phase_done` /
 * `phase_count` をそのまま使う — 画面で数え直さない）。
 *
 * ── 表頭はクリックで並べ替えられる（v4・一覧フォーマット統一 PR②・delta 4） ──
 *
 * 並び替え自体は既にプルダウン（`FilterBar.tsx` の `SORT_OPTIONS`）で実装済みなので、
 * ここは**同じ `sort` state を押しボタンにして見せているだけ**（案件一覧
 * `sales/pages/projectList/ProjectRows.tsx` と同じ作法: 印は指を乗せたときだけ薄く出す）。
 * 押せるのは `SORT_OPTIONS` に対応する2列（見積・次のアクション）だけ。
 */
import { AlertCircle, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  ESTIMATE_STATUS_LABEL, KIND_LABEL, dueLabel, dueTone, progressPct, ymd,
  type GpmProjectRow,
} from '../../types';
import { headerSortActive, nextHeaderSort, type SortKey } from './sort';
/**
 * **ステージのバッジは案件一覧と同じものを使う** (migration 179)。
 * プロジェクトは GLS-B の案件なので、同じステージに別の色・別の言葉を当てると
 * 「同じ段なのに画面によって見え方が違う」ことになる。
 */
import {
  STAGE_BADGE_LABEL, STAGE_BADGE_TONE, TERMINAL_STAGES,
} from '@/contexts/sales/pages/projectList/stages';
/**
 * 健全性バッジも**案件一覧と同じ部品**（docs/core-redesign-plan.md §3-1）。
 * サーバーが行に付けて返す `health` / `stalled_days` / `snooze_until` を
 * そのまま渡すだけで、GPM 側で日数を数え直さない（写しを作ると
 * 同じプロジェクトが案件台帳と GPM で違う状態に見える）。
 */
import { HealthBadge } from '@/contexts/sales/pages/projectList/health';

/**
 * 押せる表頭1マス。`headerKey` が無い列（プロジェクト ／ 状態 ／ いまの工程 ／
 * 進み具合 ／ 未確認）はプルダウンに対応する並び順が無いので、ただの文字のまま
 * （`ProjectRowsHeader` が `headerKey` を渡した列だけボタンになる）。
 */
function HeaderLabel({
  label, headerKey, sort, onSort, align,
}: {
  label: string;
  headerKey?: SortKey;
  sort?: SortKey;
  onSort?: (key: SortKey) => void;
  align?: 'right';
}) {
  if (!headerKey || !sort || !onSort) {
    return <span className={cn('truncate', align === 'right' && 'block text-right')}>{label}</span>;
  }
  const active = headerSortActive(sort, headerKey);
  return (
    <button
      type="button"
      onClick={() => onSort(nextHeaderSort(sort, headerKey))}
      title={`${label}で並べ替える`}
      aria-label={`${label}で並べ替える${active ? '・並べ替え中' : ''}`}
      className={cn(
        'group -mx-1 flex w-full items-center gap-1 rounded-control px-1 py-0.5 hover:bg-border-faint',
        align === 'right' && 'justify-end',
        active && 'font-bold text-primary',
      )}
    >
      <span className="truncate">{label}</span>
      {/* **並べ替えていないときの印は、指を乗せたときだけ出す**（案件一覧と同じ理由 —
          常に出すと固定幅の列が切れる） */}
      {active
        ? <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        : <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40" aria-hidden="true" />}
    </button>
  );
}

export function ProjectRowsHeader({
  sort, onSort,
}: {
  /** いまの並び順。プルダウン（`FilterBar`）と共有する。省略すると表頭は押せないただの文字になる */
  sort?: SortKey;
  onSort?: (key: SortKey) => void;
}) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain>プロジェクト ／ 依頼元・担当</RowMain>
      <RowSlot w={96}>状態</RowSlot>
      <RowSlot w={128}>いまの工程</RowSlot>
      <RowSlot w={96}>進み具合</RowSlot>
      <RowSlot w={128} align="right" aria-sort={sort ? (headerSortActive(sort, 'estimate_desc') ? 'descending' : 'none') : undefined}>
        <HeaderLabel label="見積" headerKey="estimate_desc" sort={sort} onSort={onSort} align="right" />
      </RowSlot>
      <RowSlot w={200} aria-sort={sort ? (headerSortActive(sort, 'due_asc') ? 'ascending' : 'none') : undefined}>
        <HeaderLabel label="次のアクション" headerKey="due_asc" sort={sort} onSort={onSort} />
      </RowSlot>
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
    p.customer_name,
    p.pm_company ? `PM会社 ${p.pm_company}` : '自社PM',
    p.assigned_to_name ? `担当 ${p.assigned_to_name}` : null,
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
        TERMINAL_STAGES.includes(p.stage) && 'opacity-70 hover:opacity-100',
      )}
    >
      <RowMain>
        <div className="flex items-center gap-2">
          <RowTitle>{p.name}</RowTitle>
          <span className="text-badge shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
            {p.gpm_kind ? KIND_LABEL[p.gpm_kind] : '区分なし'}
          </span>
          <HealthBadge p={p} />
        </div>
        <RowSub>{pmLine || '依頼元 未設定'}</RowSub>
      </RowMain>

      <TableBadge w={96} label={STAGE_BADGE_LABEL[p.stage]} className={STAGE_BADGE_TONE[p.stage]} />

      <RowSlot w={128} className="text-sub min-w-0" hideOnMobile>
        {p.current_phase ? <span className="truncate">{p.current_phase}</span> : null}
      </RowSlot>

      <RowSlot w={96} hideOnMobile className="flex-col items-start justify-center">
        <ProgressBar done={p.phase_done} count={p.phase_count} />
      </RowSlot>

      {/* 見積。**まだ1本も無いときは「見積なし」**（0円ではない） */}
      <RowSlot w={128} align="right" hideOnMobile className="flex-col items-end justify-center gap-0.5">
        {p.estimate_amount === null || p.estimate_amount === undefined ? (
          <span className="text-sub-sm text-muted-foreground">見積なし</span>
        ) : (
          <>
            <Money value={p.estimate_amount} className="text-sub w-full" />
            <span className="text-sub-sm w-full truncate text-right text-muted-foreground">
              {[
                p.estimate_version ? `v${p.estimate_version}` : null,
                p.estimate_status ? ESTIMATE_STATUS_LABEL[p.estimate_status] : null,
              ].filter(Boolean).join(' ')}
            </span>
          </>
        )}
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
