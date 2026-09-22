/**
 * タスク一覧のリスト表示 (v4 ④)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   タスク       伸びる (`RowMain`)                           モック flex:1
 *   案件         200px (`RowSlot`)                            モック 210px
 *   担当         96px  (`RowSlot`)                            モック 96px
 *   状態         96px  (`TableBadge`)                         モック 88px
 *   期限         96px  (`RowSlot`)                            モック 104px
 *   対応         128px (`RowSlot`)                            —
 *
 * **片づける操作は「対応済にする」ボタンにしてあります。** 以前はタスク名の左に
 * 18px の四角 (チェック) を貼り付けていましたが、四角には文字が無いので
 * 「押すと何が起きるか」が読み取れませんでした。文字のボタンは狭い枠に入らないので、
 * 7段の 128px を1つ足して**行の右端の列**にしています (縦にはそろいます)。
 */
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { TaskDoneButton } from '@gmo-onair/shared/src/client-v4/taskDoneButton';
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
      <RowSlot w={128} align="center">対応</RowSlot>
    </RowHeader>
  );
}

/** 期限の出し方。**超過だけを赤にする** — 全部に色を付けると超過が埋もれる */
function due(dueDate: string | null, today: string, done: boolean) {
  if (!dueDate) return null;
  const text = dueDate.slice(5).replace('-', '/');
  if (done) return { text, sub: null, tone: 'text-muted-foreground' };
  if (dueDate < today) return { text, sub: '期限超過', tone: 'text-destructive' };
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

      {/*
        その場で片づけられるのがこの画面の値打ち (モックもそうしている)。
        押すのは行を開く操作と**別**なので、行全体を押せるようにはしていません
        (片づけたいだけなのに詳細が開くと、毎回閉じることになる)。
      */}
      <RowSlot w={128} align="center">
        <TaskDoneButton done={done} onToggle={onToggle} taskTitle={t.title} size="sm" />
      </RowSlot>
    </Row>
  );
}
