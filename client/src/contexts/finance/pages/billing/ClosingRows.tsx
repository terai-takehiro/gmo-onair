/**
 * ② 請求・入金 の行（財務） (v4)
 *
 * 3つのタブで**同じ行の形**を使います。違うのは右端の状態列だけです。
 *
 *   選ぶ         28px（`RowMain` の中）  タブによっては選べない行がある
 *   GLS番号      96px
 *   案件 ／ 請求先 伸びる
 *   金額（税抜） 128px  **￥は左端・数字は右端**
 *   期日         96px   入金の確認だけ。**超過は赤**
 *   状態         96px
 *   帳票         96px   請求書を出す／検収書を出す のタブだけ（下記）
 *
 * ── 「帳票」列だけモックに無い ──────────────────────────────
 *
 * 「請求書を出す」「検収を記録する」は**日付を記録するだけ**で、
 * 相手に渡す紙はどこからも出せませんでした（v4 で PDF の口ごと落ちていた）。
 * 記録する画面で紙も出せないと、**別の画面を開き直して同じ行を探す**ことになります。
 * 押すと BOX の社内限りフォルダ `03_請求` にも入ります（`lib/docPdf.ts`）。
 * **請求書 Excel（業務推進提出用）だけは BOX に入りません**
 * （`downloadRevenueExcel`・`lib/docPdf.ts`）。2つ目のボタンぶん列を
 * 56px→96px に広げた
 *
 * **入金の確認タブには出しません** — 入金は相手が払う話で、こちらが出す紙はありません。
 *
 * ── 選べない行を「押せるように見せない」──────────────────────
 *
 * 申込書が揃っていない案件は請求書を出せません。四角を消すのではなく
 * **押せない四角と理由**を出します（消すと「なぜ選べないのか」が分からない）。
 */
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { GroupTag, groupNote } from '@/contexts/shared/components/GroupTag';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Check, Lock } from 'lucide-react';
import { DocPdfButton } from '@/contexts/shared/components/DocPdfButton';
import { DocExcelButton } from '@/contexts/shared/components/DocExcelButton';
import type { ClosingRow, ClosingTab } from './types';

/** `2026-08-31` → `08/31`。期日は月日だけで足りる */
function md(d: string | null): string {
  return d && d.length >= 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : '—';
}

function stateOf(r: ClosingRow, tab: ClosingTab, today: string) {
  if (tab === 'issue') {
    return r.blocked
      ? { label: '申込書なし', tone: 'border-transparent bg-warning-surface text-warning' }
      : { label: '未発行', tone: 'border-transparent bg-muted text-muted-foreground' };
  }
  if (tab === 'collect') {
    const due = r.payment_due_date;
    if (due && due < today) return { label: '期日超過', tone: 'border-transparent bg-destructive-surface text-destructive' };
    return { label: '入金待ち', tone: 'border-transparent bg-warning-surface text-warning' };
  }
  return { label: '検収前', tone: 'border-transparent bg-muted text-muted-foreground' };
}

