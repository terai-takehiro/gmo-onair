/**
 * 依頼の一覧 — **1件を1行にする**（PC）／カードにする（スマホ）
 *
 * ── なぜ縦長のカードをやめたか ──────────────────────────────
 *
 * 作り直す前は、依頼1件が
 *   バッジ4種 ＋ 題名 ＋ 相手 ＋ 期限 ＋ 本文 ＋ 操作ボタン3つ ＋ コメント欄の折りたたみ
 * という縦長のカードでした。5件並ぶと画面が操作ボタンで埋まり、
 * **どれが自分の番なのかが読めません**。
 *
 * ここは「どれを開くか」を選ぶ場所に絞り、**本文・やり取り・操作は
 * 選んだ1件のパネル**（`DelegationDetail`）にだけ出します。
 * 同じアプリのセキュリティカード（`SecurityCardsPage`）と同じ形です。
 *
 * 列は 状態 96px ／ 内容（唯一伸びる）／ 期限 128px ／ 印 56px の4つだけ。
 * `Row` / `RowSlot` に乗せているので、行ごとにバッジの端がずれません
 * （`docs/design/v4/_rules.md` 1「縦の整列」）。
 */
import { ChevronRight, Clock, MessageSquare } from 'lucide-react';
import { Row, RowHeader, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@/lib/utils';
import {
  BUCKET_LABELS, daysSinceRequested, delegationBucket, formatDue, type MyTask,
} from '@/lib/tasksApi';

/** 反応が無いまま何日で「催促してよい」とするか（要件 D3） */
const STALE_DAYS = 3;

/** 段ごとの帯の色。**4段しかない**ので直に持つ（`scoreTone` のような段分けは要らない） */
const BUCKET_TONE: Record<string, string> = {
  requested: 'border-warning-border bg-warning-surface text-warning',
  accepted: 'border-primary-border bg-primary-surface text-primary',
  bounced: 'border-destructive-border bg-destructive-surface text-destructive',
  done: 'border-transparent bg-muted text-muted-foreground',
};

/** 出した依頼で「見たけれど答えない」状態の日数。0 なら印を出さない（要件 D3） */
function staleDays(t: MyTask): number {
  if (delegationBucket(t) !== 'requested') return 0;
  const d = daysSinceRequested(t.requested_at) ?? 0;
  return d >= STALE_DAYS ? d : 0;
}

/** 相手の呼び名。受けた依頼は依頼者、出した依頼は担当者 */
function counterpart(t: MyTask, direction: 'received' | 'sent'): string {
  return direction === 'received'
    ? `${t.requester_name ?? '依頼者不明'} さんから`
    : `${t.assigned_to_name ?? '担当者不明'} さんへ`;
}

function Bucket({ t }: { t: MyTask }) {
  const b = delegationBucket(t);
  return <TableBadge label={BUCKET_LABELS[b]} w={null} className={BUCKET_TONE[b]} />;
}

/** 期限。**超過は赤くして「超過」の字を足す**（色だけだと色覚の差で読めない） */
function Due({ t }: { t: MyTask }) {
  return (
    <span className={cn('font-number text-sub text-right', t.is_overdue ? 'font-bold text-destructive' : 'text-foreground')}>
      {formatDue(t.due_at)}
      {t.is_overdue && <span className="block text-sub-sm font-bold">期限超過</span>}
    </span>
  );
}

/** 相手・案件・滞留・やり取りの件数。**行の2段目**（PC もスマホも同じ中身） */
function Meta({ t, direction }: { t: MyTask; direction: 'received' | 'sent' }) {
  const stale = staleDays(t);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="truncate">{counterpart(t, direction)}</span>
      {t.gls_number && (
        <span className="font-number text-badge shrink-0 rounded-badge bg-muted px-1.5 py-0.5 text-muted-foreground">
          {t.gls_number}
        </span>
      )}
      {/* 滞留は**出した側にだけ**意味がある（受け手には「自分が返していない」と同義） */}
      {direction === 'sent' && stale > 0 && (
        <span className="text-badge inline-flex shrink-0 items-center gap-1 rounded-badge bg-warning-surface px-1.5 py-0.5 font-bold text-warning">
          <Clock className="h-3 w-3" aria-hidden="true" />{stale} 日 返事なし
        </span>
      )}
      {/* **やり取りがあることは開かなくても分かるようにする。**
          差し戻しの理由はコメントとして残る（サーバーの `respondToDelegation`）ので、
          印が無いと「なぜ返ってきたのか」に気づく手がかりが行に1つも無い */}
      {t.comment_count > 0 && (
        <span className="text-badge inline-flex shrink-0 items-center gap-0.5" title={`やり取り ${t.comment_count} 件`}>
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          <span className="font-number">{t.comment_count}</span>
        </span>
      )}
    </span>
  );
}

export function DelegationRows({ rows, direction, selectedId, onSelect }: {
  rows: MyTask[];
  direction: 'received' | 'sent';
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border bg-card">
      {/* **本文の行と同じ 3px を空ける。** 選んだ行だけ左に色の帯が出るので、
          表頭にも同じ幅の透明な帯を置かないと列が 3px ずれる */}
      <RowHeader className="border-l-[3px] border-l-transparent">
        <RowSlot w={96}>状態</RowSlot>
        <RowMain>依頼の内容</RowMain>
        <RowSlot w={128} align="right">期限</RowSlot>
        <RowSlot w={56} placeholder="" />
      </RowHeader>

      {rows.map((t) => (
        <Row key={t.id} divider interactive align="start" className="p-0">
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            aria-current={selectedId === t.id}
            className={cn(
              'flex w-full items-start gap-3 border-l-[3px] px-4 py-[11px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selectedId === t.id ? 'border-l-primary bg-primary-surface-weak' : 'border-l-transparent',
            )}
          >
            <RowSlot w={96}><Bucket t={t} /></RowSlot>
            <RowMain>
              <RowTitle className={cn(delegationBucket(t) === 'requested' && 'font-bold')}>{t.title}</RowTitle>
              <RowSub><Meta t={t} direction={direction} /></RowSub>
            </RowMain>
            <RowSlot w={128} align="right"><Due t={t} /></RowSlot>
            <RowSlot w={56} align="right" placeholder="">
              <ChevronRight
                className={cn('h-4 w-4', selectedId === t.id ? 'text-primary' : 'text-muted-foreground')}
                aria-hidden="true"
              />
            </RowSlot>
          </button>
        </Row>
      ))}
    </div>
  );
}

/**
 * スマホの一覧。**PC の固定列をそのまま縮めない**（`_rules.md` 3）。
 * 状態 96 ＋ 期限 128 ＋ 印 56 ＝ 280px で 390px の実効幅を使い切ってしまい、
 * 内容の列に残るのが 0px になるため、縦積みのカードに組み直している。
 */
export function DelegationCards({ rows, direction, onSelect }: {
  rows: MyTask[];
  direction: 'received' | 'sent';
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={cn(
            'v4-tap flex flex-col gap-1.5 rounded-card border bg-card p-3 text-left',
            t.is_overdue ? 'border-destructive-border' : 'border-border',
          )}
        >
          <span className="flex items-center gap-2">
            <Bucket t={t} />
            <Due t={t} />
          </span>
          <span className={cn('text-list', delegationBucket(t) === 'requested' && 'font-bold')}>{t.title}</span>
          <span className="text-sub flex items-center gap-2 text-muted-foreground">
            <Meta t={t} direction={direction} />
          </span>
        </button>
      ))}
    </div>
  );
}
