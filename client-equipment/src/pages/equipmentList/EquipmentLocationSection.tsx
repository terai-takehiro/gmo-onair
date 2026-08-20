/**
 * 機材台帳 ／ 機材 — 拠点1つぶんのカードの並び（スマホ）
 *
 * `RentalSection.tsx`（貸出機材タブ）と同じ構成です。**見出しは間引かず、
 * カードだけ `useVarRowWindow` で間引きます。** 理由は2つ:
 *
 *  ① 見えている塊だけ描く（`useVarRowWindow`）にはフックが要り、
 *    拠点の数だけ繰り返す場所に直接は書けない（フックは繰り返せない）
 *  ② 拠点ごとに独立して間引ける。画面の外にある拠点は
 *    カード0枚 ＋ 高さぶんの空の箱1つになる
 *
 * 機材の1枚は開くと付属品が生えて高さが変わるので、`RentalSection` と同じく
 * 1行ぶんの送り幅ではなく**カードごとの高さを積み上げて**位置を決めます
 * （`cardHeight`）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CustomColumn } from '@/components/CustomColumnDialog';
import { EquipmentCardRow } from './EquipmentCardRow';
import { useVarRowWindow, WINDOWED_LIST_STYLE } from './useRowWindow';
import { CARD_H, cardHeight, cardRowKey, type CardEntry, type LocationSection } from './cardRowTypes';

export function EquipmentLocationSection({
  section, showHeader, loadingChildren, onToggleExpand, onOpen, onDelete,
  canBulkEdit, canDelete, selectedIds, onSelectOne,
  customColumns, visibleCustomCols, customValues,
}: {
  section: LocationSection;
  /** 拠点の見出しを上に出すか（拠点が2つ以上あるときだけ） */
  showHeader: boolean;
  loadingChildren: Set<string>;
  onToggleExpand: (entry: CardEntry) => void;
  onOpen: (id: string) => void;
  onDelete: (entry: CardEntry) => void;
  canBulkEdit: boolean;
  canDelete: boolean;
  selectedIds: Set<string>;
  onSelectOne: (id: string) => void;
  customColumns: CustomColumn[];
  visibleCustomCols: Set<string>;
  customValues: Record<string, Record<string, string>>;
}) {
  const list = useRef<HTMLDivElement>(null);

  /**
   * まず決め打ちの寸法で見積もり、**描けたカードの実寸が取れたらそれを土台に
   * 置き換える**（`RentalSection.tsx` と同じ理由で `useState` — `useRef` だと
   * 見積もりを作る `useMemo` が読み直さず、土台が決め打ちのまま固定される）。
   */
  const [cardH, setCardH] = useState<number>(CARD_H);
  const rows = useMemo(() => section.cards.map((entry) => ({
    key: cardRowKey(entry.item.id, entry.expanded),
    height: cardHeight(entry, cardH),
  })), [section.cards, cardH]);

  const win = useVarRowWindow(list, rows);
  useEffect(() => {
    if (win.typical != null && win.typical !== cardH) setCardH(win.typical);
  }, [win.typical, cardH]);

  return (
    <div className="flex flex-col gap-2">
      {/* 見出しは間引かない。拠点の数は多くても数十で作る費用は小さく、
          いま見ている拠点名が消えると「どこを見ているか」が読めない */}
      {showHeader && (
        <div className="flex items-center gap-3 px-1">
          <span className="whitespace-nowrap text-th text-muted-foreground">{section.name}</span>
          <span className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-sub-sm text-muted-foreground">{section.cards.length} 件</span>
        </div>
      )}

      {/* カードは見出しと別の入れ物に入れる。位置は「この入れ物の上端から
          数えて何 px か」で決めるので、見出しを同じ入れ物に入れると
          見出しの高さぶん（＋隙間）ずっとずれる */}
      <div ref={list} style={WINDOWED_LIST_STYLE} className="flex flex-col gap-2">
        {win.padTop > 0 && <div style={{ height: win.padTop }} aria-hidden="true" />}

        {section.cards.slice(win.start, win.end).map((entry) => (
          <EquipmentCardRow
            key={entry.item.id}
            entry={entry}
            measureKey={cardRowKey(entry.item.id, entry.expanded)}
            loading={loadingChildren.has(entry.item.id)}
            onToggleExpand={() => onToggleExpand(entry)}
            onOpen={onOpen}
            onDelete={() => onDelete(entry)}
            canBulkEdit={canBulkEdit}
            canDelete={canDelete}
            selectedIds={selectedIds}
            onSelectOne={onSelectOne}
            customColumns={customColumns}
            visibleCustomCols={visibleCustomCols}
            customValues={customValues}
          />
        ))}

        {win.padBottom > 0 && <div style={{ height: win.padBottom }} aria-hidden="true" />}
      </div>
    </div>
  );
}
