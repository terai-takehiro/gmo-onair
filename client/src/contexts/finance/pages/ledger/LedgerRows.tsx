/**
 * 財務の台帳の行（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通） (v4)
 *
 * 3つの台帳は列の意味が同じなので、**行の描き方を1つにしています**。
 * 別々に書くと、幅・並び・金額の揃え方が画面ごとにずれます（実際に旧実装は
 * 売上が8列・仕入が9列・販管費が10列で、金額の桁も揃っていませんでした）。
 *
 * 列（モックの並びのまま・幅は7段に寄せた）:
 *
 *   コード         128px (`RowSlot`)   売上=GLS番号/話数 ／ 仕入=GLS番号 ／ 販管費=勘定科目
 *                                     （96px だとエピソードコード付きの番号が
 *                                       2行に折り返す。請求・入金の一覧と同じ段にそろえた）
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
 * ── 狭い画面（1023px 以下）はこの部品を使わない ────────────────
 *
 * スマホは**表を縮めたものではなくカード**（`LedgerCards.tsx`）に替えます。
 * 出し分けは `LedgerList.tsx` が `useIsMobile()`（lg = 1023px）1本で行うので、
 * **この部品が描かれるのは 1024px 以上のときだけ**です。
 *
 * 中に残っている `stackOnMobile` / `hideOnMobile` / `sm:hidden` は、
 * その境目を将来動かしたときに崩れないための保険として残してあります
 * （いまは通りません）。**新しい分岐をここに足さないこと** —
 * 幅で変わることは `LedgerList.tsx` の1か所だけに置く決めごとです。
 *
 * ── 表頭はクリックで並べ替えられる（2026-09 依頼） ──────────────
 *
 * `sort`/`onSort`/`sortKeys` を渡した列だけ押せるボタンになる（案件一覧
 * `projectList/ProjectRows.tsx` の `HeaderLabel` と同じ作法: 印は指を乗せたときだけ
 * 薄く出す・同じ列を押すと 昇順→降順→既定 の3段で回る＝`./sort.ts`）。
 * `sortKeys` に無い列（例: 状態）は今までどおり押せないただの文字のまま——
 * サーバー側に対応する並べ替えキーが無い列を押せる見た目にしない。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from 'lucide-react';
import { Row, RowHeader, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { IntercompanyTag } from '@/contexts/shared/components/IntercompanyTag';
// 計上月・税区分の書き方は `ledger/format.ts` に切り出した
// （スマホのカード `LedgerCards.tsx` と詳細シートが同じ関数を読む。
//  写すと必ず片方だけ直されて食い違う）
import { monthOf, taxShort } from './format';
import { ledgerSortMark } from './sort';
import { STATE_TONE, type LedgerRow } from './types';

/** この台帳が持つ並べ替えキー（サーバーの `{列}_asc`/`{列}_desc` の頭）。列ごとに任意 */
export interface LedgerSortKeys {
  code?: string;
  title?: string;
  party?: string;
  amount?: string;
  tax?: string;
  recognition?: string;
}

/**
 * 表頭1マスの中身。`sortKey` が無ければ押せないただの文字（`ProjectRows.tsx` の
 * `HeaderLabel` と同じ理由でボタンの `aria-label` に並び状態を含める——
 * `RowMain`/`RowSlot` は素の `<div>` で `columnheader` の役割を持たない）。
 */
function HeaderLabel({
  label, sortKey, sort, onSort, align,
}: {
  label: string;
  sortKey?: string;
  sort: string;
  onSort?: (key: string) => void;
  align?: 'right';
}) {
  if (!sortKey || !onSort) return <span className="truncate">{label}</span>;
  const mark = ledgerSortMark(sort, sortKey);
  const stateText = mark === 'asc' ? '・昇順で並べ替え中' : mark === 'desc' ? '・降順で並べ替え中' : '';
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
          （狭い列が常時の印で切れないようにする。`ProjectRows.tsx` と同じ理由） */}
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

