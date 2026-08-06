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
 *
 * ── 選べない行を「押せるように見せない」──────────────────────
 *
 * 申込書が揃っていない案件は請求書を出せません。四角を消すのではなく
 * **押せない四角と理由**を出します（消すと「なぜ選べないのか」が分からない）。
 */
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Check, Lock } from 'lucide-react';
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
        <RowSlot w={128} align="right">金額（税抜）</RowSlot>
        {tab === 'collect' && <RowSlot w={96}>入金期日</RowSlot>}
        <RowSlot w={96}>{tab === 'issue' ? '状態' : tab === 'collect' ? '入金' : '検収'}</RowSlot>
      </RowHeader>

      {rows.map((r) => {
        const st = stateOf(r, tab, today);
        const on = picked.has(r.id);
        const can = selectable(r);
        return (
          <Row key={r.id} onClick={can ? () => onPick(r.id, !on) : undefined}>
            <RowSlot w={96}>
              <span className="flex items-center gap-2">
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
                <span className="font-number truncate text-sub-sm text-primary">
                  {r.episode_code || r.gls_number || '—'}
                </span>
              </span>
            </RowSlot>

            <RowMain>
              <RowTitle>{r.project_name || '（案件名なし）'}</RowTitle>
              <RowSub>
                {[r.customer_name, tab !== 'collect' && r.payment_due_date ? `期日 ${md(r.payment_due_date)}` : null]
                  .filter(Boolean).join(' ・ ')}
              </RowSub>
            </RowMain>

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
          </Row>
        );
      })}
    </>
  );
}
