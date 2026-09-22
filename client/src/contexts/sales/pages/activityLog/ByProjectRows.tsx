/**
 * 案件別のやること — 1案件＝1つの白い面 (v4・営業活動記録の作り直し)
 *
 * ── 色帯のカードを使わない ──────────────────────────────────
 *
 * 期限超過を目立たせるために面を赤く塗ると、**画面のほとんどが赤くなります**
 * （利用者のご指摘「期限超過でない案件もある」＝全部を赤くしない）。
 * ここは **白い面＋細い罫線の並び**（既存の `Row` / `RowHeader` / `RowSlot` の語彙）で組み、
 * **色は文字にだけ使います**（赤いのは期限超過の日付と注記だけ）。
 *
 * ── 列は案件をまたいで縦にそろえる ──────────────────────────
 *
 * `docs/design/v4/_rules.md`「1. 縦の整列」。案件ごとに幅を決めると、
 * 上下の案件で「期限」の位置がずれて**目が縦に流せません**。
 * どの案件のまとまりも同じ `RowSlot` の段（128 / 200 / 200）を使います。
 *
 *   期限            128px
 *   次のアクション  伸びる (`RowMain`)
 *   記録された活動  200px（スマホでは落として `RowMain` の下に回す）
 *   操作            200px
 *
 * ── スマホ ──────────────────────────────────────────────────
 *
 * `Row stackOnMobile` で縦積みになります。見出しの行も `flex-wrap` なので
 * 375px で横スクロールは出ません（本文は 13px 以上・ボタンは `min-h-tap`）。
 */
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { getActivityType } from './kinds';
import { duePartsOf } from './dueState';
import { eventDateLabel } from './eventDate';
import { NextActionButtons } from './NextActionButtons';
import type { NextActionItem, ProjectActivityGroup } from './byProject';
import type { useNextActionActions } from './useNextActionActions';
// ヨミ（ステージ）の和文は `projectList/stages.ts` の表をそのまま読む（2か所に持たない）
import { STAGE_BADGE_LABEL } from '../projectList/stages';
import type { ProjectStage } from '@/types';

type Actions = ReturnType<typeof useNextActionActions>;


/** 期限の色。**期限超過だけが赤** — それ以外を赤くすると赤が意味を失う */
const DUE_TONE: Record<string, string> = {
  overdue: 'text-destructive',
  today: 'text-warning',
};

/**
 * AI が立てたやることの印。
 *
 * **面は塗らず文字だけ**（今回の設計方針）。印が要るのは、人が書いた行を削除しても
 * AI への差分（`ai_corrections`）が1件も残らないためで、
 * **利用者が「AI の間違いを直している」と思える行がどれか**をはっきりさせる必要があるから。
 */
function AiMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-sub-sm text-ai" title="AI が立てた次のアクションです">
      <Sparkles className="h-3 w-3" aria-hidden="true" />AI
    </span>
  );
}

/** 案件の状態（右肩）。件数を出すのは期限超過だけ — 他は数えても打つ手が変わらない */
function GroupStatus({ g }: { g: ProjectActivityGroup }) {
  if (g.overdue_count > 0) {
    return <span className="text-sub font-bold text-destructive">期限超過 {g.overdue_count}件</span>;
  }
  if (g.today_count > 0 || g.week_count > 0) {
    return <span className="text-sub text-secondary-foreground">期限内</span>;
  }
  if (g.none_count > 0) {
    return <span className="text-sub text-muted-foreground">期限未設定</span>;
  }
  return null;
}

/** 1件の次のアクション */
function ActionRow({
  a, today, actions, onEdit,
}: {
  a: NextActionItem;
  today: string;
  actions: Actions;
  onEdit?: (id: string) => void;
}) {
  const due = duePartsOf(a.next_action_date, today);
  const tone = DUE_TONE[due.state] ?? 'text-foreground';
  const at = getActivityType(a.activity_type);
  const [, m, d] = a.activity_date.split('-');
  const source = `${Number(m)}/${Number(d)} ${at.label}「${a.subject}」`;

  return (
    <Row divider stackOnMobile align="start" density="table">
      <RowSlot w={128}>
        <div className="flex min-w-0 flex-col">
          <span className={cn('font-number text-sub', tone)}>
            <span className="text-sub-sm text-muted-foreground sm:hidden">期限 </span>
            {due.date}
          </span>
          {due.note && <span className={cn('text-sub-sm', tone)}>{due.note}</span>}
        </div>
      </RowSlot>

      <RowMain>
        <div className="flex min-w-0 items-start gap-1.5">
          {/* 1行に収めず2行まで出す — 省略すると「何をするのか」が読めない */}
          <p className="min-w-0 flex-1 text-sub text-foreground">{a.next_action}</p>
          {a.ai_generated && <AiMark />}
        </div>
        {/* 「記録された活動」列はスマホでは落とすので、ここに回す */}
        <RowSub className="sm:hidden">{source}</RowSub>
      </RowMain>

      <RowSlot w={200} hideOnMobile>
        <span className="truncate text-sub-sm text-muted-foreground" title={source}>{source}</span>
      </RowSlot>

      <RowSlot w={200}>
        <NextActionButtons id={a.id} actions={actions} onEdit={onEdit} />
      </RowSlot>
    </Row>
  );
}