export function LedgerRows({
  rows, codeLabel, titleLabel, partyLabel, stateLabel, onOpen,
  sort = '', onSort, sortKeys,
}: {
  rows: LedgerRow[];
  codeLabel: string;
  titleLabel: string;
  partyLabel: string;
  /** 状態の列名。`null` ならこの台帳に状態は無い */
  stateLabel: string | null;
  onOpen: (row: LedgerRow) => void;
  /** いまの並び順（サーバーのキー。空 = 既定順） */
  sort?: string;
  /** 渡さなければ表頭はどの列も押せない（今までどおりの表示専用の見出し） */
  onSort?: (key: string) => void;
  sortKeys?: LedgerSortKeys;
}) {
  const navigate = useNavigate();
  return (
    <>
      <RowHeader className="hidden sm:flex">
        <RowSlot w={128} aria-sort={ariaSort(ledgerSortMark(sort, sortKeys?.code ?? ''))}>
          <HeaderLabel label={codeLabel} sortKey={sortKeys?.code} sort={sort} onSort={onSort} />
        </RowSlot>
        <RowMain aria-sort={ariaSort(ledgerSortMark(sort, sortKeys?.title ?? ''))}>
          <HeaderLabel label={titleLabel} sortKey={sortKeys?.title} sort={sort} onSort={onSort} />
        </RowMain>
        <RowSlot w={160} aria-sort={ariaSort(ledgerSortMark(sort, sortKeys?.party ?? ''))}>
          <HeaderLabel label={partyLabel} sortKey={sortKeys?.party} sort={sort} onSort={onSort} />
        </RowSlot>
        <RowSlot w={128} align="right" aria-sort={ariaSort(ledgerSortMark(sort, sortKeys?.amount ?? ''))}>
          <HeaderLabel label="金額（税抜）" sortKey={sortKeys?.amount} sort={sort} onSort={onSort} align="right" />
        </RowSlot>
        <RowSlot w={56} aria-sort={ariaSort(ledgerSortMark(sort, sortKeys?.tax ?? ''))}>
          <HeaderLabel label="税" sortKey={sortKeys?.tax} sort={sort} onSort={onSort} />
        </RowSlot>
        <RowSlot w={72} aria-sort={ariaSort(ledgerSortMark(sort, sortKeys?.recognition ?? ''))}>
          <HeaderLabel label="計上月" sortKey={sortKeys?.recognition} sort={sort} onSort={onSort} />
        </RowSlot>
        {/* 状態は申請ステータス等をクライアント側で計算しており、サーバー側に
            対応する並べ替えキーが無い列——`sortKeys` に含めず、押せない見出しのまま */}
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
          <Row key={r.id} stackOnMobile interactive onClick={() => onOpen(r)}>
            <RowSlot w={128}>
              <span className="font-number text-sub-sm text-primary">{r.code || '—'}</span>
            </RowSlot>

            <RowMain>
              <div className="flex items-center gap-1">
                <RowTitle className="min-w-0 flex-1">{r.title || '（名称なし）'}</RowTitle>
                <IntercompanyTag show={r.is_intercompany} />
                {/* もう1つのバッジ（例: 売上の「検収済」）。**表示だけ**（押しても遷移しない） */}
                {r.secondaryBadge && (
                  // `shrink-0` — 固定幅の帯を持つ他のバッジ・アイコンと同じく、
                  // 狭い画面で潰れないようにする（`RowTitle` 側の `min-w-0` が伸縮を吸収する）
                  <span className="shrink-0">
                    <TableBadge
                      label={r.secondaryBadge.label}
                      w={null}
                      className={STATE_TONE[r.secondaryBadge.tone]}
                      title={r.secondaryBadge.title}
                    />
                  </span>
                )}
                {/* ⚠️ **案件へのリンク（案件を開く ↗）はここに置かない。**
                    v4 では「編集者は行を押すと編集ダイアログが開くので案件へ行けない」を
                    理由に矢印ボタンを置いていたが、**利用者の要望（9/2 仕様変更）で
                    台帳から消した** — 行に押せるものが3つ並んで読みにくく、案件へは
                    案件管理から入る運用にそろえたため。復活させないこと。
                    案件で絞り込んで来たときは画面上部の `ProjectQuickLinks` が案件詳細への
                    行き先を持ち、閲覧のみ権限のときは行を押すと案件詳細へ移る
                    （`RevenueListPage` / `PurchaseListPage` の `onOpen`）。 */}
                {/* 申請URL（仕入・販管費だけ）。**行クリック（onOpen）とは別のリンク**なので
                    ここで止める。外部サイトなので新しいタブで開く（仕様変更 #4・#6・#7） */}
                {r.settlement_url && (
                  <a
                    href={r.settlement_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="精算ページを開く"
                    aria-label="精算ページを開く"
                    className="v4-tap shrink-0 text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
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
