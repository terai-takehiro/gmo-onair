/**
 * 台帳のスマホ表示（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費 で共通） (v4)
 *
 * ── PC の表を縮めたものではありません ──────────────────────
 *
 * この3画面が PC 専用だった理由は「**金額の桁を縦にそろえて読む表**なので、
 * 畳むと桁が比べられない」でした。カードにしても**金額は畳みません** —
 * 全カードの右端に `MoneyCell width={128}` の同じレールを置くので、
 * ¥ はレールの左端・**数字の右端は画面左から常に同じ位置**に来ます。
 * `font-number`（等幅数字）で桁幅もそろうので、**カードを縦に並べただけで
 * PC の金額列と同じ「そろった列」ができます**。
 *
 * 3行とも必ず描く（値が無ければ `—`）ので**カードの高さが一定**になり、
 * 金額が等間隔・同じ横位置に並びます。ここを可変にすると桁は読めても
 * 目が縦に流れません。
 *
 * ── カード全体が1つのボタン ────────────────────────────────
 *
 * 行き先が3つ（状態 → 請求・入金／申請URL → 外部サイト／案件 → 案件詳細）
 * ありますが、**入れ子のボタン・リンクは置きません**（無効な HTML になるうえ、
 * 指ではどれを押したのか分からない）。押すと `LedgerDetailSheet` が開き、
 * 行き先はその下端に縦に並びます。申請URLは `Link2` の**印**だけ出します。
 *
 * ── `SwipeAction` は使いません ──────────────────────────────
 *
 * あの部品は「画面に既にあるボタンにもう1つの入口を足す」ためのものです。
 * 台帳の行にはボタンが1つもないので、付けると**スワイプでしか出せない操作**を
 * 新設することになります（見つけられない操作は無いのと同じ）。
 */
import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { MoneyCell } from '@gmo-onair/shared/src/client/ui/money';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { monthOf } from './format';
import { compactSettlementLabel } from './settlementState';
import { LedgerDetailSheet } from './LedgerDetailSheet';
import { STATE_TONE, type LedgerRow } from './types';

export function LedgerCards({
  rows, itemLabel, stateLabel, onOpen, onProject, canEdit,
}: {
  rows: LedgerRow[];
  /** 台帳の呼び名（売上／仕入／販管費）。詳細シートの「この◯◯を直す」に使う */
  itemLabel: string;
  /** 状態の列名。`null` ならこの台帳に状態は無い */
  stateLabel: string | null;
  onOpen: (row: LedgerRow) => void;
  onProject?: (row: LedgerRow) => void;
  canEdit: boolean;
}) {
  /*
   * 開いている行は **id で持つ**（行そのものを持たない）。
   * 裏で react-query が入れ替えたとき、掴んだままの古い行を出し続けないため
   * （保存したのに古い金額が残る、という読み違いがいちばん危ない）。
   */
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = openId ? rows.find((r) => r.id === openId) ?? null : null;

  return (
    <>
      <ul className="v4-card-in flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(r.id)}
              className="rounded-card w-full border border-border bg-card px-3.5 py-3 text-left"
            >
              {/* 行A: コード ・ 計上月 ／ 金額（**ここが金額のレール**） */}
              <div className="flex items-baseline gap-2">
                <span className="font-number text-sub-sm min-w-0 flex-1 truncate text-muted-foreground">
                  <span className="text-primary">{r.code || '—'}</span>
                  {' ・ '}
                  {monthOf(r.recognition_date)}
                </span>
                <MoneyCell value={r.amount} width={128} className="text-cardtitle" />
              </div>

              {/* 行B: 見出し（案件名・説明・詳細）。全文は詳細シートで読める */}
              <div className="text-list mt-0.5 truncate">{r.title || '（名称なし）'}</div>

              {/* 行C: 相手先 ／ 状態 */}
              <div className="mt-0.5 flex items-center gap-2">
                <span className="text-sub-sm min-w-0 flex-1 truncate text-muted-foreground">
                  {[r.sub, r.party].filter(Boolean).join(' ・ ') || '—'}
                </span>
                {r.settlement_url && (
                  // **押せる印ではありません**（入れ子のリンクになる）。
                  // 遷移は詳細シートの「精算ページをひらく」から
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                {stateLabel && r.state && (
                  <span className="shrink-0">
                    {/* 「金額確定・精算まだ」はこの幅では相手先が消える。
                        短くする規則は `settlementState.ts` に1つだけ置いてある */}
                    <TableBadge
                      label={compactSettlementLabel(r.state.label)}
                      w={null}
                      className={STATE_TONE[r.state.tone]}
                    />
                  </span>
                )}
                {r.secondaryBadge && (
                  <span className="shrink-0">
                    <TableBadge
                      label={r.secondaryBadge.label}
                      w={null}
                      className={STATE_TONE[r.secondaryBadge.tone]}
                    />
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      {/* **開くたびに作り直す**（前の行の値が残らない。`RevenueDialog` の親と同じ流儀） */}
      {detail && (
        <LedgerDetailSheet
          key={detail.id}
          row={detail}
          itemLabel={itemLabel}
          canEdit={canEdit}
          onEdit={(row) => { setOpenId(null); onOpen(row); }}
          onProject={onProject ? (row) => { setOpenId(null); onProject(row); } : undefined}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
