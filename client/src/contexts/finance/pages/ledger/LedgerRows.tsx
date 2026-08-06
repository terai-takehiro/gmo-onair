/**
 * 財務の台帳の行（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通） (v4)
 *
 * 3つの台帳は列の意味が同じなので、**行の描き方を1つにしています**。
 * 別々に書くと、幅・並び・金額の揃え方が画面ごとにずれます（実際に旧実装は
 * 売上が8列・仕入が9列・販管費が10列で、金額の桁も揃っていませんでした）。
 *
 * 列（モックの並びのまま・幅は7段に寄せた）:
 *
 *   コード         96px  (`RowSlot`)   売上=GLS番号/話数 ／ 仕入=GLS番号 ／ 販管費=勘定科目
 *   名前・説明     伸びる (`RowMain`)  ここだけが伸びる
 *   相手先         160px (`RowSlot`)   請求先／仕入先／支払先
 *   金額（税抜）   128px (`MoneyCell`) **￥は左端・数字は右端**
 *   税             56px  (`RowSlot`)
 *   計上月         72px  (`RowSlot`)
 *   状態           96px  (`RowSlot`)   無い台帳は空
 *
 * ── 旧実装から落としたもの ──────────────────────────────────
 *
 * **列幅のドラッグ**を外しました。1画面だけの操作で、他の一覧には無く、
 * 保存もされないので次に開くと元に戻ります（3つの台帳に3つの実装がありました）。
 * 揃った幅を部品側で持つほうが、桁を読み違えずに済みます。
 */
import { useNavigate } from 'react-router-dom';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { TaxCategoryLabels } from '@/types';
import { STATE_TONE, type LedgerRow } from './types';

/** `2026-07-01` → `26/07`。**計上「月」なので日は出さない**（日があると入金日と読み違える） */
function monthOf(date: string | null): string {
  if (!date || date.length < 7) return '—';
  return `${date.slice(2, 4)}/${date.slice(5, 7)}`;
}

/** 税区分は2文字に畳む。列が 56px なので「課税10%」は入らない */
function taxShort(tax: string): string {
  const label = TaxCategoryLabels[tax as keyof typeof TaxCategoryLabels] ?? tax;
  return label.replace(/課税|税率/g, '').replace(/\s/g, '') || label;
}

export function LedgerRows({
  rows, codeLabel, titleLabel, partyLabel, stateLabel, onOpen,
}: {
  rows: LedgerRow[];
  codeLabel: string;
  titleLabel: string;
  partyLabel: string;
  /** 状態の列名。`null` ならこの台帳に状態は無い */
  stateLabel: string | null;
  onOpen: (row: LedgerRow) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <RowHeader className="hidden sm:flex">
        <RowSlot w={96}>{codeLabel}</RowSlot>
        <RowMain>{titleLabel}</RowMain>
        <RowSlot w={160}>{partyLabel}</RowSlot>
        <RowSlot w={128} align="right">金額（税抜）</RowSlot>
        <RowSlot w={56}>税</RowSlot>
        <RowSlot w={72}>計上月</RowSlot>
        {stateLabel && <RowSlot w={96}>{stateLabel}</RowSlot>}
      </RowHeader>

      {rows.map((r) => (
        <Row key={r.id} onClick={() => onOpen(r)}>
          <RowSlot w={96}>
            <span className="font-number text-sub-sm text-primary">{r.code || '—'}</span>
          </RowSlot>

          <RowMain>
            <RowTitle>{r.title || '（名称なし）'}</RowTitle>
            {r.sub && <RowSub>{r.sub}</RowSub>}
            {/* スマホでは列が畳まれるので、相手先と金額をここに出す */}
            <RowSub className="sm:hidden">
              {[r.party, monthOf(r.recognition_date)].filter(Boolean).join(' ・ ')}
            </RowSub>
          </RowMain>

          <RowSlot w={160} hideOnMobile>
            <span className="truncate text-sub text-secondary-foreground">{r.party || '—'}</span>
          </RowSlot>

          <MoneyCell value={r.amount} width={128} />

          <RowSlot w={56} hideOnMobile>
            <span className="text-sub-sm text-muted-foreground">{taxShort(r.tax_category)}</span>
          </RowSlot>

          <RowSlot w={72} hideOnMobile>
            <span className="font-number text-sub-sm text-muted-foreground">{monthOf(r.recognition_date)}</span>
          </RowSlot>

          {stateLabel && (
            <RowSlot w={96}>
              {r.state ? (
                // 押すと**その状態を変えられる画面**へ行く。ここでは変えられない
                // (同じ数字を2か所から書き換えられると、どちらが正か分からなくなる)
                r.state.to ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(r.state!.to!); }}
                    title={r.state.title}
                    className="w-full"
                  >
                    <TableBadge label={r.state.label} w={null} className={`w-full ${STATE_TONE[r.state.tone]}`} />
                  </button>
                ) : (
                  <TableBadge label={r.state.label} w={null} className={`w-full ${STATE_TONE[r.state.tone]}`} />
                )
              ) : (
                <span className="text-sub-sm text-muted-foreground">—</span>
              )}
            </RowSlot>
          )}
        </Row>
      ))}
    </>
  );
}
