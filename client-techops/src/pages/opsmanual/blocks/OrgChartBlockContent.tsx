// 自由ブロック「体制図」の中身（production-manual-orgchart.md §4・§5-2）。
// 階層（上下）→ チーム（横並び）→ 人 の3段構えを、表ブロックと同じ作法で描く:
// **選択中だけ入力欄になり、選択していないときの見た目がそのまま紙に出る**
// （印刷とスマホ閲覧は `ManualPrintDocument` が `selected: false` で同じ関数を呼ぶ）。
//
// ⚠️ **SVG で座標を計算して線を引かない**（§4）。チームの高さは中の人数で変わるので、
// ブロックの幅を変えるたびに線がずれる（`client/src/contexts/gpm/pages/projectDetail/MembersTab.tsx`
// 冒頭が実測で書き残した理由。キャンバスでは利用者がブロックの幅を変えるぶん条件が悪い）。
// **上下のつながりは CSS の細い縦罫だけ**で示し、横の並びは「同じ階層にある」ことで表す。
//
// ⚠️ **立場（自社／発注者／PM会社／業者）の区分は持たない**（§10-2）。枠線はどのチームも
// 同じ細い実線で、塗らない（§4・インクを使わない）。どこの会社かはチームの見出しの
// 所属の文字で読む。プロジェクト管理の立場ごとの色分けはここへ持ち込まない。
import { Minus, Plus } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/stableIds";
import type {
  ManualOrgBox, ManualOrgChartContent, ManualOrgTier,
} from "@gmo-onair/shared/src/opsmanual/types";
import OrgChartTeamBox from "./orgchart/OrgChartTeamBox";
import { ORG_INPUT, ORG_MINUS, ORG_PLUS, resolveOrgChartShow } from "./orgchart/orgChartUi";

interface Props {
  content: ManualOrgChartContent;
  selected: boolean;
  onCommit: (content: ManualOrgChartContent) => void;
}

/**
 * 中身が空のまま読まれたときの受け皿（置いた直後は名前の無い階層が1つ・§10-1）。
 * **描くたびに `genId` を呼ばない** — id が毎回変わると React の key が動き、
 * 打っている最中の入力欄からフォーカスが飛ぶ。
 */
const FALLBACK_TIERS: ManualOrgTier[] = [{ id: "tier_1", label: "", boxes: [] }];

export default function OrgChartBlockContent({ content, selected, onCommit }: Props) {
  const tiers = content.tiers?.length ? content.tiers : FALLBACK_TIERS;
  const show = resolveOrgChartShow(content);
  const connectors = content.connectors ?? true;

  // 更新はすべて作り直し（map / filter）。`useManualHistory` は過去の blocks を
  // そのまま持っているので、中身を書き換えると undo が壊れる
  const setTiers = (next: ManualOrgTier[]) => onCommit({ ...content, tiers: next });
  const patchTier = (id: string, fn: (t: ManualOrgTier) => ManualOrgTier) =>
    setTiers(tiers.map((t) => (t.id === id ? fn(t) : t)));
  const setBoxes = (id: string, next: ManualOrgBox[]) => patchTier(id, (t) => ({ ...t, boxes: next }));

  return (
    <div
      className="flex h-full w-full flex-col overflow-auto bg-background"
      // 選択中は体制図の中で編集操作が完結する（ドラッグでブロックが動かないよう
      // pointerdown をここで止める。`ManualBlockView` の「つかんで動かす」は pointerdown
      // 起点なので mousedown ではなく pointerdown で止める必要がある。動かすときは
      // 選択を外して枠から掴む）。**未選択のときは止めない** — 止めると選べなくなる
      onPointerDown={(e) => { if (selected) e.stopPropagation(); }}
      // ＋/− を押した直後はフォーカスがそのボタンに残る。キャンバスの Delete / Backspace は
      // 入力欄（INPUT / TEXTAREA）しか避けないので、そのまま押すとブロックごと消える。
      // 体制図はボタンの数が桁違いに多いので、ここで止める
      onKeyDown={(e) => {
        if (!selected) return;
        const onButton = (e.target as HTMLElement).tagName === "BUTTON";
        if (onButton && (e.key === "Backspace" || e.key === "Delete")) e.stopPropagation();
      }}
    >
      {tiers.map((tier, i) => {
        const boxes = tier.boxes ?? [];
        const count = boxes.reduce((n, b) => n + (b.people?.length ?? 0), 0);
        return (
          <div key={tier.id}>
            {/* 階層のあいだのつながり。上下の関係だけを示す細い縦罫（切ることもできる） */}
            {i > 0 && (
              connectors
                ? <div className="mx-auto h-4 w-px bg-border" aria-hidden="true" />
                : <div className="h-2" aria-hidden="true" />
            )}

            <div className="mb-1 flex items-center gap-1.5">
              <div className={selected ? "w-24 shrink-0" : "min-w-0 max-w-[45%]"}>
                {selected ? (
                  <BufferedInput
                    value={tier.label}
                    onCommit={(v) => patchTier(tier.id, (t) => ({ ...t, label: v }))}
                    placeholder="階層の名前"
                    className={cn(ORG_INPUT, "w-full text-[10.5px] font-extrabold")}
                  />
                ) : (
                  <span className="block truncate text-[10.5px] font-extrabold">{tier.label}</span>
                )}
              </div>
              {count > 0 && <span className="shrink-0 text-[9.5px] text-muted-foreground">{count}名</span>}
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              {selected && (
                <>
                  <button
                    type="button"
                    onClick={() => setBoxes(tier.id, [...boxes, { id: genId("box"), label: "", people: [] }])}
                    className={ORG_PLUS}
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />チーム
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (tiers.length > 1) setTiers(tiers.filter((t) => t.id !== tier.id)); }}
                    disabled={tiers.length <= 1}
                    title="この階層を削除"
                    className={ORG_MINUS}
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>

            {boxes.length > 0 && (
              <div className="flex items-start gap-1.5">
                {boxes.map((box) => (
                  <OrgChartTeamBox
                    key={box.id}
                    box={box}
                    show={show}
                    selected={selected}
                    onChange={(next) => setBoxes(tier.id, boxes.map((b) => (b.id === box.id ? next : b)))}
                    onRemove={() => setBoxes(tier.id, boxes.filter((b) => b.id !== box.id))}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {selected && (
        <button
          type="button"
          onClick={() => setTiers([...tiers, { id: genId("tier"), label: "", boxes: [] }])}
          className={cn(ORG_PLUS, "mt-1 self-start")}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />階層
        </button>
      )}
    </div>
  );
}