/** 案件1件のまとまり */
function GroupCard({
  g, today, actions, onEdit,
}: {
  g: ProjectActivityGroup;
  today: string;
  actions: Actions;
  onEdit?: (id: string) => void;
}) {
  const stage = g.stage ? STAGE_BADGE_LABEL[g.stage as ProjectStage] : null;
  // 管理番号は発番済みなら GLS 番号、まだなら仮の社内コード（どちらも無い案件もある）
  const number = g.project_gls || g.project_code;
  const meta = [number, stage, g.owner_name].filter(Boolean).join(' ・ ');
  const last = g.last_activity_date
    ? `最終接触 ${Number(g.last_activity_date.split('-')[1])}/${Number(g.last_activity_date.split('-')[2])}`
      + ` ${getActivityType(g.last_activity_type ?? 'other').label}`
      + (g.last_activity_subject ? `「${g.last_activity_subject}」` : '')
    : null;

  return (
    <section className="rounded-card border border-border bg-card">
      {/*
        スマホでは**見出しを縦に積む**。横に並べたままだと、右の塊
        （状態＋「やり取りを開く」）が縮まないので 375px では案件名に 100px 程度しか
        残らず、「秋の新製…」まで削れて**どの案件か読めなくなる**（実測）
      */}
      <div className="flex flex-col gap-1.5 border-b border-border-faint px-4 py-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-3">
        <div className="min-w-0 sm:flex-1">
          {/* **タイトル → クライアント → 実施日** の順（営業担当がこの順で探す） */}
          <RowTitle className="font-bold">
            {g.project_name ?? '案件にひも付かない記録'}
          </RowTitle>
          <RowSub className="text-secondary-foreground">
            {g.customer_name ?? 'クライアント未設定'}
            {g.project_id && ` ・ ${eventDateLabel(g.event_start, g.event_day_count)}`}
          </RowSub>
          {meta && <p className="truncate text-sub-sm text-muted-foreground">{meta}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0">
          <GroupStatus g={g} />
          {g.project_id ? (
            <Link
              to={`/sales/projects/${g.project_id}/thread`}
              className="text-sub min-h-tap inline-flex items-center text-primary hover:underline lg:min-h-0"
            >
              やり取りを開く（{g.activity_count}件）
            </Link>
          ) : (
            <span className="text-sub text-muted-foreground">やり取り {g.activity_count}件</span>
          )}
        </div>
      </div>

      {g.actions.length === 0 ? (
        <p className="px-4 py-2.5 text-sub text-muted-foreground">未完了の次のアクションはありません</p>
      ) : (
        g.actions.map((a) => (
          <ActionRow key={a.id} a={a} today={today} actions={actions} onEdit={onEdit} />
        ))
      )}

      {last && (
        <p className="border-t border-border-faint px-4 py-2 text-sub-sm text-muted-foreground">{last}</p>
      )}
    </section>
  );
}

export function ByProjectRows({
  groups, today, actions, onEdit,
}: {
  groups: ProjectActivityGroup[];
  today: string;
  actions: Actions;
  /** 編集導線。**未指定なら「編集」を出さない**（`sales` の editor 権限が無い人） */
  onEdit?: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* 列見出しは PC だけ。案件のまとまりをまたいで同じ位置に列が来る */}
      <RowHeader className="hidden px-4 sm:flex">
        <RowSlot w={128}>期限</RowSlot>
        <RowMain>次のアクション</RowMain>
        <RowSlot w={200}>記録された活動</RowSlot>
        <RowSlot w={200}>操作</RowSlot>
      </RowHeader>

      {groups.map((g) => (
        <GroupCard
          key={g.project_id ?? 'no-project'}
          g={g}
          today={today}
          actions={actions}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