export function ClosingRows({
  rows, tab, today, picked, canEdit, onPick,
}: {
  rows: ClosingRow[];
  tab: ClosingTab;
  today: string;
  picked: Set<string>;
  canEdit: boolean;
  onPick: (id: string, on: boolean) => void;
}) {
  // 申込書を要求するのは**請求書を出すときだけ**。入金・検収の記録は止めない
  const selectable = (r: ClosingRow) => canEdit && !(tab === 'issue' && r.blocked);

  return (
    <>
      <RowHeader className="hidden sm:flex">
        <RowSlot w={96}>GLS番号</RowSlot>
        <RowMain>案件 ／ 請求先</RowMain>
        {/* **出したものだけ番号を持つ。** 出す前の一覧では列ごと出さない
            （空の列が並ぶと「採番に失敗した」ように見える） */}
        {tab !== 'issue' && <RowSlot w={128}>請求書番号</RowSlot>}
        <RowSlot w={128} align="right">金額（税抜）</RowSlot>
        {tab === 'collect' && <RowSlot w={96}>入金期日</RowSlot>}
        <RowSlot w={96}>{tab === 'issue' ? '状態' : tab === 'collect' ? '入金' : '検収'}</RowSlot>
        {tab !== 'collect' && <RowSlot w={96} align="right">帳票</RowSlot>}
      </RowHeader>

      {rows.map((r) => {
        const st = stateOf(r, tab, today);
        const on = picked.has(r.id);
        const can = selectable(r);
        return (
          <Row key={r.id} onClick={can ? () => onPick(r.id, !on) : undefined}>
            <RowSlot w={96}>
              {/*
                **`min-w-0` が無いと `truncate` は何もしません**（実際に踏んだ・
                レイアウト崩れの報告あり）。この span はチェック枠(18px)+隙間(8px)+
                番号の3つを持つ入れ子の flex で、flex アイテムは既定で
                「中身の幅より縮まない」ため、96px の `RowSlot` に収まらない
                長い番号（エピソードコード付き・例 `GLS-A010-2608`）が枠を
                突き破って隣の案件名に重なっていた。番号側に `min-w-0 flex-1` を、
                この外側にも `min-w-0` を足し、縮んでから省略記号を出す形にする。
              */}
              <span className="flex min-w-0 items-center gap-2">
                {can ? (
                  <span
                    aria-hidden="true"
                    className={`rounded-badge-xs flex h-[18px] w-[18px] shrink-0 items-center justify-center border-[1.5px] ${
                      on ? 'border-primary bg-primary' : 'border-border-disabled'
                    }`}
                  >
                    {on && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                ) : (
                  <span
                    title="申込書が揃っていないので請求書を出せません"
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center"
                  >
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  </span>
                )}
                <span className="font-number min-w-0 flex-1 truncate text-sub-sm text-primary">
                  {r.episode_code || r.gls_number || '—'}
                </span>
              </span>
            </RowSlot>

            <RowMain>
              <RowTitle>{r.project_name || '（案件名なし）'}<GroupTag name={r.group_name} /></RowTitle>
              <RowSub>
                {[r.customer_name,
                  tab !== 'collect' && r.payment_due_date ? `期日 ${md(r.payment_due_date)}` : null,
                  groupNote(r.group_name)]
                  .filter(Boolean).join(' ・ ')}
              </RowSub>
            </RowMain>

            {tab !== 'issue' && (
              <RowSlot w={128} hideOnMobile>
                {r.invoice_no
                  ? <span className="font-number truncate text-sub-sm text-secondary-foreground">{r.invoice_no}</span>
                  // ⚠️ `text-fg-disabled` は白地で 2.61:1 しか無く読ませる文字には使わない決めごと
                  // （`shared/CLAUDE.md`）。番号が無いことを伝える実データなので `text-muted-foreground` に直した
                  : <span className="text-sub-sm text-muted-foreground" title="この画面より前に出した請求書には番号がありません">（番号なし）</span>}
              </RowSlot>
            )}

            <MoneyCell value={r.amount} width={128} />

            {tab === 'collect' && (
              <RowSlot w={96} hideOnMobile>
                <span
                  className={`font-number text-sub ${
                    r.payment_due_date && r.payment_due_date < today
                      ? 'font-bold text-destructive'
                      : 'text-secondary-foreground'
                  }`}
                >
                  {md(r.payment_due_date)}
                </span>
              </RowSlot>
            )}

            <RowSlot w={96}>
              <TableBadge label={st.label} w={null} className={`w-full ${st.tone}`} />
            </RowSlot>

            {tab !== 'collect' && (
              <RowSlot w={96} align="right" className="gap-1">
                <DocPdfButton
                  path={`/revenues/${r.id}/pdf`}
                  kind={tab === 'issue' ? 'invoice' : 'inspection'}
                  params={{ type: tab === 'issue' ? 'invoice' : 'inspection' }}
                />
                <DocExcelButton revenueId={r.id} />
              </RowSlot>
            )}
          </Row>
        );
      })}
    </>
  );
}
