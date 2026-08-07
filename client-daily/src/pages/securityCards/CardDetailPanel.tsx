/**
 * セキュリティカード — 右の中身 (detail) (v4)
 *
 * 選んだ1枚について「どの部屋が開くか」「いま誰が持っているか」「これまで
 * 誰に貸したか」を1画面に出す。以前はダイアログで、**開くと一覧が見えなくなる**
 * ので「他に貸せるカードがあるか」を確かめるのに閉じる必要があった。
 *
 * ── 何も選んでいないときは「最近の貸し借り」を出す ──────────
 *
 * 右を空にすると画面の半分が白紙になる。カードを選ぶ前にいちばん知りたいのは
 * 「いま外に出ているカードはどれか」なので、全カードの貸し借りを新しい順に出す。
 */
import { useState } from 'react';
import { ArrowRightLeft, Check, KeyRound, Pencil, Undo2, X } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  SECURITY_AREAS, useCardLendings, useUpdateCard, type Lending, type SecurityCard,
} from '@/lib/securityCardApi';
import { groupLabel, groupTone, levelTone, statusOf } from './types';

export function CardDetailPanel({
  card, canEdit, onLend, onReturn,
}: {
  card: SecurityCard | null;
  canEdit: boolean;
  onLend: () => void;
  onReturn: () => void;
}) {
  if (!card) return <RecentLendings />;
  return <CardDetail card={card} canEdit={canEdit} onLend={onLend} onReturn={onReturn} />;
}

