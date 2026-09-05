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
 * ── タスクは押して開く ──────────────────────────────────────
 *
 * 「3 / 7」の件数を押すと、その工程のタスクが下に出ます
 * （`TaskGroup`・`GET /gpm/tasks?project_id=`）。件数だけだと
 * **何が終わっていないのかがこの画面から分からず**、⑤ 全プロジェクトの
 * タスクへ行って絞り込み直すことになっていました。
 *
 * 既定は閉じています（7工程 × 4〜5タスクで 30行を超えるため）。
 * 開いているかどうかは**呼ぶ側が持ちます** — 行の中に持たせると、
 * 並べ替えで行が作り直された瞬間に閉じます。
 */
import { ChevronDown, ChevronRight, ChevronUp, Pencil } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@gmo-onair/shared/src/client/utils';
import {
  lateDays, PHASE_STATE_LABEL, PHASE_STATE_TONE, ymd, type GpmPhase, type PhaseState,
} from '../../types';

const STATES: PhaseState[] = ['todo', 'doing', 'blocked', 'done'];

/** 工程1件ぶんの props。PC の行とスマホのカードで**同じ組**を使う（写しを作らない） */
export interface PhaseItemProps {
  phase: GpmPhase;
  /** 上から何番目か。PC の行だけが # 列に出す（カードは使わない） */
  index: number;
  /** 今日（`YYYY-MM-DD`）。「N日遅れ」の判定に使う — 呼ぶ側が1回だけ作って配る */
  today: string;
  canEdit: boolean;
  /** タスクを開いているか。**持つのは呼ぶ側** */
  open: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleOpen: (phase: GpmPhase) => void;
  onChangeState: (phase: GpmPhase, state: PhaseState) => void;
  onEdit: (phase: GpmPhase) => void;
  onMove: (phase: GpmPhase, dir: 'up' | 'down') => void;
}

export function PhaseRowsHeader() {
  return (
    <RowHeader className="hidden sm:flex">
      <RowSlot w={56} align="right">#</RowSlot>
      <RowMain>工程 ／ 担当ロール</RowMain>
      <RowSlot w={128}>状態</RowSlot>
      <RowSlot w={128}>期間</RowSlot>
      <RowSlot w={72} align="right">タスク</RowSlot>
      <RowSlot w={96} align="right" placeholder="" />
    </RowHeader>
  );
}

