/**
 * セキュリティカード — スマホの一覧（カード積み・v4 ネイティブUI対応）
 *
 * PC の `CardGrid` は `Row`（1行=1枚）を束ねた表です。**その行を縮めたものでは
 * ありません** — 375px では番号・貸出先・状態を1行に収めると文字が潰れるので、
 * `production/pages/holds/HoldCards.tsx` と同じ考え方で**タイル1枚=1枚のカード**
 * に組み直します。押すと画面は移らず、下から出るシートで詳しく見ます
 * （決めごと「終わらせるのはシートで」）。
 *
 * **まとめ方（3分類 → 6レベル）は `CardGrid` と同じ**にする。畳んで名前を
 * 消すと ROOM A と ROOM B のカードが同じに見えて渡し間違える（`types.ts`）。
 */
import { ChevronRight } from 'lucide-react';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import type { SecurityCard } from '@/lib/securityCardApi';
import {
  GROUP_LABELS, GROUP_ORDER, GROUP_TONE, LEVEL_ORDER, groupOf, levelTone, statusOf,
  type LevelGroup,
} from './types';

export function CardTiles({
  cards, onSelect,
}: {
  cards: SecurityCard[];
  onSelect: (id: string) => void;
}) {
  const byLevel = [...LEVEL_ORDER as readonly string[], ...new Set(cards.map((c) => c.security_level))]
    .filter((lv, i, arr) => arr.indexOf(lv) === i)
    .map((level) => ({
      level,
      label: cards.find((c) => c.security_level === level)?.level_label ?? level,
      items: cards.filter((c) => c.security_level === level).sort((a, b) => a.card_no - b.card_no),
    }))
    .filter((g) => g.items.length > 0);

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
        <div key={sec.key} className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className={`text-badge rounded-badge border px-2 py-0.5 ${sec.tone}`}>{sec.label}</span>
            <span className="font-number ml-auto text-sub-sm text-muted-foreground">
              {sec.levels.reduce((n, l) => n + l.items.length, 0)}枚
            </span>
          </div>
          {sec.levels.map((g) => (
            <div key={g.level} className="flex flex-col gap-2">
              {/* **6レベルの名前はここで必ず出す。** 3分類だけだと渡すカードを間違える
                  （`text-th` は色を持たないので `levelTone` の文字色と競合しない。
                  `CardGrid`＝PC 版と同じクラスにして書体・太さを揃える） */}
              <div className={`text-th rounded-note flex items-center gap-2 bg-surface-subtle px-3 py-1.5 ${levelTone(g.level)}`}>
                <span className="border-l-2 border-current pl-2">{g.label}</span>
                <span className="font-number ml-auto text-muted-foreground">{g.items.length}枚</span>
              </div>
              <div className="flex flex-col gap-2">
                {g.items.map((c) => <CardTile key={c.id} card={c} onSelect={() => onSelect(c.id)} />)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CardTile({ card, onSelect }: { card: SecurityCard; onSelect: () => void }) {
  const status = statusOf(card);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-card flex w-full items-start gap-3 border border-border bg-card p-3.5 text-left active:bg-muted"
    >
      <span className={`font-number text-cardtitle inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border ${levelTone(card.security_level)}`}>
        {card.card_no}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-list block truncate">
          {card.status === 'lent'
            ? `${card.borrower_company || '（会社名なし）'} / ${card.borrower_person}`
            : card.label || card.level_label}
        </span>
        <span className="text-note mt-0.5 block truncate text-muted-foreground">
          {card.status === 'lent'
            ? [card.purpose, card.lent_by_name ? `対応 ${card.lent_by_name}` : null].filter(Boolean).join(' ・ ') || card.level_label
            : card.is_active ? '貸出先はありません' : '運用対象外（紛失・廃止）'}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <TableBadge label={status.label} w={null} className={status.tone} />
        <ChevronRight className="h-4 w-4 text-fg-disabled" aria-hidden="true" />
      </span>
    </button>
  );
}
