/**
 * ひとつづり（1つの取引）を1枚のカードで出す（migration 281）
 *
 * ── なぜ1通ずつ並べないのか ────────────────────────────────
 *
 * 取引は 見積書 → 発注書 → 請求書 と段を踏みます。1通ずつ並べると
 * **「この請求書はどの見積の続きか」が画面から読めず**、経理が毎回
 * メールを探し直すことになります。
 *
 * ── 出す順に意味を持たせる ──────────────────────────────────
 *
 *  1行目 … 何の取引か（題名・取引先）と **いまの段**・**払う金額**・**支払期日**
 *  2行目 … **当て先**（どの案件か／販管費か）と、AI がそう当てた理由
 *  3行目〜… 中の書類（種類・件名・金額・状態・その場の操作）と**添付**
 *
 * **当て先を2行目に出すのが肝です。** ここが「AI が仮で置いた」ままなら、
 * 人はまずそこを確かめる必要があります。
 */
import { ArrowRight, Check, ExternalLink, FileText, Pencil, RotateCcw, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import { Card } from '@gmo-onair/shared/src/client/ui/card';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { Button } from '@/components/ui/button';
import { DocDetails } from './DocDetails';
import { dueState, type DueTone } from './due';
import {
  STAGE_LABEL, STAGE_TONE, STATUS_LABEL, STATUS_TONE, TYPE_LABEL,
  type DocStatus, type FinanceDoc, type FinanceDocGroup,
} from './types';

/** 支払期日の色。**色だけに頼らない**（文字にも「2日過ぎています」と出る） */
const DUE_TONE: Record<DueTone, string> = {
  overdue: 'bg-destructive-surface text-destructive',
  today: 'bg-warning-surface text-warning',
  soon: 'bg-warning-surface text-warning',
  later: 'text-secondary-foreground',
  none: 'text-muted-foreground',
};

export interface GroupCardActions {
  canReview: boolean;
  canLedger: boolean;
  today: string;
  openedDocId: string | null;
  onToggleDoc: (id: string) => void;
  onSetStatus: (id: string, status: DocStatus) => void;
  onHandoff: (doc: FinanceDoc) => void;
  onUndoHandoff: (doc: FinanceDoc) => void;
  onEditGroup: (group: FinanceDocGroup) => void;
  /** 届いた書類そのものを直す（金額・期日・種類の読み違え） */
  onEditDoc: (doc: FinanceDoc) => void;
  onDeleteGroup: (group: FinanceDocGroup) => void;
  onOpenLedger: (kind: 'purchase' | 'sga') => void;
}

/** 束のいちばん急ぐ支払期日（中の書類のうち、まだ登録していないもの） */
function nearestDue(g: FinanceDocGroup): string | null {
  const dues = g.docs
    .filter((d) => d.status !== 'processed' && d.status !== 'rejected' && d.payment_due)
    .map((d) => d.payment_due as string)
    .sort();
  return dues[0] ?? null;
}

/** 当て先の1行。**AI が仮で置いたままかどうかが読めることが肝** */
function Destination({ g, onEdit, canReview }: { g: FinanceDocGroup; onEdit: () => void; canReview: boolean }) {
  // 束の当て先が空でも、中の書類に AI の候補が入っていることがある
  const guessed = g.docs.find((d) => d.project_source === 'ai' && d.project_reason);
  const decided = g.expense_kind === 'sga' || !!g.project_id;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
      <span className="text-sub-sm text-muted-foreground">当て先</span>
      {g.expense_kind === 'sga' ? (
        <TableBadge label="販管費" w={null} className="border-transparent bg-info-surface text-info" />
      ) : g.project_id ? (
        <span className="text-sub-sm text-secondary-foreground">
          {[g.project_gls_number, g.project_name].filter(Boolean).join(' ')}
        </span>
      ) : (
        <TableBadge label="未定" w={null} className="border-transparent bg-warning-surface text-warning" />
      )}

      {/*
        **AI が当てた理由をそのまま出す**（人が確かめる材料）。
        「合っているかどうか」を人が判断できないと、当て先は結局全部調べ直しになる
      */}
      {!decided && guessed?.project_reason && (
        <span className="text-note inline-flex items-center gap-1 text-muted-foreground">
          <Sparkles className="h-3 w-3 text-ai" aria-hidden="true" />
          {guessed.project_reason}
        </span>
      )}
      {g.expense_kind === 'sga' && g.processing_month && (
        <span className="text-note text-muted-foreground">
          {g.processing_month} 処理
          {g.payment_terms_days !== null && ` ／ ${g.payment_terms_days}日サイト`}
        </span>
      )}

      {canReview && (
        <Button variant="ghost" onClick={onEdit} className="ml-auto">
          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {decided ? '当て先を直す' : '当て先を決める'}
        </Button>
      )}
    </div>
  );
}

/** 添付。**入らなかったものも出す** — 出さないと原本が無いことに誰も気づけない */
function Attachments({ doc }: { doc: FinanceDoc }) {
  const atts = doc.attachments ?? [];
  if (atts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {atts.map((a) => (a.box_url ? (
        <a
          key={a.id} href={a.box_url} target="_blank" rel="noreferrer"
          className="text-sub-sm inline-flex items-center gap-1 rounded-note bg-muted px-1.5 py-0.5 text-secondary-foreground hover:underline"
        >
          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {a.filename}
          <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
        </a>
      ) : (
        /*
          **理由まで出す**（Codex P2）。「BOX に入っていません」だけだと、
          押し直せば直るのか、人が Google 連携をやり直す必要があるのかが
          分かりません。**原本が無い状態に気づいても、直し方が分からなければ同じ**です。
        */
        <span
          key={a.id}
          className="text-sub-sm inline-flex items-start gap-1 rounded-note bg-warning-surface px-1.5 py-0.5 text-warning"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            {a.filename}
            <span className="block">
              BOX に入っていません{a.failure_label ? `（${a.failure_label}）` : ''}
            </span>
          </span>
        </span>
      )))}
    </div>
  );
}

