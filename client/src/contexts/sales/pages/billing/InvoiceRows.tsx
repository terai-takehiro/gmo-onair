/**
 * ⑤ 見積・請求 の「請求」タブ (v4)
 *
 * 列は**モックの並びそのまま**、幅だけ7段 (`SlotWidth`) に寄せています:
 *
 *   案件 ／ 請求   伸びる (`RowMain`)     モック flex:1
 *   回             96px  (`RowSlot`)      モック 96px
 *   請求額（税抜） 128px (`MoneyCell`)    モック 150px → 7段に寄せた
 *   検収           96px  (`RowSlot`)      モック 96px
 *   入金           96px  (`RowSlot`)      モック 96px
 *   締め・入金日   96px  (`RowSlot`)      モック 104px
 *   帳票           96px  (`RowSlot`)      **モックには無い**（下記）
 *
 * ── 「帳票」列だけモックに無い ──────────────────────────────
 *
 * 請求書・検収書の PDF を出す口が v4 のどこにも無くなっていた（ご指摘）ため
 * 足しました。ここは**案件をまたいで取りこぼさない一覧**なので、
 * 「検収前・入金前のものを見つけて、その場で紙を出す」がそのまま片づきます。
 * 押すと BOX の社内限りフォルダ `03_請求` にも入ります（`lib/docPdf.ts`）。
 *
 * ── 検収と入金は「押して日付を入れる」──────────────────────
 *
 * フラグではなく**日付**を持ちます (`inspection_date` / `paid_date`)。
 * 済んだかを別のフラグでも持つと、片方だけ更新されて必ず食い違います。
 * 押すと今日の日付が入り、もう一度押すと**確認したうえで**消えます
 * （入金を取り消すのは経理の訂正なので、黙って戻せると気づけません）。
 */
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { GroupTag, groupNote } from '@/contexts/shared/components/GroupTag';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import type { BillingInvoice } from './types';

function dueTone(due: string | null, today: string, paid: boolean): string {
  if (paid || !due) return 'text-secondary-foreground';
  if (due < today) return 'text-destructive';
  if (due === today) return 'text-warning';
  return 'text-secondary-foreground';
}

/** 済／未のボタン。**済のときは日付を出す** — 「いつ」が分からないと確認に使えない */
function MarkCell({
  date, doneLabel, todoLabel, canEdit, busy, onToggle, blocked,
}: {
  date: string | null;
  doneLabel: string;
  todoLabel: string;
  canEdit: boolean;
  busy: boolean;
  onToggle: () => void;
  /** 押せない理由（あれば押せない）。⚠️ **枠ごと消さない** — なぜ押せないかが分からなくなる */
  blocked?: string;
}) {
  if (date) {
    return (
      <RowSlot w={96}>
        <button
          type="button"
          disabled={!canEdit || busy}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          // **高さを決め打ちにする。** 2行（済の印 + 日付）なので、`min-h` だけだと
          // 中身の高さが勝って 41px になり、ボタンの段（32/36/40/44…）から外れる
          className="rounded-badge text-sub-sm flex min-h-tap w-full flex-col items-center justify-center leading-[1.15] bg-success-surface font-bold text-success disabled:cursor-default lg:h-9 lg:min-h-0"
          title={canEdit ? `${doneLabel}を取り消す` : undefined}
        >
          <span className="flex items-center gap-1"><Check className="h-3 w-3" aria-hidden="true" />{doneLabel}</span>
          <span className="font-number">{date.slice(5).replace('-', '/')}</span>
        </button>
      </RowSlot>
    );
  }
  return (
    <RowSlot w={96}>
      {canEdit ? (
        <button
          type="button"
          disabled={busy || !!blocked}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          title={blocked}
          className="rounded-badge text-sub-sm min-h-tap w-full border border-border bg-card font-bold text-secondary-foreground hover:border-primary-border hover:text-primary disabled:cursor-default disabled:opacity-50 disabled:hover:border-border disabled:hover:text-secondary-foreground lg:h-9 lg:min-h-0"
        >
          {todoLabel}
        </button>
      ) : (
        <span className="text-sub-sm text-muted-foreground">{todoLabel}</span>
      )}
    </RowSlot>
  );
}

