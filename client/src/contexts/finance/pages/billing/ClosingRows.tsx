/**
 * ② 請求・入金 の行（財務） (v4)
 *
 * 3つのタブで**同じ行の形**を使います。違うのは右端の状態列だけです。
 *
 *   選ぶ         56px   タブによっては選べない行がある
 *   GLS番号      128px  **エピソードコード付き（12字）が入る幅**
 *   案件 ／ 請求先 伸びる
 *   請求書番号   96px   入金を記録・検収を記録 のタブだけ（下記）
 *   金額（税抜） 128px  **￥は左端・数字は右端**
 *   期日         96px   入金を記録のタブだけ。**超過は赤**
 *   状態         96px
 *   帳票         96px   請求書を出す／検収を記録 のタブだけ（下記）
 *
 * ── 「帳票」列だけモックに無い ──────────────────────────────
 *
 * 「請求書を出す」「検収を記録」は**日付を記録するだけ**で、
 * 相手に渡す紙はどこからも出せませんでした（v4 で PDF の口ごと落ちていた）。
 * 記録する画面で紙も出せないと、**別の画面を開き直して同じ行を探す**ことになります。
 * 押すと BOX の社内限りフォルダ `03_請求` にも入ります（`lib/docPdf.ts`）。
 * **請求書 Excel（業務推進提出用）だけは BOX に入りません**
 * （`downloadRevenueExcel`・`lib/docPdf.ts`）。2つ目のボタンぶん列を
 * 56px→96px に広げた
 *
 * **入金を記録タブには出しません** — 入金は相手が払う話で、こちらが出す紙はありません。
 *
 * ── 選べない行を「押せるように見せない」──────────────────────
 *
 * 申込書が揃っていない案件は請求書を出せません。四角を消すのではなく
 * **押せない四角と理由**を出します（消すと「なぜ選べないのか」が分からない）。
 */
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { GroupTag, groupNote } from '@/contexts/shared/components/GroupTag';
import { IntercompanyTag } from '@/contexts/shared/components/IntercompanyTag';
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
        <RowSlot w={56}>選ぶ</RowSlot>
        <RowSlot w={128}>管理番号</RowSlot>
        <RowMain>案件 ／ 請求先</RowMain>
        {/* **出したものだけ番号を持つ。** 出す前の一覧では列ごと出さない
            （空の列が並ぶと「採番に失敗した」ように見える） */}
        {/* 番号は `INV-2026-0001`（実測 82px）。**96px で足りる** —
            余らせると、そのぶん案件名が削れて行を読み分けられなくなる */}
        {tab !== 'issue' && <RowSlot w={96}>請求書番号</RowSlot>}
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
          <Row key={r.id} interactive={can} onClick={can ? () => onPick(r.id, !on) : undefined}>
            {/*
              **チェック枠と番号は別の列にする。** 以前は 96px の1列に
              チェック枠(18px)+隙間(8px)+番号を同居させており、番号に残るのが
              約 70px しか無くて**全行が `GLS-A00…` に省略され、話数違いの行を
              番号で区別できなかった**（まとめて選ぶ画面なので、番号で照合しながら
              選べないと使えない）。列を分けて番号に 128px を渡す。
            */}
            <RowSlot w={56}>
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
            </RowSlot>

            <RowSlot w={128}>
              {/* **`min-w-0` が無いと `truncate` は何もしません**（実際に踏んだ）。
                  128px でも入りきらない番号が来たときに、枠を突き破って隣の
                  案件名に重ならないよう省略記号で止める。全文は `title` で読める */}
              <span
                className="font-number min-w-0 flex-1 truncate text-sub-sm text-primary"
                title={r.episode_code || r.gls_number || undefined}
              >
                {r.episode_code || r.gls_number || '—'}
              </span>
            </RowSlot>

            <RowMain>
              {/* 案件名は1行で省略する（`RowTitle` の決めごと）。狭い画面では
                  切れるので、全文を `title` で読めるようにしておく */}
              <RowTitle title={r.project_name || undefined}>
                {r.project_name || '（案件名なし）'}<GroupTag name={r.group_name} /><IntercompanyTag show={r.is_intercompany} />
              </RowTitle>
              <RowSub>
                {[r.customer_name,
                  tab !== 'collect' && r.payment_due_date ? `期日 ${md(r.payment_due_date)}` : null,
                  groupNote(r.group_name)]
                  .filter(Boolean).join(' ・ ')}
              </RowSub>
            </RowMain>

            {tab !== 'issue' && (
              <RowSlot w={96} hideOnMobile>
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
