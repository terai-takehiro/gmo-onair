/**
 * 工程（フェーズ）の並び — ③ プロジェクト詳細「概要」
 *
 * ── 状態だけをその場で変えられるようにした ──────────────────
 *
 * 工程の進み具合はほぼ「終わった」「始めた」「止まった」の3つで、
 * そのたびにダイアログを開かせると誰も更新しなくなります（更新されない
 * 工程表は見られなくなる）。だから状態は**選ぶだけ**にしてあります。
 *
 * **日付とロールは一緒に送ります。** `PUT /gpm/phases/:id` の日付は
 * `COALESCE` ではなく素の代入なので、状態だけを送ると
 * **開始日・終了日・担当ロールが消えます**（サーバーの SQL を読んで確認済み）。
 *
 * ── タスクの中身は出していません ────────────────────────────
 *
 * 工程配下のタスクは `project_tasks` にありますが、**それを読む API が
 * ありません**（既存の一覧は `JOIN projects` するので、案件に紐づかない
 * GPM のタスクは1件も返りません）。件数だけはサーバーが数えているので
 * 件数を出し、**一覧が無いことを画面に書いています**。
 */
import { Pencil } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  PHASE_STATE_LABEL, PHASE_STATE_TONE, ymd, type GpmPhase, type PhaseState,
} from '../../types';

const STATES: PhaseState[] = ['todo', 'doing', 'blocked', 'done'];

export function PhaseRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={56} align="right">#</RowSlot>
      <RowMain>工程 ／ 担当ロール</RowMain>
      <RowSlot w={128}>状態</RowSlot>
      <RowSlot w={128}>期間</RowSlot>
      <RowSlot w={72} align="right">タスク</RowSlot>
      <RowSlot w={56} align="right" placeholder="" />
    </RowHeader>
  );
}

export function PhaseRow({
  phase, index, canEdit, onChangeState, onEdit,
}: {
  phase: GpmPhase;
  index: number;
  canEdit: boolean;
  onChangeState: (phase: GpmPhase, state: PhaseState) => void;
  onEdit: (phase: GpmPhase) => void;
}) {
  return (
    <Row divider stackOnMobile>
      <RowSlot w={56} align="right" className="text-sub-sm font-number text-muted-foreground" hideOnMobile>
        {index + 1}
      </RowSlot>

      <RowMain>
        <RowTitle className={cn(phase.state === 'done' && 'text-muted-foreground line-through')}>
          {phase.label}
        </RowTitle>
        <RowSub>{phase.role ? `担当 ${phase.role}` : '担当ロール 未設定'}</RowSub>
      </RowMain>

      <RowSlot w={128}>
        {canEdit ? (
          <Select
            value={phase.state}
            onValueChange={(v) => onChangeState(phase, v as PhaseState)}
          >
            <SelectTrigger aria-label={`${phase.label} の状態`} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATES.map((s) => <SelectItem key={s} value={s}>{PHASE_STATE_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <TableBadge w={null} label={PHASE_STATE_LABEL[phase.state]} className={PHASE_STATE_TONE[phase.state]} />
        )}
      </RowSlot>

      <RowSlot w={128}>
        <DateRange short start={ymd(phase.started_on)} end={ymd(phase.ends_on)} className="text-sub" />
      </RowSlot>

      <RowSlot w={72} align="right" className="text-sub font-number" placeholder="—">
        {phase.task_count > 0 ? `${phase.task_done} / ${phase.task_count}` : null}
      </RowSlot>

      <RowSlot w={56} align="right" placeholder="">
        {canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(phase)}
            aria-label={`${phase.label} を直す`}
            title="工程を直す"
            className="rounded-control-md min-h-tap flex w-11 items-center justify-center text-muted-foreground hover:bg-muted lg:min-h-[36px] lg:w-9"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </RowSlot>
    </Row>
  );
}