export function InvoiceRows({
  rows, today, canEdit, busyId, onMark,
}: {
  rows: BillingInvoice[];
  today: string;
  canEdit: boolean;
  busyId: string | null;
  onMark: (row: BillingInvoice, field: 'inspection_date' | 'paid_date') => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <RowHeader className="hidden sm:flex">
        <RowMain>案件 ／ 請求</RowMain>
        <RowSlot w={96}>回</RowSlot>
        <RowSlot w={128} align="right">請求額（税抜）</RowSlot>
        <RowSlot w={96}>検収</RowSlot>
        <RowSlot w={96}>入金</RowSlot>
        <RowSlot w={96} align="right">締め・入金日</RowSlot>
        <RowSlot w={96} align="right">帳票</RowSlot>
      </RowHeader>
      {rows.map((r) => {
        const paid = !!r.paid_date;
        return (
          <Row
            key={r.id}
            divider
            interactive
            stackOnMobile
            onClick={() => navigate(`/sales/projects/${r.project_id}/estimate`)}
          >
            <RowMain>
              <RowTitle>{r.project_name}<GroupTag name={r.group_name} /></RowTitle>
              <RowSub>
                {[r.customer_name, r.subtitle, groupNote(r.group_name)]
                  .filter(Boolean).join(' ・ ') || '（表題なし）'}
              </RowSub>
            </RowMain>
            <RowSlot w={96} placeholder="—" hideOnMobile>
              {r.episode_code && <span className="font-number text-sub-sm truncate">{r.episode_code}</span>}
            </RowSlot>
            <MoneyCell value={r.amount} width={128} />
            <MarkCell
              date={r.inspection_date} doneLabel="検収済" todoLabel="検収前"
              canEdit={canEdit} busy={busyId === r.id}
              onToggle={() => onMark(r, 'inspection_date')}
            />
            {/*
              ⚠️ **請求書を出していない行から入金を記録させない**（レビューでの指摘・P1）。
              「未請求」チップを足したことで、**出していない売上がこの表に並ぶ**ように
              なりました。押せるままにすると**請求していないのに入金済みの行**ができます
              （この版が ⑫ スマホで塞いだ穴を、PC 側で開け直すことになる）。
              **枠は残して理由を出す** — 消すと、なぜ押せないのかが分からない。
              取り消し（`date` がある側）は止めない。**古い行を直せなくなる**ため
            */}
            <MarkCell
              date={r.paid_date} doneLabel="入金済" todoLabel="入金前"
              blocked={r.invoice_issued ? undefined : '請求書を出してから記録できます（先に「請求前」を押してください）'}
              canEdit={canEdit} busy={busyId === r.id}
              onToggle={() => onMark(r, 'paid_date')}
            />
            <RowSlot w={96} align="right" placeholder="—">
              {r.payment_due_date && (
                <span className="flex flex-col items-end leading-tight">
                  <span className={`font-number text-sub font-bold ${dueTone(r.payment_due_date, today, paid)}`}>
                    {r.payment_due_date.slice(5).replace('-', '/')}
                  </span>
                  {!paid && r.payment_due_date < today && (
                    <span className="text-sub-sm text-destructive">超過</span>
                  )}
                </span>
              )}
            </RowSlot>
            <RowSlot w={96} align="right" className="gap-1">
              {(['invoice', 'inspection'] as const).map((type) => (
                <DocPdfButton key={type} path={`/revenues/${r.id}/pdf`} kind={type} params={{ type }} />
              ))}
            </RowSlot>
          </Row>
        );
      })}
    </>
  );
}