export function PhaseRow({
  phase, index, today, canEdit, open, canMoveUp, canMoveDown, onToggleOpen, onChangeState, onEdit, onMove,
}: PhaseItemProps) {
  const late = lateDays(ymd(phase.ends_on), today, phase.state === 'done');
  return (
    <Row divider stackOnMobile>
      <RowSlot w={56} align="right" className="text-sub-sm font-number text-muted-foreground" hideOnMobile>
        {index + 1}
      </RowSlot>

      <RowMain>
        {/* 工程の名前ぜんたいが開閉のボタン。**件数だけを押させない** —
            「3 / 7」は小さく、指では当たらない */}
        <button
          type="button"
          onClick={() => onToggleOpen(phase)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-1 text-left"
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <RowTitle className={cn(phase.state === 'done' && 'text-muted-foreground line-through')}>
            {phase.label}
          </RowTitle>
        </button>
        <RowSub className="sm:pl-[18px]">{phase.role ? `担当 ${phase.role}` : '担当ロール 未設定'}</RowSub>
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

      <RowSlot w={128} className="flex-col items-start justify-center">
        <DateRange short start={ymd(phase.started_on)} end={ymd(phase.ends_on)} className="text-sub" />
        {late > 0 && <span className="text-badge font-bold text-destructive">{late}日遅れ</span>}
      </RowSlot>

      <RowSlot w={72} align="right" className="text-sub font-number" placeholder="—">
        {phase.task_count > 0 ? `${phase.task_done} / ${phase.task_count}` : null}
      </RowSlot>

      <RowSlot w={96} align="right" placeholder="">
        {canEdit ? (
          <span className="flex shrink-0 items-center justify-end">
            {/* 並べ替えは**隣と入れ替えるだけ**。端では出さない（押せるのに何も
                起きないボタンを置かない）。掴んで動かす形にしないのは、
                スマホで縦に長い表を掴むと画面がスクロールしてしまうため */}
            <button
              type="button"
              onClick={() => onMove(phase, 'up')}
              disabled={!canMoveUp}
              aria-label={`${phase.label} を上に動かす`}
              title="上に動かす"
              className="rounded-control-md min-h-tap flex w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 lg:min-h-[36px]"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMove(phase, 'down')}
              disabled={!canMoveDown}
              aria-label={`${phase.label} を下に動かす`}
              title="下に動かす"
              className="rounded-control-md min-h-tap flex w-8 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 lg:min-h-[36px]"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(phase)}
              aria-label={`${phase.label} を編集`}
              title="工程を編集"
              className="rounded-control-md min-h-tap flex w-8 items-center justify-center text-muted-foreground hover:bg-muted lg:min-h-[36px]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </RowSlot>
    </Row>
  );
}

/**
 * スマホの工程カード（2行固定）。
 *
 * PC の行（`PhaseRow`）は表の列をそのまま `stackOnMobile` で折り返していたが、
 * 375px では状態・日付・件数・操作ボタンがバラバラの位置に散っていた
 * （さらに操作の枠は 96px 固定なのに、スマホの `min-h-tap` が各ボタンを
 * 44px に広げるので 3×44=132px が枠を突き破って隣の列に重なっていた）。
 * スマホは**1行目 = 工程名＋状態 / 2行目 = 担当・期間・タスク数＋操作**に固定する。
 */
export function PhaseCard({
  phase, today, canEdit, open, canMoveUp, canMoveDown, onToggleOpen, onChangeState, onEdit, onMove,
}: PhaseItemProps) {
  const iconBtn = 'rounded-control-md flex h-11 w-11 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30';
  const late = lateDays(ymd(phase.ends_on), today, phase.state === 'done');
  return (
    <div className="border-b border-border-faint px-4 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleOpen(phase)}
          aria-expanded={open}
          className="min-h-tap flex min-w-0 flex-1 items-center gap-1 text-left"
        >
          {open
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <RowTitle className={cn(phase.state === 'done' && 'text-muted-foreground line-through')}>
            {phase.label}
          </RowTitle>
        </button>
        {canEdit ? (
          <>
            <Select
              value={phase.state}
              onValueChange={(v) => onChangeState(phase, v as PhaseState)}
            >
              {/* 幅は7段の96px（`w-24`）。状態は最長でも3字（進行中）なので入る */}
              <SelectTrigger aria-label={`${phase.label} の状態`} className="h-11 w-24 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATES.map((s) => <SelectItem key={s} value={s}>{PHASE_STATE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => onEdit(phase)}
              aria-label={`${phase.label} を編集`}
              className={cn(iconBtn, 'shrink-0')}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <TableBadge w={null} label={PHASE_STATE_LABEL[phase.state]} className={PHASE_STATE_TONE[phase.state]} />
        )}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {/* この行に使えるのは実測213px（DOM実測・375px時）。「担当」の接頭辞と
            件数の空白を落として239→190pxに詰めてある — 戻すと折り返す。
            それでも入り切らない長いロール名は**折り返す**
            （truncate だと担当が幅0まで潰れて消える — 実測） */}
        <div className="text-sub flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0 text-muted-foreground">
          <span className="max-w-full truncate">{phase.role || 'ロール未設定'}</span>
          <span className="opacity-55" aria-hidden="true">・</span>
          <DateRange short start={ymd(phase.started_on)} end={ymd(phase.ends_on)} />
          {phase.task_count > 0 && (
            <>
              <span className="opacity-55" aria-hidden="true">・</span>
              <span className="font-number" aria-label={`タスク ${phase.task_done} / ${phase.task_count}`}>
                {phase.task_done}/{phase.task_count}
              </span>
            </>
          )}
          {late > 0 && <span className="text-badge font-bold text-destructive">{late}日遅れ</span>}
        </div>
        {canEdit && (
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => onMove(phase, 'up')}
              disabled={!canMoveUp}
              aria-label={`${phase.label} を上に動かす`}
              className={iconBtn}
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onMove(phase, 'down')}
              disabled={!canMoveDown}
              aria-label={`${phase.label} を下に動かす`}
              className={iconBtn}
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
