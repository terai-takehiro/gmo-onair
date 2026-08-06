/**
 * タスク一覧のリスト表示 (v4 ④)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   タスク       伸びる (`RowMain`。チェックボックスを内包)   モック flex:1
 *   案件         200px (`RowSlot`)                            モック 210px
 *   担当         96px  (`RowSlot`)                            モック 96px
 *   状態         96px  (`TableBadge`)                         モック 88px
 *   期限         96px  (`RowSlot`)                            モック 104px
 *
 * **チェックボックスは列にしていません。** 7段のいちばん狭い枠が 56px で、
 * 18px の四角を入れるには広すぎます。段を1つ増やすと「その画面だけの幅」が
 * 生まれるので、**タスク名の左に貼り付けて `RowMain` の中に入れました**
 * (`RowMain` の左端は行をまたいで同じ位置なので、縦にはそろいます)。
 */
import { Check } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { taskState, TASK_STATE_LABEL, TASK_STATE_TONE } from './state';
import type { DashboardTask } from '@/types';

/** 表頭。**スマホでは出しません** — 行が縦積みになるので指す先がありません */
export function TaskRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain>タスク</RowMain>
      <RowSlot w={200}>案件</RowSlot>
      <RowSlot w={96}>担当</RowSlot>
      <RowSlot w={96}>状態</RowSlot>
      <RowSlot w={96} align="right">期限</RowSlot>
    </RowHeader>
  );
}

/** 期限の出し方。**超過だけを赤にする** — 全部に色を付けると超過が埋もれる */
function due(dueDate: string | null, today: string, done: boolean) {
  if (!dueDate) return null;
  const text = dueDate.slice(5).replace('-', '/');
  if (done) return { text, sub: null, tone: 'text-muted-foreground' };
  if (dueDate < today) return { text, sub: '過ぎています', tone: 'text-destructive' };
  if (dueDate === today) return { text, sub: '今日が期限', tone: 'text-warning' };
  return { text, sub: null, tone: 'text-secondary-foreground' };
}

export function TaskRow({
  t,
  today,
  onToggle,
  onOpen,
}: {
  t: DashboardTask;
  today: string;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const state = taskState(t);
  const done = state === 'done';
  const d = due(t.due_date, today, done);

  return (
    <Row divider interactive stackOnMobile align="center">
      <RowMain className="flex items-center gap-2.5">
        {/*
          その場で完了にできるのがこの画面の値打ち (モックもそうしている)。
          タップ領域はスマホ 44px / PC 36px — どちらも決めた段の中にある。
          押すのは行を開く操作と**別**なので、行全体を押せるようにはしていません
          (チェックだけしたいのに詳細が開くと、毎回閉じることになる)。
        */}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          title={done ? '完了を取り消します' : '完了にします'}
          className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center sm:h-9 sm:w-9"
        >
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-badge-xs border-[1.5px] ${
              done ? 'border-success bg-success' : 'border-border-disabled bg-card'
            }`}
          >
            <Check
              className={`h-3 w-3 text-success-foreground ${done ? '' : 'opacity-0'}`}
              aria-hidden="true"
            />
          </span>
        </button>

        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <RowTitle className={done ? 'text-muted-foreground line-through' : ''}>
            {t.title}
          </RowTitle>
          {t.column_name && <RowSub>{t.column_name}</RowSub>}
        </button>
      </RowMain>

      <RowSlot w={200} hideOnMobile className="text-sub min-w-0 text-muted-foreground">
        <span className="w-full truncate" title={t.project_name}>{t.project_name}</span>
      </RowSlot>

      <RowSlot w={96} hideOnMobile className="gap-2">
        {t.assigned_to_name ? (
          <>
            <span
              className="text-badge flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-chip bg-primary-surface text-primary"
              aria-hidden="true"
            >
              {t.assigned_to_name.slice(0, 1)}
            </span>
            <span className="text-sub min-w-0 truncate text-secondary-foreground">
              {t.assigned_to_name}
            </span>
          </>
        ) : null}
      </RowSlot>

      <TableBadge w={96} label={TASK_STATE_LABEL[state]} className={TASK_STATE_TONE[state]} />

      <RowSlot w={96} align="right" className="flex-col items-end justify-center gap-0.5">
        {d ? (
          <>
            <span className={`text-sub font-number font-bold ${d.tone}`}>{d.text}</span>
            {d.sub && <span className={`text-sub-sm ${d.tone}`}>{d.sub}</span>}
          </>
        ) : null}
      </RowSlot>
    </Row>
  );
}
