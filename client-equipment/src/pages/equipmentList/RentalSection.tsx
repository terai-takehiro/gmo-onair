/**
 * ② 機材台帳 ／ 貸出機材 — カテゴリ1つぶんの塊の並び
 *
 * `RentalPanel.tsx` から切り出したものです。**中身・並び・隙間は変えていません。**
 * 分けた理由は2つあります:
 *
 *  ① **見えている塊だけ描く**（`useVarRowWindow`）にはフックが要り、
 *    カテゴリの数だけ繰り返す場所に直接は書けない（フックは繰り返せない）
 *  ② カテゴリごとに独立して間引ける。画面の外にあるカテゴリは
 *    **カード0枚 ＋ 高さぶんの空の箱1つ**になる
 *
 * ── なぜ間引くか（実測）──────────────────────────────────────
 *
 * 貸出可の型名が 759 種のとき、このタブは DOM を **18,393 個**作り、
 * 開くまでに **1,697ms 画面が固まって**いました。内訳を切り分けると
 * **1,013ms が「並べて描く」費用・684ms が「DOM を作る」費用**で、
 * どちらか片方を省いても半分残ります。だから**作るのをやめます**。
 *
 * ── 機材のタブとは高さの決め方が違う ────────────────────────
 *
 * 機材の表は全部の行が同じ高さですが、ここは**塊を開くと中に1台ずつの行が
 * 生えて高さが変わります**。だから1行ぶんの送り幅ではなく、
 * **塊ごとの高さを積み上げて**位置を決めます（`rentalGroupHeight`）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RentalGroupRow } from './RentalGroupRow';
import { useVarRowWindow, WINDOWED_LIST_STYLE } from './useRowWindow';
import { groupKey, rentalGroupHeight, rentalRowKey, type CategorySection, type ModelGroup } from './rentalTypes';

export function RentalSection({
  section, showHeader, expanded, onToggle, onEditRental, onOpenUnit,
}: {
  section: CategorySection;
  /** カテゴリの見出しを上に出すか（カテゴリが2つ以上あるときだけ） */
  showHeader: boolean;
  /** 開いている塊の鍵 */
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onEditRental: (g: ModelGroup) => void;
  onOpenUnit: (id: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  /**
   * まず決め打ちの寸法で見積もり、**描けたカードの実寸が取れたら
   * それを土台に置き換える**（`typical` はいちばん低い実測値＝畳んだカード1枚）。
   *
   * ⚠️ **`useRef` に入れてはいけません。** 見積もりを作る `useMemo` が
   * 読み直さないので、**土台が決め打ちのまま固定**されます。スマホは
   * カードが折り返して背が高く（実測 64px → 115px）、決め打ちのままだと
   * **積み上げた高さが足りず、底まで送りきれません**（実測: 4,485px 手前で止まる）。
   */
  const [cardH, setCardH] = useState<number | undefined>(undefined);
  const rows = useMemo(() => section.groups.map((g) => {
    const open = expanded.has(groupKey(g));
    // 鍵に開閉を含める（閉じたのに開いたときの実寸を使い続けないため）
    return { key: rentalRowKey(groupKey(g), open), height: rentalGroupHeight(g, open, cardH) };
  }), [section.groups, expanded, cardH]);

  const win = useVarRowWindow(list, rows);
  // 実寸が取れたら土台を入れ替える（1〜2回で落ち着く）
  useEffect(() => {
    if (win.typical != null && win.typical !== cardH) setCardH(win.typical);
  }, [win.typical, cardH]);

  return (
    <div className="flex flex-col gap-2">
      {/*
        ⚠️ **見出しは間引きません。** カテゴリの数は多くても数十なので作る費用は
        小さく、一方で**上に居るカテゴリ名が消えると「いまどの塊を見ているか」が
        読めません**。間引くのは下のカードだけです。
      */}
      {showHeader && (
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-th text-muted-foreground">{section.name}</span>
          <span className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-sub-sm text-muted-foreground">
            {section.groups.length} 型名 ／ {section.groups.reduce((s, g) => s + g.total_count, 0)} 台
          </span>
        </div>
      )}

      {/*
        ⚠️ **カードは見出しと別の入れ物に入れること。** 位置は「この入れ物の
        上端から数えて何 px か」で決めるので、見出しを同じ入れ物に入れると
        **見出しの高さぶん（＋隙間）ずっとずれます**。隙間は外側と同じ 8px なので、
        入れ物を1枚はさんでも見た目は変わりません。
      */}
      <div ref={list} style={WINDOWED_LIST_STYLE} className="flex flex-col gap-2">
        {win.padTop > 0 && <div style={{ height: win.padTop }} aria-hidden="true" />}

        {section.groups.slice(win.start, win.end).map((g) => {
          const key = groupKey(g);
          return (
            <RentalGroupRow
              key={key}
              measureKey={rentalRowKey(key, expanded.has(key))}
              group={g}
              expanded={expanded.has(key)}
              showCategory={showHeader}
              onToggle={() => onToggle(key)}
              onEditRental={() => onEditRental(g)}
              onOpenUnit={onOpenUnit}
            />
          );
        })}

        {win.padBottom > 0 && <div style={{ height: win.padBottom }} aria-hidden="true" />}
      </div>
    </div>
  );
}