function DocLine({ doc, a }: { doc: FinanceDoc; a: GroupCardActions }) {
  const due = dueState(doc.payment_due, a.today);
  return (
    <div className="flex flex-col gap-1.5 border-t border-border-subtle py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TableBadge label={TYPE_LABEL[doc.doc_type]} w={null} className="border-transparent bg-muted text-secondary-foreground" />
        {doc.doc_type === 'quote' && doc.revision && doc.revision > 1 && (
          <span className="text-note text-muted-foreground">第{doc.revision}版</span>
        )}
        <span className="text-sub-sm min-w-0 flex-1 truncate text-secondary-foreground">
          {doc.is_ai && <Sparkles className="mr-1 inline h-3 w-3 text-ai" aria-label="AI作成" />}
          {doc.subject || '（件名なし）'}
        </span>
        <MoneyCell value={Number(doc.amount) || 0} width={128} />
        <span className={cn('rounded-note text-sub-sm inline-flex items-center px-1.5 py-0.5', DUE_TONE[due.tone])}>
          <span className="font-number">{due.text}</span>
        </span>
        <TableBadge label={STATUS_LABEL[doc.status]} w={null} className={STATUS_TONE[doc.status]} />
      </div>

      <Attachments doc={doc} />

      <DocDetails doc={doc} open={a.openedDocId === doc.id} onToggle={() => a.onToggleDoc(doc.id)} />

      {a.canReview && (
        <div className="flex flex-wrap gap-1">
          {/*
            **読み違えを直せる道を必ず出す**（ご指示「金額等が違えば、そこもマニュアル
            修正できるようにする」）。無いと、人は書類ごと消して手で入れ直すか、
            間違った金額のまま台帳に入れる。**登録済みの書類は直せない**
            （台帳の行と食い違う。先に登録を取り消す）
          */}
          {doc.status !== 'processed' && (
            <Button variant="ghost" onClick={() => a.onEditDoc(doc)}>
              <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />直す
            </Button>
          )}
          {doc.status === 'new' && (
            <Button variant="outline" onClick={() => a.onSetStatus(doc.id, 'reviewing')}>確認する</Button>
          )}
          {doc.status === 'reviewing' && (
            <>
              <Button variant="outline" onClick={() => a.onSetStatus(doc.id, 'approved')}>
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />承認
              </Button>
              <Button variant="ghost" onClick={() => a.onSetStatus(doc.id, 'rejected')}>
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />却下
              </Button>
            </>
          )}
          {/*
            **見積書は台帳に入れられない**（実際に払うのは請求書・注文書が来てから）。
            承認まではできるので、押せないボタンを出すのではなく**なぜ出ないかを書く**
          */}
          {doc.status === 'approved' && doc.doc_type === 'quote' && (
            <span className="text-note text-muted-foreground">
              見積書は仕入・販管費に入れられません（発注書・請求書が届いたら登録できます）。
            </span>
          )}
          {doc.status === 'approved' && doc.doc_type !== 'quote' && (a.canLedger ? (
            <Button onClick={() => a.onHandoff(doc)}>
              仕入・販管費に登録<ArrowRight className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          ) : (
            <span className="text-note text-muted-foreground">
              仕入・販管費に登録するのは財務の担当者です。承認まで済んでいます。
            </span>
          ))}
          {doc.status === 'processed' && doc.linked_id && (
            <>
              <Button variant="outline" onClick={() => a.onOpenLedger(doc.linked_kind ?? 'purchase')}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {doc.linked_kind === 'purchase' ? '仕入' : '販管費'}を見る
              </Button>
              {a.canLedger && (
                <Button variant="ghost" onClick={() => a.onUndoHandoff(doc)} aria-label="登録を取り消す">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              )}
            </>
          )}
          {doc.status === 'rejected' && (
            <Button variant="ghost" onClick={() => a.onSetStatus(doc.id, 'new')}>受信に戻す</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function GroupCard({ group, actions }: { group: FinanceDocGroup; actions: GroupCardActions }) {
  const due = dueState(nearestDue(group), actions.today);
  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TableBadge label={STAGE_LABEL[group.stage]} w={null} className={STAGE_TONE[group.stage]} />
        <span className="text-body min-w-0 flex-1 truncate font-bold">{group.title}</span>
        {group.amount !== null && <MoneyCell value={group.amount} width={128} />}
        <span className={cn('rounded-note text-sub-sm inline-flex items-center px-1.5 py-0.5', DUE_TONE[due.tone])}>
          <span className="font-number">{due.text}</span>
        </span>
        {actions.canReview && (
          <Button variant="ghost" onClick={() => actions.onDeleteGroup(group)} aria-label="この取引ごと消す">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      {group.vendor_name && (
        <p className="text-sub-sm text-muted-foreground">{group.vendor_name}</p>
      )}

      <Destination g={group} canReview={actions.canReview} onEdit={() => actions.onEditGroup(group)} />

      {group.docs.map((d) => <DocLine key={d.id} doc={d} a={actions} />)}
    </Card>
  );
}
