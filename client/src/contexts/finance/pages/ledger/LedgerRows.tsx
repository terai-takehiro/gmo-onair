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
 *
 * ── スマホ（640px 未満）── `Row stackOnMobile`（パターンA） ─────
 *
 * **金額だけは畳まない。** この台帳の PC 専用の理由は「金額の桁を縦にそろえて
 * 読む表」なので、`MoneyCell` は `RowMain` の外に残し、スマホでも常に
 * 右側へ大きく出す（`billing/EstimateRows.tsx` と同じ考え方）。
 * 相手先・税・計上月・状態の4列は `hideOnMobile` で列ごと消し、代わりに
 * `RowMain` の2行目（相手先・税・計上月）・3行目（状態）へまとめて縦積みにする
 * （PC の列と二重に出さない）。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
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

      {rows.map((r) => {
        // 状態バッジ。PC は右端の列、スマホは RowMain の3行目にそのまま出す
        // （**同じ挙動**: 押すと**その状態を変えられる画面**へ行く。ここでは変えられない
        //  = 同じ数字を2か所から書き換えられると、どちらが正か分からなくなる）
        const stateBadge = r.state ? (
          r.state.to ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(r.state!.to!); }}
              title={r.state.title}
            >
              <TableBadge label={r.state.label} w={null} className={STATE_TONE[r.state.tone]} />
            </button>
          ) : (
            <TableBadge label={r.state.label} w={null} className={STATE_TONE[r.state.tone]} />
          )
        ) : null;

        return (
          <Row key={r.id} stackOnMobile onClick={() => onOpen(r)}>
            <RowSlot w={96}>
              <span className="font-number text-sub-sm text-primary">{r.code || '—'}</span>
            </RowSlot>

            <RowMain>
              <div className="flex items-center gap-1">
                <RowTitle className="min-w-0 flex-1">{r.title || '（名称なし）'}</RowTitle>
                {/* 案件へのリンク。`RowMain` は PC・スマホ両方の描画で1回しか出ないので
                    ここに置く（列を増やすと PC 専用になり、スマホでは押せなくなる）。
                    `onOpen` は編集者では編集ダイアログを開いてしまい行から案件へ行けないため、
                    行き先を固定するボタンを別に持つ */}
                {r.project_id && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); navigate(`/sales/projects/${r.project_id}`); }}
                    title="案件を開く"
                    aria-label="案件を開く"
                    className="v4-tap shrink-0 text-muted-foreground hover:text-primary"
                  >
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {r.sub && <RowSub>{r.sub}</RowSub>}
              {/* スマホでは相手先・税・計上月の列が畳まれるので、2行目にまとめて出す */}
              <RowSub className="sm:hidden">
                {[r.party, taxShort(r.tax_category), monthOf(r.recognition_date)].filter(Boolean).join(' ・ ')}
              </RowSub>
              {/* 状態もスマホでは列が畳まれるので、3行目に出す（PCと同じ部品・同じ挙動） */}
              {stateLabel && stateBadge && <div className="mt-1 sm:hidden">{stateBadge}</div>}
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
              <RowSlot w={96} hideOnMobile>
                {stateBadge ?? <span className="text-sub-sm text-muted-foreground">—</span>}
              </RowSlot>
            )}
          </Row>
        );
      })}
    </>
  );
}
