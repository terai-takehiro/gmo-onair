/**
 * セキュリティカード — 左の一覧 (master) (v4)
 *
 * **まとめ方はモックの3分類 (全域 / 技術 / 共用)**、その中は**6レベルの小見出し**で
 * さらに分ける。貸すときに最初に決めるのは「どの部屋を開けさせるか」なので、
 * 24枚を番号順にべた並べすると ROOM A のカードを探すのに全部を目で追うことになる。
 *
 * **3分類だけにしない。** 畳んでしまうと ROOM A と ROOM B のカードが同じに見え、
 * 受付が違う部屋のカードを渡す (`types.ts` の説明)。分類は探すための入口、
 * レベルは渡すときに確かめる名前。
 *
 * タイルは 1行 = 1枚 の `Row` にした。以前は3列のタイルで、貸出先の会社名が
 * タイルごとに違う位置に出ていたので、誰に貸しているかを縦に流し読みできなかった。
 */
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import type { SecurityCard } from '@/lib/securityCardApi';
import {
  GROUP_LABELS, GROUP_ORDER, GROUP_TONE, LEVEL_ORDER, groupOf, levelTone, statusOf,
  type LevelGroup,
} from './types';

export function CardGrid({
  cards, selectedId, onSelect,
}: {
  cards: SecurityCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  // レベルごとにまとめる。DB に無いレベルが来ても落とさない (末尾に置く)
  const byLevel = [...LEVEL_ORDER as readonly string[], ...new Set(cards.map((c) => c.security_level))]
    .filter((lv, i, arr) => arr.indexOf(lv) === i)
    .map((level) => ({
      level,
      label: cards.find((c) => c.security_level === level)?.level_label ?? level,
      items: cards.filter((c) => c.security_level === level).sort((a, b) => a.card_no - b.card_no),
    }))
    .filter((g) => g.items.length > 0);

  // モックの3分類でさらに束ねる。分類に載らないレベルは「その他」として最後に置く
  const sections: { key: string; label: string; tone: string; levels: typeof byLevel }[] = [
    ...GROUP_ORDER.map((g: LevelGroup) => ({
      key: g,
      label: GROUP_LABELS[g],
      tone: GROUP_TONE[g],
      levels: byLevel.filter((l) => groupOf(l.level) === g),
    })),
    { key: 'other', label: 'その他', tone: 'border-border bg-muted text-muted-foreground',
      levels: byLevel.filter((l) => groupOf(l.level) === null) },
  ].filter((s) => s.levels.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {sections.map((sec) => (
        <div key={sec.key} className="rounded-card border border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-2">
            <span className={`text-badge rounded-badge border px-2 py-0.5 ${sec.tone}`}>{sec.label}</span>
            <span className="font-number ml-auto text-sub-sm text-muted-foreground">
              {sec.levels.reduce((n, l) => n + l.items.length, 0)}枚
            </span>
          </div>
          {sec.levels.map((g) => (
            <div key={g.level}>
              {/* **6レベルの名前はここで必ず出す。** 3分類だけだと渡すカードを間違える */}
              <div className={`text-th flex items-center gap-2 border-b border-border-faint bg-surface-subtle px-4 py-1.5 ${levelTone(g.level)}`}>
                <span className="border-l-2 border-current pl-2">{g.label}</span>
                <span className="font-number ml-auto text-muted-foreground">{g.items.length}枚</span>
              </div>
              {g.items.map((c) => (
                <CardRow key={c.id} card={c} selected={c.id === selectedId} onSelect={() => onSelect(c.id)} />
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CardRow({ card, selected, onSelect }: { card: SecurityCard; selected: boolean; onSelect: () => void }) {
  const status = statusOf(card);
  return (
    <Row divider interactive className={`p-0 ${selected ? 'bg-primary-surface-weak' : ''}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="min-h-tap flex w-full items-center gap-3 px-4 py-[11px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[46px]"
      >
        <RowSlot w={56}>
          <span className={`font-number text-cardtitle inline-flex h-8 w-8 items-center justify-center rounded-control border ${levelTone(card.security_level)}`}>
            {card.card_no}
          </span>
        </RowSlot>

        <RowMain>
          <RowTitle>
            {card.status === 'lent'
              ? `${card.borrower_company || '（会社名なし）'} / ${card.borrower_person}`
              : card.label || card.level_label}
          </RowTitle>
          <RowSub>
            {card.status === 'lent'
              ? [card.purpose, card.lent_by_name ? `対応 ${card.lent_by_name}` : null].filter(Boolean).join(' ・ ') || card.level_label
              : card.is_active ? '貸出先はありません' : 'いま使えません（紛失・廃止）'}
          </RowSub>
        </RowMain>

        <RowSlot w={96} align="right">
          <TableBadge label={status.label} w={null} className={status.tone} />
        </RowSlot>
      </button>
    </Row>
  );
}
