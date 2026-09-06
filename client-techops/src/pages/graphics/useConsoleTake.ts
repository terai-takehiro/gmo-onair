// テロップCG — 送出コンソールの TAKE／CLEAR／↑↓NEXT移動の実処理。GraphicsConsolePage.tsx
// から切り出した（400行の目安を超えないため。useConsoleContinue.ts と同じ思想の切り出しで、
// ロジック自体はこのファイルだけで完結する）。
//
// TAKE = NEXT を OA へ出す（同じスロットに出ているものは自動で下りる・1枠1枚）。「次へ」と
// いう別動詞は無くなったため、旧 take()／takeAndNext() をこの1つに統合してある——TAKE 自体が
// 常に出す順の次の行へ NEXT を自動で進める（末尾ではそのページに留まる。旧 takeAndNext() の
// 「末尾で留まる」挙動をそのまま引き継いだ）。進める先は `pages`（出す順＝sortOrder）で、
// `callOrder`（呼出番号順）は使わない——callNo は並べ替えても変わらない固定値で、画面に
// 見えている出す順と一致するとは限らないため（docs/design/v4/graphics-redesign.md §8
// 「安全装置」直前の段落）。↑↓ の NEXT 移動も同じ理由で `pages` を使う。
//
// CLEAR = 最後に TAKE したもの（`lastTaken`）を消す。すでに他の操作（自動退出ルール・
// スロット帯の「消す」・別の TAKE での上書き等）でスロットの中身が変わっていたら何もしない
// （エラーにしない・設計書§8「CLEAR」の段落）。`canClear` も同じ条件から出すので、
// ボタンの disabled 表示と実際のガードがずれない。
import { useState } from 'react';
import type { GraphicsCueRow, GraphicsPageRow, GraphicsSlot } from '@/lib/graphicsApi';
import { isPageContentEmpty } from './pageFields';

export function useConsoleTake({
  pages, cues, pvwPageId, setPvwPageId, guardTake, resetVoteStateForTake, sendSet,
}: {
  /** 出す順（sortOrder）。useConsolePages が返す `pages` をそのまま渡す */
  pages: GraphicsPageRow[];
  cues: Partial<Record<GraphicsSlot, GraphicsCueRow>>;
  pvwPageId: string | null;
  setPvwPageId: (id: string | null) => void;
  /** 校正の防衛線（GraphicsConsolePage.tsx の guardTake をそのまま渡す・変更なし） */
  guardTake: (page: GraphicsPageRow) => Promise<boolean>;
  resetVoteStateForTake: (page: GraphicsPageRow) => Promise<void>;
  sendSet: (slot: GraphicsSlot, pageId: string | null) => Promise<void>;
}) {
  /** CLEAR の対象。TAKE が成功するたびに更新する（表示に直接使わないが canClear に
   * 反応させたいので useRef ではなく useState） */
  const [lastTaken, setLastTaken] = useState<{ slot: GraphicsSlot; pageId: string } | null>(null);

  const take = async (page: GraphicsPageRow) => {
    if (!(await guardTake(page))) return;
    await resetVoteStateForTake(page);
    await sendSet(page.slot, page.id);
    setLastTaken({ slot: page.slot, pageId: page.id });
    // 安全装置③（文言が空のものは NEXT に立てられない）は行クリック・番号呼出・↑↓移動だけでなく
    // この自動前進にも効かせる必要がある——直後の1行が空欄（未完成のプレースホルダー等）だと
    // それをそのまま NEXT にしてしまうため、moveNext() と同じ考え方で「空欄でない次の行」まで
    // 読み飛ばす。見つからなければ（残り全部が空欄・末尾）いま TAKE した行に留まる
    const idx = pages.findIndex((p) => p.id === page.id);
    const next = idx >= 0
      ? pages.slice(idx + 1).find((p) => !isPageContentEmpty(p.partKey, p.fields)) ?? page
      : page;
    setPvwPageId(next.id);
  };

  const canClear = !!lastTaken && cues[lastTaken.slot]?.pageId === lastTaken.pageId;
  const clearLastTaken = async () => {
    if (!canClear || !lastTaken) return;
    await sendSet(lastTaken.slot, null);
    setLastTaken(null);
  };

  /**
   * ↑↓ の NEXT 移動（出す順・pages。端で止まる）。安全装置③（文言が空のものは NEXT に
   * 立てられない）は行クリック（ConsolePageList.tsx）・番号呼出（commitCall）だけでなく
   * ここでも効かせる必要があるため、移動先の候補をあらかじめ「文言があるページ」だけに
   * 絞り込んでから、そのリストの中で従来どおりのクランプ計算をする——結果として空の
   * ページは飛ばして次に進む形になる（レビュー指摘対応）。
   */
  const moveNext = (dir: 1 | -1) => {
    const selectable = pages.filter((p) => !isPageContentEmpty(p.partKey, p.fields));
    if (selectable.length === 0) return;
    const idx = pvwPageId ? selectable.findIndex((p) => p.id === pvwPageId) : -1;
    const next = idx < 0
      ? (dir > 0 ? 0 : selectable.length - 1)
      : Math.min(selectable.length - 1, Math.max(0, idx + dir));
    setPvwPageId(selectable[next].id);
  };

  return {
    take,
    canClear,
    clearLastTaken,
    moveNext,
    /** 全部消す（オールクリア）のあとに呼ぶ。CLEAR の対象も一緒に外す */
    resetLastTaken: () => setLastTaken(null),
  };
}
