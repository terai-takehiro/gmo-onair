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
 *
 * ── 表頭はクリックで並べ替えられる ────────────────────────────
 *
 * 並び替え自体は既にプルダウン（`FilterBar.tsx` の `SORT_OPTIONS`）で実装済み
 * なので、ここは**同じ `sort` state（`sort_by:sort_dir`）を押しボタンにして
 * 見せているだけ**です（案件台帳 `projectLedger/LedgerTable.tsx` と同じ作法:
 * 印は指を乗せたときだけ薄く出す・同じ列を押すと 昇順→降順→既定 の3段で回す
 * ＝ `FilterBar.tsx` の `sortMark` / `nextHeaderSort`）。
 */
import { ArrowDown, ArrowUp, ChevronsUpDown, Sparkles } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import {
  STAGE_BADGE_LABEL, STAGE_BADGE_TONE, TERMINAL_STAGES, ENTITY_BADGE_LABEL, ENTITY_BADGE_TONE,
} from './stages';
import { HealthBadge } from './health';
import { TidyActions } from './TidyActions';
import { rowInProps, type RowAnim } from './rowAnim';
import { sortMark } from './FilterBar';
import type { ProjectListRow } from './types';

/**
 * 表頭1マスの中身。`sortKey` が無い列は押せないただの文字（今はすべての列が持つ）。
 *
 * ⚠️ **`aria-sort` は `RowMain`/`RowSlot`（= 素の `<div>`）に付けているだけ**なので、
 * `columnheader`/`rowheader` の役割が無く、スクリーンリーダーには効かない
 * （テーブルではなく `Row`/`RowSlot` の一覧なので、役割を持つ要素が無い。
 * レビュー指摘）。そこで、いまの並び状態をボタンの**アクセシブルネーム自体**に
 * 含める——こちらは祖先の役割に関係なく必ず読み上げられる。
 */
function HeaderLabel({
  label, sortKey, sort, onSort, align,
}: {
  label: string;
  sortKey: string;
  sort: string;
  onSort: (key: string) => void;
  align?: 'right';
}) {
  const mark = sortMark(sort, sortKey);
  const stateText = mark === 'asc' ? '・昇順で並び替え中' : mark === 'desc' ? '・降順で並び替え中' : '';
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`${label}で並べ替える`}
      aria-label={`${label}で並べ替える${stateText}`}
      className={`group -mx-1 flex w-full items-center gap-1 rounded-control px-1 py-0.5 hover:bg-border-faint ${
        align === 'right' ? 'justify-end' : ''
      } ${mark ? 'font-bold text-primary' : ''}`}
    >
      <span className="truncate">{label}</span>
      {/* ⚠️ **並べ替えていないときの印は、指を乗せたときだけ出す**
          （`LedgerTable.tsx` と同じ理由 — 常に出すと 72px の「最後の動き」が
          切れる） */}
      {mark === 'asc' ? <ArrowUp className="h-3 w-3 shrink-0" aria-hidden="true" />
        : mark === 'desc' ? <ArrowDown className="h-3 w-3 shrink-0" aria-hidden="true" />
          : (
            <ChevronsUpDown
              className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40"
              aria-hidden="true"
            />
          )}
    </button>
  );
}

/** `mark` を `aria-sort` の値に変換する */
function ariaSort(mark: 'asc' | 'desc' | null): 'ascending' | 'descending' | 'none' {
  return mark === 'asc' ? 'ascending' : mark === 'desc' ? 'descending' : 'none';
}

/**
 * 表頭。**スマホでは出しません** — 行が縦積みになるので、
 * 列の名前が並んでいても指す先がありません。
 */
