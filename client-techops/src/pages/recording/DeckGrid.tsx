// 収録設定: 機種グループ1つぶんの表（PC）。見出しと行が同じ桁定義を読む。
import { Copy } from 'lucide-react';
import DeckRow from './DeckRow';
import { DECK_GRID_COLS, DECK_GRID_MIN_W } from './deckGrid';
import type { Deck } from '@/lib/deviceSettingsApi';

export default function DeckGrid({
  title,
  model,
  decks,
  onChange,
  selectedIds,
  onToggleSelect,
  onToggleGroup,
  mainIdOf,
  onCopyFromMain,
  onMirrorAll,
}: {
  title: string;
  /** 「HyperDeck Studio HD Plus ・ 4台（4K・DNxHR は選べません）」 */
  model: string;
  decks: Deck[];
  onChange: (next: Deck) => void;
  selectedIds: Set<string>;
  onToggleSelect: (deckId: string) => void;
  onToggleGroup: (deckIds: string[], next: boolean) => void;
  /** 控えグループだけ: この行に対応する本線のデッキ id */
  mainIdOf?: (index: number) => string;
  onCopyFromMain?: (backupId: string, index: number) => void;
  onMirrorAll?: () => void;
}) {
  const ids = decks.map((d) => d.deckId);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));

  return (
    <section className="mb-4 overflow-hidden rounded-card border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <h2 className="text-cardtitle">{title}</h2>
        <span className="text-sub-sm text-muted-foreground">{model}</span>
        <span className="flex-1" />
        {onMirrorAll && (
          <button
            type="button"
            onClick={onMirrorAll}
            className="flex min-h-tap items-center lg:min-h-[32px] gap-1.5 rounded-control-md bg-muted px-3 text-sub-sm font-bold text-foreground hover:bg-muted/70"
          >
            <Copy className="h-3.5 w-3.5" /> 本線の設定を写す
          </button>
        )}
      </div>

      {/* 囲みの中だけ横スクロールさせる（本文は 375px でも横に動かさない） */}
      <div className="overflow-x-auto">
        <div className={DECK_GRID_MIN_W}>
          <div
            className="grid items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-th text-muted-foreground"
            style={{ gridTemplateColumns: DECK_GRID_COLS }}
          >
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer accent-primary"
              checked={allSelected}
              onChange={() => onToggleGroup(ids, !allSelected)}
              aria-label={`${title}の全台を選ぶ`}
            />
            <span>デッキ ／ 呼び名</span>
            <span>解像度</span>
            <span>コーデック</span>
            <span>音声ch</span>
            <span>収録先</span>
            <span>ファイル名</span>
            <span className="text-right">使わない</span>
          </div>

          {decks.map((d, i) => (
            <DeckRow
              key={d.deckId}
              deck={d}
              onChange={onChange}
              selected={selectedIds.has(d.deckId)}
              onToggleSelect={() => onToggleSelect(d.deckId)}
              mainDeckId={mainIdOf?.(i)}
              onCopyFromMain={onCopyFromMain ? () => onCopyFromMain(d.deckId, i) : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