function CardDetail({
  card, canEdit, onLend, onReturn,
}: {
  card: SecurityCard;
  canEdit: boolean;
  onLend: () => void;
  onReturn: () => void;
}) {
  const history = useCardLendings({ card_id: card.id });
  const update = useUpdateCard();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(card.label ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [isActive, setIsActive] = useState(card.is_active);
  const status = statusOf(card);

  const save = () => {
    update.mutate({ id: card.id, fields: { label: label.trim() || null, notes: notes.trim() || null, is_active: isActive } }, {
      onSuccess: () => { setEditing(false); notifySuccess('カードの情報を直しました'); },
      onError: (e) => notifyApiError('保存できませんでした', e),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-number text-h2 inline-flex h-10 w-10 items-center justify-center rounded-control border ${levelTone(card.security_level)}`}>
            {card.card_no}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-cardtitle flex flex-wrap items-center gap-1.5">
              <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {/* **6レベルの名前を主役にする。** 渡すカードを間違えないための名前で、
                  3分類 (全域/技術/共用) は探すための入口なので添えるだけ */}
              {card.level_label}
              <span className={`text-badge rounded-badge border px-1.5 py-0.5 ${groupTone(card.security_level)}`}>
                {groupLabel(card.security_level)}
              </span>
            </p>
            {card.label && <p className="text-sub text-muted-foreground">{card.label}</p>}
          </div>
          <TableBadge label={status.label} w={null} className={status.tone} />
        </div>

        {!card.is_active && (
          <p className="text-sub mt-2 rounded-note bg-destructive-surface px-2 py-1 text-destructive">
            運用対象外です（紛失・廃止）。貸し出せません。
          </p>
        )}

        {card.status === 'lent' && (
          <div className={`mt-3 rounded-card border p-3 ${card.overdue ? 'border-destructive-border bg-destructive-surface' : 'border-warning-border bg-warning-surface'}`}>
            <p className="text-th text-muted-foreground">いま貸している相手</p>
            <p className="text-list mt-1">{card.borrower_company || '（会社名なし）'} / {card.borrower_person}</p>
            {card.borrower_contact && <p className="text-sub text-muted-foreground">{card.borrower_contact}</p>}
            <p className="text-sub mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground">
              <DateRange start={card.lent_on} end={card.due_on} className="text-sub" />
              {card.overdue ? <span className="text-destructive">返却の日を過ぎています</span> : null}
            </p>
            {card.lent_by_name && <p className="text-sub text-muted-foreground">渡した人: {card.lent_by_name}</p>}
            {card.purpose && <p className="text-sub text-muted-foreground">使いみち: {card.purpose}</p>}
          </div>
        )}

        {canEdit && !editing && (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.status === 'available' ? (
              <Button className="min-h-tap flex-1 gap-1.5" onClick={onLend} disabled={!card.is_active}>
                <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> 貸し出す
              </Button>
            ) : (
              <Button className="min-h-tap flex-1 gap-1.5" onClick={onReturn}>
                <Undo2 className="h-4 w-4" aria-hidden="true" /> 返してもらう
              </Button>
            )}
            <Button variant="outline" className="min-h-tap gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden="true" /> 直す
            </Button>
          </div>
        )}

        {canEdit && editing && (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-3">
            <div>
              <Label htmlFor="card-label">呼び名 (任意)</Label>
              <Input id="card-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：貸出用の予備" />
            </div>
            <div>
              <Label htmlFor="card-notes">備考</Label>
              <textarea
                id="card-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="text-sub mt-1 w-full resize-y rounded-control border border-border bg-background px-3 py-2"
              />
            </div>
            <label className="text-sub min-h-tap flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4" />
              貸し出せる状態にする（外すと紛失・廃止の扱いになります）
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="min-h-tap" onClick={() => setEditing(false)}>
                <X className="mr-1 h-4 w-4" aria-hidden="true" />やめる
              </Button>
              <Button className="min-h-tap" onClick={save} disabled={update.isPending}>
                <Check className="mr-1 h-4 w-4" aria-hidden="true" />保存
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 開けられる部屋。**DB の `access` をそのまま出す** (レベル名から推測しない) */}
      <div className="rounded-card border border-border bg-card p-4">
        <p className="text-th mb-2 text-muted-foreground">このカードで開けられる部屋</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SECURITY_AREAS.map((a) => {
            const ok = !!card.access[a.key];
            return (
              <div
                key={a.key}
                className={`text-sub flex items-center gap-1.5 rounded-note border px-2 py-1.5 ${
                  ok ? 'border-success-border bg-success-surface text-success' : 'border-border bg-muted text-muted-foreground'
                }`}
              >
                {ok ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{a.label}</span>
                <span className="font-number ml-auto text-sub-sm">{a.floor}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-card border border-border bg-card">
        <p className="text-th border-b border-border-subtle px-4 py-2 text-muted-foreground">このカードの貸し借り</p>
        {history.isLoading ? (
          <Delayed><SkeletonRows rows={3} /></Delayed>
        ) : (history.data ?? []).length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            title="このカードはまだ貸し出していません"
            description="貸し出すと、誰にいつ渡したかがここに残ります。"
          />
        ) : (
          (history.data ?? []).map((h) => <LendingRow key={h.id} lending={h} showCardNo={false} />)
        )}
      </div>
    </div>
  );
}

/** カードを選ぶ前に出す「最近の貸し借り（全カード）」 */
function RecentLendings() {
  const lendings = useCardLendings();
  const rows = lendings.data ?? [];
  return (
    <div className="rounded-card border border-border bg-card">
      <p className="text-th border-b border-border-subtle px-4 py-2 text-muted-foreground">
        最近の貸し借り（すべてのカード）
      </p>
      {lendings.isLoading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          className="border-0 bg-transparent"
          title="貸し借りの記録はまだありません"
          description="左のカードを選ぶと、そのカードで開けられる部屋と貸し出しの操作が出ます。"
        />
      ) : (
        rows.slice(0, 30).map((h) => <LendingRow key={h.id} lending={h} showCardNo />)
      )}
    </div>
  );
}

function LendingRow({ lending, showCardNo }: { lending: Lending; showCardNo: boolean }) {
  const tone = lending.status === 'active'
    ? (lending.overdue
      ? { label: '返却遅延', cls: 'border-destructive-border bg-destructive-surface text-destructive' }
      : { label: '貸出中', cls: 'border-warning-border bg-warning-surface text-warning' })
    : { label: '返却済み', cls: 'bg-muted text-muted-foreground' };
  return (
    <Row divider align="start" stackOnMobile>
      {showCardNo && (
        <RowSlot w={56}>
          <span className="font-number text-sub">No.{lending.card_no}</span>
        </RowSlot>
      )}
      <RowMain>
        <RowTitle>{lending.borrower_company || '（会社名なし）'} / {lending.borrower_person}</RowTitle>
        <RowSub>
          {[
            lending.purpose,
            lending.lent_by_name ? `渡した人 ${lending.lent_by_name}` : null,
            lending.returned_by_name ? `受け取った人 ${lending.returned_by_name}` : null,
          ].filter(Boolean).join(' ・ ') || (showCardNo ? lending.level_label ?? '' : '')}
        </RowSub>
      </RowMain>
      <RowSlot w={160} align="right" hideOnMobile>
        <DateRange
          start={lending.lent_on}
          end={lending.returned_on ?? lending.due_on}
          className="text-sub-sm text-muted-foreground"
        />
      </RowSlot>
      <RowSlot w={96} align="right">
        <TableBadge label={tone.label} w={null} className={tone.cls} />
      </RowSlot>
    </Row>
  );
}