export function ProjectRowsHeader({
  sort, onSort,
}: {
  /** いまの並び順（`${sort_by}:${sort_dir}`）。プルダウン（`FilterBar`）と共有する */
  sort: string;
  onSort: (key: string) => void;
}) {
  return (
    <RowHeader className="hidden sm:flex">
      <RowMain aria-sort={ariaSort(sortMark(sort, 'name'))}>
        <HeaderLabel label="案件 ／ お客様" sortKey="name" sort={sort} onSort={onSort} />
      </RowMain>
      <RowSlot w={96} aria-sort={ariaSort(sortMark(sort, 'stage'))}>
        <HeaderLabel label="ステージ" sortKey="stage" sort={sort} onSort={onSort} />
      </RowSlot>
      {/*
        計上会社（2026年10月の事業再編）。**並べ替えは無い**——サーバーの
        `SORT_COLUMN_MAP` に `entity_code` を足すのはこの回のスコープ外
        （指示書「絞り込みチップは今回追加しない」と同じ理由で表示だけに留める）ので、
        押せるボタンにせず素の見出しにする。
      */}
      <RowSlot w={72}>
        <span className="truncate">計上会社</span>
      </RowSlot>
      <RowSlot w={96} aria-sort={ariaSort(sortMark(sort, 'event_start'))}>
        <HeaderLabel label="実施日" sortKey="event_start" sort={sort} onSort={onSort} />
      </RowSlot>
      {/* **列名は左揃え・数値は右揃え。** 名前まで右に寄せると、
          数字の右端と列名の右端が重なって桁が読みにくい */}
      <RowSlot w={128} aria-sort={ariaSort(sortMark(sort, 'estimate_amount'))}>
        <HeaderLabel label="見積金額" sortKey="estimate_amount" sort={sort} onSort={onSort} />
      </RowSlot>
      <RowSlot w={200} aria-sort={ariaSort(sortMark(sort, 'next_task_due'))}>
        <HeaderLabel label="次のタスク" sortKey="next_task_due" sort={sort} onSort={onSort} />
      </RowSlot>
      <RowSlot w={72} align="right" aria-sort={ariaSort(sortMark(sort, 'last_move'))}>
        <HeaderLabel label="最後の動き" sortKey="last_move" sort={sort} onSort={onSort} align="right" />
      </RowSlot>
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
  tidy,
  onOpen,
}: {
  p: ProjectListRow;
  today: string;
  row?: RowAnim;
  /** 「要整理」ビューか。行に4つの軽いアクション（次の一手/スヌーズ/見送り/失注）を出す */
  tidy?: boolean;
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
          {/* 健全性はサーバーの `health` だけを見る（`projectList/health.tsx`）。ok は何も出ない */}
          <HealthBadge p={p} />
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
        {/* 「要整理」のときだけ、行の中に4つの手を出す（TidyActions がクリックを止める） */}
        {tidy && <TidyActions p={p} />}
      </RowMain>

      <TableBadge
        w={96}
        label={STAGE_BADGE_LABEL[p.stage] ?? p.stage}
        className={STAGE_BADGE_TONE[p.stage]}
      />

      {/*
        計上会社（2026年10月の事業再編・`docs/reorg-2026-10-plan.md` §4.4）。
        **バッジの文字は英字3文字の記号そのもの**（`GJV`/`GSS`/`GMO`）——
        `ENTITY_BADGE_LABEL` の和文（「コンテンツスタジオ」等）は5字以上あり
        `TableBadge` の 62px 均等割り付け（和文4字まで）に入らないため、
        和文の短い名前は `title`（ホバーで出す全称）に退避する。
        **`entity_code` が無い行は空欄**（旧方式のまま導出していない案件。
        `RowSlot` の既定プレースホルダ「—」に任せる — 崩れて見せない）。
      */}
      <RowSlot w={72}>
        {p.entity_code && (
          <TableBadge
            w={null}
            label={p.entity_code}
            title={ENTITY_BADGE_LABEL[p.entity_code]}
            className={ENTITY_BADGE_TONE[p.entity_code]}
          />
        )}
      </RowSlot>

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
